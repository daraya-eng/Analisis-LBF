"""
Mercado Publico — Análisis de participación LBF en insumos médicos.
Fuente: PostgreSQL mercado_publico, tabla licitaciones + licitaciones_items.

Identificación LBF (dos métodos combinados):
  1. JSONB oferentes: o->>'rut' = '93.366.000-1' AND (o->>'seleccionada')::boolean = true
  2. Columna directa:  licitaciones_items.rut_proveedor_adj = '93.366.000-1'
     (cubre casos donde el JSONB no fue actualizado correctamente)

Montos adjudicados:
  - Formato nuevo (estado='Aceptada'):  o->>'monto_adjudicado'
  - Formato antiguo (estado='Adjudicada'): o->>'total' (= monto_unitario x cantidad_adj)
  - Ítems vía rut_proveedor_adj sin JSONB: li.monto_adjudicado x COALESCE(cant_adj, cantidad)

Montos ofertados:
  - Formato nuevo: o->>'valor_total_ofertado'
  - Formato antiguo: o->>'total'
"""
import re
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db_mp import get_pg_conn
from db import get_conn as get_ss_conn, DW_FILTRO, filtro_guias, hoy
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT  = "93.366.000-1"
CAT_LIKE = "EQUIPAMIENTO%"

# Tipos de licitación pública (excluye CM que tiene módulo aparte)
TIPOS_LIC = ("L1", "LE", "LP", "LQ", "LR", "LS", "SE", "E2")


def _tipo_filter(tipo: str) -> str:
    t = (tipo or "").upper()
    if t == "ALL":
        return ""                          # sin restricción — incluye CM
    if t in TIPOS_LIC:
        return f"AND l.tipo = '{t}'"
    if t == "CM":
        return "AND l.tipo = 'CM'"
    if t == "TD":
        return "AND l.tipo = 'TD'"
    if t == "AG":
        return "AND l.tipo = 'AG'"
    # default (vacío) = excluye CM
    return "AND l.tipo <> 'CM'"


def _date_filter(ano: int, mes: int, mat: bool, alias: str = "l") -> tuple:
    """
    Returns (cur_filter, prev_filter) SQL fragment strings.

    mat=True  → rolling 12-month window (current) vs prior 12-month window (prev).
    mat=False → calendar year {ano} (current) vs {ano-1} (prev).
                If mes > 0 the current filter also restricts to that month;
                the prev filter always covers the full prior year.
    """
    date_col = f"COALESCE({alias}.fecha_adjudicacion, {alias}.fecha_publicacion)"

    if mat:
        cur_filter  = f"{date_col} >= CURRENT_DATE - INTERVAL '12 months'"
        prev_filter = (
            f"{date_col} >= CURRENT_DATE - INTERVAL '24 months' "
            f"AND {date_col} < CURRENT_DATE - INTERVAL '12 months'"
        )
    else:
        cur_filter = f"EXTRACT(YEAR FROM {date_col}) = {ano}"
        if mes > 0:
            cur_filter += f" AND EXTRACT(MONTH FROM {date_col}) = {mes}"
        prev_filter = f"EXTRACT(YEAR FROM {date_col}) = {ano - 1}"

    return cur_filter, prev_filter


def _load_participacion(ano: int, tipo: str, mes: int = 0, mat: bool = False) -> dict:
    tf = _tipo_filter(tipo)
    d_cur, d_prev = _date_filter(ano, mes, mat)
    prev_ano = ano - 1

    conn = get_pg_conn()
    cur = conn.cursor()

    # ── Single mega-CTE query — all KPIs in one round-trip ────────────────────
    cur.execute(f"""
        WITH
        -- LBF offered items (via JSONB), current period
        lbf_part AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_ofertado
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        -- LBF adjudicated via JSONB seleccionada=true, current period
        lbf_adj_j AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        -- LBF adjudicated via rut_proveedor_adj without JSONB coverage, current period
        lbf_adj_r AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj AS (
            SELECT * FROM lbf_adj_j
            UNION ALL
            SELECT * FROM lbf_adj_r
        ),
        -- LBF adjudicated JSONB, prev period
        lbf_adj_j_prev AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_prev}
              {tf}
        ),
        -- LBF adjudicated rut, prev period
        lbf_adj_r_prev AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_prev}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj_prev AS (
            SELECT * FROM lbf_adj_j_prev
            UNION ALL
            SELECT * FROM lbf_adj_r_prev
        ),
        -- Market total, current period
        market_cur AS (
            SELECT
                COUNT(DISTINCT li.licitacion_id)   AS ids,
                COUNT(DISTINCT li.id)              AS items,
                SUM(
                    CASE WHEN li.rut_proveedor_adj IS NOT NULL
                         THEN COALESCE(li.monto_adjudicado
                              * COALESCE(li.cantidad_adjudicada, li.cantidad, 1), 0)
                         WHEN EXISTS (
                             SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                             WHERE (o2->>'seleccionada')::boolean = true
                         )
                         THEN COALESCE((
                             SELECT NULLIF((o->>'monto_adjudicado')::numeric, 0)
                             FROM jsonb_array_elements(li.oferentes) o
                             WHERE (o->>'seleccionada')::boolean = true LIMIT 1
                         ), (
                             SELECT (o->>'total')::numeric
                             FROM jsonb_array_elements(li.oferentes) o
                             WHERE (o->>'seleccionada')::boolean = true LIMIT 1
                         ), 0)
                         ELSE li.monto_adjudicado
                              * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
                    END
                )                                  AS valor
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
              AND (
                  li.rut_proveedor_adj IS NOT NULL
                  OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                      WHERE (o2->>'seleccionada')::boolean = true
                  )
                  OR li.monto_adjudicado > 0
              )
        ),
        -- Market total, prev period
        market_prev AS (
            SELECT
                COUNT(DISTINCT li.licitacion_id)   AS ids,
                COUNT(DISTINCT li.id)              AS items,
                SUM(
                    CASE WHEN li.rut_proveedor_adj IS NOT NULL
                         THEN COALESCE(li.monto_adjudicado
                              * COALESCE(li.cantidad_adjudicada, li.cantidad, 1), 0)
                         WHEN EXISTS (
                             SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                             WHERE (o2->>'seleccionada')::boolean = true
                         )
                         THEN COALESCE((
                             SELECT NULLIF((o->>'monto_adjudicado')::numeric, 0)
                             FROM jsonb_array_elements(li.oferentes) o
                             WHERE (o->>'seleccionada')::boolean = true LIMIT 1
                         ), (
                             SELECT (o->>'total')::numeric
                             FROM jsonb_array_elements(li.oferentes) o
                             WHERE (o->>'seleccionada')::boolean = true LIMIT 1
                         ), 0)
                         ELSE li.monto_adjudicado
                              * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
                    END
                )                                  AS valor
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_prev}
              {tf}
              AND (
                  li.rut_proveedor_adj IS NOT NULL
                  OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                      WHERE (o2->>'seleccionada')::boolean = true
                  )
                  OR li.monto_adjudicado > 0
              )
        ),
        -- Adj in current period but licitacion published in prev year (only meaningful for mat=False)
        adj_from_prev_pub AS (
            SELECT COALESCE(SUM(a.monto_adj), 0) AS total
            FROM lbf_adj a
            JOIN licitaciones l ON l.id = a.licitacion_id
            WHERE EXTRACT(YEAR FROM l.fecha_publicacion) = {prev_ano}
        ),
        -- Per-tipo breakdown
        tipo_agg AS (
            SELECT
                l.tipo,
                COUNT(DISTINCT a.licitacion_id) AS ids_adj,
                SUM(a.monto_adj)                AS total_adj
            FROM lbf_adj a
            JOIN licitaciones l ON l.id = a.licitacion_id
            GROUP BY l.tipo
        )
        SELECT
            (SELECT COUNT(DISTINCT licitacion_id) FROM lbf_part)           AS ids_part,
            (SELECT COUNT(*)                       FROM lbf_part)           AS ofertas_realizadas,
            (SELECT COUNT(*) FROM lbf_part WHERE monto_ofertado > 0)       AS ofertas_con_precio,
            (SELECT COALESCE(SUM(monto_ofertado), 0) FROM lbf_part)        AS total_part,
            (SELECT COUNT(*)                       FROM lbf_adj)           AS ofertas_adj,
            (SELECT COUNT(DISTINCT licitacion_id)  FROM lbf_adj)           AS ids_adj,
            (SELECT COALESCE(SUM(monto_adj), 0)    FROM lbf_adj)           AS total_adj,
            (SELECT COALESCE(SUM(monto_adj), 0)    FROM lbf_adj_prev)      AS total_adj_prev,
            (SELECT ids   FROM market_cur)                                  AS mkt_ids,
            (SELECT items FROM market_cur)                                  AS mkt_items,
            (SELECT COALESCE(valor, 0) FROM market_cur)                    AS mkt_valor,
            (SELECT COALESCE(valor, 0) FROM market_prev)                   AS mkt_valor_prev,
            (SELECT COALESCE(total, 0) FROM adj_from_prev_pub)             AS adj_from_prev_pub,
            (SELECT COALESCE(
                json_agg(json_build_object(
                    'tipo',      tipo,
                    'ids_adj',   ids_adj,
                    'total_adj', total_adj
                )),
                '[]'::json
             ) FROM tipo_agg)                                               AS por_tipo_json
    """)

    row = cur.fetchone()
    ids_part          = int(row[0]  or 0)
    of_real           = int(row[1]  or 0)
    of_precio         = int(row[2]  or 0)
    total_part        = float(row[3]  or 0)
    of_adj            = int(row[4]  or 0)
    ids_adj           = int(row[5]  or 0)
    total_adj         = float(row[6]  or 0)
    total_adj_prev    = round(float(row[7]  or 0))
    mkt_ids           = int(row[8]  or 0)
    mkt_items         = int(row[9]  or 0)
    mkt_valor         = float(row[10] or 0)
    mkt_valor_prev    = round(float(row[11] or 0))
    adj_from_prev_pub = round(float(row[12] or 0))
    por_tipo_raw      = row[13] or []

    ef_items   = round(of_adj  / of_precio  * 100, 1) if of_precio  > 0 else 0
    ef_lics    = round(ids_adj / ids_part  * 100, 1) if ids_part  > 0 else 0
    part_ids   = round(ids_part / mkt_ids  * 100, 1) if mkt_ids   > 0 else 0
    part_valor = round(total_adj / mkt_valor * 100, 1) if mkt_valor > 0 else 0

    import json as _json
    if isinstance(por_tipo_raw, str):
        por_tipo_raw = _json.loads(por_tipo_raw)
    por_tipo = [
        {
            "tipo":      r.get("tipo") or "?",
            "ids_adj":   int(r.get("ids_adj") or 0),
            "total_adj": round(float(r.get("total_adj") or 0)),
        }
        for r in (por_tipo_raw or [])
    ]
    por_tipo.sort(key=lambda x: x["total_adj"], reverse=True)

    # ── Query 2 — Top 20 competidores (proper JOIN, no correlated subquery) ───
    cur.execute(f"""
        WITH lbf_lics AS (
            SELECT DISTINCT li.licitacion_id
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        lbf_adj_jsonb AS (
            SELECT li.licitacion_id,
                   COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}' AND (o->>'seleccionada')::boolean = true
        ),
        lbf_adj_rut AS (
            SELECT li.licitacion_id,
                   li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj_per_lic AS (
            SELECT licitacion_id, SUM(monto) AS lbf_monto
            FROM (SELECT * FROM lbf_adj_jsonb UNION ALL SELECT * FROM lbf_adj_rut) x
            GROUP BY licitacion_id
        ),
        comp_data AS (
            SELECT
                o->>'rut'                                                        AS rut,
                INITCAP(MAX(o->>'nombre'))                                       AS competidor,
                COUNT(DISTINCT li.licitacion_id)                                AS ids_part,
                COUNT(li.id)                                                     AS ofertas,
                COUNT(CASE WHEN COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric,0),
                    (o->>'total')::numeric, 0) > 0 THEN 1 END)                  AS ofertas_con_precio,
                COUNT(CASE WHEN (o->>'seleccionada')::boolean THEN 1 END)        AS ofertas_adj,
                COUNT(DISTINCT CASE WHEN (o->>'seleccionada')::boolean
                    THEN li.licitacion_id END)                                   AS ids_adj,
                SUM(CASE WHEN (o->>'seleccionada')::boolean THEN
                    COALESCE(
                        NULLIF((o->>'monto_adjudicado')::numeric, 0),
                        (o->>'total')::numeric,
                        0
                    ) ELSE 0 END)                                                AS total_adj,
                SUM(COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                ))                                                               AS total_ofertado
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' != '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
            GROUP BY o->>'rut'
            ORDER BY total_adj DESC
            LIMIT 20
        ),
        lbf_per_comp AS (
            -- For each competitor, sum LBF adjudicated in the licitaciones where that competitor participated
            SELECT
                o->>'rut'                                   AS comp_rut,
                SUM(COALESCE(lap.lbf_monto, 0))            AS lbf_monto
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            LEFT JOIN lbf_adj_per_lic lap ON lap.licitacion_id = li.licitacion_id
            WHERE o->>'rut' != '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
            GROUP BY o->>'rut'
        )
        SELECT
            c.competidor, c.rut, c.ids_part, c.ofertas, c.ofertas_con_precio,
            c.ofertas_adj, c.ids_adj, c.total_adj, c.total_ofertado,
            COALESCE(lpc.lbf_monto, 0)                                      AS lbf_adj_compartido
        FROM comp_data c
        LEFT JOIN lbf_per_comp lpc ON lpc.comp_rut = c.rut
    """)

    top20 = []
    for row in cur.fetchall():
        comp_name       = row[0] or "Sin nombre"
        ids_part_c      = int(row[2] or 0)
        of_tot_c        = int(row[3] or 0)
        of_precio_c     = int(row[4] or 0)
        of_adj_c        = int(row[5] or 0)
        ids_adj_c       = int(row[6] or 0)
        tadj_c          = float(row[7] or 0)
        of_c            = float(row[8] or 0)
        lbf_comp        = float(row[9] or 0)
        denom           = of_precio_c if of_precio_c > 0 else of_tot_c
        top20.append({
            "competidor":         comp_name,
            "rut":                str(row[1] or ""),
            "ids_part":           ids_part_c,
            "ofertas":            of_precio_c,
            "ofertas_adj":        of_adj_c,
            "ids_adj":            ids_adj_c,
            "total_adj":          round(tadj_c),
            "total_ofertado":     round(of_c),
            "lbf_adj_compartido": round(lbf_comp),
            "efectividad":        round(of_adj_c / denom * 100, 1) if denom > 0 else 0,
            "part_valor":         round(tadj_c / mkt_valor * 100, 1) if mkt_valor > 0 else 0,
        })

    conn.close()

    return {
        "ano":  ano,
        "tipo": tipo or "todos",
        "lbf": {
            "ids_participadas":   ids_part,
            "ids_adjudicadas":    ids_adj,
            "ofertas_realizadas": of_precio,
            "ofertas_con_precio": of_real,
            "ofertas_adj":        of_adj,
            "total_adj":          round(total_adj),
            "total_participado":  round(total_part),
            "efectividad_items":  ef_items,
            "efectividad_lics":   ef_lics,
            "part_ids":           part_ids,
            "part_valor":         part_valor,
            "total_adj_prev":     total_adj_prev,
            "adj_from_prev_pub":  adj_from_prev_pub,
        },
        "mercado": {
            "ids_total":        mkt_ids,
            "items_total":      mkt_items,
            "valor_total":      round(mkt_valor),
            "valor_total_prev": mkt_valor_prev,
        },
        "top20":    top20,
        "por_tipo": por_tipo,
    }


@router.get("/participacion")
async def get_participacion(
    ano:  int  = Query(2026),
    tipo: str  = Query(""),
    mes:  int  = Query(0),
    mat:  bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:participacion:{ano}:{tipo}:{mes}:{mat}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_participacion(ano, tipo, mes, mat)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "detalle": [], "top20": [], "por_tipo": []}


# ── /region ───────────────────────────────────────────────────────────────────

def _load_region(ano: int, tipo: str, mes: int = 0, mat: bool = False) -> list:
    tf = _tipo_filter(tipo)
    d_cur, _ = _date_filter(ano, mes, mat)
    conn = get_pg_conn()
    cur = conn.cursor()

    cur.execute(f"""
        WITH lbf_part AS (
            -- ítems donde LBF ofertó (via JSONB)
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_region_unidad,
                COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_ofertado
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        lbf_adj_jsonb AS (
            -- adjudicaciones via JSONB seleccionada=true
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_region_unidad,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        lbf_adj_rut AS (
            -- adjudicaciones via rut_proveedor_adj sin cobertura JSONB
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_region_unidad,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj AS (
            SELECT * FROM lbf_adj_jsonb
            UNION ALL
            SELECT * FROM lbf_adj_rut
        ),
        part_agg AS (
            SELECT
                COALESCE(comprador_region_unidad, 'Sin región')             AS region,
                COUNT(DISTINCT licitacion_id)                               AS ids_part,
                COUNT(item_id)                                              AS ofertas,
                SUM(monto_ofertado)                                         AS total_participado
            FROM lbf_part
            GROUP BY comprador_region_unidad
        ),
        adj_agg AS (
            SELECT
                COALESCE(comprador_region_unidad, 'Sin región')             AS region,
                COUNT(DISTINCT licitacion_id)                               AS ids_adj,
                COUNT(item_id)                                              AS ofertas_adj,
                SUM(monto_adj)                                              AS total_adj
            FROM lbf_adj
            GROUP BY comprador_region_unidad
        )
        SELECT
            p.region,
            p.ids_part,
            COALESCE(a.ids_adj, 0)                                          AS ids_adj,
            p.ofertas,
            COALESCE(a.ofertas_adj, 0)                                      AS ofertas_adj,
            COALESCE(a.total_adj, 0)                                        AS total_adj,
            COALESCE(p.total_participado, 0)                                AS total_participado
        FROM part_agg p
        LEFT JOIN adj_agg a ON a.region = p.region
        ORDER BY COALESCE(a.total_adj, 0) DESC
        LIMIT 15
    """)

    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    conn.close()

    result = []
    for row in rows:
        r = dict(zip(cols, row))
        total_adj   = float(r["total_adj"] or 0)
        total_part  = float(r["total_participado"] or 0)
        ofertas     = int(r["ofertas"] or 0)
        ofertas_adj = int(r["ofertas_adj"] or 0)
        result.append({
            "region":           r["region"],
            "ids_part":         int(r["ids_part"] or 0),
            "ids_adj":          int(r["ids_adj"] or 0),
            "ofertas":          ofertas,
            "ofertas_adj":      ofertas_adj,
            "total_adj":        round(total_adj),
            "total_participado":round(total_part),
            "pct_adj":          round(total_adj / total_part * 100, 1) if total_part > 0 else 0,
            "pct_of":           round(int(r["ids_adj"]) / int(r["ids_part"]) * 100, 1) if int(r["ids_part"] or 0) > 0 else 0,
        })
    return result


@router.get("/region")
async def get_region(
    ano:  int  = Query(2026),
    tipo: str  = Query(""),
    mes:  int  = Query(0),
    mat:  bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:region:{ano}:{tipo}:{mes}:{mat}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_region(ano, tipo, mes, mat)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


# ── /clientes ─────────────────────────────────────────────────────────────────

def _load_clientes(ano: int, tipo: str, mes: int = 0, mat: bool = False) -> list:
    tf = _tipo_filter(tipo)
    d_cur, _ = _date_filter(ano, mes, mat)
    conn = get_pg_conn()
    cur = conn.cursor()

    cur.execute(f"""
        WITH lbf_part AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_nombre_organismo,
                COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_ofertado
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        lbf_adj_jsonb AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_nombre_organismo,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                )                                                            AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
        ),
        lbf_adj_rut AS (
            SELECT
                li.licitacion_id,
                li.id                                                        AS item_id,
                l.comprador_nombre_organismo,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND {d_cur}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj AS (
            SELECT * FROM lbf_adj_jsonb
            UNION ALL
            SELECT * FROM lbf_adj_rut
        ),
        part_agg AS (
            SELECT
                COALESCE(comprador_nombre_organismo, 'Sin organismo')       AS organismo,
                COUNT(DISTINCT licitacion_id)                               AS ids_part,
                COUNT(item_id)                                              AS ofertas,
                SUM(monto_ofertado)                                         AS total_participado
            FROM lbf_part
            GROUP BY comprador_nombre_organismo
        ),
        adj_agg AS (
            SELECT
                COALESCE(comprador_nombre_organismo, 'Sin organismo')       AS organismo,
                COUNT(DISTINCT licitacion_id)                               AS ids_adj,
                COUNT(item_id)                                              AS ofertas_adj,
                SUM(monto_adj)                                              AS total_adj
            FROM lbf_adj
            GROUP BY comprador_nombre_organismo
        )
        SELECT
            p.organismo,
            p.ids_part,
            COALESCE(a.ids_adj, 0)                                          AS ids_adj,
            p.ofertas,
            COALESCE(a.ofertas_adj, 0)                                      AS ofertas_adj,
            COALESCE(a.total_adj, 0)                                        AS total_adj,
            COALESCE(p.total_participado, 0)                                AS total_participado
        FROM part_agg p
        LEFT JOIN adj_agg a ON a.organismo = p.organismo
        ORDER BY COALESCE(a.total_adj, 0) DESC
        LIMIT 30
    """)

    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    conn.close()

    result = []
    for row in rows:
        r = dict(zip(cols, row))
        total_adj   = float(r["total_adj"] or 0)
        total_part  = float(r["total_participado"] or 0)
        ofertas     = int(r["ofertas"] or 0)
        ofertas_adj = int(r["ofertas_adj"] or 0)
        result.append({
            "organismo":        r["organismo"],
            "ids_part":         int(r["ids_part"] or 0),
            "ids_adj":          int(r["ids_adj"] or 0),
            "ofertas":          ofertas,
            "ofertas_adj":      ofertas_adj,
            "total_adj":        round(total_adj),
            "total_participado":round(total_part),
            "total_no_adj":     round(max(total_part - total_adj, 0)),
            "pct_adj":          round(total_adj / total_part * 100, 1) if total_part > 0 else 0,
            "pct_ef":           round(int(r["ids_adj"]) / int(r["ids_part"]) * 100, 1) if int(r["ids_part"] or 0) > 0 else 0,
        })
    return result


@router.get("/clientes")
async def get_clientes(
    ano:  int  = Query(2026),
    tipo: str  = Query(""),
    mes:  int  = Query(0),
    mat:  bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:clientes:{ano}:{tipo}:{mes}:{mat}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_clientes(ano, tipo, mes, mat)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


# ── /clientes-categorias ──────────────────────────────────────────────────────

def _load_clientes_categorias(organismo: str, ano: int, tipo: str) -> list:
    tf = _tipo_filter(tipo)
    conn = get_pg_conn()
    cur = conn.cursor()

    cur.execute(f"""
        WITH adj_jsonb AS (
            SELECT li.categoria_nivel1 AS cat,
                COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND l.comprador_nombre_organismo = %(org)s
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        adj_rut AS (
            SELECT li.categoria_nivel1 AS cat,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND l.comprador_nombre_organismo = %(org)s
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        ),
        all_adj AS (SELECT * FROM adj_jsonb UNION ALL SELECT * FROM adj_rut),
        total AS (SELECT SUM(monto) AS t FROM all_adj)
        SELECT
            COALESCE(cat, 'Sin categoría')                                       AS categoria,
            SUM(monto)                                                            AS monto_adj,
            ROUND(SUM(monto) * 100.0 / NULLIF((SELECT t FROM total), 0), 1)      AS pct
        FROM all_adj
        GROUP BY cat
        ORDER BY monto_adj DESC
    """, {"org": organismo})

    result = []
    for row in cur.fetchall():
        result.append({
            "categoria": row[0],
            "monto_adj": round(float(row[1] or 0)),
            "pct":       float(row[2] or 0),
        })
    conn.close()
    return result


@router.get("/clientes-categorias")
async def get_clientes_categorias(
    organismo: str = Query(...),
    ano:       int = Query(2026),
    tipo:      str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    import urllib.parse
    ck = f"mp:cli_cat:{urllib.parse.quote(organismo)}:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_clientes_categorias(organismo, ano, tipo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


# ── /vs-competidor ────────────────────────────────────────────────────────────

def _load_vs_competidor(comp_rut: str, ano: int, tipo: str) -> dict:
    tf = _tipo_filter(tipo)
    conn = get_pg_conn()
    cur = conn.cursor()

    # Nombre del competidor
    cur.execute("""
        SELECT INITCAP(MAX(o->>'nombre'))
        FROM licitaciones_items li
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE o->>'rut' = %s
        LIMIT 1
    """, (comp_rut,))
    r = cur.fetchone()
    comp_nombre = (r[0] if r else comp_rut) or comp_rut

    cur.execute(f"""
        WITH lbf_lics AS (
            SELECT DISTINCT li.licitacion_id
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        comp_lics AS (
            SELECT DISTINCT li.licitacion_id
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{comp_rut}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        shared AS (
            SELECT licitacion_id FROM lbf_lics
            INTERSECT
            SELECT licitacion_id FROM comp_lics
        ),
        lbf_adj_jsonb AS (
            SELECT li.licitacion_id, li.id AS item_id,
                   COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto
            FROM licitaciones_items li
            JOIN shared s ON s.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}' AND (o->>'seleccionada')::boolean = true
        ),
        lbf_adj_rut AS (
            SELECT li.licitacion_id, li.id AS item_id,
                   li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto
            FROM licitaciones_items li
            JOIN shared s ON s.licitacion_id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        ),
        lbf_adj AS (SELECT * FROM lbf_adj_jsonb UNION ALL SELECT * FROM lbf_adj_rut),
        comp_adj AS (
            SELECT li.licitacion_id, li.id AS item_id,
                   COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto
            FROM licitaciones_items li
            JOIN shared s ON s.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{comp_rut}' AND (o->>'seleccionada')::boolean = true
        ),
        lbf_per_lic AS (
            SELECT licitacion_id,
                   COUNT(item_id) AS items_adj,
                   SUM(monto)     AS total_adj
            FROM lbf_adj GROUP BY licitacion_id
        ),
        comp_per_lic AS (
            SELECT licitacion_id,
                   COUNT(item_id) AS items_adj,
                   SUM(monto)     AS total_adj
            FROM comp_adj GROUP BY licitacion_id
        )
        SELECT
            l.id                                                             AS licitacion_id,
            l.nombre                                                         AS nombre,
            l.comprador_nombre_organismo                                     AS organismo,
            l.comprador_region_unidad                                        AS region,
            l.tipo,
            TO_CHAR(COALESCE(l.fecha_adjudicacion, l.fecha_publicacion), 'YYYY-MM') AS periodo,
            COALESCE(lb.items_adj, 0)                                        AS lbf_items,
            COALESCE(lb.total_adj, 0)                                        AS lbf_adj,
            COALESCE(cp.items_adj, 0)                                        AS comp_items,
            COALESCE(cp.total_adj, 0)                                        AS comp_adj
        FROM shared s
        JOIN licitaciones l ON l.id = s.licitacion_id
        LEFT JOIN lbf_per_lic lb ON lb.licitacion_id = s.licitacion_id
        LEFT JOIN comp_per_lic cp ON cp.licitacion_id = s.licitacion_id
        ORDER BY (COALESCE(cp.total_adj, 0) + COALESCE(lb.total_adj, 0)) DESC
        LIMIT 100
    """)

    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    conn.close()

    lbf_total  = sum(float(r["lbf_adj"]  or 0) for r in rows)
    comp_total = sum(float(r["comp_adj"] or 0) for r in rows)
    lbf_lics_adj  = sum(1 for r in rows if float(r["lbf_adj"]  or 0) > 0)
    comp_lics_adj = sum(1 for r in rows if float(r["comp_adj"] or 0) > 0)

    licitaciones = []
    for r in rows:
        la = float(r["lbf_adj"]  or 0)
        ca = float(r["comp_adj"] or 0)
        if la > 0 and ca > 0:
            ganador = "AMBOS"
        elif la > 0:
            ganador = "LBF"
        elif ca > 0:
            ganador = "COMPETIDOR"
        else:
            ganador = "OTRO"
        licitaciones.append({
            "licitacion_id": r["licitacion_id"],
            "nombre":        (r["nombre"] or "")[:120],
            "organismo":     r["organismo"] or "",
            "region":        r["region"] or "",
            "tipo":          r["tipo"] or "",
            "periodo":       r["periodo"] or "",
            "lbf_items":     int(r["lbf_items"] or 0),
            "lbf_adj":       round(la),
            "comp_items":    int(r["comp_items"] or 0),
            "comp_adj":      round(ca),
            "ganador":       ganador,
        })

    return {
        "comp_rut":        comp_rut,
        "comp_nombre":     comp_nombre,
        "ids_compartidas": len(rows),
        "lbf_total":       round(lbf_total),
        "comp_total":      round(comp_total),
        "lbf_lics_adj":    lbf_lics_adj,
        "comp_lics_adj":   comp_lics_adj,
        "licitaciones":    licitaciones,
    }


# ── /evolucion ────────────────────────────────────────────────────────────────

def _load_evolucion(ano: int, tipo: str, cat: str = "") -> list:
    """Adjudicado LBF por mes: montos (JSONB + rut), conteo licitaciones, y comparativo año anterior."""
    tf = _tipo_filter(tipo)
    cat_filter = f"AND upper(li.categoria_nivel1) LIKE '{cat.upper()}%'" if cat else f"AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'"
    conn = get_pg_conn()
    cur = conn.cursor()

    # Q1: distinct licitaciones participadas y adjudicadas por mes (JSONB)
    cur.execute(f"""
        SELECT
            EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
            COUNT(DISTINCT li.licitacion_id) AS ids_part,
            COUNT(DISTINCT CASE WHEN (o->>'seleccionada')::boolean = true THEN li.licitacion_id END) AS ids_adj
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE o->>'rut' = '{LBF_RUT}'
          AND COALESCE(NULLIF((o->>'valor_total_ofertado')::numeric,0),(o->>'total')::numeric,0) > 0
          {cat_filter}
          AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
          {tf}
        GROUP BY mes
        ORDER BY mes
    """)
    part_by_mes = {int(r[0]): (int(r[1] or 0), int(r[2] or 0)) for r in cur.fetchall()}

    # Q2: monto adjudicado año actual (JSONB + rut_proveedor_adj)
    cur.execute(f"""
        WITH adj_jsonb AS (
            SELECT
                EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
                l.tipo,
                COALESCE(NULLIF((o->>'monto_adjudicado')::numeric, 0),(o->>'total')::numeric,0) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              {cat_filter}
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        adj_rut AS (
            SELECT
                EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
                l.tipo,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              {cat_filter}
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        )
        SELECT mes, tipo, SUM(monto_adj) AS total_adj
        FROM (SELECT * FROM adj_jsonb UNION ALL SELECT * FROM adj_rut) x
        GROUP BY mes, tipo
        ORDER BY mes, total_adj DESC
    """)
    amt_rows = cur.fetchall()

    # Q3: monto adjudicado año anterior para comparativo
    cur.execute(f"""
        WITH adj_jsonb AS (
            SELECT
                EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
                COALESCE(NULLIF((o->>'monto_adjudicado')::numeric, 0),(o->>'total')::numeric,0) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              {cat_filter}
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano - 1}
              {tf}
        ),
        adj_rut AS (
            SELECT
                EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              {cat_filter}
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano - 1}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        )
        SELECT mes, SUM(monto_adj)
        FROM (SELECT * FROM adj_jsonb UNION ALL SELECT * FROM adj_rut) x
        GROUP BY mes
    """)
    prev_by_mes = {int(r[0]): round(float(r[1] or 0)) for r in cur.fetchall()}
    conn.close()

    MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    from collections import defaultdict
    by_mes: dict = defaultdict(dict)
    for mes_num, t, adj in amt_rows:
        by_mes[int(mes_num)][t or "?"] = round(float(adj or 0))

    return [
        {
            "mes":            m,
            "mes_nom":        MESES[m - 1],
            "ids_part":       part_by_mes.get(m, (0, 0))[0],
            "ids_adj":        part_by_mes.get(m, (0, 0))[1],
            "efectividad":    round(part_by_mes.get(m, (0, 0))[1] / part_by_mes.get(m, (0, 0))[0] * 100, 1)
                              if part_by_mes.get(m, (0, 0))[0] > 0 else 0.0,
            "total_adj":      sum(by_mes[m].values()) if m in by_mes else 0,
            "total_adj_prev": prev_by_mes.get(m, 0),
            "tipos":          [{"tipo": t, "adj": v} for t, v in by_mes[m].items()] if m in by_mes else [],
        }
        for m in range(1, 13)
    ]


def _load_perdidos(ano: int, tipo: str, cat: str = "", mes: int = 0) -> list:
    """Ítems donde LBF ofertó el precio mínimo pero no fue adjudicado."""
    tf = _tipo_filter(tipo)
    cat_filter = f"AND upper(li.categoria_nivel1) LIKE '{cat.upper()}%'" if cat else f"AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'"
    mes_filter = f"AND EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {mes}" if mes > 0 else ""
    conn = get_pg_conn()
    cur = conn.cursor()
    cur.execute(f"""
        WITH lbf_no_adj AS (
            SELECT
                li.id AS item_id,
                li.licitacion_id,
                COALESCE(NULLIF(li.nombre_producto, ''), l.nombre) AS nombre_producto,
                COALESCE(NULLIF(TRIM(SPLIT_PART(li.descripcion, '@', 2)), ''), li.descripcion) AS descripcion_item,
                li.cantidad AS cantidad,
                li.unidad_medida AS unidad_medida,
                COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                ) AS lbf_precio
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND NOT COALESCE((o->>'seleccionada')::boolean, false)
              AND COALESCE(
                    NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                ) > 0
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {cat_filter} {tf} {mes_filter}
        ),
        min_precio AS (
            SELECT li2.id AS item_id,
                   MIN(COALESCE(
                       NULLIF((o2->>'valor_total_ofertado')::numeric, 0),
                       (o2->>'total')::numeric,
                       0
                   )) AS min_p
            FROM licitaciones_items li2
            CROSS JOIN LATERAL jsonb_array_elements(li2.oferentes) o2
            WHERE li2.id IN (SELECT item_id FROM lbf_no_adj)
              AND COALESCE(
                    NULLIF((o2->>'valor_total_ofertado')::numeric, 0),
                    (o2->>'total')::numeric,
                    0
                ) > 0
            GROUP BY li2.id
        ),
        ganadores AS (
            SELECT li3.id AS item_id,
                   INITCAP(o3->>'nombre') AS ganador_nombre,
                   o3->>'rut' AS ganador_rut,
                   COALESCE(
                       NULLIF((o3->>'monto_adjudicado')::numeric, 0),
                       NULLIF((o3->>'valor_total_ofertado')::numeric, 0),
                       (o3->>'total')::numeric,
                       0
                   ) AS ganador_precio
            FROM licitaciones_items li3
            CROSS JOIN LATERAL jsonb_array_elements(li3.oferentes) o3
            WHERE li3.id IN (SELECT item_id FROM lbf_no_adj)
              AND COALESCE((o3->>'seleccionada')::boolean, false) = true
        )
        SELECT
            l.codigo,
            l.nombre AS licitacion,
            l.comprador_nombre_organismo,
            n.nombre_producto,
            l.tipo,
            n.lbf_precio,
            g.ganador_precio,
            g.ganador_nombre,
            g.ganador_rut,
            n.item_id,
            n.descripcion_item,
            n.cantidad,
            n.unidad_medida,
            l.adjudicacion->>'UrlActa' AS url_acta
        FROM lbf_no_adj n
        JOIN min_precio m ON m.item_id = n.item_id AND n.lbf_precio <= m.min_p
        JOIN licitaciones l ON l.id = n.licitacion_id
        JOIN ganadores g ON g.item_id = n.item_id
        WHERE g.ganador_precio > n.lbf_precio
          AND n.lbf_precio >= 1000
        ORDER BY (g.ganador_precio / NULLIF(n.lbf_precio, 0) - 1) DESC NULLS LAST
        LIMIT 300
    """)
    rows = cur.fetchall()
    conn.close()
    return [
        {
            "codigo":        r[0] or "",
            "licitacion":    r[1] or "",
            "organismo":     r[2] or "",
            "producto":      r[3] or "",
            "tipo":          r[4] or "",
            "lbf_precio":    round(float(r[5] or 0)),
            "ganador_precio": round(float(r[6] or 0)),
            "diferencia_pct": round((float(r[6] or 0) / float(r[5] or 1) - 1) * 100, 1),
            "ganador_nombre": r[7] or "",
            "ganador_rut":   r[8] or "",
            "item_id":       int(r[9]),
            "descripcion":   r[10] or "",
            "cantidad":      float(r[11] or 0),
            "unidad_medida": r[12] or "",
            "url_acta":      r[13] or "",
        }
        for r in rows
    ]


@router.get("/evolucion")
async def get_evolucion(
    ano:  int = Query(2026),
    tipo: str = Query(""),
    cat:  str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:evolucion:{ano}:{tipo}:{cat}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_evolucion(ano, tipo, cat)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


@router.get("/perdidos")
async def get_perdidos(
    ano:  int = Query(2026),
    tipo: str = Query(""),
    cat:  str = Query(""),
    mes:  int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:perdidos:{ano}:{tipo}:{cat}:{mes}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_perdidos(ano, tipo, cat, mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


def _load_perdidos_detalle(item_id: int) -> dict:
    """Detalle completo de un ítem perdido: info del producto + todos los oferentes + análisis."""
    conn = get_pg_conn()
    cur = conn.cursor()

    # Item metadata + criterios de evaluacion
    cur.execute("""
        SELECT
            COALESCE(NULLIF(li.nombre_producto, ''), l.nombre)         AS nombre_producto,
            COALESCE(NULLIF(TRIM(SPLIT_PART(li.descripcion, '@', 2)), ''), li.descripcion) AS descripcion,
            li.cantidad,
            li.unidad_medida,
            l.adjudicacion->>'UrlActa'                                 AS url_acta,
            l.adjudicacion->>'Numero'                                  AS acta_numero,
            l.adjudicacion->>'Fecha'                                   AS acta_fecha,
            l.nombre                                                   AS licitacion,
            l.codigo,
            l.comprador_nombre_organismo,
            COALESCE(l.fichas_extra->'criterios_evaluacion', '[]'::jsonb) AS criterios_raw
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        WHERE li.id = %s
    """, (item_id,))
    meta = cur.fetchone()

    # All oferentes ordered by price
    cur.execute("""
        SELECT
            o->>'rut'                                                              AS rut,
            INITCAP(o->>'nombre')                                                  AS nombre,
            COALESCE(NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                     (o->>'total')::numeric, 0)                                    AS precio_total,
            COALESCE((o->>'monto_unitario')::numeric, 0)                           AS precio_unitario,
            COALESCE((o->>'cantidad_ofertada')::numeric, 0)                        AS cantidad_ofertada,
            COALESCE((o->>'monto_adjudicado')::numeric, 0)                         AS monto_adj,
            COALESCE((o->>'seleccionada')::boolean, false)                         AS seleccionada,
            o->>'estado'                                                            AS estado,
            o->>'fecha_envio'                                                       AS fecha_envio
        FROM licitaciones_items li
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE li.id = %s
          AND COALESCE(NULLIF((o->>'valor_total_ofertado')::numeric, 0),
                       (o->>'total')::numeric, 0) > 0
        ORDER BY precio_total ASC
    """, (item_id,))
    oferentes_rows = cur.fetchall()
    conn.close()

    oferentes = [
        {
            "rut":             r[0] or "",
            "nombre":          r[1] or "",
            "precio_total":    round(float(r[2] or 0)),
            "precio_unitario": round(float(r[3] or 0)),
            "cantidad_ofertada": float(r[4] or 0),
            "monto_adj":       round(float(r[5] or 0)),
            "seleccionada":    bool(r[6]),
            "estado":          r[7] or "",
            "fecha_envio":     r[8] or "",
        }
        for r in oferentes_rows
    ]

    # Rule-based analysis
    lbf = next((o for o in oferentes if o["rut"] == "93.366.000-1"), None)
    ganador = next((o for o in oferentes if o["seleccionada"]), None)
    analisis = []
    if lbf and ganador:
        gap_pct = round((ganador["precio_total"] / lbf["precio_total"] - 1) * 100, 1) if lbf["precio_total"] > 0 else 0
        if lbf["estado"] == "Aceptada":
            analisis.append("OFERTA_OK|La oferta de LBF fue aceptada tecnicamente (no fue rechazada por requisitos formales).")
        else:
            analisis.append(f"OFERTA_WARN|Estado de oferta LBF: {lbf['estado']} - posible rechazo por requisitos formales.")
        if gap_pct > 200:
            analisis.append(f"PRECIO_ALTO|El ganador cobro {gap_pct:.0f}% mas que LBF. Esto sugiere que el precio tuvo baja ponderacion en los criterios de evaluacion, o que el ganador tenia ventaja tecnica significativa.")
        elif gap_pct > 50:
            analisis.append(f"PRECIO_MEDIO|El ganador cobro {gap_pct:.0f}% mas que LBF. Es probable que otros criterios (experiencia, plazo de entrega, especificaciones tecnicas) tuvieran mayor peso que el precio.")
        else:
            analisis.append(f"PRECIO_BAJO|El ganador cobro {gap_pct:.0f}% mas que LBF. La diferencia es moderada - el criterio de decision puede haber sido tecnico, de marca o experiencia previa con el proveedor.")
        analisis.append("ACTA|Para ver los criterios y puntajes exactos, consulta el Acta de Adjudicacion oficial.")

    if meta:
        acta_fecha = (meta[6] or "")[:10] if meta[6] else ""

        # Parse criterios de evaluacion
        criterios_raw = meta[10] if meta[10] else []
        criterios = []
        precio_ponderacion = None
        for c in criterios_raw:
            nombre = (c.get("nombre") or "").strip()
            pond_str = (c.get("ponderacion") or "").strip()
            obs = (c.get("observaciones") or "").strip()
            # Parse ponderacion to numeric (e.g. "10%" → 10.0)
            pond_num = None
            try:
                pond_num = float(pond_str.replace("%", "").replace(",", ".").strip())
            except (ValueError, AttributeError):
                pond_num = None
            criterios.append({
                "nombre":      nombre,
                "ponderacion": pond_str,
                "ponderacion_num": pond_num,
                "observaciones": obs,
                "es_precio":   "precio" in nombre.lower(),
            })
            if "precio" in nombre.lower() and pond_num is not None:
                precio_ponderacion = pond_num

        # Enrich analisis with criteria context
        if precio_ponderacion is not None:
            if precio_ponderacion <= 15:
                analisis.append(f"CRITERIO_PRECIO|El criterio Precio tiene solo {precio_ponderacion:.0f}% de ponderacion. Aunque LBF tenia el menor precio, los otros criterios (experiencia, plazo, calidad tecnica) sumaban el {100 - precio_ponderacion:.0f}% restante y determinaron el resultado.")
            elif precio_ponderacion <= 40:
                analisis.append(f"CRITERIO_PRECIO|El criterio Precio vale {precio_ponderacion:.0f}% de la evaluacion. El menor precio de LBF dio ventaja, pero no fue suficiente frente al puntaje que acumulo el ganador en los demas criterios.")
            else:
                analisis.append(f"CRITERIO_PRECIO|El criterio Precio tiene {precio_ponderacion:.0f}% de ponderacion (peso alto). Puede haber influido un rechazo tecnico, calculo de precio ponderado distinto, o evaluacion de especificaciones.")
        elif criterios:
            analisis.append("CRITERIO_PRECIO|No se identifico un criterio especifico de Precio en las bases. La adjudicacion puede haberse basado en criterios tecnicos o administrativos.")

        return {
            "item": {
                "nombre_producto": meta[0] or "",
                "descripcion":     meta[1] or "",
                "cantidad":        float(meta[2] or 0),
                "unidad_medida":   meta[3] or "",
                "url_acta":        meta[4] or "",
                "acta_numero":     meta[5] or "",
                "acta_fecha":      acta_fecha,
                "licitacion":      meta[7] or "",
                "codigo":          meta[8] or "",
                "organismo":       meta[9] or "",
            },
            "oferentes":  oferentes,
            "analisis":   analisis,
            "criterios":  criterios,
        }
    return {"item": {}, "oferentes": oferentes, "analisis": analisis, "criterios": []}


@router.get("/perdidos-detalle")
async def get_perdidos_detalle(
    item_id: int = Query(...),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:perdidos_det:{item_id}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_perdidos_detalle(item_id)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"item": None, "oferentes": [], "analisis": [f"ERROR|{str(e)}"], "error": str(e)}


def _es_precio_criterio(name: str) -> bool:
    import unicodedata
    n = unicodedata.normalize("NFD", name.lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return "precio" in n or "econom" in n


def _parse_acta_html(url: str) -> dict:
    """Fetch and parse a Mercado Público Acta de Adjudicación page."""
    import re
    import requests
    from bs4 import BeautifulSoup

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    http_url = url.replace("https://", "http://").replace(":443/", "/")
    resp = requests.get(http_url, headers=headers, timeout=25, verify=False, allow_redirects=True)
    resp.raise_for_status()

    # Explicit UTF-8 decode to avoid latin-1 corruption
    html = resp.content.decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n", strip=True)
    lines = [l.strip() for l in text.split("\n")]

    pct_re = re.compile(r"(\d{1,3})\s*%")

    # ── 1. Extract criterios section ──────────────────────────────────────────
    criterios = []
    crit_start = next(
        (i for i, l in enumerate(lines) if "criterios de evaluaci" in l.lower()), None
    )
    # End of criterios: first long line with "que" and no % after start
    crit_end = (crit_start or 0) + 25
    if crit_start:
        for i in range(crit_start + 5, min(crit_start + 30, len(lines))):
            l = lines[i]
            if "%" not in l and len(l) > 40 and ("que," in l.lower() or "8.-" in l or "9.-" in l):
                crit_end = i
                break

    if crit_start:
        current_group = None
        for line in lines[crit_start + 1: crit_end]:
            if not line:
                continue
            pct_m = pct_re.search(line)
            low = line.lower()
            # Group header: "Criterio Administrativo" or "Criterio técnico (27%)"
            if "criterio" in low:
                grp = re.sub(r"criterio\s*", "", line, flags=re.I).strip()
                grp = re.sub(r"\(\d+%\)", "", grp).strip()
                if grp:
                    current_group = grp
                if pct_m:
                    pct_val = int(pct_m.group(1))
                    name = current_group or grp
                    if name:
                        criterios.append({
                            "nombre": name,
                            "ponderacion": f"{pct_val}%",
                            "ponderacion_num": float(pct_val),
                            "es_precio": _es_precio_criterio(name),
                        })
            elif pct_m:
                pct_val = int(pct_m.group(1))
                name = re.sub(r"\(\d+%\)|\d+\s*%", "", line).strip()
                if not name and current_group:
                    name = current_group
                if name and pct_val > 0:
                    criterios.append({
                        "nombre": name,
                        "ponderacion": f"{pct_val}%",
                        "ponderacion_num": float(pct_val),
                        "es_precio": _es_precio_criterio(name),
                    })

    # ── 2. Extract LBF admissibility and causal ───────────────────────────────
    lbf_markers = ["comercial lbf", "lbf ltda", "93.366.000"]
    lbf_causal = None
    lbf_admisible = None
    inadmis_re = re.compile(r"inadmisib", re.I)

    for i, line in enumerate(lines):
        ll = line.lower()
        if not any(m in ll for m in lbf_markers):
            continue
        window = " ".join(lines[i: i + 10])
        if inadmis_re.search(window) and " no " in window.lower():
            lbf_admisible = False
            causal_parts = []
            for j in range(i, min(i + 12, len(lines))):
                seg = lines[j]
                if (inadmis_re.search(seg) or "incumplimiento" in seg.lower()
                        or "eett" in seg.lower() or "etapa" in seg.lower()
                        or "acta de evaluaci" in seg.lower()):
                    causal_parts.append(seg)
                elif causal_parts and not seg:
                    break
            if causal_parts:
                lbf_causal = " ".join(causal_parts).strip()
            break
        elif " sí " in window.lower() or " si " in window.lower():
            lbf_admisible = True

    # ── 3. Extract winner puntajes ────────────────────────────────────────────
    ganador_puntajes: list[dict] = []
    for line in lines:
        ll = line.lower()
        if any(m in ll for m in lbf_markers):
            continue
        if (" sí " in ll or " si " in ll) and len(pct_re.findall(line)) >= 3:
            scores = [int(m) for m in pct_re.findall(line)]
            ganador_puntajes = [{"pct": s} for s in scores[:-1]]  # last is TOTAL
            break

    razon_perdida = lbf_causal if lbf_admisible is False else None

    return {
        "criterios": criterios,
        "lbf_admisible": lbf_admisible,
        "lbf_causal": lbf_causal,
        "ganador_puntajes": ganador_puntajes,
        "razon_perdida": razon_perdida,
    }


@router.get("/perdidos-acta")
async def get_perdidos_acta(
    acta_url: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    import hashlib
    ck = f"mp:acta:{hashlib.md5(acta_url.encode()).hexdigest()}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _parse_acta_html(acta_url)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"criterios": [], "lbf_admisible": None, "lbf_causal": None,
                "ganador_puntajes": [], "razon_perdida": None, "error": str(e)}


@router.get("/vs-competidor")
async def get_vs_competidor(
    rut:  str = Query(...),
    ano:  int = Query(2026),
    tipo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:vs:{rut}:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_vs_competidor(rut, ano, tipo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "categorias": [], "evolucion": [], "clientes": []}



# ═══════════════════════════════════════════════════════════════════════════════
# COMPRA ÁGIL — Multiproducto, Segundo Llamado, Revendedores
# Fuente: PostgreSQL (compras_agiles) + SQL Server (BI_TOTAL_FACTURA)
# ═══════════════════════════════════════════════════════════════════════════════

MESES_AG = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

MP_RUT = "77.619.564-2"   # Multiproducto SPA en PostgreSQL


def _norm_rut(rut: str) -> str:
    return re.sub(r"[.\-\s]", "", str(rut or "")).upper().lstrip("0")


# ── Multiproducto YTD ────────────────────────────────────────────────────────

def _load_ag_multiproducto(ano: int) -> dict:
    try:
        _FG = filtro_guias()
        ss = get_ss_conn()
        ss_cur = ss.cursor()
        ss_cur.execute(f"""
            SELECT MES, SUM(CAST(VENTA AS float))
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {ano}
              AND (UPPER(NOMBRE) LIKE '%RENHET%' OR UPPER(NOMBRE) LIKE '%MULTIPRODUCTO%')
              AND {DW_FILTRO} AND {_FG}
            GROUP BY MES
        """)
        compra_by_mes = {int(r[0]): float(r[1] or 0) for r in ss_cur.fetchall()}
        ss.close()

        pg = get_pg_conn()
        cur = pg.cursor()
        cur.execute("""
            SELECT EXTRACT(MONTH FROM fecha_publicacion)::int AS mes,
                   SUM(monto_adjudicado) AS monto
            FROM compras_agiles
            WHERE rut_adjudicado = %s
              AND EXTRACT(YEAR FROM fecha_publicacion) = %s
              AND monto_adjudicado > 0
            GROUP BY 1
        """, (MP_RUT, ano))
        venta_by_mes = {r[0]: float(r[1] or 0) for r in cur.fetchall()}

        cur.execute("""
            SELECT proveedor_adjudicado, SUM(monto_adjudicado) AS monto, COUNT(*) AS n_ocs
            FROM compras_agiles
            WHERE EXTRACT(YEAR FROM fecha_publicacion) = %s
              AND monto_adjudicado > 0
              AND rut_adjudicado IS NOT NULL
              AND rut_adjudicado != %s
              AND proveedor_adjudicado IS NOT NULL
            GROUP BY proveedor_adjudicado
            ORDER BY monto DESC
            LIMIT 20
        """, (ano, MP_RUT))
        competidores = [
            {"empresa": r[0], "monto": round(float(r[1] or 0)), "n_ocs": int(r[2] or 0)}
            for r in cur.fetchall()
        ]
        pg.close()

        mensual = [
            {
                "mes": m, "mes_nombre": MESES_AG[m],
                "compra_lbf": round(compra_by_mes.get(m, 0)),
                "venta_ag":   round(venta_by_mes.get(m, 0)),
            }
            for m in range(1, 13)
            if compra_by_mes.get(m, 0) > 0 or venta_by_mes.get(m, 0) > 0
        ]
        return {
            "total_compra_lbf": round(sum(compra_by_mes.values())),
            "total_venta_ag":   round(sum(venta_by_mes.values())),
            "mensual":          mensual,
            "competidores":     competidores,
        }
    except Exception as e:
        return {"error": str(e), "total_compra_lbf": 0, "total_venta_ag": 0, "mensual": [], "competidores": []}


@router.get("/ag-multiproducto")
async def get_ag_multiproducto(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:ag_mp:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_ag_multiproducto(ano)
    if "error" not in data:
        mem_set(ck, data)
    return data


# ── Multiproducto Mes ────────────────────────────────────────────────────────

def _load_ag_multiproducto_mes(ano: int, mes: int) -> dict:
    try:
        _FG = filtro_guias()
        ss = get_ss_conn()
        ss_cur = ss.cursor()
        ss_cur.execute(f"""
            SELECT LTRIM(RTRIM(CODIGO)), LTRIM(RTRIM(DESCRIPCION)),
                   LTRIM(RTRIM(CATEGORIA)),
                   SUM(CAST(CANT AS float)), SUM(CAST(VENTA AS float))
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {ano} AND MES = {mes}
              AND (UPPER(NOMBRE) LIKE '%RENHET%' OR UPPER(NOMBRE) LIKE '%MULTIPRODUCTO%')
              AND {DW_FILTRO} AND {_FG}
            GROUP BY CODIGO, DESCRIPCION, CATEGORIA
            ORDER BY SUM(CAST(VENTA AS float)) DESC
        """)
        compras_lbf = []
        for r in ss_cur.fetchall():
            cant = float(r[3] or 0)
            venta = float(r[4] or 0)
            compras_lbf.append({
                "codigo": str(r[0] or ""), "descripcion": str(r[1] or ""),
                "categoria": str(r[2] or ""), "cantidad": round(cant),
                "precio_unit": round(venta / cant) if cant > 0 else 0,
                "venta": round(venta),
            })
        ss.close()

        pg = get_pg_conn()
        cur = pg.cursor()
        cur.execute("""
            SELECT ca.codigo, ca.organismo_comprador, ca.monto_adjudicado
            FROM compras_agiles ca
            WHERE ca.rut_adjudicado = %s
              AND EXTRACT(YEAR  FROM ca.fecha_publicacion) = %s
              AND EXTRACT(MONTH FROM ca.fecha_publicacion) = %s
              AND ca.monto_adjudicado > 0
            ORDER BY ca.monto_adjudicado DESC
            LIMIT 200
        """, (MP_RUT, ano, mes))
        ocs = cur.fetchall()

        ventas_ag = []
        for oc in ocs:
            cur.execute("""
                SELECT nombre_producto, cantidad, unidad_medida
                FROM compras_agiles_items
                WHERE codigo_cotizacion = %s
                LIMIT 3
            """, (oc[0],))
            items = cur.fetchall()
            nombre = items[0][0] if items else oc[0]
            cant = float(items[0][1] or 1) if items else 1
            monto = float(oc[2] or 0)
            ventas_ag.append({
                "descripcion": nombre,
                "tipo_producto": items[0][2] if items else "",
                "institucion": str(oc[1] or ""),
                "cantidad": cant,
                "precio_unit": round(monto / cant) if cant > 0 else round(monto),
                "monto": round(monto),
            })
        pg.close()

        return {
            "total_compra_lbf": sum(p["venta"] for p in compras_lbf),
            "n_productos_lbf":  len(compras_lbf),
            "total_venta_ag":   sum(p["monto"] for p in ventas_ag),
            "n_productos_ag":   len(ventas_ag),
            "compras_lbf":      compras_lbf,
            "ventas_ag":        ventas_ag,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/ag-multiproducto-mes")
async def get_ag_multiproducto_mes(
    ano: int = Query(2026),
    mes: int = Query(1),
    current_user: dict = Depends(get_current_user),
):
    return _load_ag_multiproducto_mes(ano, mes)


# ── Segundo Llamado ──────────────────────────────────────────────────────────

def _load_segundo_llamado(ano: int, mes: int) -> dict:
    try:
        pg = get_pg_conn()
        cur = pg.cursor()

        # Mes específico: incluye publicadas ese mes + ganadas ese mes (aunque publicadas antes)
        if mes > 0:
            mes_filter = f"""AND (
                EXTRACT(MONTH FROM ca.fecha_publicacion) = {mes}
                OR (ca.rut_adjudicado = '{LBF_RUT}' AND EXTRACT(MONTH FROM ca.updated_at) = {mes})
            )"""
        else:
            mes_filter = ""

        # Todas las cotizaciones de LBF en el período
        cur.execute(f"""
            SELECT ca.codigo, ca.nombre, ca.organismo_comprador, ca.estado,
                   ca.proveedor_adjudicado, ca.monto_adjudicado,
                   c.monto_ofertado,
                   (ca.rut_adjudicado = '{LBF_RUT}') AS lbf_gano,
                   EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS mes,
                   ca.presupuesto_estimado
            FROM compras_agiles_cotizantes c
            JOIN compras_agiles ca ON ca.codigo = c.codigo_cotizacion
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {mes_filter}
            ORDER BY (ca.rut_adjudicado = '{LBF_RUT}') DESC, ca.updated_at DESC
        """)
        rows = cur.fetchall()

        from collections import defaultdict
        by_mes: dict = defaultdict(lambda: {"total": 0, "adjudicadas": 0, "desiertas": 0})
        for r in rows:
            m = r[8] or 0
            by_mes[m]["total"] += 1
            if r[7]:  # lbf_gano = rut_adjudicado = LBF_RUT
                by_mes[m]["adjudicadas"] += 1
            if "desierta" in (r[3] or "").lower():
                by_mes[m]["desiertas"] += 1

        mensual = [
            {"mes": m, "mes_nombre": MESES_AG[m], **v}
            for m, v in sorted(by_mes.items()) if m > 0
        ]

        # Bulk fetch items para TODAS las cotizaciones (sin límite, evita N+1)
        codigos = [str(r[0]) for r in rows if r[0]]
        items_by_cod: dict = defaultdict(list)
        cotiz_by_cod: dict = defaultdict(list)
        if codigos:
            cur.execute("""
                SELECT codigo_cotizacion, nombre_producto, cantidad, unidad_medida
                FROM compras_agiles_items
                WHERE codigo_cotizacion = ANY(%s)
            """, (codigos,))
            for cod, prod, cant, unid in cur.fetchall():
                items_by_cod[str(cod)].append({
                    "producto": prod or "", "descripcion": "",
                    "cantidad": float(cant or 0), "unidad": unid or "", "codigo_producto": "",
                })

            cur.execute(f"""
                SELECT codigo_cotizacion, razon_social, rut_proveedor, monto_ofertado, seleccionado
                FROM compras_agiles_cotizantes
                WHERE codigo_cotizacion = ANY(%s) AND rut_proveedor != '{LBF_RUT}'
                ORDER BY codigo_cotizacion, seleccionado DESC, monto_ofertado ASC
            """, (codigos,))
            for cod, rs, rut, monto, sel in cur.fetchall():
                cotiz_by_cod[str(cod)].append({
                    "empresa": rs or "", "rut": rut or "",
                    "monto": float(monto or 0), "seleccionado": bool(sel),
                })

        # Construir lista completa sin límite de 50
        lbf_cotizaciones = []
        for r in rows:
            cod = str(r[0] or "")
            lbf_cotizaciones.append({
                "codigo": cod,
                "nombre": str(r[1] or ""),
                "institucion": str(r[2] or ""),
                "estado": str(r[3] or ""),
                "seleccionado": bool(r[7]),  # True si rut_adjudicado = LBF_RUT
                "monto_ofertado": round(float(r[6] or 0)),
                "proveedor_ganador": r[4],
                "monto_ganador": round(float(r[5] or 0)),
                "items": items_by_cod.get(cod, []),
                "cotizantes": cotiz_by_cod.get(cod, []),
            })

        cur.execute(f"""
            SELECT c.razon_social, COUNT(DISTINCT c.codigo_cotizacion) AS part,
                   SUM(CASE WHEN c.seleccionado THEN 1 ELSE 0 END) AS sel
            FROM compras_agiles_cotizantes c
            JOIN compras_agiles ca ON ca.codigo = c.codigo_cotizacion
            WHERE EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {mes_filter}
              AND c.rut_proveedor != '{LBF_RUT}'
              AND c.razon_social IS NOT NULL
            GROUP BY c.razon_social
            ORDER BY part DESC
            LIMIT 20
        """)
        competidores = [
            {"empresa": r[0], "participaciones": int(r[1]), "seleccionado": int(r[2])}
            for r in cur.fetchall()
        ]
        pg.close()

        adj      = sum(1 for r in rows if r[7])  # lbf_gano
        desiertas = sum(1 for r in rows if "desierta" in (r[3] or "").lower())
        return {
            "kpis": {
                "total_cotizaciones": len(rows),
                "adjudicadas":        adj,
                "desiertas":          desiertas,
                "presupuesto":        round(sum(float(r[9] or 0) for r in rows)),
                "monto_ofertado":     round(sum(float(r[6] or 0) for r in rows)),
                "adjudicado":         round(sum(float(r[5] or 0) for r in rows if r[7])),
            },
            "mensual": mensual, "lbf_cotizaciones": lbf_cotizaciones, "competidores": competidores,
        }
    except Exception as e:
        return {"error": str(e), "kpis": {}, "mensual": [], "lbf_cotizaciones": [], "competidores": []}


@router.get("/segundo-llamado")
async def get_segundo_llamado(
    ano: int = Query(2026),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    # Sin caché — datos de adjudicación cambian frecuentemente
    data = _load_segundo_llamado(ano, mes)
    if False and "error" not in data:
        mem_set(ck, data)
    return data


# ── Actividad Diaria AG ──────────────────────────────────────────────────────

def _load_ag_diario(ano: int, mes: int) -> dict:
    try:
        pg = get_pg_conn()
        cur = pg.cursor()
        # Ambas dimensiones (postuladas y adjudicadas) por mes de publicación.
        # Usar updated_at causaba mismatch: adj de publicaciones de meses anteriores
        # aparecían en el mes de adjudicación, no en el mes en que se cotizó.
        pub_filter = f"AND EXTRACT(MONTH FROM ca.fecha_publicacion) = {mes}" if mes > 0 else ""
        adj_filter = pub_filter  # mismo filtro — consistencia temporal

        # Primer llamado: postuladas y adjudicadas de Multiproducto por día (ambas por publicación)
        cur.execute(f"""
            SELECT DATE(ca.fecha_publicacion) AS dia,
                   COUNT(DISTINCT ca.codigo) AS postuladas,
                   COUNT(DISTINCT CASE WHEN ca.rut_adjudicado = %s THEN ca.codigo END) AS adj,
                   COALESCE(SUM(CASE WHEN ca.rut_adjudicado = %s THEN ca.monto_adjudicado END), 0) AS monto
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = %s
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
            GROUP BY DATE(ca.fecha_publicacion)
            ORDER BY dia
        """, (MP_RUT, MP_RUT, MP_RUT))
        primer = {str(r[0]): {"postuladas": int(r[1]), "n": int(r[2]), "monto": round(float(r[3]))} for r in cur.fetchall()}

        # Segundo llamado — postuladas por día de publicación
        cur.execute(f"""
            SELECT DATE(ca.fecha_publicacion) AS dia,
                   COUNT(DISTINCT ca.codigo) AS n,
                   COALESCE(SUM(ca.presupuesto_estimado), 0) AS presupuesto
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
            GROUP BY DATE(ca.fecha_publicacion)
            ORDER BY dia
        """)
        segundo_post = {str(r[0]): {"n": int(r[1]), "presupuesto": round(float(r[2]))} for r in cur.fetchall()}

        # Segundo llamado — adjudicadas por día de publicación (mismo eje temporal que postuladas)
        cur.execute(f"""
            SELECT DATE(ca.fecha_publicacion) AS dia,
                   COUNT(DISTINCT ca.codigo) AS adj,
                   COALESCE(SUM(ca.monto_adjudicado), 0) AS monto_adj
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND ca.rut_adjudicado = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
            GROUP BY DATE(ca.fecha_publicacion)
            ORDER BY dia
        """)
        segundo_adj = {str(r[0]): {"adj": int(r[1]), "monto_adj": round(float(r[2]))} for r in cur.fetchall()}

        # Totales reales LBF — postuladas por publicación, adjudicadas por adjudicación
        cur.execute(f"""
            SELECT COUNT(DISTINCT ca.codigo) FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
        """)
        total_post_real = int(cur.fetchone()[0])

        cur.execute(f"""
            SELECT COUNT(DISTINCT ca.codigo) FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND ca.rut_adjudicado = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {adj_filter}
        """)
        total_adj_real = int(cur.fetchone()[0])

        # Gestores 2° llamado: solo cotizaciones donde LBF cotizó directamente
        # (excluye primer llamado de Multiproducto que también aparece en lm_oportunidades)
        cur.execute(f"""
            SELECT
                u.nombre, u.email,
                COUNT(DISTINCT o.codigo_cotizacion) AS postuladas,
                COUNT(DISTINCT CASE WHEN ca.rut_adjudicado = '{LBF_RUT}' THEN o.codigo_cotizacion END) AS adjudicadas
            FROM lm_oportunidades_compra_agil o
            JOIN lm_usuarios u ON u.id = o.operador_usuario_id
            JOIN compras_agiles ca ON ca.codigo = o.codigo_cotizacion
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
              AND c.rut_proveedor = '{LBF_RUT}'
            WHERE o.estado_gestion = 'postulada'
              AND u.email != 'externo@lbf.cl'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
            GROUP BY u.nombre, u.email
            ORDER BY postuladas DESC
        """)
        usuarios = []
        sum_post_lm = 0; sum_adj_lm = 0
        for r in cur.fetchall():
            nombre = r[0] or ""
            partes = nombre.split()
            iniciales = (partes[0][0] + partes[-1][0]).upper() if len(partes) >= 2 else nombre[:2].upper()
            post = int(r[2]); adj = int(r[3])
            conv = round(adj / post * 100, 1) if post > 0 else 0.0
            sum_post_lm += post; sum_adj_lm += adj
            usuarios.append({"nombre": nombre, "iniciales": iniciales, "postuladas": post, "adjudicadas": adj, "conv": conv})
        # Fila sin atribuir
        sa_post = max(0, total_post_real - sum_post_lm)
        sa_adj  = max(0, total_adj_real - sum_adj_lm)
        usuarios.append({"nombre": "Sin atribuir", "iniciales": "—", "postuladas": sa_post, "adjudicadas": sa_adj, "conv": round(sa_adj / sa_post * 100, 1) if sa_post > 0 else 0.0, "sin_atribuir": True})

        # Resumen mensual — Primer llamado (Multiproducto)
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS mes,
                   COUNT(DISTINCT ca.codigo) AS postuladas,
                   COUNT(DISTINCT CASE WHEN ca.rut_adjudicado = '{MP_RUT}' THEN ca.codigo END) AS adjudicadas
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{MP_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
            GROUP BY mes
            ORDER BY mes
        """)
        primer_mes = {int(r[0]): {"postuladas": int(r[1]), "adjudicadas": int(r[2])} for r in cur.fetchall()}

        # Resumen mensual — Segundo llamado (LBF): postuladas por mes publicación
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS mes,
                   COUNT(DISTINCT ca.codigo) AS postuladas
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
            GROUP BY mes
            ORDER BY mes
        """)
        segundo_mes_post = {int(r[0]): int(r[1]) for r in cur.fetchall()}

        # Adjudicadas por mes de publicación (mismo eje temporal que postuladas)
        cur.execute(f"""
            SELECT EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS mes_pub,
                   COUNT(DISTINCT ca.codigo) AS adjudicadas,
                   COALESCE(SUM(ca.monto_adjudicado), 0) AS monto_adj
            FROM compras_agiles ca
            JOIN compras_agiles_cotizantes c ON c.codigo_cotizacion = ca.codigo
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND ca.rut_adjudicado = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
            GROUP BY mes_pub
            ORDER BY mes_pub
        """)
        segundo_mes_adj = {int(r[0]): {"adj": int(r[1]), "monto": round(float(r[2]))} for r in cur.fetchall()}

        meses_set = sorted(set(primer_mes) | set(segundo_mes_post) | set(segundo_mes_adj))
        meses_resumen = []
        for m in meses_set:
            p = primer_mes.get(m, {"postuladas": 0, "adjudicadas": 0})
            s_adj = segundo_mes_adj.get(m, {"adj": 0, "monto": 0})
            meses_resumen.append({
                "mes": m,
                "p1_post": p["postuladas"], "p1_adj": p["adjudicadas"],
                "p2_post": segundo_mes_post.get(m, 0),
                "p2_adj": s_adj["adj"],
                "p2_monto_adj": s_adj["monto"],
            })

        # Iniciales por día (2° llamado LBF) — calculadas en Python
        cur.execute(f"""
            SELECT DATE(ca.fecha_publicacion) AS dia, u.nombre
            FROM lm_oportunidades_compra_agil o
            JOIN lm_usuarios u ON u.id = o.operador_usuario_id
            JOIN compras_agiles ca ON ca.codigo = o.codigo_cotizacion
            WHERE o.estado_gestion = 'postulada'
              AND u.email != 'externo@lbf.cl'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {pub_filter}
        """)
        _ini_map: dict[str, set] = {}
        for r in cur.fetchall():
            dia_k = str(r[0])
            nombre = r[1] or ""
            partes = nombre.split()
            ini = (partes[0][0] + partes[-1][0]).upper() if len(partes) >= 2 else nombre[:2].upper()
            _ini_map.setdefault(dia_k, set()).add(ini)
        iniciales_dia = {k: "·".join(sorted(v)) for k, v in _ini_map.items()}

        pg.close()

        # Merge por día
        dias_set = sorted(set(primer) | set(segundo_post) | set(segundo_adj))
        dias = []
        for d in dias_set:
            p = primer.get(d, {"postuladas": 0, "n": 0, "monto": 0})
            sp = segundo_post.get(d, {"n": 0, "presupuesto": 0})
            sa = segundo_adj.get(d, {"adj": 0, "monto_adj": 0})
            dias.append({
                "dia": d,
                "primer_postuladas": p["postuladas"],
                "primer_n": p["n"], "primer_monto": p["monto"],
                "segundo_n": sp["n"], "segundo_adj": sa["adj"],
                "segundo_monto_adj": sa["monto_adj"],
                "segundo_presupuesto": sp["presupuesto"],
                "iniciales": iniciales_dia.get(d, ""),
            })

        return {"dias": dias, "usuarios": usuarios, "meses_resumen": meses_resumen, "ano": ano, "mes": mes}
    except Exception as e:
        return {"error": str(e), "dias": []}


@router.get("/ag-diario")
async def get_ag_diario(
    ano: int = Query(2026),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:ag_diario:{ano}:{mes}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_ag_diario(ano, mes)
    if "error" not in data:
        mem_set(ck, data)
    return data


# ── Revendedores ─────────────────────────────────────────────────────────────

def _load_ag_resellers_base(ano: int, mes: int = 0) -> dict:
    try:
        _FG = filtro_guias()
        mes_ss = f"AND MES = {mes}" if mes > 0 else ""
        mes_pg = f"AND EXTRACT(MONTH FROM fecha_publicacion) = {mes}" if mes > 0 else ""

        ss = get_ss_conn()
        ss_cur = ss.cursor()
        ss_cur.execute(f"""
            SELECT LTRIM(RTRIM(RUT)), LTRIM(RTRIM(NOMBRE)),
                   SUM(CAST(VENTA AS float)), MES
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {ano} AND {DW_FILTRO} AND {_FG}
              AND RUT IS NOT NULL AND RUT != ''
              AND UPPER(NOMBRE) NOT LIKE '%RENHET%'
              AND UPPER(NOMBRE) NOT LIKE '%MULTIPRODUCTO%'
              {mes_ss}
            GROUP BY RUT, NOMBRE, MES
        """)
        from collections import defaultdict
        lbf_by_rut: dict = defaultdict(lambda: {"nombre": "", "total": 0.0, "meses": defaultdict(float)})
        for r in ss_cur.fetchall():
            rut_n = _norm_rut(str(r[0]))
            lbf_by_rut[rut_n]["nombre"] = str(r[1] or "")
            lbf_by_rut[rut_n]["total"] += float(r[2] or 0)
            lbf_by_rut[rut_n]["meses"][int(r[3] or 0)] += float(r[2] or 0)
        ss.close()

        pg = get_pg_conn()
        cur = pg.cursor()
        cur.execute(f"""
            SELECT rut_adjudicado, proveedor_adjudicado,
                   SUM(monto_adjudicado) AS venta_ag,
                   COUNT(*) AS n_ocs,
                   COUNT(DISTINCT organismo_comprador) AS n_inst,
                   EXTRACT(MONTH FROM fecha_publicacion)::int AS mes
            FROM compras_agiles
            WHERE EXTRACT(YEAR FROM fecha_publicacion) = {ano}
              {mes_pg}
              AND monto_adjudicado > 0
              AND rut_adjudicado IS NOT NULL
              AND rut_adjudicado != '{LBF_RUT}'
              AND rut_adjudicado != '{MP_RUT}'
            GROUP BY rut_adjudicado, proveedor_adjudicado,
                     EXTRACT(MONTH FROM fecha_publicacion)::int
        """)
        ag_by_rut: dict = defaultdict(lambda: {"nombre_mp": "", "venta_ag": 0.0, "n_ocs": 0, "n_inst": set(), "meses": defaultdict(float)})
        for r in cur.fetchall():
            rut_n = _norm_rut(str(r[0]))
            ag_by_rut[rut_n]["nombre_mp"] = str(r[1] or "")
            ag_by_rut[rut_n]["venta_ag"] += float(r[2] or 0)
            ag_by_rut[rut_n]["n_ocs"] += int(r[3] or 0)
            ag_by_rut[rut_n]["n_inst"].add(str(r[4] or ""))
            ag_by_rut[rut_n]["meses"][int(r[5] or 0)] += float(r[2] or 0)
        pg.close()

        lbf_rut_n = _norm_rut(LBF_RUT)
        mp_rut_n  = _norm_rut(MP_RUT)
        resellers = []
        for rut_n, lbf in lbf_by_rut.items():
            if rut_n not in ag_by_rut or rut_n in (lbf_rut_n, mp_rut_n):
                continue
            ag = ag_by_rut[rut_n]
            meses_list = [
                {"mes": m, "compra_lbf": round(lbf["meses"].get(m, 0)), "venta_ag": round(ag["meses"].get(m, 0))}
                for m in range(1, 13)
                if lbf["meses"].get(m, 0) > 0 or ag["meses"].get(m, 0) > 0
            ]
            resellers.append({
                "rut": rut_n, "nombre_lbf": lbf["nombre"], "nombre_mp": ag["nombre_mp"],
                "compra_lbf": round(lbf["total"]), "venta_ag": round(ag["venta_ag"]),
                "n_ocs_ag": ag["n_ocs"], "n_instituciones": len(ag["n_inst"]),
                "destacado": False, "meses": meses_list,
            })

        resellers.sort(key=lambda x: x["venta_ag"], reverse=True)
        return {
            "total_resellers": len(resellers),
            "total_compra_lbf": sum(r["compra_lbf"] for r in resellers),
            "total_venta_ag": sum(r["venta_ag"] for r in resellers),
            "resellers": resellers,
        }
    except Exception as e:
        return {"error": str(e), "total_resellers": 0, "total_compra_lbf": 0, "total_venta_ag": 0, "resellers": []}


@router.get("/ag-resellers")
async def get_ag_resellers(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:ag_resellers:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_ag_resellers_base(ano, 0)
    if "error" not in data:
        mem_set(ck, data)
    return data


@router.get("/ag-resellers-mes")
async def get_ag_resellers_mes(
    ano: int = Query(2026),
    mes: int = Query(1),
    current_user: dict = Depends(get_current_user),
):
    return _load_ag_resellers_base(ano, mes)


@router.get("/ag-reseller-detalle")
async def get_ag_reseller_detalle(
    rut: str = Query(...),
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    try:
        _FG = filtro_guias()
        rut_clean = re.sub(r"[^0-9kK]", "", rut)
        ss = get_ss_conn()
        ss_cur = ss.cursor()
        ss_cur.execute(f"""
            SELECT LTRIM(RTRIM(CODIGO)), LTRIM(RTRIM(DESCRIPCION)),
                   LTRIM(RTRIM(CATEGORIA)),
                   SUM(CAST(CANT AS float)), SUM(CAST(VENTA AS float))
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {ano} AND {DW_FILTRO} AND {_FG}
              AND REPLACE(REPLACE(LTRIM(RTRIM(RUT)), '.', ''), '-', '') = '{rut_clean}'
            GROUP BY CODIGO, DESCRIPCION, CATEGORIA
            ORDER BY SUM(CAST(VENTA AS float)) DESC
        """)
        resumen = []
        total = 0.0
        for r in ss_cur.fetchall():
            cant = float(r[3] or 0)
            venta = float(r[4] or 0)
            total += venta
            resumen.append({
                "codigo": str(r[0] or ""), "descripcion": str(r[1] or ""),
                "categoria": str(r[2] or ""),
                "cantidad": round(cant),
                "precio_unit": round(venta / cant) if cant > 0 else 0,
                "venta": round(venta),
            })
        ss.close()
        return {"n_productos": len(resumen), "total": round(total), "resumen": resumen}
    except Exception as e:
        return {"error": str(e), "n_productos": 0, "total": 0, "resumen": []}
