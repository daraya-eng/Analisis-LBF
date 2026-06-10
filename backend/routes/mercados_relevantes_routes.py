"""
Mercados Relevantes — fuente principal: PostgreSQL (licitaciones + licitaciones_items).
Endpoints Serres mantienen SQL Server hasta migración posterior.
"""
import traceback
import datetime
from collections import defaultdict, OrderedDict
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn          # Serres endpoints (SQL Server)
from db_mp import get_pg_conn    # Main endpoints (PostgreSQL)
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT = "93.366.000-1"
IVA = 1.19

# ── PostgreSQL SQL fragments ───────────────────────────────────────────────────

# Category filter (ILIKE — %% escapes the literal % for psycopg2)
_CAT_PG = (
    "(li.categoria_nivel1 ILIKE 'Equipamiento y suministros m%%'"
    " OR li.categoria_nivel1 ILIKE 'Equipamiento para laboratorios%%')"
)

# LBF participation — JSONB check OR column adjudication (2026+: many items have oferentes IS NULL)
_LBF_PART = (
    "(EXISTS ("
    "  SELECT 1 FROM jsonb_array_elements(li.oferentes) o"
    "  WHERE o->>'rut' = '93.366.000-1'"
    ")"
    " OR li.rut_proveedor_adj = '93.366.000-1')"
)

# LBF adjudication — rut_proveedor_adj is only populated for 2026+; use JSONB seleccionada for all years
_LBF_ADJ = (
    "(li.rut_proveedor_adj = '93.366.000-1'"
    " OR (li.rut_proveedor_adj IS NULL"
    "     AND (SELECT (o->>'seleccionada')::boolean"
    "          FROM jsonb_array_elements(li.oferentes) o"
    "          WHERE o->>'rut' = '93.366.000-1' LIMIT 1) = true))"
)

# LBF's valor_total_ofertado — JSONB when available, falls back to column when LBF won (2026+)
_LBF_VTO = (
    "COALESCE("
    "(SELECT (o->>'valor_total_ofertado')::numeric"
    " FROM jsonb_array_elements(li.oferentes) o"
    " WHERE o->>'rut' = '93.366.000-1' LIMIT 1),"
    " CASE WHEN li.rut_proveedor_adj = '93.366.000-1' THEN li.valor_total_ofertado ELSE NULL END"
    ")"
)

# Winner's valor_total_ofertado — winner identified via seleccionada=true in JSONB
_WIN_VTO = (
    "(SELECT (o->>'valor_total_ofertado')::numeric"
    " FROM jsonb_array_elements(li.oferentes) o"
    " WHERE (o->>'seleccionada')::boolean = true LIMIT 1)"
)

# ── SQL Server fragments (Serres) ──────────────────────────────────────────────

_RUBRO_SS = (
    "(Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
    " OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
)

_SERRES_SS = (
    "AND ("
    "  DescripcionlineaAdquisicion LIKE '%bolsa%aspirac%'"
    "  OR DescripcionlineaAdquisicion LIKE '%aspirac%bolsa%'"
    "  OR DescripcionlineaAdquisicion LIKE '%bolsa%aspir%'"
    "  OR Nombreproductogenrico = 'DEPÓSITOS DE ASPIRACIÓN QUIRÚrgicos'"
    "  OR Nombreproductogenrico = 'SONDAS DE DRENAJE PARA LA ASPIRACIÓN QUIRÚrgica'"
    "  OR Nombreproductogenrico = 'CÁNULAS O TUBOS DE SUCCIÓN MÉDICOS O ACCESORIOS'"
    "  OR Nombreproductogenrico = 'PRODUCTOS DE ASPIRACIÓN PARA BIOPSIA O ACCESORIOS'"
    ")"
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _pg_close(conn):
    try:
        conn.close()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS — PostgreSQL
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/licitaciones-kpis")
async def licitaciones_kpis(current_user: dict = Depends(get_current_user)):
    """KPIs del mercado total por año (2024-2025-2026)."""
    ck = "mercados_relevantes:lic_kpis_pg_v2"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()

        # Note: rut_proveedor_adj is only populated for 2026+; use JSONB seleccionada for all years
        cur.execute(f"""
            WITH lics_yr AS (
                SELECT DISTINCT
                    EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
                    l.id AS lic_id,
                    COALESCE(l.monto_estimado, 0) AS monto_estimado
                FROM licitaciones l
                JOIN licitaciones_items li ON li.licitacion_id = l.id
                WHERE l.fecha_adjudicacion IS NOT NULL
                  AND EXTRACT(YEAR FROM l.fecha_adjudicacion) BETWEEN 2024 AND 2026
                  AND {_CAT_PG}
            ),
            lic_stats AS (
                SELECT ano,
                    COUNT(*) AS total_lics,
                    SUM(monto_estimado) AS monto_estimado
                FROM lics_yr GROUP BY ano
            ),
            lic_adj_stats AS (
                -- Item adjudicated: rut_proveedor_adj IS NOT NULL (2026+) OR JSONB seleccionada=true (all years)
                SELECT EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
                    COUNT(DISTINCT l.id) AS lics_adj
                FROM licitaciones l
                JOIN licitaciones_items li ON li.licitacion_id = l.id
                WHERE l.fecha_adjudicacion IS NOT NULL
                  AND EXTRACT(YEAR FROM l.fecha_adjudicacion) BETWEEN 2024 AND 2026
                  AND {_CAT_PG}
                  AND (
                      li.rut_proveedor_adj IS NOT NULL
                      OR (li.oferentes IS NOT NULL AND EXISTS (
                          SELECT 1 FROM jsonb_array_elements(li.oferentes) o
                          WHERE (o->>'seleccionada')::boolean = true
                      ))
                  )
                GROUP BY ano
            ),
            item_stats AS (
                SELECT EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
                    COUNT(*) AS total_items,
                    COUNT(CASE WHEN
                        li.rut_proveedor_adj IS NOT NULL
                        OR (li.oferentes IS NOT NULL AND has_win.is_adj IS NOT NULL)
                    THEN 1 END) AS items_adj,
                    SUM(COALESCE(win_vto.vto, li.valor_total_ofertado, 0)) AS monto_adjudicado
                FROM licitaciones l
                JOIN licitaciones_items li ON li.licitacion_id = l.id
                LEFT JOIN LATERAL (
                    SELECT TRUE AS is_adj
                    FROM jsonb_array_elements(li.oferentes) o
                    WHERE (o->>'seleccionada')::boolean = true
                    LIMIT 1
                ) has_win ON (li.oferentes IS NOT NULL)
                LEFT JOIN LATERAL (
                    SELECT (o->>'valor_total_ofertado')::numeric AS vto
                    FROM jsonb_array_elements(li.oferentes) o
                    WHERE (o->>'seleccionada')::boolean = true
                    LIMIT 1
                ) win_vto ON (li.oferentes IS NOT NULL AND has_win.is_adj IS NOT NULL)
                WHERE l.fecha_adjudicacion IS NOT NULL
                  AND EXTRACT(YEAR FROM l.fecha_adjudicacion) BETWEEN 2024 AND 2026
                  AND {_CAT_PG}
                  AND (li.rut_proveedor_adj IS NOT NULL OR li.oferentes IS NOT NULL)
                GROUP BY ano
            )
            SELECT ls.ano, ls.total_lics,
                COALESCE(las.lics_adj, 0) AS lics_adj,
                its.total_items, its.items_adj,
                ls.monto_estimado, its.monto_adjudicado
            FROM lic_stats ls
            LEFT JOIN lic_adj_stats las ON las.ano = ls.ano
            JOIN item_stats its ON its.ano = ls.ano
            ORDER BY ls.ano
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            ti = int(d["total_items"] or 0)
            ia = int(d["items_adj"] or 0)
            me = float(d["monto_estimado"] or 0)
            ma = float(d["monto_adjudicado"] or 0) * IVA
            rows.append({
                "ano":                 int(d["ano"]),
                "total_lics":          tl,
                "lics_adj":            la,
                "tasa_adj_lics":       round(la / tl * 100, 1) if tl else 0,
                "total_items":         ti,
                "items_adj":           ia,
                "tasa_adj_items":      round(ia / ti * 100, 1) if ti else 0,
                "monto_estimado":      me,
                "monto_adjudicado":    ma,
                "pct_adj_vs_estimado": round(ma / me * 100, 1) if me else 0,
            })
        result = {"anos": rows}
        mem_set(ck, result)
        return result

    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _pg_close(conn)


@router.get("/licitaciones-lbf")
async def licitaciones_lbf(current_user: dict = Depends(get_current_user)):
    """Resumen anual de participación LBF (2024-2025-2026)."""
    ck = "mercados_relevantes:lic_lbf_pg_v2"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT
                EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
                COUNT(DISTINCT l.id) AS total_lics,
                COUNT(DISTINCT CASE WHEN {_LBF_ADJ} THEN l.id END) AS lics_adj,
                COUNT(*) AS total_items,
                COUNT(CASE WHEN {_LBF_ADJ} THEN 1 END) AS items_adj,
                SUM(COALESCE({_LBF_VTO}, 0)) AS monto_ofertado,
                SUM(CASE WHEN {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto_adjudicado,
                MAX(EXTRACT(MONTH FROM l.fecha_adjudicacion))::int AS ultimo_mes
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) BETWEEN 2024 AND 2026
              AND {_CAT_PG}
              AND {_LBF_PART}
            GROUP BY ano
            ORDER BY ano
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            ti = int(d["total_items"] or 0)
            ia = int(d["items_adj"] or 0)
            mo = float(d["monto_ofertado"] or 0)
            ma = float(d["monto_adjudicado"] or 0) * IVA
            rows.append({
                "ano":                 int(d["ano"]),
                "total_lics":          tl,
                "lics_adj":            la,
                "tasa_adj_lics":       round(la / tl * 100, 1) if tl else 0,
                "total_items":         ti,
                "items_adj":           ia,
                "tasa_adj_items":      round(ia / ti * 100, 1) if ti else 0,
                "monto_ofertado":      mo,
                "monto_adjudicado":    ma,
                "pct_ganado_ofertado": round(ma / mo * 100, 1) if mo else 0,
                "ultimo_mes":          int(d["ultimo_mes"] or 0),
            })
        result = {"anos": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _pg_close(conn)


def _get_raw_lbf_data_pg() -> list[dict]:
    """Carga o retorna desde cache la data LBF por (ano, tipo) — PostgreSQL."""
    ck = "mercados_relevantes:lic_lbf_raw_pg_v2"
    if cached := mem_get(ck):
        return cached

    conn = get_pg_conn()
    cur = conn.cursor()
    cur.execute(f"""
        SELECT
            EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
            COALESCE(l.tipo, '(sin tipo)') AS tipo,
            COUNT(DISTINCT l.id) AS total_lics,
            COUNT(DISTINCT CASE WHEN {_LBF_ADJ} THEN l.id END) AS lics_adj,
            COUNT(*) AS total_items,
            COUNT(CASE WHEN {_LBF_ADJ} THEN 1 END) AS items_adj,
            SUM(COALESCE({_LBF_VTO}, 0)) AS monto_ofertado,
            SUM(CASE WHEN {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto_adjudicado
        FROM licitaciones l
        JOIN licitaciones_items li ON li.licitacion_id = l.id
        WHERE l.fecha_adjudicacion IS NOT NULL
          AND EXTRACT(YEAR FROM l.fecha_adjudicacion) IN (2024, 2025, 2026)
          AND {_CAT_PG}
          AND {_LBF_PART}
        GROUP BY ano, tipo
        ORDER BY ano, monto_ofertado DESC
    """)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    _pg_close(conn)
    result = [dict(zip(cols, r)) for r in rows]
    mem_set(ck, result)
    return result


@router.get("/licitaciones-lbf-tipo")
async def licitaciones_lbf_tipo(current_user: dict = Depends(get_current_user)):
    """Desglose por tipo de licitación (2024-2025-2026)."""
    try:
        raw = _get_raw_lbf_data_pg()
        rows = []
        for d in raw:
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            mo = float(d["monto_ofertado"] or 0)
            ma = float(d["monto_adjudicado"] or 0) * IVA
            rows.append({
                "ano":              int(d["ano"]),
                "tipo":             d["tipo"],
                "total_lics":       tl,
                "lics_adj":         la,
                "tasa_adj_lics":    round(la / tl * 100, 1) if tl else 0,
                "monto_ofertado":   mo,
                "monto_adjudicado": ma,
                "pct_ganado":       round(ma / mo * 100, 1) if mo else 0,
            })
        return {"filas": rows}
    except Exception as e:
        return {"filas": [], "error": str(e), "detail": traceback.format_exc()}


@router.get("/licitaciones-lbf-tipo-periodo")
async def licitaciones_lbf_tipo_periodo(current_user: dict = Depends(get_current_user)):
    """Desglose por tipo — mismo período Ene-May 2025 vs 2026."""
    ck = "mercados_relevantes:lic_lbf_tipo_periodo_pg_v2"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT
                COALESCE(l.tipo, '(sin tipo)') AS tipo,
                COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2025
                    THEN l.id END) AS total_lics_25,
                COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2025
                    AND {_LBF_ADJ} THEN l.id END) AS lics_adj_25,
                COUNT(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2025
                    THEN 1 END) AS items_part_25,
                COUNT(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2025
                    AND {_LBF_ADJ} THEN 1 END) AS items_adj_25,
                SUM(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2025
                    AND {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto_adj_25,
                COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                    THEN l.id END) AS total_lics_26,
                COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                    AND {_LBF_ADJ} THEN l.id END) AS lics_adj_26,
                COUNT(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                    THEN 1 END) AS items_part_26,
                COUNT(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                    AND {_LBF_ADJ} THEN 1 END) AS items_adj_26,
                SUM(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                    AND {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto_adj_26
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) IN (2025, 2026)
              AND EXTRACT(MONTH FROM l.fecha_adjudicacion) BETWEEN 1 AND 5
              AND {_CAT_PG}
              AND {_LBF_PART}
            GROUP BY tipo
            ORDER BY SUM(CASE WHEN EXTRACT(YEAR FROM l.fecha_adjudicacion) = 2026
                AND {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) DESC
        """)
        cols = [d[0] for d in cur.description]
        filas = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            filas.append({
                "tipo":           d["tipo"],
                "total_lics_25":  int(d["total_lics_25"]  or 0),
                "lics_adj_25":    int(d["lics_adj_25"]    or 0),
                "items_part_25":  int(d["items_part_25"]  or 0),
                "items_adj_25":   int(d["items_adj_25"]   or 0),
                "monto_adj_25":   round(float(d["monto_adj_25"] or 0) * IVA),
                "total_lics_26":  int(d["total_lics_26"]  or 0),
                "lics_adj_26":    int(d["lics_adj_26"]    or 0),
                "items_part_26":  int(d["items_part_26"]  or 0),
                "items_adj_26":   int(d["items_adj_26"]   or 0),
                "monto_adj_26":   round(float(d["monto_adj_26"] or 0) * IVA),
            })
        result = {"filas": filas}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"filas": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _pg_close(conn)


@router.get("/zona40-resumen")
async def zona40_resumen(current_user: dict = Depends(get_current_user)):
    """Facturación + Meta zona 40-MERCADO PUBLICO y adjudicaciones LBF por tipo de licitación."""
    today = datetime.date.today()
    ano   = today.year
    mes   = today.month
    ck    = f"mercados_relevantes:zona40_resumen_v1_{ano}_{mes}"
    if cached := mem_get(ck):
        return cached

    _MESES = {1:"Ene",2:"Feb",3:"Mar",4:"Abr",5:"May",6:"Jun",
              7:"Jul",8:"Ago",9:"Sep",10:"Oct",11:"Nov",12:"Dic"}
    mes_list     = ",".join(str(m) for m in range(1, mes + 1))
    aniomes_list = ",".join(str(ano * 100 + m) for m in range(1, mes + 1))

    conn_ss = None
    pg_conn = None
    try:
        conn_ss = get_conn()
        cur = conn_ss.cursor()

        # Venta zona 40 año actual por mes
        cur.execute(f"""
            SELECT MES, SUM(CAST(VENTA AS float)) AS venta
            FROM BI_TOTAL_FACTURA
            WHERE VENDEDOR = '40-MERCADO PUBLICO'
              AND ANO = {ano} AND MES IN ({mes_list})
              AND CODIGO NOT IN ('FLETE','NINV','SIN','')
            GROUP BY MES ORDER BY MES
        """)
        venta_mes = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

        # Venta mismo período año anterior
        cur.execute(f"""
            SELECT SUM(CAST(VENTA AS float))
            FROM BI_TOTAL_FACTURA
            WHERE VENDEDOR = '40-MERCADO PUBLICO'
              AND ANO = {ano - 1} AND MES IN ({mes_list})
              AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        """)
        r0 = cur.fetchone()
        venta_25_ytd = float(r0[0] or 0) if r0 else 0.0

        # Meta año actual desde Metas_KAM
        cur.execute(f"""
            SELECT CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) AS mes,
                   CAST(LTRIM(RTRIM([ META ])) AS float) AS meta
            FROM Metas_KAM
            WHERE LTRIM(RTRIM(Zona)) = '40-MERCADO PUBLICO'
              AND ANIOMES IN ({aniomes_list})
        """)
        meta_mes = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

        conn_ss.close()
        conn_ss = None

        # PostgreSQL: adjudicaciones LBF YTD por tipo de licitación
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        pg_cur.execute(f"""
            SELECT
                COALESCE(l.tipo, '(sin tipo)') AS tipo,
                COUNT(DISTINCT l.id)            AS lics_adj,
                SUM(COALESCE({_LBF_VTO}, 0))    AS monto_adj
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR  FROM l.fecha_adjudicacion) = {ano}
              AND EXTRACT(MONTH FROM l.fecha_adjudicacion) BETWEEN 1 AND {mes}
              AND {_CAT_PG}
              AND {_LBF_ADJ}
            GROUP BY l.tipo
            ORDER BY SUM(COALESCE({_LBF_VTO}, 0)) DESC
        """)
        pg_cols = [d[0] for d in pg_cur.description]
        por_tipo = []
        for row in pg_cur.fetchall():
            d = dict(zip(pg_cols, row))
            por_tipo.append({
                "tipo":      d["tipo"],
                "lics_adj":  int(d["lics_adj"] or 0),
                "monto_adj": round(float(d["monto_adj"] or 0) * IVA),
            })
        pg_cur.close()

        venta_ytd = sum(venta_mes.values())
        meta_ytd  = sum(meta_mes.values())

        por_mes = []
        for m in range(1, mes + 1):
            v  = venta_mes.get(m, 0)
            mt = meta_mes.get(m, 0)
            por_mes.append({
                "mes":       m,
                "mes_nom":   _MESES[m],
                "venta":     round(v),
                "meta":      round(mt),
                "cumpl_pct": round(v / mt * 100, 1) if mt > 0 else 0,
            })

        result = {
            "kpis": {
                "venta_ytd":    round(venta_ytd),
                "meta_ytd":     round(meta_ytd),
                "cumpl_pct":    round(venta_ytd / meta_ytd * 100, 1) if meta_ytd > 0 else 0,
                "venta_25_ytd": round(venta_25_ytd),
                "crec_pct":     round((venta_ytd / venta_25_ytd - 1) * 100, 1) if venta_25_ytd > 0 else 0,
            },
            "por_mes":  por_mes,
            "por_tipo": por_tipo,
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"kpis": {}, "por_mes": [], "por_tipo": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn_ss:
            try: conn_ss.close()
            except Exception: pass
        if pg_conn: _pg_close(pg_conn)


@router.get("/evolucion-mensual")
async def evolucion_mensual(current_user: dict = Depends(get_current_user)):
    """Evolución mensual ofertado y adjudicado LBF para 2024/2025/2026."""
    ck = "mercados_relevantes:evolucion_mensual_pg_v5"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()
        # items_part_precio: ítems donde LBF ofertó con precio real (Aceptada + VTO > 0)
        # Este es el denominador correcto para la tasa de adjudicación por ítems.
        # items sin precio en JSONB = LBF listó el ítem pero no tenía precio para ese producto.
        cur.execute(f"""
            SELECT
                EXTRACT(YEAR FROM l.fecha_adjudicacion)::int AS ano,
                EXTRACT(MONTH FROM l.fecha_adjudicacion)::int AS mes,
                COUNT(DISTINCT l.id) AS lics_part,
                COUNT(DISTINCT CASE WHEN {_LBF_ADJ} THEN l.id END) AS lics_adj,
                COUNT(*) AS items_part,
                COUNT(CASE WHEN
                    (SELECT o->>'estado' FROM jsonb_array_elements(li.oferentes) o
                     WHERE o->>'rut' = '93.366.000-1' LIMIT 1) = 'Aceptada'
                    OR li.rut_proveedor_adj = '93.366.000-1'
                THEN 1 END) AS items_part_acep,
                COUNT(CASE WHEN (
                    (SELECT o->>'estado' FROM jsonb_array_elements(li.oferentes) o
                     WHERE o->>'rut' = '93.366.000-1' LIMIT 1) = 'Aceptada'
                    AND (SELECT (o->>'valor_total_ofertado')::numeric
                         FROM jsonb_array_elements(li.oferentes) o
                         WHERE o->>'rut' = '93.366.000-1' LIMIT 1) > 0
                ) OR li.rut_proveedor_adj = '93.366.000-1'
                THEN 1 END) AS items_part_precio,
                COUNT(CASE WHEN {_LBF_ADJ} THEN 1 END) AS items_adj,
                SUM(COALESCE({_LBF_VTO}, 0)) AS monto_ofertado,
                SUM(CASE WHEN {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto_adjudicado
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) BETWEEN 2024 AND 2026
              AND l.fecha_adjudicacion < DATE_TRUNC('month', CURRENT_DATE)
              AND {_CAT_PG}
              AND {_LBF_PART}
            GROUP BY ano, mes
            ORDER BY ano, mes
        """)
        cols = [d[0] for d in cur.description]
        raw_rows = cur.fetchall()

        MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        _zero = lambda: {
            "v2024_of": 0, "v2024_adj": 0, "l2024_part": 0, "l2024_adj": 0,
            "i2024_part": 0, "i2024_part_acep": 0, "i2024_part_precio": 0, "i2024_adj": 0,
            "v2025_of": 0, "v2025_adj": 0, "l2025_part": 0, "l2025_adj": 0,
            "i2025_part": 0, "i2025_part_acep": 0, "i2025_part_precio": 0, "i2025_adj": 0,
            "v2026_of": 0, "v2026_adj": 0, "l2026_part": 0, "l2026_adj": 0,
            "i2026_part": 0, "i2026_part_acep": 0, "i2026_part_precio": 0, "i2026_adj": 0,
        }
        by_mes: dict = {}
        for r in raw_rows:
            d = dict(zip(cols, r))
            ano = int(d["ano"])
            mes = int(d["mes"])
            if mes not in by_mes:
                by_mes[mes] = {"mes": mes, "mes_nom": MESES[mes - 1], **_zero()}
            of   = round(float(d["monto_ofertado"]      or 0))
            adj  = round(float(d["monto_adjudicado"]    or 0) * IVA)
            lp   = int(d["lics_part"]         or 0)
            la   = int(d["lics_adj"]          or 0)
            ip   = int(d["items_part"]        or 0)
            ipa  = int(d["items_part_acep"]   or 0)
            ipp  = int(d["items_part_precio"] or 0)
            ia   = int(d["items_adj"]         or 0)
            prefix = {2024: "2024", 2025: "2025", 2026: "2026"}.get(ano)
            if prefix:
                by_mes[mes][f"v{prefix}_of"]          = of
                by_mes[mes][f"v{prefix}_adj"]         = adj
                by_mes[mes][f"l{prefix}_part"]        = lp
                by_mes[mes][f"l{prefix}_adj"]         = la
                by_mes[mes][f"i{prefix}_part"]        = ip
                by_mes[mes][f"i{prefix}_part_acep"]   = ipa
                by_mes[mes][f"i{prefix}_part_precio"] = ipp
                by_mes[mes][f"i{prefix}_adj"]         = ia

        meses_full = []
        for m in range(1, 13):
            row = by_mes.get(m, {"mes": m, "mes_nom": MESES[m - 1], **_zero()})
            meses_full.append(row)

        data = {"meses": meses_full}
        mem_set(ck, data)
        return data

    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _pg_close(conn)


@router.get("/perdidos-precio")
async def perdidos_precio(
    ano: int = Query(2025),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    """
    Ítems donde LBF participó pero no fue adjudicado.
    Grupo A: oferta aceptada, LBF tenía precio mínimo pero no ganó.
    Grupo B: oferta rechazada (inadmisible).
    """
    ck = f"mercados_relevantes:perdidos_precio_pg_v2:{ano}:{mes}"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()

        # Grupo A — LBF aceptada, menor precio, no adjudicada
        # Winner identified via seleccionada=true in JSONB (works for all years, rut_proveedor_adj is NULL pre-2026)
        cur.execute(f"""
            SELECT
                l.codigo,
                li.correlativo::text AS codigo_item,
                li.nombre_producto AS producto,
                l.comprador_nombre_organismo AS organismo,
                COALESCE(l.tipo, '(sin tipo)') AS tipo,
                l.fecha_adjudicacion::date AS fecha_adj,
                lbf_o.lbf_precio,
                lbf_o.lbf_precio_unit,
                win_o.ganador_precio,
                win_o.ganador_precio_unit,
                win_o.ganador_nombre,
                ROUND((win_o.ganador_precio / NULLIF(lbf_o.lbf_precio, 0) - 1) * 100, 1) AS dif_pct
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            JOIN LATERAL (
                SELECT
                    COALESCE((o->>'valor_total_ofertado')::numeric, 0) AS lbf_precio,
                    COALESCE((o->>'monto_unitario')::numeric, 0)       AS lbf_precio_unit,
                    o->>'estado' AS estado
                FROM jsonb_array_elements(li.oferentes) o
                WHERE o->>'rut' = '93.366.000-1'
                LIMIT 1
            ) lbf_o ON true
            JOIN LATERAL (
                SELECT
                    COALESCE((o->>'valor_total_ofertado')::numeric, 0) AS ganador_precio,
                    COALESCE((o->>'monto_unitario')::numeric, 0)       AS ganador_precio_unit,
                    COALESCE(o->>'razon_social', o->>'nombre', '')     AS ganador_nombre
                FROM jsonb_array_elements(li.oferentes) o
                WHERE (o->>'seleccionada')::boolean = true
                  AND o->>'rut' <> '93.366.000-1'
                LIMIT 1
            ) win_o ON true
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) = %s
              AND (EXTRACT(MONTH FROM l.fecha_adjudicacion) = %s OR %s = 0)
              AND {_CAT_PG}
              AND lbf_o.estado = 'Aceptada'
              AND lbf_o.lbf_precio >= 1000
              AND lbf_o.lbf_precio <= (
                  SELECT MIN((o->>'valor_total_ofertado')::numeric)
                  FROM jsonb_array_elements(li.oferentes) o
                  WHERE (o->>'valor_total_ofertado')::numeric > 0
              )
              AND win_o.ganador_precio > lbf_o.lbf_precio
            ORDER BY dif_pct DESC
            LIMIT 500
        """, (ano, mes, mes))
        cols_a = [d[0] for d in cur.description]
        grupo_a = []
        for r in cur.fetchall():
            d = dict(zip(cols_a, r))
            grupo_a.append({
                "codigo":              d["codigo"],
                "codigo_item":         d["codigo_item"],
                "producto":            d["producto"] or "",
                "organismo":           d["organismo"] or "",
                "tipo":                d["tipo"] or "",
                "fecha_adj":           str(d["fecha_adj"]),
                "lbf_precio":          round(float(d["lbf_precio"] or 0) * IVA),
                "lbf_precio_unit":     round(float(d["lbf_precio_unit"] or 0) * IVA),
                "ganador_precio":      round(float(d["ganador_precio"] or 0) * IVA),
                "ganador_precio_unit": round(float(d["ganador_precio_unit"] or 0) * IVA),
                "ganador_nombre":      d["ganador_nombre"] or "",
                "dif_pct":             float(d["dif_pct"] or 0),
            })

        # Grupo B — LBF rechazada
        cur.execute(f"""
            SELECT
                l.codigo,
                li.correlativo::text AS codigo_item,
                li.nombre_producto AS producto,
                l.comprador_nombre_organismo AS organismo,
                COALESCE(l.tipo, '(sin tipo)') AS tipo,
                l.fecha_adjudicacion::date AS fecha_adj,
                lbf_o.lbf_precio,
                lbf_o.lbf_precio_unit,
                COALESCE(win_o.ganador_nombre, '') AS ganador_nombre,
                COALESCE(win_o.ganador_precio, 0)  AS ganador_precio
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            JOIN LATERAL (
                SELECT
                    COALESCE((o->>'valor_total_ofertado')::numeric, 0) AS lbf_precio,
                    COALESCE((o->>'monto_unitario')::numeric, 0)       AS lbf_precio_unit,
                    o->>'estado' AS estado
                FROM jsonb_array_elements(li.oferentes) o
                WHERE o->>'rut' = '93.366.000-1'
                LIMIT 1
            ) lbf_o ON true
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE((o->>'valor_total_ofertado')::numeric, 0) AS ganador_precio,
                    COALESCE(o->>'razon_social', o->>'nombre', '')     AS ganador_nombre
                FROM jsonb_array_elements(li.oferentes) o
                WHERE (o->>'seleccionada')::boolean = true
                  AND o->>'rut' <> '93.366.000-1'
                LIMIT 1
            ) win_o ON true
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) = %s
              AND (EXTRACT(MONTH FROM l.fecha_adjudicacion) = %s OR %s = 0)
              AND {_CAT_PG}
              AND lbf_o.estado = 'Rechazada'
            ORDER BY l.fecha_adjudicacion DESC
            LIMIT 500
        """, (ano, mes, mes))
        cols_b = [d[0] for d in cur.description]
        grupo_b = []
        for r in cur.fetchall():
            d = dict(zip(cols_b, r))
            grupo_b.append({
                "codigo":          d["codigo"],
                "codigo_item":     d["codigo_item"],
                "producto":        d["producto"] or "",
                "organismo":       d["organismo"] or "",
                "tipo":            d["tipo"] or "",
                "fecha_adj":       str(d["fecha_adj"]),
                "lbf_precio":      round(float(d["lbf_precio"] or 0) * IVA),
                "lbf_precio_unit": round(float(d["lbf_precio_unit"] or 0) * IVA),
                "ganador_nombre":  d["ganador_nombre"] or "",
                "ganador_precio":  round(float(d["ganador_precio"] or 0) * IVA),
            })

        # Resumen de participación
        cur.execute(f"""
            SELECT
                COUNT(DISTINCT l.id) AS lics_part,
                COUNT(DISTINCT CASE WHEN {_LBF_ADJ} THEN l.id END) AS lics_adj,
                COUNT(*) AS items_part,
                COUNT(CASE WHEN {_LBF_ADJ} THEN 1 END) AS items_adj,
                COUNT(CASE WHEN (
                    SELECT o->>'estado' FROM jsonb_array_elements(li.oferentes) o
                    WHERE o->>'rut' = '93.366.000-1' LIMIT 1
                ) = 'Rechazada' THEN 1 END) AS items_inadmisibles,
                COUNT(DISTINCT CASE WHEN (
                    SELECT o->>'estado' FROM jsonb_array_elements(li.oferentes) o
                    WHERE o->>'rut' = '93.366.000-1' LIMIT 1
                ) = 'Rechazada' THEN l.id END) AS lics_inadmisibles
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) = %s
              AND (EXTRACT(MONTH FROM l.fecha_adjudicacion) = %s OR %s = 0)
              AND {_CAT_PG}
              AND {_LBF_PART}
        """, (ano, mes, mes))
        r_res = cur.fetchone()
        c_res = [d[0] for d in cur.description]
        res_d = dict(zip(c_res, r_res))
        resumen = {
            "lics_part":          int(res_d["lics_part"] or 0),
            "lics_adj":           int(res_d["lics_adj"] or 0),
            "items_part":         int(res_d["items_part"] or 0),
            "items_adj":          int(res_d["items_adj"] or 0),
            "items_inadmisibles": int(res_d["items_inadmisibles"] or 0),
            "lics_inadmisibles":  int(res_d["lics_inadmisibles"] or 0),
            "items_menor_precio": len(grupo_a),
        }

        # Inadmisibles por tipo
        cur.execute(f"""
            SELECT COALESCE(l.tipo, '(sin tipo)') AS tipo,
                COUNT(DISTINCT l.id) AS lics,
                COUNT(*) AS items
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND EXTRACT(YEAR FROM l.fecha_adjudicacion) = %s
              AND (EXTRACT(MONTH FROM l.fecha_adjudicacion) = %s OR %s = 0)
              AND {_CAT_PG}
              AND (
                  SELECT o->>'estado' FROM jsonb_array_elements(li.oferentes) o
                  WHERE o->>'rut' = '93.366.000-1' LIMIT 1
              ) = 'Rechazada'
            GROUP BY tipo
            ORDER BY items DESC
        """, (ano, mes, mes))
        inadmisibles_por_tipo = [
            {"tipo": r[0], "lics": int(r[1] or 0), "items": int(r[2] or 0)}
            for r in cur.fetchall()
        ]

        result = {
            "aceptadas": grupo_a,
            "rechazadas": grupo_b,
            "resumen": resumen,
            "inadmisibles_por_tipo": inadmisibles_por_tipo,
        }
        mem_set(ck, result)
        return result

    except Exception as e:
        return {
            "aceptadas": [], "rechazadas": [],
            "resumen": {}, "inadmisibles_por_tipo": [],
            "error": str(e), "detail": traceback.format_exc(),
        }
    finally:
        if conn: _pg_close(conn)


@router.get("/perdidos-licitacion")
async def perdidos_licitacion(
    codigo: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Todos los ítems + proveedores de una licitación donde LBF participó."""
    ck = f"mercados_relevantes:perdidos_licitacion_pg_v2:{codigo}"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_pg_conn()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT
                li.correlativo AS codigo_item,
                li.nombre_producto AS producto,
                li.rut_proveedor_adj,
                li.oferentes
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.codigo = %s
              AND {_LBF_PART}
            ORDER BY li.correlativo
        """, (codigo,))
        rows = cur.fetchall()
        if not rows:
            result = {"codigo": codigo, "items": []}
            mem_set(ck, result)
            return result

        items_map: dict = OrderedDict()
        for r in rows:
            ci = int(r[0] or 0)
            producto = r[1] or ""
            rut_adj = r[2]
            oferentes_json = r[3] or []
            if ci not in items_map:
                items_map[ci] = {"codigo_item": ci, "producto": producto, "proveedores": []}
            for o in oferentes_json:
                rut = o.get("rut", "")
                items_map[ci]["proveedores"].append({
                    "nombre":        o.get("razon_social") or o.get("nombre") or "",
                    "rut":           rut,
                    "es_lbf":        rut == LBF_RUT,
                    "estado_oferta": o.get("estado", ""),
                    "seleccionada":  bool(o.get("seleccionada")),
                    "precio_unit":   round(float(o.get("monto_unitario") or 0) * IVA),
                    "precio_total":  round(float(o.get("valor_total_ofertado") or 0) * IVA),
                    "cantidad_req":  round(float(o.get("cantidad_ofertada") or 0)),
                })
            # Sort: winner first, then LBF, then by precio_total asc
            items_map[ci]["proveedores"].sort(
                key=lambda p: (not p["seleccionada"], not p["es_lbf"], p["precio_total"])
            )

        result = {"codigo": codigo, "items": list(items_map.values())}
        mem_set(ck, result)
        return result

    except Exception as e:
        return {"codigo": codigo, "items": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _pg_close(conn)


# ══════════════════════════════════════════════════════════════════════════════
#  SGL — Gestión comercial (SQL Server BI — tablas SGL_*)
# ══════════════════════════════════════════════════════════════════════════════

def _ss_close(conn):
    try:
        conn.close()
    except Exception:
        pass


def _get_pg_adj_set() -> set:
    """Retorna el set de códigos de licitación donde LBF fue adjudicado en MP (PostgreSQL).
    Cacheado 8h — evita repetir el mismo query JSONB costoso en múltiples endpoints SGL."""
    ck = "mercados_relevantes:pg_adj_lbf_set_v1"
    if cached := mem_get(ck):
        return set(cached)
    pg_conn = None
    try:
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        pg_cur.execute(f"""
            SELECT DISTINCT l.codigo
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE {_LBF_ADJ}
        """)
        result = {r[0] for r in pg_cur.fetchall()}
        pg_cur.close()
        mem_set(ck, list(result))
        return result
    except Exception:
        return set()
    finally:
        if pg_conn: _pg_close(pg_conn)


def _get_pg_adj_map() -> dict:
    """Retorna dict codigo → (ano_adj, mes_adj, monto_adj) para licitaciones donde LBF ganó en MP.
    Cacheado 8h."""
    ck = "mercados_relevantes:pg_adj_lbf_map_v1"
    if cached := mem_get(ck):
        return {k: tuple(v) for k, v in cached.items()}
    pg_conn = None
    try:
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        pg_cur.execute(f"""
            SELECT DISTINCT ON (l.codigo)
                l.codigo,
                EXTRACT(YEAR  FROM l.fecha_adjudicacion)::int AS ano_adj,
                EXTRACT(MONTH FROM l.fecha_adjudicacion)::int AS mes_adj,
                COALESCE(
                    (SELECT SUM((o->>'valor_total_ofertado')::numeric)
                     FROM jsonb_array_elements(li.oferentes) o
                     WHERE o->>'rut' = '93.366.000-1'),
                    CASE WHEN li.rut_proveedor_adj = '93.366.000-1' THEN li.valor_total_ofertado ELSE NULL END,
                    0
                ) AS monto_adj
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND {_LBF_ADJ}
            ORDER BY l.codigo, l.fecha_adjudicacion
        """)
        result = {}
        for r in pg_cur.fetchall():
            result[r[0]] = (int(r[1] or 0), int(r[2] or 0), float(r[3] or 0))
        pg_cur.close()
        mem_set(ck, result)
        return result
    except Exception:
        return {}
    finally:
        if pg_conn: _pg_close(pg_conn)


def _get_pg_all_adj_dates() -> dict:
    """Retorna dict codigo → (ano_adj, mes_adj) para TODAS las licitaciones adjudicadas desde 2024.
    Usado como denominador: de las licitaciones que LBF cotizó, cuántas se resolvieron cada mes.
    Cacheado 8h. Solo escanea la tabla licitaciones (sin JSONB)."""
    ck = "mercados_relevantes:pg_all_adj_dates_v1"
    if cached := mem_get(ck):
        return {k: tuple(v) for k, v in cached.items()}
    pg_conn = None
    try:
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        pg_cur.execute("""
            SELECT DISTINCT ON (codigo)
                codigo,
                EXTRACT(YEAR  FROM fecha_adjudicacion)::int AS ano_adj,
                EXTRACT(MONTH FROM fecha_adjudicacion)::int AS mes_adj
            FROM licitaciones
            WHERE fecha_adjudicacion IS NOT NULL
              AND fecha_adjudicacion >= '2024-01-01'
              AND fecha_adjudicacion < DATE_TRUNC('month', CURRENT_DATE)
            ORDER BY codigo, fecha_adjudicacion
        """)
        result = {}
        for r in pg_cur.fetchall():
            result[r[0]] = (int(r[1] or 0), int(r[2] or 0))
        pg_cur.close()
        mem_set(ck, result)
        return result
    except Exception:
        return {}
    finally:
        if pg_conn: _pg_close(pg_conn)


def _sgl_date_filter(col: str, ano: int, mes: int, trim: int, ytd: int) -> tuple:
    """Devuelve (fragmento_WHERE, params) para filtrar SGL por período."""
    import datetime
    clauses: list = []
    params:  list = []
    if ytd:
        hoy = datetime.date.today()
        clauses.append(f"YEAR({col}) = {hoy.year}")
        clauses.append(f"MONTH({col}) <= {hoy.month}")
    else:
        if ano:
            clauses.append(f"YEAR({col}) = ?");  params.append(ano)
        if mes and not trim:
            clauses.append(f"MONTH({col}) = ?");  params.append(mes)
        elif trim and 1 <= trim <= 4 and not mes:
            q_s = (trim - 1) * 3 + 1
            q_e = trim * 3
            clauses.append(f"MONTH({col}) BETWEEN ? AND ?")
            params += [q_s, q_e]
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _sgl_period_label(ano: int, mes: int, trim: int, ytd: int) -> str:
    import datetime
    MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    TRIM_LABEL = {1:"Ene–Mar", 2:"Abr–Jun", 3:"Jul–Sep", 4:"Oct–Dic"}
    hoy = datetime.date.today()
    if ytd:
        return f"Ene–{MESES[hoy.month-1]} {hoy.year} (YTD)"
    if ano and mes:
        return f"{MESES[mes-1]} {ano}"
    if ano and trim:
        return f"T{trim} {ano} ({TRIM_LABEL[trim]})"
    if ano:
        return str(ano)
    if mes:
        return MESES[mes-1]
    return "Ene 2025 – hoy"


@router.get("/sgl-kpis")
async def sgl_kpis(
    ano:  int = Query(0),
    mes:  int = Query(0),
    trim: int = Query(0),
    ytd:  int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    """KPIs generales del pipeline SGL filtrable por período."""
    ck = f"mercados_relevantes:sgl_kpis_v2:{ano}:{mes}:{trim}:{ytd}"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Tenders
        w, p = _sgl_date_filter("fecha_creacion", ano, mes, trim, ytd)
        cur.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END)
            FROM SGL_Tenders {w}
        """, p)
        t = cur.fetchone()
        tenders = {
            "total": int(t[0] or 0), "cotizadas": int(t[1] or 0),
            "en_proceso": int(t[2] or 0), "sin_gestionar": int(t[3] or 0),
        }

        # QuickBids
        cur.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END)
            FROM SGL_QuickBids {w}
        """, p)
        q = cur.fetchone()
        quickbids = {
            "total": int(q[0] or 0), "cotizadas": int(q[1] or 0),
            "en_proceso": int(q[2] or 0), "sin_gestionar": int(q[3] or 0),
        }

        # OC — usa fecha_creacion de SGL_PurchaseOrders
        w_oc, p_oc = _sgl_date_filter("fecha_creacion", ano, mes, trim, ytd)
        cur.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN estado LIKE 'Recepci_n conforme' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado = 'Aceptada'              THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado LIKE 'Cancelada%'         THEN 1 ELSE 0 END),
                   SUM(CASE WHEN estado = 'No aceptada'           THEN 1 ELSE 0 END),
                   SUM(ISNULL(monto, 0)),
                   SUM(CASE WHEN estado LIKE 'Recepci_n conforme' OR estado = 'Aceptada'
                       THEN ISNULL(monto, 0) ELSE 0 END)
            FROM SGL_PurchaseOrders {w_oc}
        """, p_oc)
        o = cur.fetchone()
        oc = {
            "total": int(o[0] or 0),
            "recepcion_conforme": int(o[1] or 0),
            "aceptadas":          int(o[2] or 0),
            "canceladas":         int(o[3] or 0),
            "no_aceptadas":       int(o[4] or 0),
            "monto_total":        round(float(o[5] or 0)),
            "monto_confirmado":   round(float(o[6] or 0)),
        }

        result = {
            "tenders": tenders, "quickbids": quickbids, "oc": oc,
            "periodo": _sgl_period_label(ano, mes, trim, ytd),
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/sgl-pipeline-mensual")
async def sgl_pipeline_mensual(current_user: dict = Depends(get_current_user)):
    """Evolución mensual del pipeline SGL (tenders + quickbids) desde Ene 2025."""
    ck = "mercados_relevantes:sgl_pipeline_mensual_v2"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                YEAR(fecha_creacion)  AS ano,
                MONTH(fecha_creacion) AS mes,
                SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END) AS t_cotizadas,
                SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END) AS t_en_proceso,
                SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END) AS t_sin_gestionar,
                COUNT(*) AS t_total
            FROM SGL_Tenders
            WHERE fecha_creacion >= '2025-01-01'
              AND fecha_creacion < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
            GROUP BY YEAR(fecha_creacion), MONTH(fecha_creacion)
            ORDER BY ano, mes
        """)
        t_rows = {(int(r[0]), int(r[1])): r for r in cur.fetchall()}

        cur.execute("""
            SELECT
                YEAR(fecha_creacion)  AS ano,
                MONTH(fecha_creacion) AS mes,
                SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END) AS qb_cotizadas,
                SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END) AS qb_en_proceso,
                SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END) AS qb_sin_gestionar,
                COUNT(*) AS qb_total
            FROM SGL_QuickBids
            WHERE fecha_creacion >= '2025-01-01'
              AND fecha_creacion < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
            GROUP BY YEAR(fecha_creacion), MONTH(fecha_creacion)
            ORDER BY ano, mes
        """)
        qb_rows = {(int(r[0]), int(r[1])): r for r in cur.fetchall()}

        MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        meses_out = []
        all_keys = sorted(set(list(t_rows.keys()) + list(qb_rows.keys())))
        for (y, m) in all_keys:
            t  = t_rows.get((y, m),  (y, m, 0, 0, 0, 0))
            qb = qb_rows.get((y, m), (y, m, 0, 0, 0, 0))
            meses_out.append({
                "label":            f"{MESES[m-1]}'{str(y)[2:]}",
                "ano": y, "mes": m,
                "t_cotizadas":      int(t[2]  or 0),
                "t_en_proceso":     int(t[3]  or 0),
                "t_sin_gestionar":  int(t[4]  or 0),
                "t_total":          int(t[5]  or 0),
                "qb_cotizadas":     int(qb[2] or 0),
                "qb_en_proceso":    int(qb[3] or 0),
                "qb_sin_gestionar": int(qb[4] or 0),
                "qb_total":         int(qb[5] or 0),
            })

        result = {"meses": meses_out}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/sgl-motivos")
async def sgl_motivos(current_user: dict = Depends(get_current_user)):
    """Motivos de descarte en tenders y quickbids SGL."""
    ck = "mercados_relevantes:sgl_motivos_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                ISNULL(NULLIF(LTRIM(RTRIM(motivo_descarte)),''), '(sin motivo)') AS motivo,
                COUNT(*) AS tenders,
                0        AS quickbids
            FROM SGL_Tenders
            WHERE motivo_descarte IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_descarte))) > 0
            GROUP BY LTRIM(RTRIM(motivo_descarte))
            UNION ALL
            SELECT
                ISNULL(NULLIF(LTRIM(RTRIM(motivo_descarte)),''), '(sin motivo)') AS motivo,
                0        AS tenders,
                COUNT(*) AS quickbids
            FROM SGL_QuickBids
            WHERE motivo_descarte IS NOT NULL AND LEN(LTRIM(RTRIM(motivo_descarte))) > 0
            GROUP BY LTRIM(RTRIM(motivo_descarte))
        """)
        from collections import defaultdict
        agg = defaultdict(lambda: {"tenders": 0, "quickbids": 0})
        for r in cur.fetchall():
            motivo = r[0]
            agg[motivo]["tenders"]   += int(r[1] or 0)
            agg[motivo]["quickbids"] += int(r[2] or 0)

        rows = [
            {"motivo": k, "tenders": v["tenders"], "quickbids": v["quickbids"],
             "total": v["tenders"] + v["quickbids"]}
            for k, v in agg.items()
        ]
        rows.sort(key=lambda x: -x["total"])

        result = {"motivos": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"motivos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/sgl-oc-mensual")
async def sgl_oc_mensual(current_user: dict = Depends(get_current_user)):
    """OC recibidas por LBF mes a mes con monto y estado."""
    ck = "mercados_relevantes:sgl_oc_mensual_v2"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                YEAR(fecha_creacion)   AS ano,
                MONTH(fecha_creacion)  AS mes,
                estado,
                COUNT(*)               AS n_oc,
                SUM(ISNULL(monto, 0))  AS monto
            FROM SGL_PurchaseOrders
            WHERE fecha_creacion >= '2025-01-01'
              AND fecha_creacion < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
            GROUP BY YEAR(fecha_creacion), MONTH(fecha_creacion), estado
            ORDER BY ano, mes, estado
        """)
        from collections import defaultdict
        MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        by_mes = defaultdict(lambda: {"n_oc": 0, "monto_total": 0, "estados": {}})
        for r in cur.fetchall():
            y, m, estado, n, monto = int(r[0]), int(r[1]), r[2] or "", int(r[3] or 0), float(r[4] or 0)
            key = (y, m)
            by_mes[key]["n_oc"]       += n
            by_mes[key]["monto_total"] += monto
            by_mes[key]["estados"][estado] = by_mes[key]["estados"].get(estado, 0) + monto

        rows = []
        for (y, m), v in sorted(by_mes.items()):
            rows.append({
                "label":       f"{MESES[m-1]}'{str(y)[2:]}",
                "ano": y, "mes": m,
                "n_oc":        v["n_oc"],
                "monto_total": round(v["monto_total"]),
                "monto_conf":  round(sum(vv for k, vv in v["estados"].items()
                                        if "conforme" in k.lower() or k == "Aceptada")),
                "estados":     {k: round(vv) for k, vv in v["estados"].items()},
            })

        result = {"meses": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/sgl-items-mensual")
async def sgl_items_mensual(current_user: dict = Depends(get_current_user)):
    """Items donde LBF ofertó vs adjudicados por mes (fecha_adjudicacion MP) — fuente: PostgreSQL."""
    ck = "mercados_relevantes:sgl_items_mensual_v6"
    if cached := mem_get(ck):
        return cached
    pg_conn = None
    try:
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        # items_ofertados = ítems en los que LBF específicamente ofertó (_LBF_PART)
        # items_adj       = ítems que LBF ganó (_LBF_ADJ)
        # Agrupado por mes de adjudicación de la licitación (meses cerrados)
        pg_cur.execute(f"""
            SELECT
                EXTRACT(YEAR  FROM l.fecha_adjudicacion)::int AS ano_adj,
                EXTRACT(MONTH FROM l.fecha_adjudicacion)::int AS mes_adj,
                COUNT(DISTINCT CASE WHEN {_LBF_PART} THEN l.id END) AS tenders,
                COUNT(DISTINCT CASE WHEN {_LBF_ADJ}  THEN l.id END) AS tenders_adj,
                COUNT(CASE WHEN {_LBF_PART} THEN 1 END) AS items_ofertados,
                COUNT(CASE WHEN {_LBF_ADJ}  THEN 1 END) AS items_adj
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND l.fecha_adjudicacion >= '2025-01-01'
              AND l.fecha_adjudicacion < DATE_TRUNC('month', CURRENT_DATE)
              AND {_CAT_PG}
            GROUP BY ano_adj, mes_adj
            ORDER BY ano_adj, mes_adj
        """)
        cols = [d[0] for d in pg_cur.description]
        pg_rows = [dict(zip(cols, r)) for r in pg_cur.fetchall()]
        pg_cur.close()

        MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        rows = []
        for d in pg_rows:
            ano = int(d["ano_adj"] or 0)
            mes = int(d["mes_adj"] or 0)
            if not ano or not mes:
                continue
            items_of  = int(d["items_ofertados"] or 0)
            items_adj = int(d["items_adj"]       or 0)
            rows.append({
                "label":           f"{MESES[mes-1]}'{str(ano)[2:]}",
                "ano": ano, "mes": mes,
                "tenders":         int(d["tenders"]     or 0),
                "tenders_adj":     int(d["tenders_adj"] or 0),
                "items_ofertados": items_of,
                "items_adj":       items_adj,
                "tasa_items":      round(items_adj / items_of * 100, 1) if items_of else 0,
            })

        result = {"meses": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if pg_conn: _pg_close(pg_conn)


@router.get("/sgl-performance")
async def sgl_performance(
    ano: int = Query(0),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    """Performance por vendedor/pm — cruce SGL (quién gestionó) × PG (LBF adjudicado en MP)."""
    ck = f"mercados_relevantes:sgl_performance_v4:{ano}:{mes}"
    if cached := mem_get(ck):
        return cached
    ss_conn = pg_conn = None
    try:
        # ── 1. SGL Tenders cotizados/en proceso con vendedor y pm (SQL Server) ──
        ss_conn = get_conn()
        ss_cur = ss_conn.cursor()
        ss_cur.execute("""
            SELECT codigo,
                   ISNULL(NULLIF(LTRIM(RTRIM(vendedor)),    ''), '(Sin asignar)') AS vendedor,
                   ISNULL(NULLIF(LTRIM(RTRIM(usuario_pm)), ''), '(Sin asignar)') AS usuario_pm,
                   estado_sgl,
                   ISNULL(items_count, 0) AS items_count
            FROM SGL_Tenders
            WHERE estado_sgl IN ('Cotizada','En proceso')
              AND (? = 0 OR YEAR(fecha_creacion)  = ?)
              AND (? = 0 OR MONTH(fecha_creacion) = ?)
              AND (? != 0 OR ? != 0 OR fecha_creacion < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        """, (ano, ano, mes, mes, ano, mes))
        sgl_rows = ss_cur.fetchall()
        ss_cur.close()
        _ss_close(ss_conn); ss_conn = None

        # ── 2. LBF adjudicado en MP — derivado del mapa cacheado (PG) ───────────
        adj_set: set = set()
        if sgl_rows:
            sgl_codigos = {r[0] for r in sgl_rows}
            adj_set = set(_get_pg_adj_map().keys()) & sgl_codigos

        # ── 3. Agrupar por usuario (vendedor y pm) ────────────────────────────
        def build_perf(col_idx: int) -> list:
            agg: dict = {}
            for codigo, vendedor, usuario_pm, estado_sgl, items_count in sgl_rows:
                usuario = vendedor if col_idx == 1 else usuario_pm
                if usuario not in agg:
                    agg[usuario] = {"cotizadas": 0, "en_proceso": 0, "items_ofertados": 0, "adj": 0, "items_adj": 0}
                d = agg[usuario]
                d["items_ofertados"] += int(items_count or 0)
                if estado_sgl == "Cotizada":
                    d["cotizadas"] += 1
                else:
                    d["en_proceso"] += 1
                if codigo in adj_set:
                    d["adj"] += 1
                    d["items_adj"] += int(items_count or 0)
            rows = []
            for usuario, d in agg.items():
                cot = d["cotizadas"]
                gestionados = cot + d["en_proceso"]
                adj = d["adj"]
                rows.append({
                    "usuario":         usuario,
                    "total":           gestionados,
                    "cotizadas":       cot,
                    "en_proceso":      d["en_proceso"],
                    "items_ofertados": d["items_ofertados"],
                    "adj":             adj,
                    "items_adj":       d["items_adj"],
                    "tasa_cot":        round(cot / gestionados * 100, 1) if gestionados else 0,
                    "tasa_adj":        round(adj / cot * 100, 1) if cot else 0,
                })
            rows.sort(key=lambda r: (-r["adj"], -r["cotizadas"]))
            return rows

        result = {
            "por_vendedor": build_perf(1),
            "por_pm":       build_perf(2),
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"por_vendedor": [], "por_pm": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if ss_conn: _ss_close(ss_conn)


@router.get("/sgl-adj-mensual")
async def sgl_adj_mensual(current_user: dict = Depends(get_current_user)):
    """Licitaciones LBF ofertadas vs adjudicadas por mes (fecha_adjudicacion MP) — fuente: PostgreSQL."""
    ck = "mercados_relevantes:sgl_adj_mensual_v5"
    if cached := mem_get(ck):
        return cached
    pg_conn = None
    try:
        pg_conn = get_pg_conn()
        pg_cur = pg_conn.cursor()
        # n_total = licitaciones adjudicadas ese mes donde LBF participó
        # n_lics  = de esas, las que LBF ganó
        pg_cur.execute(f"""
            SELECT
                EXTRACT(YEAR  FROM l.fecha_adjudicacion)::int AS ano_adj,
                EXTRACT(MONTH FROM l.fecha_adjudicacion)::int AS mes_adj,
                COUNT(DISTINCT CASE WHEN {_LBF_PART} THEN l.id END) AS n_total,
                COUNT(DISTINCT CASE WHEN {_LBF_ADJ}  THEN l.id END) AS n_lics,
                SUM(CASE WHEN {_LBF_ADJ} THEN COALESCE({_LBF_VTO}, 0) ELSE 0 END) AS monto
            FROM licitaciones l
            JOIN licitaciones_items li ON li.licitacion_id = l.id
            WHERE l.fecha_adjudicacion IS NOT NULL
              AND l.fecha_adjudicacion >= '2025-01-01'
              AND l.fecha_adjudicacion < DATE_TRUNC('month', CURRENT_DATE)
              AND {_CAT_PG}
            GROUP BY ano_adj, mes_adj
            ORDER BY ano_adj, mes_adj
        """)
        cols = [d[0] for d in pg_cur.description]
        pg_rows = [dict(zip(cols, r)) for r in pg_cur.fetchall()]
        pg_cur.close()

        MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        rows = []
        for d in pg_rows:
            ano = int(d["ano_adj"] or 0)
            mes = int(d["mes_adj"] or 0)
            if not ano or not mes:
                continue
            n_tot = int(d["n_total"] or 0)
            n_lic = int(d["n_lics"]  or 0)
            rows.append({
                "label":    f"{MESES[mes-1]}'{str(ano)[2:]}",
                "ano": ano, "mes": mes,
                "n_total":   n_tot,
                "n_lics":    n_lic,
                "monto":     round(float(d["monto"] or 0) * IVA),
                "tasa_lics": round(n_lic / n_tot * 100, 1) if n_tot else 0,
            })

        result = {"meses": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if pg_conn: _pg_close(pg_conn)


@router.get("/sgl-por-vendedor")
async def sgl_por_vendedor(current_user: dict = Depends(get_current_user)):
    """Pipeline SGL desglosado por vendedor (usuario_pm o vendedor con datos)."""
    ck = "mercados_relevantes:sgl_por_vendedor_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Por vendedor (comercial asignado al tender)
        cur.execute("""
            SELECT
                ISNULL(NULLIF(LTRIM(RTRIM(vendedor)), ''), '(Sin asignar)') AS nombre,
                COUNT(*)                                                      AS total,
                SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END) AS cotizadas,
                SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END) AS en_proceso,
                SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END) AS sin_gestionar
            FROM SGL_Tenders
            GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(vendedor)), ''), '(Sin asignar)')
            ORDER BY cotizadas DESC, total DESC
        """)
        cols_v = [d[0] for d in cur.description]
        rows_v = cur.fetchall()
        por_vendedor = []
        for row in rows_v:
            r = dict(zip(cols_v, row))
            total = int(r["total"] or 0)
            cotizadas = int(r["cotizadas"] or 0)
            en_proceso = int(r["en_proceso"] or 0)
            gestionados = cotizadas + en_proceso
            por_vendedor.append({
                "nombre": r["nombre"],
                "total": total,
                "cotizadas": cotizadas,
                "en_proceso": en_proceso,
                "sin_gestionar": int(r["sin_gestionar"] or 0),
                "tasa_cotizacion": round(cotizadas / gestionados * 100, 1) if gestionados else 0,
            })

        # Por usuario PM (gestor interno)
        cur.execute("""
            SELECT
                ISNULL(NULLIF(LTRIM(RTRIM(usuario_pm)), ''), '(Sin asignar)') AS nombre,
                COUNT(*)                                                        AS total,
                SUM(CASE WHEN estado_sgl = 'Cotizada'      THEN 1 ELSE 0 END)  AS cotizadas,
                SUM(CASE WHEN estado_sgl = 'En proceso'    THEN 1 ELSE 0 END)  AS en_proceso,
                SUM(CASE WHEN estado_sgl = 'Sin gestionar' THEN 1 ELSE 0 END)  AS sin_gestionar
            FROM SGL_Tenders
            GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(usuario_pm)), ''), '(Sin asignar)')
            ORDER BY cotizadas DESC, total DESC
        """)
        cols_pm = [d[0] for d in cur.description]
        rows_pm = cur.fetchall()
        por_pm = []
        for row in rows_pm:
            r = dict(zip(cols_pm, row))
            total = int(r["total"] or 0)
            cotizadas = int(r["cotizadas"] or 0)
            en_proceso = int(r["en_proceso"] or 0)
            gestionados = cotizadas + en_proceso
            por_pm.append({
                "nombre": r["nombre"],
                "total": total,
                "cotizadas": cotizadas,
                "en_proceso": en_proceso,
                "sin_gestionar": int(r["sin_gestionar"] or 0),
                "tasa_cotizacion": round(cotizadas / gestionados * 100, 1) if gestionados else 0,
            })

        result = {"por_vendedor": por_vendedor, "por_pm": por_pm}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"por_vendedor": [], "por_pm": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


# ══════════════════════════════════════════════════════════════════════════════
#  SERRES — SQL Server (pending migration)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/mercado-serres/resumen")
async def mercado_serres_resumen(current_user: dict = Depends(get_current_user)):
    """Resumen anual del mercado Serres: mercado total vs LBF (2022-2026)."""
    ck = "mercados_relevantes:serres_resumen_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT YEAR(FechaAdjudicacion) AS ano,"
            " COUNT(DISTINCT Codigo) AS lics_total,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS adj_mercado_neto"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2022 AND 2026"
            "   AND Ofertaseleccionada='Seleccionada'"
            f"  AND {_RUBRO_SS} {_SERRES_SS}"
            " GROUP BY YEAR(FechaAdjudicacion) ORDER BY ano"
        )
        cols = [d[0] for d in cur.description]
        mercado_rows = {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}

        cur.execute(
            "SELECT YEAR(FechaAdjudicacion) AS ano,"
            " COUNT(DISTINCT Codigo) AS lics_part,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
            " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_of,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS lbf_adj_neto"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE RutProveedor='93.366.000-1' AND FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2022 AND 2026"
            f"  AND {_RUBRO_SS} {_SERRES_SS}"
            " GROUP BY YEAR(FechaAdjudicacion) ORDER BY ano"
        )
        cols2 = [d[0] for d in cur.description]
        lbf_rows = {r[0]: dict(zip(cols2, r)) for r in cur.fetchall()}

        anos = sorted(set(list(mercado_rows.keys()) + list(lbf_rows.keys())))
        result_rows = []
        for ano in anos:
            m = mercado_rows.get(ano, {})
            l = lbf_rows.get(ano, {})
            adj_m = float(m.get("adj_mercado_neto") or 0) * IVA
            adj_l = float(l.get("lbf_adj_neto") or 0) * IVA
            lics_t = int(m.get("lics_total") or 0)
            items_of = int(l.get("items_of") or 0)
            items_adj = int(l.get("items_adj") or 0)
            result_rows.append({
                "ano": ano,
                "adj_mercado": round(adj_m),
                "lbf_adj": round(adj_l),
                "cuota_lbf": round(adj_l / adj_m * 100, 1) if adj_m else 0,
                "lics_total": lics_t,
                "lbf_lics_part": int(l.get("lics_part") or 0),
                "lbf_lics_adj": int(l.get("lics_adj") or 0),
                "lbf_items_of": items_of,
                "lbf_items_adj": items_adj,
                "lbf_ef_items": round(items_adj / items_of * 100, 1) if items_of else 0,
            })
        result = {"anos": result_rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()


@router.get("/mercado-serres/competidores")
async def mercado_serres_competidores(current_user: dict = Depends(get_current_user)):
    """Ranking de competidores en el mercado Serres 2024-2026."""
    ck = "mercados_relevantes:serres_comp_v3"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT TOP 20 NombreProveedor, RutProveedor,"
            " COUNT(DISTINCT Codigo) AS lics_adj,"
            " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS adj_neto,"
            " SUM(CAST(ISNULL(Cantidad,0) AS FLOAT)) AS unidades"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2024 AND 2026"
            "   AND Ofertaseleccionada='Seleccionada'"
            f"  AND {_RUBRO_SS} {_SERRES_SS}"
            " GROUP BY NombreProveedor, RutProveedor"
            " ORDER BY adj_neto DESC"
        )
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        total_neto = sum(float(r[4] or 0) for r in rows)
        total_unid = sum(float(r[5] or 0) for r in rows)
        result_rows = []
        for i, r in enumerate(rows):
            d = dict(zip(cols, r))
            adj = float(d["adj_neto"] or 0) * IVA
            unid = float(d["unidades"] or 0)
            result_rows.append({
                "rank": i + 1,
                "nombre": d["NombreProveedor"],
                "rut": d["RutProveedor"],
                "lics_adj": int(d["lics_adj"] or 0),
                "items_adj": int(d["items_adj"] or 0),
                "adj": round(adj),
                "unidades": round(unid),
                "cuota": round(adj / (total_neto * IVA) * 100, 1) if total_neto else 0,
                "cuota_unid": round(unid / total_unid * 100, 1) if total_unid else 0,
                "es_lbf": d["RutProveedor"] == "93.366.000-1",
            })
        result = {
            "competidores": result_rows,
            "total_mercado": round(total_neto * IVA),
            "total_unidades": round(total_unid),
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"competidores": [], "total_mercado": 0, "total_unidades": 0, "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()


@router.get("/mercado-serres/cuadro-comparativo")
async def mercado_serres_cuadro(current_user: dict = Depends(get_current_user)):
    """Cuadro comparativo Serres: 2024, 2025, YTD 2026, MAT."""
    ck = "mercados_relevantes:serres_cuadro_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        serres_where = (
            " WHERE FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2024 AND 2026"
            "   AND Ofertaseleccionada='Seleccionada'"
            f"  AND {_RUBRO_SS} {_SERRES_SS}"
        )

        pivot_select = (
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2024 THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS adj_2024,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2024 THEN CAST(ISNULL(Cantidad,0) AS FLOAT) ELSE 0 END) AS unid_2024,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2025 THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS adj_2025,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2025 THEN CAST(ISNULL(Cantidad,0) AS FLOAT) ELSE 0 END) AS unid_2025,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2026 THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS adj_ytd,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2026 THEN CAST(ISNULL(Cantidad,0) AS FLOAT) ELSE 0 END) AS unid_ytd,"
            " SUM(CASE WHEN FechaAdjudicacion >= DATEADD(year,-1,CAST(GETDATE() AS DATE))"
            "          THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS adj_mat,"
            " SUM(CASE WHEN FechaAdjudicacion >= DATEADD(year,-1,CAST(GETDATE() AS DATE))"
            "          THEN CAST(ISNULL(Cantidad,0) AS FLOAT) ELSE 0 END) AS unid_mat"
        )

        cur.execute("SELECT" + pivot_select + " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones" + serres_where)
        m = dict(zip([d[0] for d in cur.description], cur.fetchone()))
        cur.execute(
            "SELECT" + pivot_select +
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones" + serres_where +
            " AND RutProveedor='93.366.000-1'"
        )
        l = dict(zip([d[0] for d in cur.description], cur.fetchone()))

        def build(sfx: str) -> dict:
            ma = float(m.get(f"adj_{sfx}") or 0) * IVA
            mu = float(m.get(f"unid_{sfx}") or 0)
            la = float(l.get(f"adj_{sfx}") or 0) * IVA
            lu = float(l.get(f"unid_{sfx}") or 0)
            return {
                "mercado_adj": round(ma),
                "mercado_unidades": round(mu),
                "lbf_adj": round(la),
                "lbf_unidades": round(lu),
                "cuota_adj": round(la / ma * 100, 1) if ma else 0,
                "cuota_unidades": round(lu / mu * 100, 1) if mu else 0,
            }

        result = {
            "periodos": {
                "2024":     build("2024"),
                "2025":     build("2025"),
                "ytd_2026": build("ytd"),
                "mat":      build("mat"),
            }
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"periodos": {}, "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()


@router.get("/mercado-serres/oportunidades")
async def mercado_serres_oportunidades(current_user: dict = Depends(get_current_user)):
    """Top licitaciones Serres 2024-2026 donde LBF no participó."""
    ck = "mercados_relevantes:serres_oport_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT TOP 15 l.Codigo, l.Tipo, l.NombreProveedor AS ganador,"
            " l.NombreOrganismo, CAST(l.FechaAdjudicacion AS DATE) AS fecha,"
            " SUM(CAST(ISNULL(l.MontoLineaAdjudica,0) AS FLOAT)) AS adj_neto"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones l"
            " WHERE l.FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(l.FechaAdjudicacion) IN (2024,2025,2026)"
            "   AND l.Ofertaseleccionada='Seleccionada'"
            f"  AND {_RUBRO_SS.replace('Rubro1', 'l.Rubro1')}"
            "   AND (l.DescripcionlineaAdquisicion LIKE '%bolsa%aspirac%'"
            "     OR l.DescripcionlineaAdquisicion LIKE '%aspirac%bolsa%'"
            "     OR l.DescripcionlineaAdquisicion LIKE '%bolsa%aspir%'"
            "     OR l.Nombreproductogenrico = 'DEPÓSITOS DE ASPIRACIÓN QUIRÚrgicos'"
            "     OR l.Nombreproductogenrico = 'SONDAS DE DRENAJE PARA LA ASPIRACIÓN QUIRÚrgica'"
            "     OR l.Nombreproductogenrico = 'CÁNULAS O TUBOS DE SUCCIÓN MÉDICOS O ACCESORIOS'"
            "     OR l.Nombreproductogenrico = 'PRODUCTOS DE ASPIRACIÓN PARA BIOPSIA O ACCESORIOS')"
            "   AND NOT EXISTS ("
            "     SELECT 1 FROM DWLBF.dbo.dw_datos_abiertos_licitaciones x"
            "     WHERE x.Codigo = l.Codigo AND x.RutProveedor = '93.366.000-1'"
            "   )"
            " GROUP BY l.Codigo, l.Tipo, l.NombreProveedor, l.NombreOrganismo, l.FechaAdjudicacion"
            " ORDER BY adj_neto DESC"
        )
        cols = [d[0] for d in cur.description]
        result_rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            result_rows.append({
                "codigo": d["Codigo"],
                "tipo": d["Tipo"],
                "ganador": d["ganador"],
                "organismo": d["NombreOrganismo"],
                "fecha": str(d["fecha"]),
                "adj": round(float(d["adj_neto"] or 0) * IVA),
            })
        result = {"oportunidades": result_rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"oportunidades": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()


# ── marcador fin Serres ──
@router.get("/mercado-serres/tendencia-clientes")
async def mercado_serres_tendencia_competidores(current_user: dict = Depends(get_current_user)):
    """Tendencia mensual por competidor en el mercado Serres 2023-2026."""
    ck = "mercados_relevantes:serres_tend_comp_v2"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        serres_base = (
            " WHERE FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2023 AND 2026"
            "   AND Ofertaseleccionada='Seleccionada'"
            f"  AND {_RUBRO_SS}"
            "   AND (DescripcionlineaAdquisicion LIKE '%bolsa%aspirac%'"
            "     OR DescripcionlineaAdquisicion LIKE '%aspirac%bolsa%'"
            "     OR DescripcionlineaAdquisicion LIKE '%bolsa%aspir%'"
            "     OR Nombreproductogenrico = 'DEPÓSITOS DE ASPIRACIÓN QUIRÚRGICOS'"
            "     OR Nombreproductogenrico = 'SONDAS DE DRENAJE PARA LA ASPIRACIÓN QUIRÚRGICA'"
            "     OR Nombreproductogenrico = 'CÁNULAS O TUBOS DE SUCCIÓN MÉDICOS O ACCESORIOS'"
            "     OR Nombreproductogenrico = 'PRODUCTOS DE ASPIRACIÓN PARA BIOPSIA O ACCESORIOS')"
        )

        cur.execute(
            "SELECT TOP 7 RutProveedor, NombreProveedor"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            + serres_base +
            "   AND RutProveedor <> '93.366.000-1'"
            " GROUP BY RutProveedor, NombreProveedor"
            " ORDER BY SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) DESC"
        )
        top_ruts = {r[0]: r[1] for r in cur.fetchall()}
        top_ruts["93.366.000-1"] = "Comercial LBF Limitada"
        rut_list = "','".join(top_ruts.keys())

        cur.execute(
            "SELECT NombreProveedor, RutProveedor,"
            "   YEAR(FechaAdjudicacion) AS ano,"
            "   MONTH(FechaAdjudicacion) AS mes,"
            "   SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS adj_neto,"
            "   SUM(CAST(ISNULL(Cantidad,0) AS FLOAT)) AS unidades"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            + serres_base +
            f"  AND RutProveedor IN ('{rut_list}')"
            " GROUP BY NombreProveedor, RutProveedor,"
            "   YEAR(FechaAdjudicacion), MONTH(FechaAdjudicacion)"
            " ORDER BY NombreProveedor, ano, mes"
        )
        rows = cur.fetchall()

        comp_data: dict = defaultdict(dict)
        comp_meta: dict = {}
        all_trim: set = set()
        comp_totals: dict = defaultdict(float)

        def _short(name: str) -> str:
            s = (name or "").strip()
            if "LBF" in s.upper():
                return "LBF"
            for drop in ("Comercial ", "Distribuidora ", "Laboratorios ", "Representaciones "):
                if s.startswith(drop):
                    s = s[len(drop):]
            return s[:22]

        for r in rows:
            nombre, rut = r[0], r[1]
            key = f"{r[2]}-{int(r[3]):02d}"
            adj = float(r[4] or 0) * IVA
            unid = float(r[5] or 0)
            comp_data[rut][key] = {"adj": round(adj), "unidades": round(unid)}
            all_trim.add(key)
            comp_totals[rut] += adj
            if rut not in comp_meta:
                comp_meta[rut] = {
                    "nombre": nombre,
                    "shortname": _short(nombre),
                    "es_lbf": rut == "93.366.000-1",
                }

        sorted_trim = sorted(all_trim)
        lbf_rut = "93.366.000-1"
        other_ruts = sorted(
            [r for r in comp_data if r != lbf_rut],
            key=lambda r: comp_totals[r], reverse=True
        )
        sorted_ruts = ([lbf_rut] if lbf_rut in comp_data else []) + other_ruts

        result = {
            "trimestres": sorted_trim,
            "organismos": [
                {
                    "nombre": comp_meta[r]["nombre"],
                    "shortname": comp_meta[r]["shortname"],
                    "es_lbf": comp_meta[r]["es_lbf"],
                    "data": dict(comp_data[r]),
                }
                for r in sorted_ruts
            ],
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"trimestres": [], "organismos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS — Gestión Falcon (SQL Server BI: tabla falcon_gestion)
# ══════════════════════════════════════════════════════════════════════════════

def _ss_close(conn):
    try:
        conn.close()
    except Exception:
        pass


@router.get("/falcon-resumen")
async def falcon_resumen(current_user: dict = Depends(get_current_user)):
    """KPIs y resumen de gestión desde falcon_gestion (SQL Server BI)."""
    ck = "mercados_relevantes:falcon_resumen_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # ── KPIs globales ──────────────────────────────────────────────────
        cur.execute("""
            SELECT
                COUNT(DISTINCT licitacion_id)                               AS total_lics,
                COUNT(DISTINCT CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' THEN licitacion_id END) AS lics_lbf,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' THEN 1 END)            AS items_lbf,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                           AND estado_mp = 'Adjudicada' THEN 1 END)         AS items_adj,
                SUM(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' AND estado_mp = 'Adjudicada'
                         THEN ISNULL(total_adjudicado, 0) END)              AS monto_adj
            FROM falcon_gestion
        """)
        r = cur.fetchone()
        total_lics, lics_lbf, items_lbf, items_adj, monto_adj = r
        tasa_adj = round(items_adj / items_lbf * 100, 1) if items_lbf else 0

        # ── Perdidas por precio ────────────────────────────────────────────
        cur.execute("""
            WITH lbf AS (
                SELECT licitacion_id, item_nbr, precio AS precio_lbf, cantidad, total_ofertado
                FROM falcon_gestion
                WHERE empresa = 'COMERCIAL LBF LIMITADA'
                  AND estado_mp = 'No Adjudicada'
                  AND precio > 0 AND cantidad > 0
            ),
            gano AS (
                SELECT licitacion_id, item_nbr, precio AS precio_ganador
                FROM falcon_gestion
                WHERE estado_mp = 'Adjudicada'
                  AND ISNULL(total_adjudicado,0) > 0
                  AND precio > 0
            )
            SELECT
                COUNT(*)                                                        AS n_perdidas_precio,
                ROUND(SUM((l.precio_lbf - g.precio_ganador) * l.cantidad), 0)  AS monto_gap,
                ROUND(SUM(l.total_ofertado), 0)                                 AS venta_potencial
            FROM lbf l
            JOIN gano g ON l.licitacion_id = g.licitacion_id AND l.item_nbr = g.item_nbr
            WHERE l.precio_lbf > g.precio_ganador
        """)
        r2 = cur.fetchone()
        n_perdidas, monto_gap, venta_pot = r2 if r2 else (0, 0, 0)

        # ── Por canal ──────────────────────────────────────────────────────
        cur.execute("""
            SELECT canal,
                   COUNT(DISTINCT licitacion_id)                              AS lics,
                   COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' THEN 1 END)           AS items_lbf,
                   COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                              AND estado_mp='Adjudicada' THEN 1 END)          AS items_adj,
                   ROUND(SUM(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' AND estado_mp='Adjudicada'
                                  THEN ISNULL(total_adjudicado,0) END), 0)    AS monto_adj
            FROM falcon_gestion
            GROUP BY canal
            ORDER BY monto_adj DESC
        """)
        cols = [d[0] for d in cur.description]
        por_canal = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            il = int(d["items_lbf"] or 0)
            ia = int(d["items_adj"] or 0)
            por_canal.append({
                "canal":     d["canal"],
                "lics":      int(d["lics"] or 0),
                "items_lbf": il,
                "items_adj": ia,
                "tasa_adj":  round(ia / il * 100, 1) if il else 0,
                "monto_adj": round(float(d["monto_adj"] or 0)),
            })

        result = {
            "kpis": {
                "total_lics":        int(total_lics or 0),
                "lics_lbf":          int(lics_lbf or 0),
                "items_lbf":         int(items_lbf or 0),
                "items_adj":         int(items_adj or 0),
                "tasa_adj":          tasa_adj,
                "monto_adj":         round(float(monto_adj or 0)),
                "n_perdidas_precio": int(n_perdidas or 0),
                "monto_gap":         round(float(monto_gap or 0)),
                "venta_potencial":   round(float(venta_pot or 0)),
            },
            "por_canal": por_canal,
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"kpis": {}, "por_canal": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-perdidas-precio")
async def falcon_perdidas_precio(
    limit: int = Query(200),
    canal: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    """Items donde LBF perdió porque el ganador tenía precio más bajo."""
    ck = f"mercados_relevantes:falcon_perdidas_v2:{canal}:{limit}"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        canal_cond = "AND canal = ?" if canal else ""
        params_lbf = [canal] if canal else []
        params_gano = [canal] if canal else []

        # ── Detalle ────────────────────────────────────────────────────────
        sql_det = f"""
            WITH lbf AS (
                SELECT licitacion_id, item_nbr, descripcion_item,
                       precio AS precio_lbf, cantidad, total_ofertado,
                       usuario_gestion, organismo, canal, fecha_adj
                FROM falcon_gestion
                WHERE empresa = 'COMERCIAL LBF LIMITADA'
                  AND estado_mp = 'No Adjudicada'
                  AND precio > 0 AND cantidad > 0
                  {canal_cond}
            ),
            gano AS (
                SELECT licitacion_id, item_nbr, empresa AS empresa_ganadora,
                       precio AS precio_ganador, total_adjudicado
                FROM falcon_gestion
                WHERE estado_mp = 'Adjudicada'
                  AND ISNULL(total_adjudicado,0) > 0
                  AND precio > 0
                  {canal_cond}
            )
            SELECT TOP {limit}
                l.licitacion_id,
                l.item_nbr,
                l.descripcion_item,
                l.organismo,
                l.canal,
                CONVERT(VARCHAR(10), l.fecha_adj, 23)                              AS fecha_adj,
                l.usuario_gestion,
                l.precio_lbf,
                g.precio_ganador,
                g.empresa_ganadora,
                l.cantidad,
                ROUND(l.total_ofertado, 0)                                         AS venta_potencial,
                ROUND((l.precio_lbf-g.precio_ganador)/g.precio_ganador*100, 1)    AS diff_pct,
                ROUND((l.precio_lbf-g.precio_ganador)*l.cantidad, 0)              AS monto_gap
            FROM lbf l
            JOIN gano g ON l.licitacion_id=g.licitacion_id AND l.item_nbr=g.item_nbr
            WHERE l.precio_lbf > g.precio_ganador
            ORDER BY monto_gap DESC
        """
        cur.execute(sql_det, params_lbf + params_gano)
        cols = [d[0] for d in cur.description]
        detalle = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for k in ["precio_lbf", "precio_ganador", "cantidad", "venta_potencial", "diff_pct", "monto_gap"]:
                d[k] = round(float(d[k] or 0), 2)
            detalle.append(d)

        # ── Por usuario ────────────────────────────────────────────────────
        sql_usr = f"""
            WITH lbf AS (
                SELECT licitacion_id, item_nbr, precio AS precio_lbf, cantidad, total_ofertado, usuario_gestion
                FROM falcon_gestion
                WHERE empresa = 'COMERCIAL LBF LIMITADA' AND estado_mp='No Adjudicada'
                  AND precio > 0 AND cantidad > 0 {canal_cond}
            ),
            gano AS (
                SELECT licitacion_id, item_nbr, precio AS precio_ganador
                FROM falcon_gestion
                WHERE estado_mp='Adjudicada' AND ISNULL(total_adjudicado,0)>0
                  AND precio > 0 {canal_cond}
            )
            SELECT
                ISNULL(l.usuario_gestion,'(Sin asignar)')                         AS usuario,
                COUNT(*)                                                           AS items_perdidos,
                ROUND(SUM((l.precio_lbf-g.precio_ganador)*l.cantidad),0)          AS monto_gap,
                ROUND(SUM(l.total_ofertado),0)                                    AS venta_potencial,
                ROUND(AVG((l.precio_lbf-g.precio_ganador)/g.precio_ganador*100),1) AS avg_diff_pct
            FROM lbf l
            JOIN gano g ON l.licitacion_id=g.licitacion_id AND l.item_nbr=g.item_nbr
            WHERE l.precio_lbf > g.precio_ganador
            GROUP BY l.usuario_gestion
            ORDER BY monto_gap DESC
        """
        cur.execute(sql_usr, params_lbf + params_gano)
        cols2 = [d[0] for d in cur.description]
        por_usuario = []
        for row in cur.fetchall():
            d = dict(zip(cols2, row))
            por_usuario.append({
                "usuario":         d["usuario"],
                "items_perdidos":  int(d["items_perdidos"] or 0),
                "monto_gap":       round(float(d["monto_gap"] or 0)),
                "venta_potencial": round(float(d["venta_potencial"] or 0)),
                "avg_diff_pct":    round(float(d["avg_diff_pct"] or 0), 1),
            })

        # ── Por empresa ganadora ───────────────────────────────────────────
        sql_emp = f"""
            WITH lbf AS (
                SELECT licitacion_id, item_nbr, precio AS precio_lbf, cantidad
                FROM falcon_gestion
                WHERE empresa = 'COMERCIAL LBF LIMITADA' AND estado_mp='No Adjudicada'
                  AND precio > 0 AND cantidad > 0 {canal_cond}
            ),
            gano AS (
                SELECT licitacion_id, item_nbr, empresa AS empresa_ganadora, precio AS precio_ganador
                FROM falcon_gestion
                WHERE estado_mp='Adjudicada' AND ISNULL(total_adjudicado,0)>0
                  AND precio > 0 {canal_cond}
            )
            SELECT TOP 20
                g.empresa_ganadora,
                COUNT(*)                                                           AS items_ganados,
                ROUND(SUM((l.precio_lbf-g.precio_ganador)*l.cantidad),0)          AS monto_gap,
                ROUND(AVG((l.precio_lbf-g.precio_ganador)/g.precio_ganador*100),1) AS avg_diff_pct
            FROM lbf l
            JOIN gano g ON l.licitacion_id=g.licitacion_id AND l.item_nbr=g.item_nbr
            WHERE l.precio_lbf > g.precio_ganador
            GROUP BY g.empresa_ganadora
            ORDER BY monto_gap DESC
        """
        cur.execute(sql_emp, params_lbf + params_gano)
        cols3 = [d[0] for d in cur.description]
        por_empresa = []
        for row in cur.fetchall():
            d = dict(zip(cols3, row))
            por_empresa.append({
                "empresa":       d["empresa_ganadora"] or "(Desconocido)",
                "items_ganados": int(d["items_ganados"] or 0),
                "monto_gap":     round(float(d["monto_gap"] or 0)),
                "avg_diff_pct":  round(float(d["avg_diff_pct"] or 0), 1),
            })

        result = {"detalle": detalle, "por_usuario": por_usuario, "por_empresa": por_empresa}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"detalle": [], "por_usuario": [], "por_empresa": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-por-usuario")
async def falcon_por_usuario(
    canal: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    """Performance completo por UsuarioGestion desde falcon_gestion."""
    ck = f"mercados_relevantes:falcon_por_usuario_v1:{canal}"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        where = f"WHERE canal = ?" if canal else ""
        params = [canal] if canal else []

        cur.execute(f"""
            SELECT
                ISNULL(usuario_gestion,'(Sin asignar)')                      AS usuario,
                COUNT(DISTINCT licitacion_id)                                AS lics_total,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' THEN 1 END)            AS items_ofertados,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                           AND estado_mp='Adjudicada' THEN 1 END)           AS items_adj,
                ROUND(SUM(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' AND estado_mp='Adjudicada'
                               THEN ISNULL(total_adjudicado,0) END),0)      AS monto_adj,
                COUNT(CASE WHEN estado_sgl='Cotizada' THEN 1 END)           AS cotizadas,
                COUNT(CASE WHEN estado_sgl='En Proceso' THEN 1 END)         AS en_proceso,
                COUNT(CASE WHEN estado_sgl='Sin Gestionar' THEN 1 END)      AS sin_gestionar
            FROM falcon_gestion
            {where}
            GROUP BY usuario_gestion
            ORDER BY items_adj DESC
        """, params)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            io = int(d["items_ofertados"] or 0)
            ia = int(d["items_adj"] or 0)
            rows.append({
                "usuario":         d["usuario"],
                "lics_total":      int(d["lics_total"] or 0),
                "items_ofertados": io,
                "items_adj":       ia,
                "tasa_adj":        round(ia / io * 100, 1) if io else 0,
                "monto_adj":       round(float(d["monto_adj"] or 0)),
                "cotizadas":       int(d["cotizadas"] or 0),
                "en_proceso":      int(d["en_proceso"] or 0),
                "sin_gestionar":   int(d["sin_gestionar"] or 0),
            })

        result = {"usuarios": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"usuarios": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-por-mes")
async def falcon_por_mes(current_user: dict = Depends(get_current_user)):
    """Tasa de adjudicación real por mes de resolución (fecha_adj).
    Denominador = ítems resueltos ese mes (adj + no adj), excluye los aún en proceso."""
    ck = "mercados_relevantes:falcon_por_mes_v5"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                YEAR(fecha_adj)   AS ano,
                MONTH(fecha_adj)  AS mes,
                COUNT(*)                                                              AS items_lbf,
                COUNT(CASE WHEN estado_mp = 'Adjudicada' THEN 1 END)                 AS items_adj,
                COUNT(DISTINCT licitacion_id)                                         AS lics_lbf,
                COUNT(DISTINCT CASE WHEN estado_mp = 'Adjudicada'
                                    THEN licitacion_id END)                           AS lics_adj,
                ROUND(SUM(CASE WHEN estado_mp = 'Adjudicada'
                               THEN ISNULL(total_adjudicado, 0) END), 0)             AS monto_adj
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND fecha_adj IS NOT NULL
              AND YEAR(fecha_adj) BETWEEN 2024 AND 2026
              AND fecha_adj < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
              AND estado_mp IN ('Adjudicada', 'No Adjudicada')
            GROUP BY YEAR(fecha_adj), MONTH(fecha_adj)
            ORDER BY ano, mes
        """)
        cols = [d[0] for d in cur.description]
        MES_NOM = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',
                   7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'}
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            ano, mes = int(d['ano']), int(d['mes'])
            il  = int(d['items_lbf'] or 0)
            ia  = int(d['items_adj'] or 0)
            ll  = int(d['lics_lbf']  or 0)
            la  = int(d['lics_adj']  or 0)
            rows.append({
                'ano': ano, 'mes': mes,
                'label': f"{MES_NOM[mes]}'{str(ano)[2:]}",
                'items_lbf': il,
                'items_adj': ia,
                'tasa_adj':  round(ia / il * 100, 1) if il else 0,
                'lics_lbf':  ll,
                'lics_adj':  la,
                'tasa_adj_lics': round(la / ll * 100, 1) if ll else 0,
                'monto_adj': round(float(d['monto_adj'] or 0)),
            })
        result = {"meses": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-por-estado-sgl")
async def falcon_por_estado_sgl(current_user: dict = Depends(get_current_user)):
    """Distribución por estado_sgl de ítems LBF en falcon_gestion."""
    ck = "mercados_relevantes:falcon_por_estado_sgl_v1"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                ISNULL(estado_sgl, '(Sin estado)')  AS estado_sgl,
                COUNT(DISTINCT licitacion_id)        AS lics,
                COUNT(*)                             AS items
            FROM falcon_gestion
            WHERE empresa = 'COMERCIAL LBF LIMITADA'
            GROUP BY estado_sgl
            ORDER BY items DESC
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            rows.append({
                'estado_sgl': d['estado_sgl'],
                'lics':  int(d['lics'] or 0),
                'items': int(d['items'] or 0),
            })
        result = {"estados": rows}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"estados": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-licitaciones")
async def falcon_licitaciones(
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    estado: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Detalle de licitaciones donde LBF ofertó, una fila por licitación con totales."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Filtros dinámicos
        where_parts = ["canal = 'Licitacion'", "empresa = 'COMERCIAL LBF LIMITADA'"]
        params: list = []

        safe_search = re.sub(r"[%_\[\]'\";\\=]", "", search).strip() if search else ""
        if safe_search:
            where_parts.append("(licitacion_id LIKE ? OR organismo LIKE ? OR unidad_compra LIKE ?)")
            params += [f"%{safe_search}%", f"%{safe_search}%", f"%{safe_search}%"]
        if estado:
            where_parts.append("estado_mp = ?")
            params.append(estado)

        where_sql = "WHERE " + " AND ".join(where_parts)

        # Totales globales + conteo de licitaciones
        cur.execute(f"""
            SELECT
                COUNT(DISTINCT licitacion_id)                                           AS total_lics,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA' THEN 1 END)         AS total_items_ofertados,
                COUNT(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                            AND estado_mp = 'Adjudicada' THEN 1 END)                   AS total_items_adj,
                ROUND(SUM(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                               AND estado_mp = 'Adjudicada'
                               THEN ISNULL(total_adjudicado, 0) END), 0)               AS total_monto_adj,
                ROUND(SUM(CASE WHEN empresa = 'COMERCIAL LBF LIMITADA'
                               THEN ISNULL(precio * cantidad, 0) END), 0)              AS total_monto_ofertado
            FROM falcon_gestion
            {where_sql}
        """, params)
        r_tot = cur.fetchone()
        total_lics            = int(r_tot[0] or 0)
        total_items_ofertados = int(r_tot[1] or 0)
        total_items_adj       = int(r_tot[2] or 0)
        total_monto_adj       = round(float(r_tot[3] or 0))
        total_monto_ofertado  = round(float(r_tot[4] or 0))

        offset = (page - 1) * page_size
        cur.execute(f"""
            SELECT
                licitacion_id,
                MAX(organismo)        AS organismo,
                MAX(unidad_compra)    AS unidad_compra,
                MAX(region)           AS region,
                MAX(estado_mp)        AS estado_mp,
                MAX(CONVERT(varchar, fecha_inicio, 23))  AS fecha_inicio,
                MAX(CONVERT(varchar, fecha_adj,   23))   AS fecha_adj,
                COUNT(*)                                  AS items_ofertados,
                SUM(CASE WHEN estado_mp = 'Adjudicada' THEN 1 ELSE 0 END) AS items_adj,
                ROUND(SUM(ISNULL(precio * cantidad, 0)), 0)                AS monto_ofertado,
                ROUND(SUM(ISNULL(total_adjudicado,  0)), 0)                AS monto_adj,
                MAX(duracion_contrato) AS duracion_contrato,
                MAX(etiquetas)         AS etiquetas
            FROM falcon_gestion
            {where_sql}
            GROUP BY licitacion_id
            ORDER BY MAX(fecha_inicio) DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """, params + [offset, page_size])

        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            io = int(d["items_ofertados"] or 0)
            ia = int(d["items_adj"] or 0)
            rows.append({
                "licitacion_id":   d["licitacion_id"] or "",
                "organismo":       d["organismo"] or "",
                "unidad_compra":   d["unidad_compra"] or "",
                "region":          d["region"] or "",
                "estado_mp":       d["estado_mp"] or "",
                "fecha_inicio":    d["fecha_inicio"] or "",
                "fecha_adj":       d["fecha_adj"] or "",
                "items_ofertados": io,
                "items_adj":       ia,
                "tasa_adj":        round(ia / io * 100, 1) if io else 0,
                "monto_ofertado":  round(float(d["monto_ofertado"] or 0)),
                "monto_adj":       round(float(d["monto_adj"] or 0)),
                "duracion_contrato": d["duracion_contrato"] or "",
                "etiquetas":       d["etiquetas"] or "",
            })

        return {
            "total": total_lics,
            "page": page,
            "page_size": page_size,
            "pages": max(1, -(-total_lics // page_size)),
            "total_items_ofertados": total_items_ofertados,
            "total_items_adj":       total_items_adj,
            "total_monto_adj":       total_monto_adj,
            "total_monto_ofertado":  total_monto_ofertado,
            "licitaciones": rows,
        }
    except Exception as e:
        return {"total": 0, "page": 1, "page_size": page_size, "pages": 0,
                "licitaciones": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-comparacion")
async def falcon_comparacion(current_user: dict = Depends(get_current_user)):
    """Comparación mes a mes Ene–May 2025 vs 2026 para LBF Licitaciones.
    Todo agrupado por fecha_adj; denominador = items con resultado real (adj + no adj).
    """
    ck = "mercados_relevantes:falcon_comparacion_v2"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                YEAR(fecha_adj)   AS ano,
                MONTH(fecha_adj)  AS mes,
                COUNT(*)          AS items_lbf,
                COUNT(CASE WHEN estado_mp = 'Adjudicada' THEN 1 END)              AS items_adj,
                COUNT(DISTINCT licitacion_id)                                       AS lics_lbf,
                COUNT(DISTINCT CASE WHEN estado_mp = 'Adjudicada' THEN licitacion_id END) AS lics_adj,
                ROUND(SUM(CASE WHEN estado_mp = 'Adjudicada'
                               THEN ISNULL(total_adjudicado, 0) ELSE 0 END), 0)    AS monto_adj
            FROM falcon_gestion
            WHERE empresa = 'COMERCIAL LBF LIMITADA'
              AND canal = 'Licitacion'
              AND fecha_adj IS NOT NULL
              AND YEAR(fecha_adj) IN (2025, 2026)
              AND MONTH(fecha_adj) BETWEEN 1 AND 5
              AND estado_mp IN ('Adjudicada', 'No Adjudicada')
            GROUP BY YEAR(fecha_adj), MONTH(fecha_adj)
            ORDER BY ano, mes
        """)
        cols = [d[0] for d in cur.description]
        raw = [dict(zip(cols, r)) for r in cur.fetchall()]

        MES_LABEL = {1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May"}

        data: dict = {}
        for m in range(1, 6):
            data[m] = {
                "items_lbf_25": 0, "items_adj_25": 0, "lics_lbf_25": 0, "lics_adj_25": 0, "monto_adj_25": 0,
                "items_lbf_26": 0, "items_adj_26": 0, "lics_lbf_26": 0, "lics_adj_26": 0, "monto_adj_26": 0,
            }

        for r in raw:
            ano = int(r["ano"] or 0)
            mes = int(r["mes"] or 0)
            if mes not in data:
                continue
            sfx = "25" if ano == 2025 else "26" if ano == 2026 else None
            if sfx is None:
                continue
            data[mes][f"items_lbf_{sfx}"] = int(r["items_lbf"] or 0)
            data[mes][f"items_adj_{sfx}"] = int(r["items_adj"] or 0)
            data[mes][f"lics_lbf_{sfx}"]  = int(r["lics_lbf"]  or 0)
            data[mes][f"lics_adj_{sfx}"]  = int(r["lics_adj"]  or 0)
            data[mes][f"monto_adj_{sfx}"] = round(float(r["monto_adj"] or 0))

        def _var(new: float, base: float):
            if base == 0:
                return None
            return round((new - base) / base * 100, 1)

        def _tasa(adj: int, total: int) -> float:
            return round(adj / total * 100, 1) if total > 0 else 0.0

        meses_out = []
        for m in range(1, 6):
            d = data[m]
            ia25 = d["items_adj_25"];  ia26 = d["items_adj_26"]
            il25 = d["items_lbf_25"];  il26 = d["items_lbf_26"]
            la25 = d["lics_adj_25"];   la26 = d["lics_adj_26"]
            ll25 = d["lics_lbf_25"];   ll26 = d["lics_lbf_26"]
            ma25 = d["monto_adj_25"];  ma26 = d["monto_adj_26"]
            meses_out.append({
                "mes":          m,
                "label":        MES_LABEL[m],
                "lics_lbf_25":  ll25,
                "lics_lbf_26":  ll26,
                "lics_adj_25":  la25,
                "lics_adj_26":  la26,
                "tasa_lics_25": _tasa(la25, ll25),
                "tasa_lics_26": _tasa(la26, ll26),
                "var_lics_pct": _var(la26, la25),
                "items_lbf_25": il25,
                "items_lbf_26": il26,
                "items_adj_25": ia25,
                "items_adj_26": ia26,
                "tasa_adj_25":  _tasa(ia25, il25),
                "tasa_adj_26":  _tasa(ia26, il26),
                "var_items_pct": _var(ia26, ia25),
                "monto_adj_25": ma25,
                "monto_adj_26": ma26,
                "var_monto_pct": _var(ma26, ma25),
            })

        # Totals row
        t_il25 = sum(d["items_lbf_25"] for d in data.values())
        t_il26 = sum(d["items_lbf_26"] for d in data.values())
        t_ia25 = sum(d["items_adj_25"] for d in data.values())
        t_ia26 = sum(d["items_adj_26"] for d in data.values())
        t_ll25 = sum(d["lics_lbf_25"]  for d in data.values())
        t_ll26 = sum(d["lics_lbf_26"]  for d in data.values())
        t_la25 = sum(d["lics_adj_25"]  for d in data.values())
        t_la26 = sum(d["lics_adj_26"]  for d in data.values())
        t_ma25 = sum(d["monto_adj_25"] for d in data.values())
        t_ma26 = sum(d["monto_adj_26"] for d in data.values())

        totales = {
            "mes":          0,
            "label":        "Total Ene-May",
            "lics_lbf_25":  t_ll25,
            "lics_lbf_26":  t_ll26,
            "lics_adj_25":  t_la25,
            "lics_adj_26":  t_la26,
            "tasa_lics_25": _tasa(t_la25, t_ll25),
            "tasa_lics_26": _tasa(t_la26, t_ll26),
            "var_lics_pct": _var(t_la26, t_la25),
            "items_lbf_25": t_il25,
            "items_lbf_26": t_il26,
            "items_adj_25": t_ia25,
            "items_adj_26": t_ia26,
            "tasa_adj_25":  _tasa(t_ia25, t_il25),
            "tasa_adj_26":  _tasa(t_ia26, t_il26),
            "var_items_pct": _var(t_ia26, t_ia25),
            "monto_adj_25": t_ma25,
            "monto_adj_26": t_ma26,
            "var_monto_pct": _var(t_ma26, t_ma25),
        }

        result = {"meses": meses_out, "totales": totales}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"meses": [], "totales": {}, "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-adj-detalle")
async def falcon_adj_detalle(
    ano: int = 2026,
    mes: int = 5,
    current_user: dict = Depends(get_current_user),
):
    """Detalle de ítems adjudicados a LBF en un mes dado (por fecha_adj), con resumen por usuario."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Detalle de ítems
        cur.execute("""
            SELECT
                licitacion_id,
                organismo,
                CONVERT(varchar, fecha_inicio, 23)   AS fecha_inicio,
                CONVERT(varchar, fecha_adj,   23)    AS fecha_adj,
                descripcion_item,
                ISNULL(usuario_gestion, '(Sin asignar)') AS usuario,
                ROUND(ISNULL(precio * cantidad, 0), 0)   AS monto_cotizado,
                ROUND(ISNULL(total_adjudicado, 0), 0)    AS monto_adj
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND estado_mp = 'Adjudicada'
              AND fecha_adj IS NOT NULL
              AND YEAR(fecha_adj) = ?
              AND MONTH(fecha_adj) = ?
            ORDER BY usuario_gestion, licitacion_id
        """, [ano, mes])
        cols = [d[0] for d in cur.description]
        items = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            mc = round(float(d["monto_cotizado"] or 0))
            ma = round(float(d["monto_adj"] or 0))
            items.append({
                "licitacion_id":  d["licitacion_id"] or "",
                "organismo":      (d["organismo"] or "")[:80],
                "fecha_inicio":   d["fecha_inicio"] or "",
                "fecha_adj":      d["fecha_adj"] or "",
                "descripcion":    (d["descripcion_item"] or "")[:80],
                "usuario":        d["usuario"],
                "monto_cotizado": mc,
                "monto_adj":      ma,
                "efectividad":    round(ma / mc * 100, 1) if mc else 0,
            })

        # Ofertados del mes (por fecha_inicio = mes seleccionado)
        cur.execute("""
            SELECT
                ISNULL(usuario_gestion, '(Sin asignar)')     AS usuario,
                COUNT(DISTINCT licitacion_id)                AS lics,
                COUNT(*)                                     AS items_ofertados,
                ROUND(SUM(ISNULL(precio * cantidad, 0)), 0)  AS monto_ofertado
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND fecha_inicio IS NOT NULL
              AND YEAR(fecha_inicio) = ?
              AND MONTH(fecha_inicio) = ?
            GROUP BY usuario_gestion
        """, [ano, mes])
        ofertados_map: dict = {}
        for row in cur.fetchall():
            ofertados_map[row[0]] = {"lics": int(row[1] or 0), "items_ofertados": int(row[2] or 0), "monto_ofertado": round(float(row[3] or 0))}

        # Resumen por usuario (adjudicados del mes)
        resumen: dict = {}
        for it in items:
            u = it["usuario"]
            if u not in resumen:
                resumen[u] = {"usuario": u, "items_adj": 0, "monto_cotizado": 0, "monto_adj": 0}
            resumen[u]["items_adj"] += 1
            resumen[u]["monto_cotizado"] += it["monto_cotizado"]
            resumen[u]["monto_adj"] += it["monto_adj"]

        # Base: todos los usuarios que ofertaron en el mes; cruzar con adjudicaciones
        all_users = set(ofertados_map.keys()) | set(resumen.keys())
        por_usuario = []
        for u in sorted(all_users, key=lambda u: -ofertados_map.get(u, {}).get("monto_ofertado", 0)):
            ofe = ofertados_map.get(u, {"lics": 0, "items_ofertados": 0, "monto_ofertado": 0})
            adj = resumen.get(u, {"items_adj": 0, "monto_cotizado": 0, "monto_adj": 0})
            io  = ofe["items_ofertados"]
            mo  = ofe["monto_ofertado"]
            ma  = adj["monto_adj"]
            por_usuario.append({
                "usuario":          u,
                "lics":             ofe["lics"],
                "items_ofertados":  io,
                "monto_ofertado":   mo,
                "items_adj":        adj["items_adj"],
                "monto_adj":        ma,
                "efectividad":      round(ma / mo * 100, 1) if mo else 0,
            })

        total_mc  = sum(x["monto_cotizado"]   for x in items)
        total_ma  = sum(x["monto_adj"]         for x in items)
        total_io  = sum(x["items_ofertados"]   for x in por_usuario)
        total_mo  = sum(x["monto_ofertado"]    for x in por_usuario)

        return {
            "ano": ano, "mes": mes,
            "total_items":           len(items),
            "total_cotizado":        total_mc,
            "total_adj":             total_ma,
            "total_items_ofertados": total_io,
            "total_monto_ofertado":  total_mo,
            "efectividad_global":    round(total_ma / total_mo * 100, 1) if total_mo else 0,
            "items": items,
            "por_usuario": por_usuario,
        }
    except Exception as e:
        return {"items": [], "por_usuario": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-postulaciones-usuario")
async def falcon_postulaciones_usuario(
    current_user: dict = Depends(get_current_user),
):
    """Postulaciones LBF 2026 por usuario/mes (fecha_inicio) + adjudicaciones (fecha_adj)."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Postulaciones por fecha_inicio
        cur.execute("""
            SELECT
                ISNULL(usuario_gestion, '(Sin asignar)')    AS usuario,
                MONTH(fecha_inicio)                         AS mes,
                COUNT(DISTINCT licitacion_id)               AS lics,
                COUNT(*)                                    AS items,
                ROUND(SUM(ISNULL(precio * cantidad, 0)), 0) AS monto
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND fecha_inicio IS NOT NULL
              AND YEAR(fecha_inicio) = 2026
            GROUP BY usuario_gestion, MONTH(fecha_inicio)
            ORDER BY usuario_gestion, MONTH(fecha_inicio)
        """)
        post_map = {}
        for r in cur.fetchall():
            key = (r[0], int(r[1]))
            post_map[key] = {
                "usuario": r[0], "mes": int(r[1]),
                "lics": int(r[2] or 0), "items": int(r[3] or 0),
                "monto": round(float(r[4] or 0)),
                "lics_res": 0, "lics_adj": 0,
                "items_res": 0, "items_adj": 0, "monto_adj": 0,
            }

        # Adjudicaciones por fecha_adj (mismo criterio que el gráfico)
        cur.execute("""
            SELECT
                ISNULL(usuario_gestion, '(Sin asignar)')                               AS usuario,
                MONTH(fecha_adj)                                                        AS mes,
                COUNT(DISTINCT licitacion_id)                                           AS lics_res,
                COUNT(DISTINCT CASE WHEN estado_mp='Adjudicada' THEN licitacion_id END) AS lics_adj,
                COUNT(*)                                                                 AS items_res,
                COUNT(CASE WHEN estado_mp='Adjudicada' THEN 1 END)                      AS items_adj,
                ROUND(SUM(CASE WHEN estado_mp='Adjudicada'
                               THEN ISNULL(total_adjudicado,0) ELSE 0 END), 0)          AS monto_adj
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND fecha_adj IS NOT NULL
              AND YEAR(fecha_adj) = 2026
              AND estado_mp IN ('Adjudicada', 'No Adjudicada')
            GROUP BY usuario_gestion, MONTH(fecha_adj)
            ORDER BY usuario_gestion, MONTH(fecha_adj)
        """)
        for r in cur.fetchall():
            key = (r[0], int(r[1]))
            if key not in post_map:
                post_map[key] = {
                    "usuario": r[0], "mes": int(r[1]),
                    "lics": 0, "items": 0, "monto": 0,
                }
            post_map[key]["lics_res"]  = int(r[2] or 0)
            post_map[key]["lics_adj"]  = int(r[3] or 0)
            post_map[key]["items_res"] = int(r[4] or 0)
            post_map[key]["items_adj"] = int(r[5] or 0)
            post_map[key]["monto_adj"] = round(float(r[6] or 0))

        rows = sorted(post_map.values(), key=lambda x: (x["usuario"], x["mes"]))
        return {"rows": rows}
    except Exception as e:
        return {"rows": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-postulaciones-detalle")
async def falcon_postulaciones_detalle(
    usuario: str,
    mes: int,
    ano: int = 2026,
    current_user: dict = Depends(get_current_user),
):
    """Detalle de licitaciones postuladas por un usuario en un mes dado."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                licitacion_id,
                MAX(organismo)                               AS organismo,
                MAX(unidad_compra)                           AS unidad_compra,
                MAX(region)                                  AS region,
                COUNT(*)                                     AS items,
                ROUND(SUM(ISNULL(precio * cantidad, 0)), 0)  AS monto,
                CONVERT(varchar, MIN(fecha_inicio), 23)      AS fecha_inicio,
                CONVERT(varchar, MAX(fecha_termino), 23)     AS fecha_termino,
                MAX(estado_mp)                               AS estado_mp
            FROM falcon_gestion
            WHERE canal = 'Licitacion'
              AND empresa = 'COMERCIAL LBF LIMITADA'
              AND ISNULL(usuario_gestion, '(Sin asignar)') = ?
              AND fecha_inicio IS NOT NULL
              AND YEAR(fecha_inicio) = ?
              AND MONTH(fecha_inicio) = ?
            GROUP BY licitacion_id
            ORDER BY licitacion_id
        """, [usuario, ano, mes])
        cols = [d[0] for d in cur.description]
        lics = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            lics.append({
                "licitacion_id":  d["licitacion_id"] or "",
                "organismo":      (d["organismo"] or "")[:80],
                "unidad_compra":  (d["unidad_compra"] or "")[:60],
                "region":         d["region"] or "",
                "items":          int(d["items"] or 0),
                "monto":          round(float(d["monto"] or 0)),
                "fecha_inicio":   d["fecha_inicio"] or "",
                "fecha_termino":  d["fecha_termino"] or "",
                "estado_mp":      d["estado_mp"] or "",
            })
        return {"usuario": usuario, "mes": mes, "ano": ano, "licitaciones": lics}
    except Exception as e:
        return {"licitaciones": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-perdidos-precio")
async def falcon_perdidos_precio(
    ano: int = 0,  # 0 = todos los años
    current_user: dict = Depends(get_current_user),
):
    """Ítems donde LBF perdió por tener precio mayor al adjudicado."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        year_filter = "AND YEAR(lbf.fecha_inicio) = ?" if ano else ""
        params_base = [ano] if ano else []

        # KPIs globales
        cur.execute(f"""
            SELECT
                COUNT(DISTINCT lbf.licitacion_id)                       AS lics,
                COUNT(*)                                                 AS items,
                ROUND(SUM(lbf.total_ofertado), 0)                       AS monto_lbf,
                ROUND(SUM(adj.precio * lbf.cantidad), 0)                AS monto_adj,
                ROUND(SUM((lbf.precio - adj.precio) * lbf.cantidad), 0) AS gap_monto
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND adj.precio    < lbf.precio
              AND lbf.precio    > 0 AND adj.precio > 0
              AND lbf.fecha_inicio IS NOT NULL
              {year_filter}
        """, params_base)
        r = cur.fetchone()
        kpis = {
            "lics":       int(r[0] or 0),
            "items":      int(r[1] or 0),
            "monto_lbf":  round(float(r[2] or 0)),
            "monto_adj":  round(float(r[3] or 0)),
            "gap_monto":  round(float(r[4] or 0)),
        }

        # Tabla por licitación (top 200 por monto LBF)
        cur.execute(f"""
            SELECT TOP 200
                lbf.licitacion_id,
                MAX(lbf.organismo)                                           AS organismo,
                CONVERT(varchar, MIN(lbf.fecha_inicio), 23)                  AS fecha_inicio,
                COUNT(*)                                                      AS items,
                ROUND(SUM(lbf.total_ofertado), 0)                            AS monto_lbf,
                ROUND(SUM(adj.precio * lbf.cantidad), 0)                     AS monto_adj,
                ROUND(SUM((lbf.precio - adj.precio) * lbf.cantidad), 0)      AS gap_monto,
                ROUND(AVG(CAST(lbf.precio - adj.precio AS float)
                      / NULLIF(adj.precio,0) * 100), 1)                      AS gap_pct
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND adj.precio    < lbf.precio
              AND lbf.precio    > 0 AND adj.precio > 0
              AND lbf.fecha_inicio IS NOT NULL
              {year_filter}
            GROUP BY lbf.licitacion_id
            ORDER BY monto_lbf DESC
        """, params_base)
        cols = [d[0] for d in cur.description]
        licitaciones = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            licitaciones.append({
                "licitacion_id": d["licitacion_id"] or "",
                "organismo":     (d["organismo"] or "")[:80],
                "fecha_inicio":  (d["fecha_inicio"] or "")[:7],
                "items":         int(d["items"] or 0),
                "monto_lbf":     round(float(d["monto_lbf"] or 0)),
                "monto_adj":     round(float(d["monto_adj"] or 0)),
                "gap_monto":     round(float(d["gap_monto"] or 0)),
                "gap_pct":       round(float(d["gap_pct"] or 0), 1),
            })

        # Top 10 competidores que ganan a LBF por precio
        cur.execute(f"""
            SELECT TOP 10
                adj.empresa,
                COUNT(*)                                   AS items,
                COUNT(DISTINCT lbf.licitacion_id)          AS lics,
                ROUND(SUM(adj.precio * lbf.cantidad), 0)   AS monto_adj
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND adj.precio    < lbf.precio
              AND lbf.precio    > 0 AND adj.precio > 0
              AND lbf.fecha_inicio IS NOT NULL
              {year_filter}
            GROUP BY adj.empresa
            ORDER BY items DESC
        """, params_base)
        competidores = []
        for row in cur.fetchall():
            competidores.append({
                "empresa":   row[0] or "",
                "items":     int(row[1] or 0),
                "lics":      int(row[2] or 0),
                "monto_adj": round(float(row[3] or 0)),
            })

        # Por mes
        cur.execute(f"""
            SELECT
                YEAR(lbf.fecha_inicio)                                       AS ano,
                MONTH(lbf.fecha_inicio)                                      AS mes,
                COUNT(DISTINCT lbf.licitacion_id)                            AS lics,
                COUNT(*)                                                      AS items,
                ROUND(SUM(lbf.total_ofertado), 0)                            AS monto_lbf,
                ROUND(SUM(adj.precio * lbf.cantidad), 0)                     AS monto_adj,
                ROUND(SUM((lbf.precio - adj.precio) * lbf.cantidad), 0)      AS gap_monto
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND adj.precio    < lbf.precio
              AND lbf.precio    > 0 AND adj.precio > 0
              AND lbf.fecha_inicio IS NOT NULL
              {year_filter}
            GROUP BY YEAR(lbf.fecha_inicio), MONTH(lbf.fecha_inicio)
            ORDER BY ano, mes
        """, params_base)
        por_mes = []
        for row in cur.fetchall():
            por_mes.append({
                "ano":       int(row[0]),
                "mes":       int(row[1]),
                "lics":      int(row[2] or 0),
                "items":     int(row[3] or 0),
                "monto_lbf": round(float(row[4] or 0)),
                "monto_adj": round(float(row[5] or 0)),
                "gap_monto": round(float(row[6] or 0)),
            })

        return {"ano": ano, "kpis": kpis, "por_mes": por_mes, "competidores": competidores}
    except Exception as e:
        return {"kpis": {}, "por_mes": [], "competidores": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-perdidos-detalle")
async def falcon_perdidos_detalle(
    ano: int,
    mes: int,
    current_user: dict = Depends(get_current_user),
):
    """Licitaciones perdidas por precio en un mes/año dado."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                lbf.licitacion_id,
                MAX(lbf.organismo)                                          AS organismo,
                COUNT(*)                                                    AS items,
                ROUND(SUM(lbf.total_ofertado), 0)                           AS monto_lbf,
                ROUND(SUM(adj.precio * lbf.cantidad), 0)                    AS monto_adj,
                ROUND(SUM((lbf.precio - adj.precio) * lbf.cantidad), 0)     AS gap_monto,
                ROUND(AVG(CAST(lbf.precio - adj.precio AS float)
                      / NULLIF(adj.precio, 0) * 100), 1)                    AS gap_pct,
                (SELECT TOP 1 adj2.empresa
                 FROM falcon_gestion adj2
                 WHERE adj2.licitacion_id = lbf.licitacion_id
                   AND adj2.estado_mp = 'Adjudicada'
                   AND adj2.empresa <> 'COMERCIAL LBF LIMITADA'
                 GROUP BY adj2.empresa
                 ORDER BY COUNT(*) DESC)                                    AS competidor
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND adj.precio    < lbf.precio
              AND lbf.precio    > 0 AND adj.precio > 0
              AND lbf.fecha_inicio IS NOT NULL
              AND YEAR(lbf.fecha_inicio)  = ?
              AND MONTH(lbf.fecha_inicio) = ?
            GROUP BY lbf.licitacion_id
            ORDER BY monto_lbf DESC
        """, [ano, mes])
        cols = [d[0] for d in cur.description]
        lics = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            lics.append({
                "licitacion_id": d["licitacion_id"] or "",
                "organismo":     (d["organismo"] or "")[:80],
                "items":         int(d["items"] or 0),
                "monto_lbf":     round(float(d["monto_lbf"] or 0)),
                "monto_adj":     round(float(d["monto_adj"] or 0)),
                "gap_monto":     round(float(d["gap_monto"] or 0)),
                "gap_pct":       round(float(d["gap_pct"] or 0), 1),
                "competidor":    (d["competidor"] or "")[:60],
            })
        return {"ano": ano, "mes": mes, "licitaciones": lics}
    except Exception as e:
        return {"licitaciones": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


@router.get("/falcon-perdidos-conteo")
async def falcon_perdidos_conteo(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    """Conteo de ítems perdidos — dos grupos:
      mejor: LBF precio < adjudicado (éramos más baratos pero no ganamos)
      mayor: LBF precio > adjudicado (éramos más caros, pérdida esperada)
    Solo licitaciones Adjudicadas. Fuente: falcon_gestion (SQL Server).
    """
    ck = f"mercados_relevantes:falcon_perdidos_conteo_v2:{ano}"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        ano_filter = "AND YEAR(adj.fecha_adj) = ?" if ano else "AND YEAR(adj.fecha_adj) BETWEEN 2024 AND 2026"
        params = [ano] if ano else []

        MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

        cur.execute(f"""
            SELECT
                YEAR(adj.fecha_adj)  AS ano,
                MONTH(adj.fecha_adj) AS mes,
                COUNT(DISTINCT CASE WHEN lbf.precio < adj.precio THEN lbf.licitacion_id END) AS mejor_lics,
                SUM(CASE WHEN lbf.precio < adj.precio THEN 1 ELSE 0 END)                     AS mejor_items,
                COUNT(DISTINCT CASE WHEN lbf.precio > adj.precio THEN lbf.licitacion_id END) AS mayor_lics,
                SUM(CASE WHEN lbf.precio > adj.precio THEN 1 ELSE 0 END)                     AS mayor_items
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND lbf.precio    > 0
              AND adj.precio    > 0
              AND adj.fecha_adj IS NOT NULL
              {ano_filter}
            GROUP BY YEAR(adj.fecha_adj), MONTH(adj.fecha_adj)
            ORDER BY ano, mes
        """, params)

        por_mes = []
        tot_ml = tot_mi = tot_ayl = tot_ayi = 0
        for r in cur.fetchall():
            y, m = int(r[0]), int(r[1])
            ml, mi, ayl, ayi = int(r[2] or 0), int(r[3] or 0), int(r[4] or 0), int(r[5] or 0)
            tot_ml += ml; tot_mi += mi; tot_ayl += ayl; tot_ayi += ayi
            por_mes.append({
                "ano": y, "mes": m,
                "label": f"{MESES[m-1]}'{str(y)[2:]}",
                "mejor_lics": ml, "mejor_items": mi,
                "mayor_lics": ayl, "mayor_items": ayi,
            })

        result = {
            "kpis": {
                "mejor_lics": tot_ml, "mejor_items": tot_mi,
                "mayor_lics": tot_ayl, "mayor_items": tot_ayi,
            },
            "por_mes": por_mes,
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"kpis": {}, "por_mes": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: _ss_close(conn)


# ─── Perdidos por precio — detalle de un mes (drill-down) ────────────────────

@router.get("/falcon-perdidos-detalle-mes")
async def falcon_perdidos_detalle_mes(
    ano:   int = Query(2026),
    mes:   int = Query(1),
    grupo: str = Query("mejor"),   # "mejor" | "mayor"
    current_user: dict = Depends(get_current_user),
):
    """Detalle por licitación de ítems perdidos en un mes.
    grupo='mejor': LBF era más barato pero no adjudicado (lbf.precio < adj.precio).
    grupo='mayor': LBF era más caro (lbf.precio > adj.precio).
    Incluye precios promedio y dif% para diagnóstico.
    """
    ck = f"falcon_perdidos_detalle_v2:{ano}:{mes}:{grupo}"
    cached = mem_get(ck)
    if cached is not None:
        return cached

    ss_conn = None
    try:
        MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        precio_cond = "lbf.precio < adj.precio" if grupo == "mejor" else "lbf.precio > adj.precio"

        ss_conn = get_conn()
        cur = ss_conn.cursor()
        cur.execute(f"""
            SELECT
                lbf.licitacion_id                                                         AS licitacion_id,
                MAX(lbf.organismo)                                                         AS organismo,
                COUNT(*)                                                                   AS items_perdidos,
                MAX(adj.empresa)                                                           AS competidor,
                ROUND(AVG(lbf.precio), 0)                                                 AS precio_lbf_avg,
                ROUND(AVG(adj.precio), 0)                                                 AS precio_adj_avg,
                ROUND((AVG(adj.precio) / NULLIF(AVG(lbf.precio), 0) - 1) * 100, 1)       AS dif_pct,
                MAX(ISNULL(LTRIM(RTRIM(lbf.estado_sgl)), ''))                             AS estado_sgl
            FROM falcon_gestion lbf
            JOIN falcon_gestion adj
              ON lbf.licitacion_id = adj.licitacion_id
             AND lbf.item_nbr      = adj.item_nbr
            WHERE lbf.empresa   = 'COMERCIAL LBF LIMITADA'
              AND lbf.estado_mp = 'No Adjudicada'
              AND lbf.canal     = 'Licitacion'
              AND adj.estado_mp = 'Adjudicada'
              AND adj.empresa  <> 'COMERCIAL LBF LIMITADA'
              AND lbf.precio    > 0
              AND adj.precio    > 0
              AND adj.fecha_adj IS NOT NULL
              AND YEAR(adj.fecha_adj)  = ?
              AND MONTH(adj.fecha_adj) = ?
              AND {precio_cond}
            GROUP BY lbf.licitacion_id
            ORDER BY items_perdidos DESC
        """, (ano, mes))
        ss_rows = cur.fetchall()

        rows = [
            {
                "licitacion_id":  r[0],
                "organismo":      r[1] or "",
                "items_perdidos": int(r[2] or 0),
                "competidor":     r[3] or "",
                "precio_lbf_avg": round(float(r[4] or 0)),
                "precio_adj_avg": round(float(r[5] or 0)),
                "dif_pct":        round(float(r[6] or 0), 1),
                "estado_sgl":     r[7] or "",
            }
            for r in ss_rows
        ]

        result = {
            "ano": ano, "mes": mes, "grupo": grupo,
            "label": f"{MESES[mes-1]}'{str(ano)[2:]}",
            "rows": rows,
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"rows": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if ss_conn: _ss_close(ss_conn)
