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


def _load_participacion(ano: int, tipo: str) -> dict:
    tf = _tipo_filter(tipo)
    conn = get_pg_conn()
    cur = conn.cursor()

    # ── KPIs LBF — participación (ítems ofertados via JSONB) ──────────────────
    cur.execute(f"""
        WITH lbf_items AS (
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        )
        SELECT
            COUNT(DISTINCT licitacion_id)                              AS ids_participadas,
            COUNT(item_id)                                             AS ofertas_realizadas,
            COUNT(CASE WHEN monto_ofertado > 0 THEN 1 END)            AS ofertas_con_precio,
            SUM(monto_ofertado)                                        AS total_ofertado
        FROM lbf_items
    """)
    r = cur.fetchone()
    ids_part   = int(r[0] or 0)
    of_real    = int(r[1] or 0)
    of_precio  = int(r[2] or 0)
    total_part = float(r[3] or 0)

    # ── KPIs LBF — adjudicaciones (método combinado JSONB + rut_proveedor_adj) ─
    #
    # Método 1: ítems donde LBF aparece en JSONB con seleccionada=true.
    # Monto: COALESCE(o.monto_adjudicado, o.total) según formato del JSONB.
    #
    # Método 2: ítems donde rut_proveedor_adj = LBF pero el JSONB no refleja
    # la adjudicación (data quality issue en la fuente). Monto: precio_unit × cantidad.
    cur.execute(f"""
        WITH adj_jsonb AS (
            -- Método 1: JSONB seleccionada=true
            SELECT
                li.licitacion_id,
                li.id AS item_id,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                ) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        adj_rut AS (
            -- Método 2: rut_proveedor_adj sin cobertura JSONB
            SELECT
                li.licitacion_id,
                li.id AS item_id,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        all_adj AS (
            SELECT * FROM adj_jsonb
            UNION ALL
            SELECT * FROM adj_rut
        )
        SELECT
            COUNT(item_id)                                       AS ofertas_adj,
            COUNT(DISTINCT licitacion_id)                        AS ids_adj,
            SUM(monto_adj)                                       AS total_adj
        FROM all_adj
    """)
    r = cur.fetchone()
    of_adj    = int(r[0] or 0)
    ids_adj   = int(r[1] or 0)
    total_adj = float(r[2] or 0)

    ef_items = round(of_adj / of_real * 100, 1) if of_real > 0 else 0
    ef_lics  = round(ids_adj / ids_part * 100, 1) if ids_part > 0 else 0

    # ── Mercado total (misma categoría y filtro tipo) ─────────────────────────
    # Combina rut_proveedor_adj (datos modernos) con JSONB seleccionada (datos 2024/2025
    # donde rut_proveedor_adj puede estar vacío).
    def _mkt_query(year_val: int) -> str:
        # Tres caminos para capturar todos los años:
        # 1. rut_proveedor_adj poblado (datos modernos 2026): monto_adjudicado × cantidad
        # 2. JSONB seleccionada=true (datos 2024): monto_adjudicado o total del JSONB
        # 3. monto_adjudicado > 0 sin los marcadores anteriores (datos 2025)
        return f"""
            SELECT
                COUNT(DISTINCT li.licitacion_id)   AS ids_total,
                COUNT(DISTINCT li.id)              AS items_total,
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
                )                                  AS valor_total_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {year_val}
              {tf}
              AND (
                  li.rut_proveedor_adj IS NOT NULL
                  OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                      WHERE (o2->>'seleccionada')::boolean = true
                  )
                  OR li.monto_adjudicado > 0
              )
        """

    cur.execute(_mkt_query(ano))
    r = cur.fetchone()
    mkt_ids   = int(r[0] or 0)
    mkt_items = int(r[1] or 0)
    mkt_valor = float(r[2] or 0)

    part_ids   = round(ids_part / mkt_ids * 100, 1) if mkt_ids > 0 else 0
    part_valor = round(total_adj / mkt_valor * 100, 1) if mkt_valor > 0 else 0

    # ── Datos año anterior para comparativa ──────────────────────────────────
    prev_ano = ano - 1

    cur.execute(f"""
        WITH adj_j AS (
            SELECT COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS m
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}' AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {prev_ano}
              {tf}
        ),
        adj_r AS (
            SELECT li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS m
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {prev_ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        )
        SELECT SUM(m) FROM (SELECT * FROM adj_j UNION ALL SELECT * FROM adj_r) x
    """)
    r = cur.fetchone()
    total_adj_prev = round(float(r[0] or 0)) if r and r[0] else 0

    cur.execute(_mkt_query(prev_ano))
    r = cur.fetchone()
    mkt_valor_prev = round(float(r[2] or 0)) if r and r[2] else 0

    # ── Adj año actual procedente de lics publicadas en año anterior ─────────
    cur.execute(f"""
        WITH adj_j AS (
            SELECT li.licitacion_id,
                COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS m
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}' AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        adj_r AS (
            SELECT li.licitacion_id,
                li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS m
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        )
        SELECT SUM(a.m)
        FROM (SELECT * FROM adj_j UNION ALL SELECT * FROM adj_r) a
        JOIN licitaciones l ON l.id = a.licitacion_id
        WHERE EXTRACT(YEAR FROM l.fecha_publicacion) = {prev_ano}
    """)
    r = cur.fetchone()
    adj_from_prev_pub = round(float(r[0] or 0)) if r and r[0] else 0

    # ── Adjudicado LBF por tipo de licitación ────────────────────────────────
    cur.execute(f"""
        WITH adj_jsonb AS (
            SELECT li.licitacion_id, li.id AS item_id,
                   COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
        ),
        adj_rut AS (
            SELECT li.licitacion_id, li.id AS item_id,
                   li.monto_adjudicado * COALESCE(li.cantidad_adjudicada, li.cantidad) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            WHERE li.rut_proveedor_adj = '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}' AND (o2->>'seleccionada')::boolean = true
              )
        ),
        all_adj AS (SELECT * FROM adj_jsonb UNION ALL SELECT * FROM adj_rut)
        SELECT
            l.tipo,
            COUNT(DISTINCT a.licitacion_id) AS ids_adj,
            SUM(a.monto_adj)                AS total_adj
        FROM all_adj a
        JOIN licitaciones l ON l.id = a.licitacion_id
        GROUP BY l.tipo
        ORDER BY total_adj DESC
    """)
    por_tipo = []
    for row in cur.fetchall():
        por_tipo.append({
            "tipo":     row[0] or "?",
            "ids_adj":  int(row[1] or 0),
            "total_adj": round(float(row[2] or 0)),
        })

    # ── Top 20 competidores en las mismas licitaciones donde participó LBF ────
    # Para adj de competidores: JSONB monto_adjudicado/total (tiene los totales correctos
    # para grandes contratos marco). rut_proveedor_adj × cant da el precio unitario,
    # no el total, para la mayoría de empresas grandes.
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
        lbf_adj_jsonb AS (
            -- LBF adjudicado por licitacion (método JSONB)
            SELECT li.licitacion_id,
                   COALESCE(NULLIF((o->>'monto_adjudicado')::numeric,0),(o->>'total')::numeric,0) AS monto
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}' AND (o->>'seleccionada')::boolean = true
        ),
        lbf_adj_rut AS (
            -- LBF adjudicado por licitacion (método rut_proveedor_adj)
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
                ))                                                               AS total_ofertado,
                -- licitaciones donde este competidor participa
                array_agg(DISTINCT li.licitacion_id)                             AS lics_array
            FROM licitaciones_items li
            JOIN lbf_lics ll ON ll.licitacion_id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' != '{LBF_RUT}'
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
            GROUP BY o->>'rut'
            ORDER BY total_adj DESC
            LIMIT 20
        )
        SELECT
            c.competidor, c.rut, c.ids_part, c.ofertas, c.ofertas_adj,
            c.ids_adj, c.total_adj, c.total_ofertado,
            COALESCE((
                SELECT SUM(lbf_monto)
                FROM lbf_adj_per_lic
                WHERE licitacion_id = ANY(c.lics_array)
            ), 0) AS lbf_adj_compartido
        FROM comp_data c
    """)
    # columnas: competidor(0), rut(1), ids_part(2), ofertas(3),
    #           ofertas_adj(4), ids_adj(5), total_adj(6), total_ofertado(7), lbf_adj_compartido(8)
    top20 = []
    for row in cur.fetchall():
        comp_name  = row[0] or "Sin nombre"
        ids_part_c = int(row[2] or 0)
        of_tot_c   = int(row[3] or 0)
        of_adj_c   = int(row[4] or 0)
        ids_adj_c  = int(row[5] or 0)
        tadj_c     = float(row[6] or 0)
        of_c       = float(row[7] or 0)
        lbf_comp   = float(row[8] or 0)
        top20.append({
            "competidor":        comp_name,
            "rut":               str(row[1] or ""),
            "ids_part":          ids_part_c,
            "ofertas":           of_tot_c,
            "ofertas_adj":       of_adj_c,
            "ids_adj":           ids_adj_c,
            "total_adj":         round(tadj_c),
            "total_ofertado":    round(of_c),
            "lbf_adj_compartido":round(lbf_comp),
            "efectividad":       round(of_adj_c / of_tot_c * 100, 1) if of_tot_c > 0 else 0,
            "part_valor":        round(tadj_c / mkt_valor * 100, 1) if mkt_valor > 0 else 0,
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
            "total_adj_prev":    total_adj_prev,
            "adj_from_prev_pub": adj_from_prev_pub,
        },
        "mercado": {
            "ids_total":       mkt_ids,
            "items_total":     mkt_items,
            "valor_total":     round(mkt_valor),
            "valor_total_prev":mkt_valor_prev,
        },
        "top20":    top20,
        "por_tipo": por_tipo,
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
    try:
        data = _load_participacion(ano, tipo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "detalle": [], "top20": [], "por_tipo": []}


# ── /region ───────────────────────────────────────────────────────────────────

def _load_region(ano: int, tipo: str) -> list:
    tf = _tipo_filter(tipo)
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
    ano:  int = Query(2026),
    tipo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:region:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_region(ano, tipo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


# ── /clientes ─────────────────────────────────────────────────────────────────

def _load_clientes(ano: int, tipo: str) -> list:
    tf = _tipo_filter(tipo)
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
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
    ano:  int = Query(2026),
    tipo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:clientes:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_clientes(ano, tipo)
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
        "comp_rut":       comp_rut,
        "comp_nombre":    comp_nombre,
        "ids_compartidas": len(rows),
        "lbf_total":      round(lbf_total),
        "comp_total":     round(comp_total),
        "lbf_lics_adj":   lbf_lics_adj,
        "comp_lics_adj":  comp_lics_adj,
        "licitaciones":   licitaciones,
    }


# ── /evolucion ────────────────────────────────────────────────────────────────

def _load_evolucion(ano: int, tipo: str) -> list:
    """Adjudicado LBF por mes×tipo para el año solicitado (método combinado JSONB + rut)."""
    tf = _tipo_filter(tipo)
    conn = get_pg_conn()
    cur = conn.cursor()

    cur.execute(f"""
        WITH adj_jsonb AS (
            SELECT
                EXTRACT(MONTH FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int AS mes,
                l.tipo,
                COALESCE(
                    NULLIF((o->>'monto_adjudicado')::numeric, 0),
                    (o->>'total')::numeric,
                    0
                ) AS monto_adj
            FROM licitaciones_items li
            JOIN licitaciones l ON l.id = li.licitacion_id
            CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
            WHERE o->>'rut' = '{LBF_RUT}'
              AND (o->>'seleccionada')::boolean = true
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
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
              AND upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
              AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
              {tf}
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(li.oferentes) o2
                  WHERE o2->>'rut' = '{LBF_RUT}'
                    AND (o2->>'seleccionada')::boolean = true
              )
        ),
        all_adj AS (SELECT * FROM adj_jsonb UNION ALL SELECT * FROM adj_rut)
        SELECT mes, tipo, SUM(monto_adj) AS total_adj
        FROM all_adj
        GROUP BY mes, tipo
        ORDER BY mes, total_adj DESC
    """)

    MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    rows = cur.fetchall()
    conn.close()

    # Organizar por mes: {mes_num -> {tipo -> monto}}
    from collections import defaultdict
    by_mes: dict = defaultdict(dict)
    for mes_num, t, adj in rows:
        by_mes[int(mes_num)][t or "?"] = round(float(adj or 0))

    return [
        {
            "mes":       MESES[m - 1],
            "mes_num":   m,
            "total_adj": sum(by_mes[m].values()) if m in by_mes else 0,
            "tipos":     [{"tipo": t, "adj": v} for t, v in by_mes[m].items()] if m in by_mes else [],
        }
        for m in range(1, 13)
    ]


@router.get("/evolucion")
async def get_evolucion(
    ano:  int = Query(2026),
    tipo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"mp:evolucion:{ano}:{tipo}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_evolucion(ano, tipo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


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

        mes_filter = f"AND EXTRACT(MONTH FROM ca.fecha_publicacion) = {mes}" if mes > 0 else ""

        cur.execute(f"""
            SELECT ca.codigo, ca.nombre, ca.organismo_comprador, ca.estado,
                   ca.proveedor_adjudicado, ca.monto_adjudicado,
                   c.monto_ofertado, c.seleccionado,
                   EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS mes,
                   ca.presupuesto_estimado
            FROM compras_agiles_cotizantes c
            JOIN compras_agiles ca ON ca.codigo = c.codigo_cotizacion
            WHERE c.rut_proveedor = '{LBF_RUT}'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
              {mes_filter}
            ORDER BY ca.fecha_publicacion DESC
        """)
        rows = cur.fetchall()

        from collections import defaultdict
        by_mes: dict = defaultdict(lambda: {"total": 0, "adjudicadas": 0, "desiertas": 0})
        for r in rows:
            m = r[8] or 0
            by_mes[m]["total"] += 1
            if r[7]:
                by_mes[m]["adjudicadas"] += 1
            if "desierta" in (r[3] or "").lower():
                by_mes[m]["desiertas"] += 1

        mensual = [
            {"mes": m, "mes_nombre": MESES_AG[m], **v}
            for m, v in sorted(by_mes.items()) if m > 0
        ]

        lbf_cotizaciones = []
        for r in rows[:50]:
            cur.execute("""
                SELECT nombre_producto, cantidad, unidad_medida
                FROM compras_agiles_items WHERE codigo_cotizacion = %s
            """, (r[0],))
            items = [
                {"producto": i[0], "descripcion": "", "cantidad": float(i[1] or 0), "unidad": i[2] or "", "codigo_producto": ""}
                for i in cur.fetchall()
            ]
            cur.execute(f"""
                SELECT razon_social, rut_proveedor, monto_ofertado, seleccionado
                FROM compras_agiles_cotizantes
                WHERE codigo_cotizacion = %s AND rut_proveedor != '{LBF_RUT}'
                ORDER BY seleccionado DESC, monto_ofertado ASC
            """, (r[0],))
            cotizantes = [
                {"empresa": c[0], "rut": c[1], "monto": float(c[2] or 0), "seleccionado": bool(c[3])}
                for c in cur.fetchall()
            ]
            lbf_cotizaciones.append({
                "codigo": str(r[0] or ""), "nombre": str(r[1] or ""),
                "institucion": str(r[2] or ""), "estado": str(r[3] or ""),
                "seleccionado": bool(r[7]),
                "monto_ofertado": round(float(r[6] or 0)),
                "proveedor_ganador": r[4],
                "monto_ganador": round(float(r[5] or 0)),
                "items": items, "cotizantes": cotizantes,
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

        adj = sum(1 for r in rows if r[7])
        desiertas = sum(1 for r in rows if "desierta" in (r[3] or "").lower())
        return {
            "kpis": {
                "total_cotizaciones": len(rows), "adjudicadas": adj, "desiertas": desiertas,
                "presupuesto": round(sum(float(r[9] or 0) for r in rows)),
                "adjudicado": round(sum(float(r[5] or 0) for r in rows if r[7])),
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
    ck = f"mp:seg_llamado:{ano}:{mes}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_segundo_llamado(ano, mes)
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
