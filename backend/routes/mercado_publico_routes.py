"""
Mercado Publico — Análisis de participación LBF en insumos médicos.
Fuente: PostgreSQL mercado_publico, tabla licitaciones + licitaciones_items.
LBF se identifica por RUT 93.366.000-1 dentro del JSONB oferentes.
"""
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db_mp import get_pg_conn
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


def _load_participacion(ano: int, tipo: str) -> dict:
    tf = _tipo_filter(tipo)
    conn = get_pg_conn()
    cur = conn.cursor()

    # ── KPIs LBF ──────────────────────────────────────────────────────────────
    cur.execute(f"""
        WITH lbf_items AS (
            SELECT
                li.licitacion_id,
                li.id                                            AS item_id,
                (o->>'seleccionada')::boolean                   AS adj,
                COALESCE(
                    (o->>'valor_total_ofertado')::numeric, 0)   AS monto_ofertado,
                COALESCE(li.monto_adjudicado, 0)               AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        )
        SELECT
            COUNT(DISTINCT licitacion_id)                              AS ids_participadas,
            COUNT(item_id)                                             AS ofertas_realizadas,
            COUNT(CASE WHEN monto_ofertado > 0 THEN 1 END)            AS ofertas_con_precio,
            COUNT(CASE WHEN adj THEN 1 END)                           AS ofertas_adj,
            COUNT(DISTINCT CASE WHEN adj THEN licitacion_id END)      AS ids_adj,
            SUM(CASE WHEN adj THEN monto_adj ELSE 0 END)              AS total_adj,
            SUM(monto_ofertado)                                        AS total_ofertado
        FROM lbf_items
    """)
    r = cur.fetchone()
    ids_part   = int(r[0] or 0)
    of_real    = int(r[1] or 0)
    of_precio  = int(r[2] or 0)
    of_adj     = int(r[3] or 0)
    ids_adj    = int(r[4] or 0)
    total_adj  = float(r[5] or 0)
    total_part = float(r[6] or 0)

    ef_items = round(of_adj / of_real * 100, 1) if of_real > 0 else 0
    ef_lics  = round(ids_adj / ids_part * 100, 1) if ids_part > 0 else 0

    # ── Mercado total (misma categoría y filtro tipo) ─────────────────────────
    cur.execute(f"""
        SELECT
            COUNT(DISTINCT li.licitacion_id)    AS ids_total,
            COUNT(li.id)                        AS items_total,
            SUM(COALESCE(li.monto_adjudicado,0)) AS valor_total_adj
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
          AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
          {tf}
    """)
    r = cur.fetchone()
    mkt_ids   = int(r[0] or 0)
    mkt_items = int(r[1] or 0)
    mkt_valor = float(r[2] or 0)

    part_ids   = round(ids_part / mkt_ids * 100, 1) if mkt_ids > 0 else 0
    part_valor = round(total_adj / mkt_valor * 100, 1) if mkt_valor > 0 else 0

    # ── Top 20 competidores en las mismas licitaciones donde participó LBF ────
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
        )
        SELECT
            INITCAP(o->>'nombre')                                            AS competidor,
            COUNT(DISTINCT li.licitacion_id)                                AS ids_part,
            COUNT(li.id)                                                    AS ofertas,
            COUNT(CASE WHEN (o->>'seleccionada')::boolean THEN 1 END)       AS ofertas_adj,
            COUNT(DISTINCT CASE WHEN (o->>'seleccionada')::boolean
                THEN li.licitacion_id END)                                  AS ids_adj,
            SUM(CASE WHEN (o->>'seleccionada')::boolean
                THEN COALESCE(li.monto_adjudicado, 0) ELSE 0 END)          AS total_adj,
            SUM(COALESCE((o->>'valor_total_ofertado')::numeric, 0))         AS total_ofertado
        FROM licitaciones_items li
        JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE o->>'rut' != '{LBF_RUT}'
          AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
        GROUP BY o->>'nombre', o->>'rut'
        ORDER BY total_adj DESC
        LIMIT 20
    """)
    top20 = []
    for row in cur.fetchall():
        comp_of   = int(row[2] or 0)
        comp_adj  = int(row[3] or 0)
        comp_tadj = float(row[5] or 0)
        top20.append({
            "competidor":    row[0] or "Sin nombre",
            "ids_part":      int(row[1] or 0),
            "ofertas":       comp_of,
            "ofertas_adj":   comp_adj,
            "ids_adj":       int(row[4] or 0),
            "total_adj":     round(comp_tadj),
            "total_ofertado":round(float(row[6] or 0)),
            "efectividad":   round(comp_adj / comp_of * 100, 1) if comp_of > 0 else 0,
            "part_valor":    round(comp_tadj / mkt_valor * 100, 1) if mkt_valor > 0 else 0,
        })

    conn.close()

    return {
        "ano":   ano,
        "tipo":  tipo or "todos",
        "lbf": {
            "ids_participadas":  ids_part,
            "ids_adjudicadas":   ids_adj,
            "ofertas_realizadas":of_real,
            "ofertas_con_precio":of_precio,
            "ofertas_adj":       of_adj,
            "total_adj":         round(total_adj),
            "total_participado": round(total_part),
            "efectividad_items": ef_items,
            "efectividad_lics":  ef_lics,
            "part_ids":          part_ids,
            "part_valor":        part_valor,
        },
        "mercado": {
            "ids_total":  mkt_ids,
            "items_total":mkt_items,
            "valor_total":round(mkt_valor),
        },
        "top20": top20,
    }


@router.get("/participacion")
async def get_participacion(
    ano:  int = Query(2026),
    tipo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:participacion:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_participacion(ano, tipo)
    mem_set(ck, data)
    return data
