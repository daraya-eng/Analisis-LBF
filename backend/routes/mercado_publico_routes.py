"""
Mercado Publico — Market position analysis for LBF in medical supplies.
Source: PostgreSQL mercado_publico DB (ordenes_compra + ordenes_compra_items).
Channels: SE (Licitaciones), CM (Convenio Marco), TD (Trato Directo).
Compra Agil: primer/segundo llamado from compras_agiles + ordenes_compra AG.
"""
import re
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn as get_sql_conn
from db_mp import get_pg_conn, MEDICAL_CAT, LBF_NAME, CHANNELS
from cache import mem_get, mem_set

router = APIRouter()

MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

# Monto items: recent months have monto_total=NULL, fallback to cantidad*precio
_MONTO = "COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _channel_filter(canal: str) -> str:
    tc = CHANNELS.get(canal, canal.upper())
    return f"oc.tipo_compra = '{tc}'"


def _direct_competition_filter(cur, ano: int) -> str:
    """
    Build a WHERE fragment that restricts to subcategories (Level 2)
    where LBF actually sells. This narrows from the broad category 42
    to LBF's direct competitive space.
    """
    cur.execute(f"""
        SELECT DISTINCT SPLIT_PART(oi.categoria, ' / ', 2) AS subcat
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})
          AND SPLIT_PART(oi.categoria, ' / ', 2) != ''
    """)
    subcats = [r[0] for r in cur.fetchall()]
    if not subcats:
        return "TRUE"
    quoted = ", ".join(f"'{s}'" for s in subcats)
    return f"SPLIT_PART(oi.categoria, ' / ', 2) IN ({quoted})"


# ═══════════════════════════════════════════════════════════════════
# 1. Overview (SE, CM, TD)
# ═══════════════════════════════════════════════════════════════════

def _load_overview(ano: int, canal: str) -> dict:
    conn = get_pg_conn()
    cur = conn.cursor()
    cf = _channel_filter(canal)
    ano_prev = ano - 1

    # ── Subcategory breakdown (LBF lines) ──
    cur.execute(f"""
        SELECT
            SPLIT_PART(oi.categoria, ' / ', 2) AS subcategoria,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto_total,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                THEN {_MONTO} ELSE 0 END), 0)::bigint AS monto_lbf,
            COUNT(DISTINCT oc.id) AS n_ocs
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {cf}
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
          AND SPLIT_PART(oi.categoria, ' / ', 2) != ''
        GROUP BY SPLIT_PART(oi.categoria, ' / ', 2)
        HAVING SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                   THEN {_MONTO} ELSE 0 END) > 0
        ORDER BY monto_lbf DESC
    """)
    subcategorias = []
    for r in cur.fetchall():
        mt = int(r[1] or 0)
        ml = int(r[2] or 0)
        subcategorias.append({
            "subcategoria": (r[0] or "").strip(),
            "mercado": mt,
            "lbf": ml,
            "share": round(ml / mt * 100, 2) if mt > 0 else 0,
            "n_ocs": r[3] or 0,
        })

    # Build direct competition subcat filter
    dc_filter = _direct_competition_filter(cur, ano)

    # ── KPIs (direct competition only) ──
    cur.execute(f"""
        SELECT
            COALESCE(SUM({_MONTO}), 0)::bigint AS mercado_total,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                THEN {_MONTO} ELSE 0 END), 0)::bigint AS lbf_total,
            COUNT(DISTINCT oc.id) AS total_ocs,
            COUNT(DISTINCT CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%' THEN oc.id END) AS lbf_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS total_instituciones,
            COUNT(DISTINCT CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%' THEN oc.comprador_rut_unidad END) AS lbf_instituciones
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {cf}
          AND {dc_filter}
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
    """)
    r = cur.fetchone()
    mercado_total = int(r[0] or 0)
    lbf_total = int(r[1] or 0)
    total_ocs = r[2] or 0
    lbf_ocs = r[3] or 0
    total_inst = r[4] or 0
    lbf_inst = r[5] or 0
    share = round(lbf_total / mercado_total * 100, 2) if mercado_total > 0 else 0

    # ── Previous year (for growth) ──
    cur.execute(f"""
        SELECT
            COALESCE(SUM({_MONTO}), 0)::bigint,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                THEN {_MONTO} ELSE 0 END), 0)::bigint
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {cf}
          AND {dc_filter}
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano_prev}
    """)
    rp = cur.fetchone()
    mercado_prev = int(rp[0] or 0)
    lbf_prev = int(rp[1] or 0)
    growth_mercado = round((mercado_total - mercado_prev) / mercado_prev * 100, 1) if mercado_prev > 0 else None
    growth_lbf = round((lbf_total - lbf_prev) / lbf_prev * 100, 1) if lbf_prev > 0 else None

    # ── LBF ranking (direct competition) ──
    cur.execute(f"""
        WITH proveedores AS (
            SELECT oc.proveedor_nombre_empresa AS empresa,
                   SUM({_MONTO}) AS monto
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND {cf}
              AND {dc_filter}
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
            GROUP BY oc.proveedor_nombre_empresa
        )
        SELECT COUNT(*) + 1
        FROM proveedores
        WHERE monto > (
            SELECT COALESCE(SUM(monto), 0) FROM proveedores
            WHERE LOWER(empresa) LIKE '%%lbf%%'
        )
    """)
    ranking = cur.fetchone()[0] or 0

    cur.execute(f"""
        SELECT COUNT(DISTINCT oc.proveedor_nombre_empresa)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {cf}
          AND {dc_filter}
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
    """)
    total_proveedores = cur.fetchone()[0] or 0

    kpis = {
        "mercado_total": mercado_total,
        "lbf_total": lbf_total,
        "share": share,
        "ranking": ranking,
        "total_proveedores": total_proveedores,
        "total_ocs": total_ocs,
        "lbf_ocs": lbf_ocs,
        "total_instituciones": total_inst,
        "lbf_instituciones": lbf_inst,
        "growth_mercado": growth_mercado,
        "growth_lbf": growth_lbf,
        "mercado_prev": mercado_prev,
        "lbf_prev": lbf_prev,
    }

    # ── Monthly trend (direct competition) ──
    for year_label, year_val in [("cur", ano), ("prev", ano_prev)]:
        cur.execute(f"""
            SELECT
                EXTRACT(MONTH FROM oc.fecha_envio)::int AS mes,
                COALESCE(SUM({_MONTO}), 0)::bigint,
                COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                    THEN {_MONTO} ELSE 0 END), 0)::bigint
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND {cf}
              AND {dc_filter}
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {year_val}
            GROUP BY EXTRACT(MONTH FROM oc.fecha_envio)
            ORDER BY mes
        """)
        if year_label == "cur":
            trend_cur = {int(r[0]): {"mercado": int(r[1]), "lbf": int(r[2])} for r in cur.fetchall()}
        else:
            trend_prev = {int(r[0]): {"mercado": int(r[1]), "lbf": int(r[2])} for r in cur.fetchall()}

    tendencia = []
    for m in range(1, 13):
        cur_m = trend_cur.get(m, {"mercado": 0, "lbf": 0})
        prev_m = trend_prev.get(m, {"mercado": 0, "lbf": 0})
        g_mkt = round((cur_m["mercado"] - prev_m["mercado"]) / prev_m["mercado"] * 100, 1) if prev_m["mercado"] > 0 else None
        g_lbf = round((cur_m["lbf"] - prev_m["lbf"]) / prev_m["lbf"] * 100, 1) if prev_m["lbf"] > 0 else None
        share_m = round(cur_m["lbf"] / cur_m["mercado"] * 100, 2) if cur_m["mercado"] > 0 else 0
        tendencia.append({
            "mes": m, "mes_nombre": MESES[m - 1],
            "mercado": cur_m["mercado"], "lbf": cur_m["lbf"],
            "mercado_prev": prev_m["mercado"], "lbf_prev": prev_m["lbf"],
            "growth_mercado": g_mkt, "growth_lbf": g_lbf, "share": share_m,
        })

    # ── Top 20 competitors (direct competition) ──
    cur.execute(f"""
        SELECT
            oc.proveedor_nombre_empresa AS empresa,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
            COUNT(DISTINCT oc.id) AS n_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS n_instituciones
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {cf}
          AND {dc_filter}
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY oc.proveedor_nombre_empresa
        ORDER BY monto DESC
        LIMIT 20
    """)
    competidores = []
    for r in cur.fetchall():
        m = int(r[1] or 0)
        competidores.append({
            "empresa": (r[0] or "").strip(),
            "monto": m,
            "share": round(m / mercado_total * 100, 2) if mercado_total > 0 else 0,
            "n_ocs": r[2] or 0,
            "n_instituciones": r[3] or 0,
        })

    conn.close()
    return {
        "ano": ano, "canal": canal,
        "kpis": kpis, "tendencia": tendencia,
        "competidores": competidores, "subcategorias": subcategorias,
    }


# ═══════════════════════════════════════════════════════════════════
# 2. Compra Agil
# ═══════════════════════════════════════════════════════════════════

def _load_compra_agil(ano: int) -> dict:
    """
    Compra Agil analysis:
    - Primer llamado: who sells LBF's product types, top providers
    - Segundo llamado: LBF participation, adjudication
    - OC data from ordenes_compra tipo_compra='AG'
    """
    conn = get_pg_conn()
    cur = conn.cursor()
    ano_prev = ano - 1

    # ── KPIs from OCs (historical purchase orders) ──
    cur.execute(f"""
        SELECT
            COALESCE(SUM({_MONTO}), 0)::bigint AS mercado_total,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                THEN {_MONTO} ELSE 0 END), 0)::bigint AS lbf_total,
            COUNT(DISTINCT oc.id) AS total_ocs,
            COUNT(DISTINCT CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%' THEN oc.id END) AS lbf_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS total_instituciones,
            COUNT(DISTINCT CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%' THEN oc.comprador_rut_unidad END) AS lbf_instituciones
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.tipo_compra = 'AG'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
    """)
    r = cur.fetchone()
    mercado_total = int(r[0] or 0)
    lbf_total = int(r[1] or 0)
    share = round(lbf_total / mercado_total * 100, 2) if mercado_total > 0 else 0

    # Previous year
    cur.execute(f"""
        SELECT
            COALESCE(SUM({_MONTO}), 0)::bigint,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                THEN {_MONTO} ELSE 0 END), 0)::bigint
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.tipo_compra = 'AG'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano_prev}
    """)
    rp = cur.fetchone()
    mercado_prev = int(rp[0] or 0)
    lbf_prev = int(rp[1] or 0)

    kpis = {
        "mercado_total": mercado_total,
        "lbf_total": lbf_total,
        "share": share,
        "total_ocs": r[2] or 0,
        "lbf_ocs": r[3] or 0,
        "total_instituciones": r[4] or 0,
        "lbf_instituciones": r[5] or 0,
        "growth_mercado": round((mercado_total - mercado_prev) / mercado_prev * 100, 1) if mercado_prev > 0 else None,
        "growth_lbf": round((lbf_total - lbf_prev) / lbf_prev * 100, 1) if lbf_prev > 0 else None,
    }

    # ── Primer Llamado: who sells LBF's product types ──
    # First, identify product types (Level 3) where LBF sells via AG
    cur.execute(f"""
        SELECT DISTINCT SPLIT_PART(oi.categoria, ' / ', 3) AS prod_type
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
          AND oc.tipo_compra = 'AG'
          AND SPLIT_PART(oi.categoria, ' / ', 3) != ''
    """)
    lbf_prod_types = [r[0] for r in cur.fetchall()]

    # Top providers in LBF's product types (primer llamado competitors)
    primer_llamado = []
    if lbf_prod_types:
        quoted = ", ".join(f"'{t}'" for t in lbf_prod_types)
        cur.execute(f"""
            SELECT
                oc.proveedor_nombre_empresa AS empresa,
                COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
                COUNT(DISTINCT oc.id) AS n_ocs,
                COUNT(DISTINCT oc.comprador_rut_unidad) AS n_instituciones
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.tipo_compra = 'AG'
              AND SPLIT_PART(oi.categoria, ' / ', 3) IN ({quoted})
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
            GROUP BY oc.proveedor_nombre_empresa
            ORDER BY monto DESC
            LIMIT 20
        """)
        mkt_total_pl = 0
        rows_pl = cur.fetchall()
        for r in rows_pl:
            mkt_total_pl += int(r[1] or 0)
        for r in rows_pl:
            m = int(r[1] or 0)
            primer_llamado.append({
                "empresa": (r[0] or "").strip(),
                "monto": m,
                "share": round(m / mkt_total_pl * 100, 2) if mkt_total_pl > 0 else 0,
                "n_ocs": r[2] or 0,
                "n_instituciones": r[3] or 0,
            })

    # ── Breakdown by product type: LBF vs Market in AG ──
    productos_ag = []
    if lbf_prod_types:
        quoted = ", ".join(f"'{t}'" for t in lbf_prod_types)
        cur.execute(f"""
            SELECT
                SPLIT_PART(oi.categoria, ' / ', 3) AS prod_type,
                COALESCE(SUM({_MONTO}), 0)::bigint AS mercado,
                COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                    THEN {_MONTO} ELSE 0 END), 0)::bigint AS lbf,
                COUNT(DISTINCT oc.id) AS n_ocs
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.tipo_compra = 'AG'
              AND SPLIT_PART(oi.categoria, ' / ', 3) IN ({quoted})
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
            GROUP BY SPLIT_PART(oi.categoria, ' / ', 3)
            ORDER BY mercado DESC
        """)
        for r in cur.fetchall():
            mt = int(r[1] or 0)
            ml = int(r[2] or 0)
            productos_ag.append({
                "producto": (r[0] or "").strip(),
                "mercado": mt,
                "lbf": ml,
                "share": round(ml / mt * 100, 2) if mt > 0 else 0,
                "n_ocs": r[3] or 0,
            })

    # ── Segundo Llamado: from compras_agiles table ──
    # Summary by convocatoria state
    cur.execute(f"""
        SELECT
            ca.estado_convocatoria,
            COUNT(*) AS n_cotizaciones,
            COALESCE(SUM(ca.presupuesto_estimado), 0)::bigint AS presupuesto,
            COALESCE(SUM(ca.monto_adjudicado), 0)::bigint AS adjudicado,
            COUNT(CASE WHEN ca.estado = 'Proveedor seleccionado' THEN 1 END) AS adjudicadas,
            COUNT(CASE WHEN ca.estado = 'Desierta' THEN 1 END) AS desiertas,
            COUNT(CASE WHEN ca.estado = 'Cancelada' THEN 1 END) AS canceladas
        FROM compras_agiles ca
        JOIN compras_agiles_items cai ON cai.codigo_cotizacion = ca.codigo
        WHERE LEFT(cai.codigo_producto, 2) = '42'
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
        GROUP BY ca.estado_convocatoria
        ORDER BY ca.estado_convocatoria
    """)
    llamados = []
    for r in cur.fetchall():
        llamados.append({
            "llamado": int(r[0]) if r[0] else 0,
            "n_cotizaciones": r[1] or 0,
            "presupuesto": int(r[2] or 0),
            "adjudicado": int(r[3] or 0),
            "adjudicadas": r[4] or 0,
            "desiertas": r[5] or 0,
            "canceladas": r[6] or 0,
        })

    # ── Top cotizantes in segundo llamado (medical) ──
    cur.execute(f"""
        SELECT
            cac.razon_social AS empresa,
            COUNT(DISTINCT cac.codigo_cotizacion) AS participaciones,
            SUM(CASE WHEN cac.seleccionado THEN 1 ELSE 0 END) AS seleccionado
        FROM compras_agiles_cotizantes cac
        JOIN compras_agiles ca ON ca.codigo = cac.codigo_cotizacion
        JOIN compras_agiles_items cai ON cai.codigo_cotizacion = ca.codigo
        WHERE LEFT(cai.codigo_producto, 2) = '42'
          AND ca.estado_convocatoria = 2
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
        GROUP BY cac.razon_social
        ORDER BY participaciones DESC
        LIMIT 20
    """)
    seg_llamado_proveedores = []
    for r in cur.fetchall():
        seg_llamado_proveedores.append({
            "empresa": (r[0] or "").strip(),
            "participaciones": r[1] or 0,
            "seleccionado": r[2] or 0,
        })

    # ── LBF in cotizantes (segundo llamado) ──
    cur.execute(f"""
        SELECT
            cac.codigo_cotizacion,
            ca.nombre,
            cac.monto_ofertado::bigint,
            cac.seleccionado,
            ca.proveedor_adjudicado,
            ca.monto_adjudicado::bigint,
            ca.estado
        FROM compras_agiles_cotizantes cac
        JOIN compras_agiles ca ON ca.codigo = cac.codigo_cotizacion
        WHERE cac.razon_social ILIKE '%%lbf%%'
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
        ORDER BY cac.monto_ofertado DESC
    """)
    lbf_cotizaciones = []
    for r in cur.fetchall():
        lbf_cotizaciones.append({
            "codigo": r[0] or "",
            "nombre": (r[1] or "").strip(),
            "monto_ofertado": int(r[2] or 0),
            "seleccionado": bool(r[3]),
            "proveedor_ganador": (r[4] or "").strip(),
            "monto_ganador": int(r[5] or 0),
            "estado": (r[6] or "").strip(),
        })

    # ── Monthly trend AG from OCs ──
    for year_label, year_val in [("cur", ano), ("prev", ano_prev)]:
        cur.execute(f"""
            SELECT
                EXTRACT(MONTH FROM oc.fecha_envio)::int AS mes,
                COALESCE(SUM({_MONTO}), 0)::bigint,
                COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                    THEN {_MONTO} ELSE 0 END), 0)::bigint
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.tipo_compra = 'AG'
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {year_val}
            GROUP BY EXTRACT(MONTH FROM oc.fecha_envio)
            ORDER BY mes
        """)
        if year_label == "cur":
            trend_cur = {int(r[0]): {"mercado": int(r[1]), "lbf": int(r[2])} for r in cur.fetchall()}
        else:
            trend_prev = {int(r[0]): {"mercado": int(r[1]), "lbf": int(r[2])} for r in cur.fetchall()}

    tendencia = []
    for m in range(1, 13):
        cur_m = trend_cur.get(m, {"mercado": 0, "lbf": 0})
        prev_m = trend_prev.get(m, {"mercado": 0, "lbf": 0})
        g_mkt = round((cur_m["mercado"] - prev_m["mercado"]) / prev_m["mercado"] * 100, 1) if prev_m["mercado"] > 0 else None
        g_lbf = round((cur_m["lbf"] - prev_m["lbf"]) / prev_m["lbf"] * 100, 1) if prev_m["lbf"] > 0 else None
        share_m = round(cur_m["lbf"] / cur_m["mercado"] * 100, 2) if cur_m["mercado"] > 0 else 0
        tendencia.append({
            "mes": m, "mes_nombre": MESES[m - 1],
            "mercado": cur_m["mercado"], "lbf": cur_m["lbf"],
            "mercado_prev": prev_m["mercado"], "lbf_prev": prev_m["lbf"],
            "growth_mercado": g_mkt, "growth_lbf": g_lbf, "share": share_m,
        })

    conn.close()
    return {
        "ano": ano,
        "kpis": kpis,
        "tendencia": tendencia,
        "primer_llamado": primer_llamado,
        "productos_ag": productos_ag,
        "llamados": llamados,
        "segundo_llamado_proveedores": seg_llamado_proveedores,
        "lbf_cotizaciones": lbf_cotizaciones,
    }


# ═══════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/overview")
async def get_overview(
    ano: int = Query(2026),
    canal: str = Query("se"),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_overview:{canal}:{ano}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_overview(ano, canal)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "tendencia": [], "competidores": [], "subcategorias": []}


@router.get("/compra-agil")
async def get_compra_agil(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_ag:{ano}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_compra_agil(ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "tendencia": [], "primer_llamado": [],
                "productos_ag": [], "llamados": [], "segundo_llamado_proveedores": [],
                "lbf_cotizaciones": []}


# ═══════════════════════════════════════════════════════════════════
# 3. AG Resellers — Clients that buy from LBF and sell in AG
# ═══════════════════════════════════════════════════════════════════

def _normalize_rut(rut: str) -> str:
    """Strip dots, dashes, spaces → pure digits+K for matching."""
    return re.sub(r"[.\-\s]", "", (rut or "")).upper().lstrip("0")


def _load_ag_resellers(ano: int) -> dict:
    """
    Cross-reference SQL Server (LBF clients) with PostgreSQL (AG providers).
    LBF cannot participate in AG primer llamado — resellers buy from LBF
    and sell those products in AG.
    Includes monthly breakdown for current year.
    """
    # ── Step 1: LBF clients from SQL Server (YTD current year) ──
    sql_conn = get_sql_conn()
    sql_cur = sql_conn.cursor()

    # YTD totals
    sql_cur.execute(f"""
        SELECT RUT, NOMBRE, SUM(VENTA) AS total_venta
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND VENDEDOR NOT IN (
            '89-FACTURACION MUESTRA Y U OBSEQU',
            '90-FACTURACION USO INTERNO',
            '96-FACTURACION FALTANTES',
            '97-DONACIONES',
            '98-FACTURACION OTROS CONCEPTOS',
            '99-FACTURACION MERMAS'
          )
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY RUT, NOMBRE
        HAVING SUM(VENTA) > 0
    """)
    lbf_clients = {}
    for r in sql_cur.fetchall():
        raw_rut = str(r[0] or "").strip()
        norm = _normalize_rut(raw_rut)
        if not norm:
            continue
        venta = float(r[2] or 0)
        if norm in lbf_clients:
            lbf_clients[norm]["venta"] += venta
        else:
            lbf_clients[norm] = {
                "rut": raw_rut,
                "nombre_lbf": str(r[1] or "").strip(),
                "venta": venta,
            }

    # Monthly LBF purchases by client (current year)
    sql_cur.execute(f"""
        SELECT RUT, MONTH(DIA) AS mes, SUM(VENTA) AS venta
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND VENDEDOR NOT IN (
            '89-FACTURACION MUESTRA Y U OBSEQU',
            '90-FACTURACION USO INTERNO',
            '96-FACTURACION FALTANTES',
            '97-DONACIONES',
            '98-FACTURACION OTROS CONCEPTOS',
            '99-FACTURACION MERMAS'
          )
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY RUT, MONTH(DIA)
        HAVING SUM(VENTA) > 0
    """)
    lbf_monthly = {}  # norm_rut → {mes: venta}
    for r in sql_cur.fetchall():
        norm = _normalize_rut(str(r[0] or "").strip())
        if not norm:
            continue
        mes = int(r[1])
        lbf_monthly.setdefault(norm, {})[mes] = round(float(r[2] or 0))
    sql_conn.close()

    # ── Step 2: AG providers from PostgreSQL (current year) ──
    pg_conn = get_pg_conn()
    pg_cur = pg_conn.cursor()

    # YTD totals
    pg_cur.execute(f"""
        SELECT
            oc.proveedor_rut,
            oc.proveedor_nombre_empresa,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto_ag,
            COUNT(DISTINCT oc.id) AS n_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS n_instituciones
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY oc.proveedor_rut, oc.proveedor_nombre_empresa
        ORDER BY monto_ag DESC
    """)
    ag_providers = {}
    for r in pg_cur.fetchall():
        raw_rut = str(r[0] or "").strip()
        norm = _normalize_rut(raw_rut)
        if not norm:
            continue
        ag_providers[norm] = {
            "rut_mp": raw_rut,
            "nombre_mp": str(r[1] or "").strip(),
            "monto_ag": int(r[2] or 0),
            "n_ocs": r[3] or 0,
            "n_instituciones": r[4] or 0,
        }

    # Monthly AG sales by provider (current year)
    pg_cur.execute(f"""
        SELECT
            oc.proveedor_rut,
            EXTRACT(MONTH FROM oc.fecha_envio)::int AS mes,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY oc.proveedor_rut, EXTRACT(MONTH FROM oc.fecha_envio)
    """)
    ag_monthly = {}  # norm_rut → {mes: monto}
    for r in pg_cur.fetchall():
        norm = _normalize_rut(str(r[0] or "").strip())
        if not norm:
            continue
        mes = int(r[1])
        ag_monthly.setdefault(norm, {})[mes] = int(r[2] or 0)
    pg_conn.close()

    # ── Step 3: Match ──
    matches = []
    for norm_rut, client in lbf_clients.items():
        if norm_rut in ag_providers:
            prov = ag_providers[norm_rut]
            if "lbf" in prov["nombre_mp"].lower():
                continue
            # Build monthly arrays
            lbf_m = lbf_monthly.get(norm_rut, {})
            ag_m = ag_monthly.get(norm_rut, {})
            meses = []
            for m in range(1, 13):
                cl = lbf_m.get(m, 0)
                ca = ag_m.get(m, 0)
                if cl > 0 or ca > 0:
                    meses.append({"mes": m, "compra_lbf": cl, "venta_ag": ca})

            is_multiproducto = "multiproducto" in client["nombre_lbf"].lower() or "renhet" in prov["nombre_mp"].lower()
            matches.append({
                "rut": client["rut"],
                "nombre_lbf": client["nombre_lbf"],
                "nombre_mp": prov["nombre_mp"],
                "compra_lbf": round(client["venta"]),
                "venta_ag": prov["monto_ag"],
                "n_ocs_ag": prov["n_ocs"],
                "n_instituciones": prov["n_instituciones"],
                "destacado": is_multiproducto,
                "meses": meses,
            })

    matches.sort(key=lambda x: x["venta_ag"], reverse=True)

    total_compra = sum(m["compra_lbf"] for m in matches)
    total_venta_ag = sum(m["venta_ag"] for m in matches)

    return {
        "ano": ano,
        "total_resellers": len(matches),
        "total_compra_lbf": total_compra,
        "total_venta_ag": total_venta_ag,
        "resellers": matches[:50],
    }


# ═══════════════════════════════════════════════════════════════════
# 4. Multiproducto deep-dive — AG adjudications vs LBF purchases
# ═══════════════════════════════════════════════════════════════════

def _load_multiproducto_ag(ano: int) -> dict:
    """
    Deep-dive into Multiproducto/Renhet: what they buy from LBF vs
    what they sell in AG — by product category, to identify cases
    where they buy from competitors despite getting special LBF prices.
    """
    mp_rut_sql = "77619564"  # Multiproducto/Renhet without DV

    # ── LBF purchases by category (SQL Server) ──
    sql_conn = get_sql_conn()
    sql_cur = sql_conn.cursor()

    # By category YTD
    sql_cur.execute(f"""
        SELECT CATEGORIA, SUM(VENTA) AS venta, COUNT(DISTINCT CODIGO) AS n_prod
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND REPLACE(REPLACE(RUT, '.', ''), '-', '') LIKE '{mp_rut_sql}%%'
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY CATEGORIA
        ORDER BY SUM(VENTA) DESC
    """)
    cols = [d[0].strip() for d in sql_cur.description]
    lbf_categorias = []
    for r in sql_cur.fetchall():
        lbf_categorias.append({
            "categoria": str(r[0] or "Sin cat").strip(),
            "venta": round(float(r[1] or 0)),
            "n_productos": r[2] or 0,
        })

    # Top products they buy from LBF
    sql_cur.execute(f"""
        SELECT TOP 20 CODIGO, DESCRIPCION, CATEGORIA,
               SUM(VENTA) AS venta, SUM(CANT) AS cant
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND REPLACE(REPLACE(RUT, '.', ''), '-', '') LIKE '{mp_rut_sql}%%'
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY CODIGO, DESCRIPCION, CATEGORIA
        ORDER BY SUM(VENTA) DESC
    """)
    lbf_productos = []
    for r in sql_cur.fetchall():
        lbf_productos.append({
            "codigo": str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "categoria": str(r[2] or "").strip(),
            "venta": round(float(r[3] or 0)),
            "cantidad": int(r[4] or 0),
        })

    # Monthly LBF purchases
    sql_cur.execute(f"""
        SELECT MONTH(DIA) AS mes, SUM(VENTA) AS venta
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND REPLACE(REPLACE(RUT, '.', ''), '-', '') LIKE '{mp_rut_sql}%%'
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY MONTH(DIA)
        ORDER BY MONTH(DIA)
    """)
    lbf_mensual = {int(r[0]): round(float(r[1] or 0)) for r in sql_cur.fetchall()}
    sql_conn.close()

    # ── AG sales by category (PostgreSQL) ──
    pg_conn = get_pg_conn()
    pg_cur = pg_conn.cursor()
    mp_rut_pg = "77.619.564-2"

    # AG sales by product type (Level 3 — medical only)
    pg_cur.execute(f"""
        SELECT
            SPLIT_PART(oi.categoria, ' / ', 2) AS subcat,
            SPLIT_PART(oi.categoria, ' / ', 3) AS prod_type,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
            COUNT(DISTINCT oc.id) AS n_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS n_inst
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oc.proveedor_rut = '{mp_rut_pg}'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY SPLIT_PART(oi.categoria, ' / ', 2),
                 SPLIT_PART(oi.categoria, ' / ', 3)
        ORDER BY monto DESC
    """)
    ag_categorias = []
    for r in pg_cur.fetchall():
        ag_categorias.append({
            "subcategoria": (r[0] or "").strip(),
            "producto": (r[1] or "").strip(),
            "monto": int(r[2] or 0),
            "n_ocs": r[3] or 0,
            "n_instituciones": r[4] or 0,
        })

    # Monthly AG sales (medical only — consistent with resellers)
    pg_cur.execute(f"""
        SELECT
            EXTRACT(MONTH FROM oc.fecha_envio)::int AS mes,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
            COUNT(DISTINCT oc.id) AS n_ocs
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oc.proveedor_rut = '{mp_rut_pg}'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY EXTRACT(MONTH FROM oc.fecha_envio)
        ORDER BY mes
    """)
    ag_mensual = {int(r[0]): {"monto": int(r[1] or 0), "n_ocs": r[2] or 0} for r in pg_cur.fetchall()}

    # Who else sells in the SAME product types as Multiproducto in AG?
    # Get Multiproducto's top product types
    top_prod_types = [c["producto"] for c in ag_categorias[:10] if c["producto"]]
    competidores_mp = []
    if top_prod_types:
        quoted = ", ".join(f"'{t}'" for t in top_prod_types)
        pg_cur.execute(f"""
            SELECT
                oc.proveedor_nombre_empresa AS empresa,
                COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
                COUNT(DISTINCT oc.id) AS n_ocs
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oc.tipo_compra = 'AG'
              AND SPLIT_PART(oi.categoria, ' / ', 3) IN ({quoted})
              AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
              AND oc.proveedor_rut != '{mp_rut_pg}'
            GROUP BY oc.proveedor_nombre_empresa
            ORDER BY monto DESC
            LIMIT 15
        """)
        for r in pg_cur.fetchall():
            competidores_mp.append({
                "empresa": (r[0] or "").strip(),
                "monto": int(r[1] or 0),
                "n_ocs": r[2] or 0,
            })

    # Top institutions buying from Multiproducto in AG (medical)
    pg_cur.execute(f"""
        SELECT
            oc.comprador_nombre_unidad AS institucion,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto,
            COUNT(DISTINCT oc.id) AS n_ocs
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oc.proveedor_rut = '{mp_rut_pg}'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
        GROUP BY oc.comprador_nombre_unidad
        ORDER BY monto DESC
        LIMIT 15
    """)
    instituciones = []
    for r in pg_cur.fetchall():
        instituciones.append({
            "institucion": (r[0] or "").strip(),
            "monto": int(r[1] or 0),
            "n_ocs": r[2] or 0,
        })

    pg_conn.close()

    # Build monthly comparison
    mensual = []
    for m in range(1, 13):
        cl = lbf_mensual.get(m, 0)
        ag = ag_mensual.get(m, {})
        if cl > 0 or ag.get("monto", 0) > 0:
            mensual.append({
                "mes": m, "mes_nombre": MESES[m - 1],
                "compra_lbf": cl,
                "venta_ag": ag.get("monto", 0),
                "ocs_ag": ag.get("n_ocs", 0),
            })

    total_lbf = sum(lbf_mensual.values())
    total_ag = sum(v["monto"] for v in ag_mensual.values())

    return {
        "ano": ano,
        "nombre": "MULTIPRODUCTO SPA / COMERCIAL RENHET SPA",
        "rut": "77.619.564-2",
        "total_compra_lbf": total_lbf,
        "total_venta_ag": total_ag,
        "mensual": mensual,
        "lbf_categorias": lbf_categorias,
        "lbf_productos": lbf_productos,
        "ag_categorias": ag_categorias,
        "competidores": competidores_mp,
        "instituciones": instituciones,
    }


@router.get("/ag-resellers")
async def get_ag_resellers(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_ag_resellers:{ano}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_ag_resellers(ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "total_resellers": 0, "resellers": []}


@router.get("/ag-multiproducto")
async def get_ag_multiproducto(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_ag_multi:{ano}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_multiproducto_ag(ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# 5. Multiproducto monthly product-level detail
# ═══════════════════════════════════════════════════════════════════

def _load_mp_mes(ano: int, mes: int) -> dict:
    """
    For a specific month: what Multiproducto bought from LBF (with prices)
    vs what they sold in AG (with adjudication prices).
    Lets user verify if the 20% margin claim is real.
    """
    mp_rut_sql = "77619564"
    mp_rut_pg = "77.619.564-2"

    # ── Products bought from LBF this month (SQL Server) ──
    sql_conn = get_sql_conn()
    sql_cur = sql_conn.cursor()
    sql_cur.execute(f"""
        SELECT CODIGO, DESCRIPCION, CATEGORIA,
               SUM(CANT) AS cantidad,
               SUM(VENTA) AS venta,
               CASE WHEN SUM(CANT) > 0
                    THEN ROUND(SUM(VENTA) / SUM(CANT), 0)
                    ELSE 0 END AS precio_unit
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano} AND MONTH(DIA) = {mes}
          AND REPLACE(REPLACE(RUT, '.', ''), '-', '') LIKE '{mp_rut_sql}%%'
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
          AND VENTA > 0
        GROUP BY CODIGO, DESCRIPCION, CATEGORIA
        ORDER BY SUM(VENTA) DESC
    """)
    compras_lbf = []
    for r in sql_cur.fetchall():
        compras_lbf.append({
            "codigo": str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "categoria": str(r[2] or "").strip(),
            "cantidad": int(r[3] or 0),
            "venta": round(float(r[4] or 0)),
            "precio_unit": round(float(r[5] or 0)),
        })
    total_compra = sum(p["venta"] for p in compras_lbf)
    sql_conn.close()

    # ── Products sold in AG this month (PostgreSQL) — item-level detail ──
    pg_conn = get_pg_conn()
    pg_cur = pg_conn.cursor()

    pg_cur.execute(f"""
        SELECT
            COALESCE(NULLIF(oi.especificacion_comprador, ''), oi.nombre) AS desc_producto,
            oi.nombre AS tipo_producto,
            oi.cantidad,
            oi.precio_unitario,
            COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0) AS monto,
            oc.comprador_nombre_unidad AS institucion,
            oc.codigo AS oc_codigo
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oc.proveedor_rut = '{mp_rut_pg}'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
          AND EXTRACT(MONTH FROM oc.fecha_envio) = {mes}
        ORDER BY monto DESC NULLS LAST
    """)
    ventas_ag = []
    for r in pg_cur.fetchall():
        ventas_ag.append({
            "descripcion": (r[0] or "").strip()[:200],
            "tipo_producto": (r[1] or "").strip(),
            "cantidad": float(r[2] or 0),
            "precio_unit": round(float(r[3] or 0)),
            "monto": round(float(r[4] or 0)),
            "institucion": (r[5] or "").strip(),
            "oc": (r[6] or "").strip(),
        })
    total_ag = sum(p["monto"] for p in ventas_ag)
    pg_conn.close()

    return {
        "ano": ano, "mes": mes, "mes_nombre": MESES[mes - 1],
        "total_compra_lbf": total_compra,
        "total_venta_ag": total_ag,
        "n_productos_lbf": len(compras_lbf),
        "n_productos_ag": len(ventas_ag),
        "compras_lbf": compras_lbf,
        "ventas_ag": ventas_ag,
    }


@router.get("/ag-multiproducto-mes")
async def get_ag_multiproducto_mes(
    ano: int = Query(2026),
    mes: int = Query(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_ag_mes:{ano}:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_mp_mes(ano, mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# 6. Segundo Llamado — monthly detail
# ═══════════════════════════════════════════════════════════════════

def _load_segundo_llamado(ano: int, mes: int = 0) -> dict:
    """
    Segundo llamado (compras_agiles) where LBF can participate directly.
    mes=0 means YTD.
    Returns: cotizaciones summary, LBF participations, top competitors.
    """
    conn = get_pg_conn()
    cur = conn.cursor()

    mes_filter = f"AND EXTRACT(MONTH FROM ca.fecha_publicacion) = {mes}" if mes > 0 else ""

    # ── Summary by state ──
    cur.execute(f"""
        SELECT
            COUNT(*) AS total,
            COUNT(CASE WHEN ca.estado = 'Proveedor seleccionado' THEN 1 END) AS adjudicadas,
            COUNT(CASE WHEN ca.estado = 'Desierta' THEN 1 END) AS desiertas,
            COUNT(CASE WHEN ca.estado = 'Cancelada' THEN 1 END) AS canceladas,
            COALESCE(SUM(ca.presupuesto_estimado), 0)::bigint AS presupuesto,
            COALESCE(SUM(ca.monto_adjudicado), 0)::bigint AS adjudicado
        FROM compras_agiles ca
        JOIN compras_agiles_items cai ON cai.codigo_cotizacion = ca.codigo
        WHERE LEFT(cai.codigo_producto, 2) = '42'
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
          {mes_filter}
    """)
    r = cur.fetchone()
    kpis = {
        "total_cotizaciones": r[0] or 0,
        "adjudicadas": r[1] or 0,
        "desiertas": r[2] or 0,
        "canceladas": r[3] or 0,
        "presupuesto": int(r[4] or 0),
        "adjudicado": int(r[5] or 0),
    }

    # ── LBF participations with items ──
    cur.execute(f"""
        SELECT
            cac.codigo_cotizacion,
            ca.nombre,
            cac.monto_ofertado::bigint,
            cac.seleccionado,
            ca.proveedor_adjudicado,
            ca.monto_adjudicado::bigint,
            ca.estado,
            ca.organismo_comprador
        FROM compras_agiles_cotizantes cac
        JOIN compras_agiles ca ON ca.codigo = cac.codigo_cotizacion
        WHERE cac.razon_social ILIKE '%%lbf%%'
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
          {mes_filter}
        ORDER BY ca.fecha_publicacion DESC
    """)
    lbf_codes = []
    lbf_cotizaciones = []
    for r in cur.fetchall():
        code = r[0] or ""
        lbf_codes.append(code)
        lbf_cotizaciones.append({
            "codigo": code,
            "nombre": (r[1] or "").strip(),
            "monto_ofertado": int(r[2] or 0),
            "seleccionado": bool(r[3]),
            "proveedor_ganador": (r[4] or "").strip(),
            "monto_ganador": int(r[5] or 0),
            "estado": (r[6] or "").strip(),
            "institucion": (r[7] or "").strip(),
            "items": [],
            "cotizantes": [],
        })

    # Load items and cotizantes for each LBF cotización
    if lbf_codes:
        quoted_codes = ", ".join(f"'{c}'" for c in lbf_codes)

        # Items (product descriptions)
        cur.execute(f"""
            SELECT codigo_cotizacion, nombre_producto, descripcion, cantidad, unidad_medida, codigo_producto
            FROM compras_agiles_items
            WHERE codigo_cotizacion IN ({quoted_codes})
            ORDER BY codigo_cotizacion, correlativo
        """)
        items_by_code = {}
        for r in cur.fetchall():
            items_by_code.setdefault(r[0], []).append({
                "producto": (r[1] or "").strip(),
                "descripcion": (r[2] or "").strip(),
                "cantidad": r[3] or 0,
                "unidad": (r[4] or "").strip(),
                "codigo_producto": (r[5] or "").strip(),
            })

        # Other cotizantes (competitors for each quote)
        cur.execute(f"""
            SELECT codigo_cotizacion, razon_social, monto_ofertado, seleccionado
            FROM compras_agiles_cotizantes
            WHERE codigo_cotizacion IN ({quoted_codes})
              AND razon_social NOT ILIKE '%%lbf%%'
            ORDER BY codigo_cotizacion, seleccionado DESC, razon_social
        """)
        cot_by_code = {}
        for r in cur.fetchall():
            cot_by_code.setdefault(r[0], []).append({
                "empresa": (r[1] or "").strip(),
                "monto": int(r[2] or 0) if r[2] else None,
                "seleccionado": bool(r[3]),
            })

        for cot in lbf_cotizaciones:
            cot["items"] = items_by_code.get(cot["codigo"], [])
            cot["cotizantes"] = cot_by_code.get(cot["codigo"], [])

    # ── Top cotizantes (competitors) ──
    cur.execute(f"""
        SELECT
            cac.razon_social AS empresa,
            COUNT(DISTINCT cac.codigo_cotizacion) AS participaciones,
            SUM(CASE WHEN cac.seleccionado THEN 1 ELSE 0 END) AS seleccionado
        FROM compras_agiles_cotizantes cac
        JOIN compras_agiles ca ON ca.codigo = cac.codigo_cotizacion
        JOIN compras_agiles_items cai ON cai.codigo_cotizacion = ca.codigo
        WHERE LEFT(cai.codigo_producto, 2) = '42'
          AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
          {mes_filter}
        GROUP BY cac.razon_social
        ORDER BY participaciones DESC
        LIMIT 20
    """)
    competidores = []
    for r in cur.fetchall():
        competidores.append({
            "empresa": (r[0] or "").strip(),
            "participaciones": r[1] or 0,
            "seleccionado": r[2] or 0,
        })

    # ── Monthly summary (only when YTD) ──
    mensual = []
    if mes == 0:
        cur.execute(f"""
            SELECT
                EXTRACT(MONTH FROM ca.fecha_publicacion)::int AS m,
                COUNT(*) AS total,
                COUNT(CASE WHEN ca.estado = 'Proveedor seleccionado' THEN 1 END) AS adj,
                COUNT(CASE WHEN ca.estado = 'Desierta' THEN 1 END) AS des,
                COALESCE(SUM(ca.monto_adjudicado), 0)::bigint AS monto_adj
            FROM compras_agiles ca
            JOIN compras_agiles_items cai ON cai.codigo_cotizacion = ca.codigo
            WHERE LEFT(cai.codigo_producto, 2) = '42'
              AND EXTRACT(YEAR FROM ca.fecha_publicacion) = {ano}
            GROUP BY EXTRACT(MONTH FROM ca.fecha_publicacion)
            ORDER BY m
        """)
        for r in cur.fetchall():
            mensual.append({
                "mes": int(r[0]),
                "mes_nombre": MESES[int(r[0]) - 1],
                "total": r[1] or 0,
                "adjudicadas": r[2] or 0,
                "desiertas": r[3] or 0,
                "monto_adjudicado": int(r[4] or 0),
            })

    conn.close()
    return {
        "ano": ano, "mes": mes,
        "kpis": kpis,
        "lbf_cotizaciones": lbf_cotizaciones,
        "competidores": competidores,
        "mensual": mensual,
    }


@router.get("/segundo-llamado")
async def get_segundo_llamado(
    ano: int = Query(2026),
    mes: int = Query(0),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_seg_llamado:{ano}:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_segundo_llamado(ano, mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "lbf_cotizaciones": [], "competidores": [], "mensual": []}


# ═══════════════════════════════════════════════════════════════════
# 7. Resellers with optional month filter
# ═══════════════════════════════════════════════════════════════════

def _load_ag_resellers_mes(ano: int, mes: int) -> dict:
    """
    Same as _load_ag_resellers but filtered to a single month.
    Shows who bought from LBF and sold in AG in that specific month.
    """
    sql_conn = get_sql_conn()
    sql_cur = sql_conn.cursor()

    # LBF client purchases in this month
    sql_cur.execute(f"""
        SELECT RUT, NOMBRE, SUM(VENTA) AS venta
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano} AND MONTH(DIA) = {mes}
          AND VENDEDOR NOT IN (
            '89-FACTURACION MUESTRA Y U OBSEQU',
            '90-FACTURACION USO INTERNO',
            '96-FACTURACION FALTANTES',
            '97-DONACIONES',
            '98-FACTURACION OTROS CONCEPTOS',
            '99-FACTURACION MERMAS'
          )
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
        GROUP BY RUT, NOMBRE
        HAVING SUM(VENTA) > 0
    """)
    lbf_clients = {}
    for r in sql_cur.fetchall():
        norm = _normalize_rut(str(r[0] or "").strip())
        if not norm:
            continue
        lbf_clients[norm] = {
            "rut": str(r[0] or "").strip(),
            "nombre_lbf": str(r[1] or "").strip(),
            "venta": round(float(r[2] or 0)),
        }
    sql_conn.close()

    # AG providers in this month
    pg_conn = get_pg_conn()
    pg_cur = pg_conn.cursor()
    pg_cur.execute(f"""
        SELECT
            oc.proveedor_rut,
            oc.proveedor_nombre_empresa,
            COALESCE(SUM({_MONTO}), 0)::bigint AS monto_ag,
            COUNT(DISTINCT oc.id) AS n_ocs,
            COUNT(DISTINCT oc.comprador_rut_unidad) AS n_instituciones
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oc.tipo_compra = 'AG'
          AND oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
          AND EXTRACT(MONTH FROM oc.fecha_envio) = {mes}
        GROUP BY oc.proveedor_rut, oc.proveedor_nombre_empresa
        ORDER BY monto_ag DESC
    """)
    ag_providers = {}
    for r in pg_cur.fetchall():
        norm = _normalize_rut(str(r[0] or "").strip())
        if not norm:
            continue
        ag_providers[norm] = {
            "rut_mp": str(r[0] or "").strip(),
            "nombre_mp": str(r[1] or "").strip(),
            "monto_ag": int(r[2] or 0),
            "n_ocs": r[3] or 0,
            "n_instituciones": r[4] or 0,
        }
    pg_conn.close()

    # Match
    matches = []
    for norm_rut, client in lbf_clients.items():
        if norm_rut in ag_providers:
            prov = ag_providers[norm_rut]
            if "lbf" in prov["nombre_mp"].lower():
                continue
            is_mp = "multiproducto" in client["nombre_lbf"].lower() or "renhet" in prov["nombre_mp"].lower()
            matches.append({
                "rut": client["rut"],
                "nombre_lbf": client["nombre_lbf"],
                "nombre_mp": prov["nombre_mp"],
                "compra_lbf": client["venta"],
                "venta_ag": prov["monto_ag"],
                "n_ocs_ag": prov["n_ocs"],
                "n_instituciones": prov["n_instituciones"],
                "destacado": is_mp,
            })

    matches.sort(key=lambda x: x["venta_ag"], reverse=True)
    total_compra = sum(m["compra_lbf"] for m in matches)
    total_venta_ag = sum(m["venta_ag"] for m in matches)

    return {
        "ano": ano, "mes": mes, "mes_nombre": MESES[mes - 1],
        "total_resellers": len(matches),
        "total_compra_lbf": total_compra,
        "total_venta_ag": total_venta_ag,
        "resellers": matches[:50],
    }


@router.get("/ag-resellers-mes")
async def get_ag_resellers_mes(
    ano: int = Query(2026),
    mes: int = Query(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_ag_resellers_mes:{ano}:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_ag_resellers_mes(ano, mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "total_resellers": 0, "resellers": []}


# ═══════════════════════════════════════════════════════════════════
# 8. Reseller product detail — what they buy from LBF
# ═══════════════════════════════════════════════════════════════════

def _load_reseller_detalle(rut: str, ano: int) -> dict:
    """Product-level detail of what a reseller buys from LBF."""
    sql_conn = get_sql_conn()
    sql_cur = sql_conn.cursor()

    sql_cur.execute(f"""
        SELECT CODIGO, DESCRIPCION, CATEGORIA,
               MONTH(DIA) AS mes,
               SUM(CANT) AS cantidad,
               SUM(VENTA) AS venta,
               CASE WHEN SUM(CANT) > 0
                    THEN ROUND(SUM(VENTA) / SUM(CANT), 0)
                    ELSE 0 END AS precio_unit
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND RUT = '{rut}'
          AND VENDEDOR NOT IN (
            '89-FACTURACION MUESTRA Y U OBSEQU',
            '90-FACTURACION USO INTERNO',
            '96-FACTURACION FALTANTES',
            '97-DONACIONES',
            '98-FACTURACION OTROS CONCEPTOS',
            '99-FACTURACION MERMAS'
          )
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
          AND VENTA > 0
        GROUP BY CODIGO, DESCRIPCION, CATEGORIA, MONTH(DIA)
        ORDER BY MONTH(DIA), SUM(VENTA) DESC
    """)
    por_mes = []
    for r in sql_cur.fetchall():
        por_mes.append({
            "codigo": str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "categoria": str(r[2] or "").strip(),
            "mes": int(r[3]),
            "cantidad": int(r[4] or 0),
            "venta": round(float(r[5] or 0)),
            "precio_unit": round(float(r[6] or 0)),
        })

    # YTD totals by product
    sql_cur.execute(f"""
        SELECT CODIGO, DESCRIPCION, CATEGORIA,
               SUM(CANT) AS cantidad,
               SUM(VENTA) AS venta,
               CASE WHEN SUM(CANT) > 0
                    THEN ROUND(SUM(VENTA) / SUM(CANT), 0)
                    ELSE 0 END AS precio_unit
        FROM DW_TOTAL_FACTURA
        WHERE YEAR(DIA) = {ano}
          AND RUT = '{rut}'
          AND VENDEDOR NOT IN (
            '89-FACTURACION MUESTRA Y U OBSEQU',
            '90-FACTURACION USO INTERNO',
            '96-FACTURACION FALTANTES',
            '97-DONACIONES',
            '98-FACTURACION OTROS CONCEPTOS',
            '99-FACTURACION MERMAS'
          )
          AND CODIGO NOT IN ('FLETE','NINV','SIN','')
          AND VENTA > 0
        GROUP BY CODIGO, DESCRIPCION, CATEGORIA
        ORDER BY SUM(VENTA) DESC
    """)
    resumen = []
    for r in sql_cur.fetchall():
        resumen.append({
            "codigo": str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "categoria": str(r[2] or "").strip(),
            "cantidad": int(r[3] or 0),
            "venta": round(float(r[4] or 0)),
            "precio_unit": round(float(r[5] or 0)),
        })
    sql_conn.close()

    return {
        "rut": rut, "ano": ano,
        "total": sum(p["venta"] for p in resumen),
        "n_productos": len(resumen),
        "resumen": resumen,
        "por_mes": por_mes,
    }


@router.get("/ag-reseller-detalle")
async def get_ag_reseller_detalle(
    rut: str = Query(...),
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mp_reseller_det:{rut}:{ano}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_reseller_detalle(rut, ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "resumen": [], "por_mes": []}
