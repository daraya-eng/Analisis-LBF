"""
Mercados Relevantes — Analisis del mercado de licitaciones publicas.
Fuente unica: DWLBF.dbo.dw_datos_abiertos_licitaciones (SQL Server).
Rubros: Equipamiento y Suministros Medicos + Equipamiento para Laboratorios.
"""
import traceback
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT = "93.366.000-1"
IVA = 1.19  # MontoLineaAdjudica en SS es neto; Masnet muestra con IVA

_RUBRO_FILTER = """
    (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'
     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')
"""

# Same condition for WHERE concatenation (no f-string, uses LIKE with % wildcard)
_LBF_RUBRO_AND = (
    "AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
    " OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
)

_SERRES_FILTER = (
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


@router.get("/licitaciones-kpis")
async def licitaciones_kpis(
    current_user: dict = Depends(get_current_user),
):
    """KPIs generales del mercado total por ano (2024-2025-2026)."""
    ck = "mercados_relevantes:lic_kpis_dw_adj_v4_iva"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"""
            WITH items AS (
                SELECT
                    YEAR(FechaAdjudicacion)  AS ano,
                    Codigo,
                    Codigoitem,
                    MAX(Estado)        AS estado,
                    MAX(MontoEstimado) AS monto_estimado,
                    MAX(CASE WHEN Ofertaseleccionada = 'Seleccionada'
                             THEN MontoLineaAdjudica ELSE 0 END) AS monto_adj_item,
                    MAX(CASE WHEN Ofertaseleccionada = 'Seleccionada'
                             THEN 1 ELSE 0 END) AS item_adj
                FROM DWLBF.dbo.dw_datos_abiertos_licitaciones
                WHERE {_RUBRO_FILTER}
                  AND FechaAdjudicacion IS NOT NULL
                  AND YEAR(FechaAdjudicacion) BETWEEN 2024 AND 2026
                GROUP BY YEAR(FechaAdjudicacion), Codigo, Codigoitem
            ),
            lics AS (
                SELECT ano, Codigo,
                    MAX(estado)         AS estado,
                    MAX(monto_estimado) AS monto_estimado
                FROM items GROUP BY ano, Codigo
            ),
            lic_yr AS (
                SELECT ano,
                    COUNT(*) AS total_lics,
                    SUM(CASE WHEN estado = 'Adjudicada' THEN 1 ELSE 0 END) AS lics_adj,
                    SUM(monto_estimado) AS monto_estimado
                FROM lics GROUP BY ano
            ),
            item_yr AS (
                SELECT ano,
                    COUNT(*)            AS total_items,
                    SUM(item_adj)       AS items_adj,
                    SUM(monto_adj_item) AS monto_adjudicado
                FROM items GROUP BY ano
            )
            SELECT
                l.ano,
                l.total_lics,
                l.lics_adj,
                ROUND(CAST(l.lics_adj AS FLOAT) / NULLIF(l.total_lics,0) * 100, 1) AS tasa_adj_lics,
                i.total_items,
                i.items_adj,
                ROUND(CAST(i.items_adj AS FLOAT) / NULLIF(i.total_items,0) * 100, 1) AS tasa_adj_items,
                l.monto_estimado,
                i.monto_adjudicado,
                ROUND(CAST(i.monto_adjudicado AS FLOAT) / NULLIF(l.monto_estimado,0) * 100, 1) AS pct_adj_vs_estimado
            FROM lic_yr l JOIN item_yr i ON i.ano = l.ano ORDER BY l.ano
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            me = float(d["monto_estimado"] or 0)
            ma = float(d["monto_adjudicado"] or 0) * IVA
            rows.append({
                "ano":                 int(d["ano"]),
                "total_lics":          int(d["total_lics"] or 0),
                "lics_adj":            int(d["lics_adj"] or 0),
                "tasa_adj_lics":       float(d["tasa_adj_lics"] or 0),
                "total_items":         int(d["total_items"] or 0),
                "items_adj":           int(d["items_adj"] or 0),
                "tasa_adj_items":      float(d["tasa_adj_items"] or 0),
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
        if conn:
            conn.close()


def _get_raw_lbf_data() -> list[dict]:
    """
    Carga o retorna desde cache la data LBF por (ano, tipo).
    Incluye filtro de rubro para consistencia con KPIs de mercado.
    """
    ck = "mercados_relevantes:lic_lbf_dw_raw_adj_v4_iva"
    if cached := mem_get(ck):
        return cached

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT YEAR(FechaAdjudicacion) AS ano, ISNULL(Tipo,'(sin tipo)') AS tipo,"
        " COUNT(DISTINCT Codigo) AS total_lics,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
        " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS total_items,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
        " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
        " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado"
        " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
        " WHERE RutProveedor='93.366.000-1' AND FechaAdjudicacion IS NOT NULL"
        "   AND YEAR(FechaAdjudicacion) IN (2024,2025,2026)"
        "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
        "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
        " GROUP BY YEAR(FechaAdjudicacion), ISNULL(Tipo,'(sin tipo)')"
        " ORDER BY ano, monto_ofertado DESC"
    )
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    conn.close()
    result = [dict(zip(cols, r)) for r in rows]
    mem_set(ck, result)
    return result


@router.get("/licitaciones-lbf")
async def licitaciones_lbf(
    current_user: dict = Depends(get_current_user),
):
    """Resumen anual de participacion LBF (2025-2026). Incluye ultimo_mes para label YTD."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT YEAR(FechaAdjudicacion) AS ano,"
            " COUNT(DISTINCT Codigo) AS total_lics,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
            " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS total_items,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado,"
            " MAX(MONTH(FechaAdjudicacion)) AS ultimo_mes,"
            " MAX(MONTH(FechaAdjudicacion)) AS meses_con_data"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE RutProveedor='93.366.000-1' AND FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) IN (2024,2025,2026)"
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            " GROUP BY YEAR(FechaAdjudicacion) ORDER BY ano"
        )
        cols = [d[0] for d in cur.description]
        raw = cur.fetchall()
        conn.close()

        rows = []
        for r in raw:
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
        return {"anos": rows}
    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}


@router.get("/licitaciones-lbf-tipo")
async def licitaciones_lbf_tipo(
    current_user: dict = Depends(get_current_user),
):
    """Desglose por tipo de licitacion (2025-2026)."""
    try:
        raw = _get_raw_lbf_data()
        rows = []
        for d in raw:
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            mo = float(d["monto_ofertado"] or 0)
            ma = float(d["monto_adjudicado"] or 0) * IVA
            rows.append({
                "ano":               int(d["ano"]),
                "tipo":              d["tipo"],
                "total_lics":        tl,
                "lics_adj":          la,
                "tasa_adj_lics":     round(la / tl * 100, 1) if tl else 0,
                "monto_ofertado":    mo,
                "monto_adjudicado":  ma,
                "pct_ganado":        round(ma / mo * 100, 1) if mo else 0,
            })
        return {"filas": rows}
    except Exception as e:
        return {"filas": [], "error": str(e), "detail": traceback.format_exc()}


@router.get("/licitaciones-lbf-tipo-periodo")
async def licitaciones_lbf_tipo_periodo(
    current_user: dict = Depends(get_current_user),
):
    """Desglose por tipo — mismo periodo Ene-May 2025 vs 2026."""
    ck = "mercados_relevantes:lic_lbf_tipo_periodo_v1"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT ISNULL(Tipo,'(sin tipo)') AS tipo,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2025 THEN Codigo END) AS total_lics_25,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2025 AND Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj_25,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2025"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_part_25,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2025 AND Ofertaseleccionada='Seleccionada'"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj_25,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2025 THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS monto_adj_25,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2026 THEN Codigo END) AS total_lics_26,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2026 AND Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj_26,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2026"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_part_26,"
            " COUNT(DISTINCT CASE WHEN YEAR(FechaAdjudicacion)=2026 AND Ofertaseleccionada='Seleccionada'"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj_26,"
            " SUM(CASE WHEN YEAR(FechaAdjudicacion)=2026 THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) AS monto_adj_26"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE RutProveedor='93.366.000-1' AND FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) IN (2025,2026)"
            "   AND MONTH(FechaAdjudicacion) BETWEEN 1 AND 5"
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            " GROUP BY ISNULL(Tipo,'(sin tipo)')"
            " ORDER BY SUM(CASE WHEN YEAR(FechaAdjudicacion)=2026"
            "   THEN CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT) ELSE 0 END) DESC"
        )
        cols = [d[0] for d in cur.description]
        raw = cur.fetchall()

        filas = []
        for r in raw:
            d = dict(zip(cols, r))
            filas.append({
                "tipo":          d["tipo"],
                "total_lics_25": int(d["total_lics_25"] or 0),
                "lics_adj_25":   int(d["lics_adj_25"]   or 0),
                "items_adj_25":  int(d["items_adj_25"]   or 0),
                "monto_adj_25":  round(float(d["monto_adj_25"] or 0) * IVA),
                "total_lics_26": int(d["total_lics_26"] or 0),
                "lics_adj_26":   int(d["lics_adj_26"]   or 0),
                "items_adj_26":  int(d["items_adj_26"]   or 0),
                "monto_adj_26":  round(float(d["monto_adj_26"] or 0) * IVA),
            })

        result = {"filas": filas}
        mem_set(ck, result)
        return result

    except Exception as e:
        return {"filas": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn:
            conn.close()


@router.get("/evolucion-mensual")
async def evolucion_mensual(
    current_user: dict = Depends(get_current_user),
):
    """Evolucion mensual ofertado y adjudicado LBF para 2024/2025/2026 (todos los meses)."""
    ck = "mercados_relevantes:evolucion_mensual_adj_v7_items"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT YEAR(FechaAdjudicacion) AS ano, MONTH(FechaAdjudicacion) AS mes,"
            " COUNT(DISTINCT Codigo) AS lics_part,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
            " COUNT(DISTINCT CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR))) AS items_part,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada'"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE RutProveedor='93.366.000-1' AND FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) IN (2024,2025,2026)"
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            " GROUP BY YEAR(FechaAdjudicacion), MONTH(FechaAdjudicacion)"
            " ORDER BY ano, mes"
        )
        cols = [d[0] for d in cur.description]
        raw_rows = cur.fetchall()

        MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        _zero = lambda: {
            "v2024_of": 0, "v2024_adj": 0, "l2024_part": 0, "l2024_adj": 0, "i2024_part": 0, "i2024_adj": 0,
            "v2025_of": 0, "v2025_adj": 0, "l2025_part": 0, "l2025_adj": 0, "i2025_part": 0, "i2025_adj": 0,
            "v2026_of": 0, "v2026_adj": 0, "l2026_part": 0, "l2026_adj": 0, "i2026_part": 0, "i2026_adj": 0,
        }
        by_mes: dict = {}
        for r in raw_rows:
            d = dict(zip(cols, r))
            ano = int(d["ano"])
            mes = int(d["mes"])
            if mes not in by_mes:
                by_mes[mes] = {"mes": mes, "mes_nom": MESES[mes - 1], **_zero()}
            of  = round(float(d["monto_ofertado"]  or 0))
            adj = round(float(d["monto_adjudicado"] or 0) * IVA)
            lp  = int(d["lics_part"]  or 0)
            la  = int(d["lics_adj"]   or 0)
            ip  = int(d["items_part"] or 0)
            ia  = int(d["items_adj"]  or 0)
            prefix = {2024: "2024", 2025: "2025", 2026: "2026"}.get(ano)
            if prefix:
                by_mes[mes][f"v{prefix}_of"]    = of
                by_mes[mes][f"v{prefix}_adj"]   = adj
                by_mes[mes][f"l{prefix}_part"]  = lp
                by_mes[mes][f"l{prefix}_adj"]   = la
                by_mes[mes][f"i{prefix}_part"]  = ip
                by_mes[mes][f"i{prefix}_adj"]   = ia

        # Build full 12-month list; missing months get zeros
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
        if conn:
            conn.close()


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
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            f"  {_SERRES_FILTER}"
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
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            f"  {_SERRES_FILTER}"
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
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            f"  {_SERRES_FILTER}"
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
    """Cuadro comparativo Serres: 2024, 2025, YTD 2026, MAT (últimos 12 meses)."""
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
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            f"  {_SERRES_FILTER}"
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
            "   AND (l.Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR l.Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
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
        rows = cur.fetchall()
        result_rows = []
        for r in rows:
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


@router.get("/mercado-serres/tendencia-clientes")
async def mercado_serres_tendencia_competidores(current_user: dict = Depends(get_current_user)):
    """Tendencia trimestral por competidor en el mercado Serres 2023-2026. LBF siempre incluido."""
    ck = "mercados_relevantes:serres_tend_comp_v2"
    if cached := mem_get(ck):
        return cached
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        base_where = (
            " WHERE d.FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(d.FechaAdjudicacion) BETWEEN 2023 AND 2026"
            "   AND d.Ofertaseleccionada='Seleccionada'"
            "   AND (d.Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR d.Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            "   AND (d.DescripcionlineaAdquisicion LIKE '%bolsa%aspirac%'"
            "     OR d.DescripcionlineaAdquisicion LIKE '%aspirac%bolsa%'"
            "     OR d.DescripcionlineaAdquisicion LIKE '%bolsa%aspir%'"
            "     OR d.Nombreproductogenrico = 'DEPÓSITOS DE ASPIRACIÓN QUIRÚRGICOS'"
            "     OR d.Nombreproductogenrico = 'SONDAS DE DRENAJE PARA LA ASPIRACIÓN QUIRÚRGICA'"
            "     OR d.Nombreproductogenrico = 'CÁNULAS O TUBOS DE SUCCIÓN MÉDICOS O ACCESORIOS'"
            "     OR d.Nombreproductogenrico = 'PRODUCTOS DE ASPIRACIÓN PARA BIOPSIA O ACCESORIOS')"
        )

        serres_base = (
            " WHERE FechaAdjudicacion IS NOT NULL"
            "   AND YEAR(FechaAdjudicacion) BETWEEN 2023 AND 2026"
            "   AND Ofertaseleccionada='Seleccionada'"
            "   AND (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
            "     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')"
            "   AND (DescripcionlineaAdquisicion LIKE '%bolsa%aspirac%'"
            "     OR DescripcionlineaAdquisicion LIKE '%aspirac%bolsa%'"
            "     OR DescripcionlineaAdquisicion LIKE '%bolsa%aspir%'"
            "     OR Nombreproductogenrico = 'DEPÓSITOS DE ASPIRACIÓN QUIRÚRGICOS'"
            "     OR Nombreproductogenrico = 'SONDAS DE DRENAJE PARA LA ASPIRACIÓN QUIRÚRGICA'"
            "     OR Nombreproductogenrico = 'CÁNULAS O TUBOS DE SUCCIÓN MÉDICOS O ACCESORIOS'"
            "     OR Nombreproductogenrico = 'PRODUCTOS DE ASPIRACIÓN PARA BIOPSIA O ACCESORIOS')"
        )

        # Step 1: get top 7 competitor RUTs (fast — no JOIN)
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
        # Build IN list for step 2
        rut_list = "','".join(top_ruts.keys())

        # Step 2: monthly breakdown for those RUTs only
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

        from collections import defaultdict
        comp_data: dict = defaultdict(dict)  # {rut: {quarter: {adj, unidades}}}
        comp_meta: dict = {}                  # {rut: {nombre, shortname, es_lbf}}
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
        # LBF first, then rest sorted by total desc
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


@router.get("/perdidos-precio")
async def perdidos_precio(
    ano: int = Query(2025),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    """
    Items donde LBF participó pero no fue adjudicado:
      - 'Aceptada' + precio mínimo → anomalía real (ganador cobró más que LBF)
      - 'Rechazada' → oferta inadmisible (descartada antes de evaluación de precio)
    Incluye resumen de participación, desglose por tipo y precio unitario.
    """
    ck = f"mercados_relevantes:perdidos_precio_v3:{ano}:{mes}"
    if cached := mem_get(ck):
        return cached

    mes_filter = f"AND MONTH(FechaAdjudicacion) = {mes}" if mes > 0 else ""
    rubro = ("(Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
             " OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')")
    rubro_b = ("(d.Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'"
               " OR d.Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')")

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # ── Grupo A: Aceptadas con precio mínimo pero no adjudicadas ─────────
        cur.execute(
            "WITH lbf_ok AS ("
            "  SELECT Codigo, CodigoItem,"
            "    ISNULL(NULLIF(NombrelineaAdquisicion,''), DescripcionlineaAdquisicion) AS producto,"
            "    NombreOrganismo, Tipo,"
            "    CAST(FechaAdjudicacion AS DATE) AS fecha_adj,"
            "    CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT) AS lbf_precio,"
            "    CAST(ISNULL(MontoUnitarioOferta,0) AS FLOAT) AS lbf_precio_unit"
            "  FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            f" WHERE RutProveedor='93.366.000-1' AND EstadoOferta='Aceptada'"
            f"   AND ISNULL(Ofertaseleccionada,'')<>'Seleccionada'"
            f"   AND CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT) >= 1000"
            f"   AND YEAR(FechaAdjudicacion)={ano} AND {rubro} {mes_filter}"
            "),"
            "min_p AS ("
            "  SELECT d.Codigo, d.CodigoItem,"
            "    MIN(CAST(ISNULL(d.ValorTotalOfertado,0) AS FLOAT)) AS min_precio"
            "  FROM DWLBF.dbo.dw_datos_abiertos_licitaciones d"
            "  WHERE CAST(ISNULL(d.ValorTotalOfertado,0) AS FLOAT) > 0"
            "    AND EXISTS (SELECT 1 FROM lbf_ok x WHERE x.Codigo=d.Codigo AND x.CodigoItem=d.CodigoItem)"
            "  GROUP BY d.Codigo, d.CodigoItem"
            "),"
            "gan AS ("
            "  SELECT d.Codigo, d.CodigoItem,"
            "    MAX(d.NombreProveedor) AS ganador_nombre,"
            "    MAX(CAST(ISNULL(d.ValorTotalOfertado,0) AS FLOAT)) AS ganador_precio,"
            "    MAX(CAST(ISNULL(d.MontoUnitarioOferta,0) AS FLOAT)) AS ganador_precio_unit"
            "  FROM DWLBF.dbo.dw_datos_abiertos_licitaciones d"
            "  WHERE d.Ofertaseleccionada='Seleccionada'"
            "    AND EXISTS (SELECT 1 FROM lbf_ok x WHERE x.Codigo=d.Codigo AND x.CodigoItem=d.CodigoItem)"
            "  GROUP BY d.Codigo, d.CodigoItem"
            ")"
            "SELECT TOP 500"
            "  a.Codigo, a.CodigoItem, a.producto, a.NombreOrganismo, a.Tipo,"
            "  a.fecha_adj, a.lbf_precio, a.lbf_precio_unit,"
            "  g.ganador_precio, g.ganador_precio_unit, g.ganador_nombre,"
            "  ROUND((g.ganador_precio/NULLIF(a.lbf_precio,0)-1)*100,1) AS dif_pct"
            " FROM lbf_ok a"
            " JOIN min_p m ON m.Codigo=a.Codigo AND m.CodigoItem=a.CodigoItem"
            "   AND a.lbf_precio <= m.min_precio"
            " JOIN gan g ON g.Codigo=a.Codigo AND g.CodigoItem=a.CodigoItem"
            " WHERE g.ganador_precio > a.lbf_precio"
            " ORDER BY dif_pct DESC"
        )
        cols = [d[0] for d in cur.description]
        grupo_a = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            grupo_a.append({
                "codigo":              d["Codigo"],
                "codigo_item":         int(d["CodigoItem"] or 0),
                "producto":            d["producto"] or "",
                "organismo":           d["NombreOrganismo"] or "",
                "tipo":                d["Tipo"] or "",
                "fecha_adj":           str(d["fecha_adj"]),
                "lbf_precio":          round(float(d["lbf_precio"] or 0) * IVA),
                "lbf_precio_unit":     round(float(d["lbf_precio_unit"] or 0) * IVA),
                "ganador_precio":      round(float(d["ganador_precio"] or 0) * IVA),
                "ganador_precio_unit": round(float(d["ganador_precio_unit"] or 0) * IVA),
                "ganador_nombre":      d["ganador_nombre"] or "",
                "dif_pct":             float(d["dif_pct"] or 0),
            })

        # ── Grupo B: Rechazadas (inadmisibles) ───────────────────────────────
        cur.execute(
            "SELECT TOP 500"
            "  d.Codigo, d.CodigoItem,"
            "  ISNULL(NULLIF(d.NombrelineaAdquisicion,''), d.DescripcionlineaAdquisicion) AS producto,"
            "  d.NombreOrganismo, d.Tipo,"
            "  CAST(d.FechaAdjudicacion AS DATE) AS fecha_adj,"
            "  CAST(ISNULL(d.ValorTotalOfertado,0) AS FLOAT) AS lbf_precio,"
            "  CAST(ISNULL(d.MontoUnitarioOferta,0) AS FLOAT) AS lbf_precio_unit,"
            "  g.NombreProveedor AS ganador_nombre,"
            "  CAST(ISNULL(g.ValorTotalOfertado,0) AS FLOAT) AS ganador_precio"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones d"
            " LEFT JOIN DWLBF.dbo.dw_datos_abiertos_licitaciones g"
            "   ON g.Codigo=d.Codigo AND g.CodigoItem=d.CodigoItem AND g.Ofertaseleccionada='Seleccionada'"
            f" WHERE d.RutProveedor='93.366.000-1' AND d.EstadoOferta='Rechazada'"
            f"   AND YEAR(d.FechaAdjudicacion)={ano} AND {rubro_b} {mes_filter}"
            " ORDER BY d.FechaAdjudicacion DESC"
        )
        cols2 = [d[0] for d in cur.description]
        grupo_b = []
        for r in cur.fetchall():
            d = dict(zip(cols2, r))
            grupo_b.append({
                "codigo":          d["Codigo"],
                "codigo_item":     int(d["CodigoItem"] or 0),
                "producto":        d["producto"] or "",
                "organismo":       d["NombreOrganismo"] or "",
                "tipo":            d["Tipo"] or "",
                "fecha_adj":       str(d["fecha_adj"]),
                "lbf_precio":      round(float(d["lbf_precio"] or 0) * IVA),
                "lbf_precio_unit": round(float(d["lbf_precio_unit"] or 0) * IVA),
                "ganador_nombre":  d["ganador_nombre"] or "",
                "ganador_precio":  round(float(d["ganador_precio"] or 0) * IVA),
            })

        # ── Resumen de participación global ───────────────────────────────────
        cur.execute(
            "SELECT"
            " COUNT(DISTINCT Codigo) AS lics_part,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
            " COUNT(DISTINCT CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR))) AS items_part,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada'"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " COUNT(DISTINCT CASE WHEN EstadoOferta='Rechazada'"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),'-',CAST(CodigoItem AS VARCHAR)) END) AS items_inadmisibles,"
            " COUNT(DISTINCT CASE WHEN EstadoOferta='Rechazada' THEN Codigo END) AS lics_inadmisibles"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            f" WHERE RutProveedor='93.366.000-1' AND YEAR(FechaAdjudicacion)={ano}"
            f"   AND {rubro} {mes_filter}"
        )
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

        # ── Inadmisibles por tipo ─────────────────────────────────────────────
        cur.execute(
            "SELECT ISNULL(Tipo,'(sin tipo)') AS tipo,"
            " COUNT(DISTINCT Codigo) AS lics,"
            " COUNT(*) AS items"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            f" WHERE RutProveedor='93.366.000-1' AND EstadoOferta='Rechazada'"
            f"   AND YEAR(FechaAdjudicacion)={ano} AND {rubro} {mes_filter}"
            " GROUP BY ISNULL(Tipo,'(sin tipo)')"
            " ORDER BY items DESC"
        )
        c_tipo = [d[0] for d in cur.description]
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
        if conn: conn.close()


@router.get("/perdidos-licitacion")
async def perdidos_licitacion(
    codigo: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Todos los ítems + proveedores de una licitación donde LBF participó."""
    ck = f"mercados_relevantes:perdidos_licitacion_v1:{codigo}"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        # Step 1: get LBF's item codes for this licitacion (fast point lookup)
        cur.execute(
            "SELECT DISTINCT CodigoItem"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE Codigo=? AND RutProveedor=?",
            (codigo, LBF_RUT)
        )
        lbf_items = [r[0] for r in cur.fetchall()]
        if not lbf_items:
            result = {"codigo": codigo, "items": []}
            mem_set(ck, result)
            return result

        # Step 2: all providers for those items only (IN list, no full-table correlated scan)
        placeholders = ",".join(["?" for _ in lbf_items])
        cur.execute(
            "SELECT d.CodigoItem,"
            " ISNULL(NULLIF(d.NombrelineaAdquisicion,''), d.DescripcionlineaAdquisicion) AS producto,"
            " d.NombreProveedor, d.RutProveedor,"
            " ISNULL(d.EstadoOferta,'') AS estado_oferta,"
            " ISNULL(d.Ofertaseleccionada,'') AS oferta_sel,"
            " CAST(ISNULL(d.MontoUnitarioOferta,0) AS FLOAT) AS precio_unit,"
            " CAST(ISNULL(d.ValorTotalOfertado,0) AS FLOAT) AS precio_total,"
            " CAST(ISNULL(d.Cantidad,0) AS FLOAT) AS cantidad_req"
            f" FROM DWLBF.dbo.dw_datos_abiertos_licitaciones d"
            f" WHERE d.Codigo=? AND d.CodigoItem IN ({placeholders})"
            " ORDER BY d.CodigoItem, d.ValorTotalOfertado",
            [codigo] + lbf_items
        )
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()

        from collections import OrderedDict
        items_map: dict = OrderedDict()
        for r in rows:
            d = dict(zip(cols, r))
            ci = int(d["CodigoItem"] or 0)
            if ci not in items_map:
                items_map[ci] = {"codigo_item": ci, "producto": d["producto"] or "", "proveedores": []}
            items_map[ci]["proveedores"].append({
                "nombre":        d["NombreProveedor"] or "",
                "rut":           d["RutProveedor"] or "",
                "es_lbf":        d["RutProveedor"] == LBF_RUT,
                "estado_oferta": d["estado_oferta"],
                "seleccionada":  d["oferta_sel"] == "Seleccionada",
                "precio_unit":   round(float(d["precio_unit"] or 0) * IVA),
                "precio_total":  round(float(d["precio_total"] or 0) * IVA),
                "cantidad_req":  round(float(d["cantidad_req"] or 0)),
            })

        result = {"codigo": codigo, "items": list(items_map.values())}
        mem_set(ck, result)
        return result

    except Exception as e:
        return {"codigo": codigo, "items": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn: conn.close()
