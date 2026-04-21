"""
M&A Analysis — Identify potential acquisition targets in Mercado Publico.
Analyzes medical supply providers by revenue, category overlap with LBF,
geographic reach, and channel mix.

Periods: "total" = 2025+2026, "2025" = year closed, "2026" = YTD
"""
import re
from datetime import date
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db_mp import get_pg_conn, MEDICAL_CAT, LBF_NAME
from cache import mem_get, mem_set

router = APIRouter()

MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
              "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
_MONTO = "COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)"
_REVENUE_CAP = 1_900_000_000  # ~2M USD
_REVENUE_MIN = 100_000_000    # ~$105K USD — minimum to be interesting

# Multinacionales, farmacias, clinicas, hospitales — no adquiribles
_BLACKLIST = [
    "bayer", "roche", "hospira", "pfizer", "abbott", "baxter", "b braun",
    "b.braun", "medtronic", "siemens", "philips", "johnson", "3m chile",
    "boston sci", "stryker", "olympus", "fresenius", "cardinal health",
    "grifols", "davita", "sanderson", "ahumada", "becton", "smiths",
    "drager", "dräger", "ge health", "merck", "novartis", "astrazeneca",
    "sanofi", "medline", "coloplast", "molnlycke", "cook medical",
    "integra life", "smith nephew", "karl storz", "zimmer", "biomet",
    "convatec", "hollister", "teleflex", "edwards life", "hologic",
    "alcon", "essilor", "mindray", "fuji", "canon med", "ortho-clinical",
]

# Clinicas y hospitales no son targets de M&A para distribuidores
_BLACKLIST_PATTERNS = [
    "clinica ", "clínica ", "hospital ", "farmacia ",
    "centro medico", "centro médico", "laboratorio ",
]


def _blacklist_sql() -> str:
    """SQL fragment: single NOT ILIKE ALL(...) instead of 50+ AND clauses.
    PostgreSQL evaluates array predicates more efficiently than N separate ANDs."""
    patterns = [f"%%{name}%%" for name in _BLACKLIST]
    patterns += [f"{pat}%%" for pat in _BLACKLIST_PATTERNS]
    arr = "ARRAY[" + ",".join(f"'{p}'" for p in patterns) + "]"
    return f"oc.proveedor_nombre_empresa NOT ILIKE ALL({arr})"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_lbf_subcats(cur, ano: int) -> list[str]:
    """Get LBF's significant subcategories (>1% of total LBF revenue)."""
    cur.execute(f"""
        WITH lbf_rev AS (
            SELECT SPLIT_PART(oi.categoria, ' / ', 2) AS subcat,
                   SUM(COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)) AS rev
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
              AND EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})
              AND SPLIT_PART(oi.categoria, ' / ', 2) != ''
            GROUP BY SPLIT_PART(oi.categoria, ' / ', 2)
        )
        SELECT subcat FROM lbf_rev
        WHERE rev >= (SELECT SUM(rev) * 0.01 FROM lbf_rev)
        ORDER BY rev DESC
    """)
    return [r[0] for r in cur.fetchall()]


def _get_lbf_subcats_cached(cur, ano: int) -> list[str]:
    """Cached version — subcats don't change within a session."""
    ck = f"lbf_subcats:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    result = _get_lbf_subcats(cur, ano)
    mem_set(ck, result)
    return result


def _year_filter(periodo: str, ano: int) -> str:
    """SQL WHERE fragment for period filtering."""
    if periodo == "2025":
        return f"EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1}"
    elif periodo == "2026":
        return f"EXTRACT(YEAR FROM oc.fecha_envio) = {ano}"
    else:  # total
        return f"EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})"


def _periodo_label(periodo: str, ano: int) -> dict:
    """Return human labels for the period."""
    hoy = date.today()
    mes_actual = hoy.month
    if periodo == "2025":
        return {
            "label": f"{ano - 1} (Ano cerrado)",
            "detalle": f"Ordenes de compra de Enero a Diciembre {ano - 1}",
            "corto": str(ano - 1),
        }
    elif periodo == "2026":
        return {
            "label": f"{ano} (YTD hasta {MESES_FULL[mes_actual - 1]})",
            "detalle": f"Ordenes de compra de Enero a {MESES_FULL[mes_actual - 1]} {ano}",
            "corto": f"{ano} YTD",
        }
    else:
        return {
            "label": f"{ano - 1} + {ano} YTD",
            "detalle": f"Ordenes de compra desde Enero {ano - 1} hasta {MESES_FULL[mes_actual - 1]} {ano} (~18 meses)",
            "corto": f"{ano - 1}+{ano}",
        }


# ═══════════════════════════════════════════════════════════════════
# 1. Market Overview
# ═══════════════════════════════════════════════════════════════════

def _load_ma_overview(ano: int, periodo: str) -> dict:
    conn = get_pg_conn()
    cur = conn.cursor()

    lbf_subcats = _get_lbf_subcats_cached(cur, ano)
    if not lbf_subcats:
        conn.close()
        return {"error": "No se encontraron subcategorias LBF"}

    quoted_subcats = ", ".join(f"'{s}'" for s in lbf_subcats)
    dc_filter = f"SPLIT_PART(oi.categoria, ' / ', 2) IN ({quoted_subcats})"
    yf = _year_filter(periodo, ano)
    bl = _blacklist_sql()

    # ── Query 1: Market + LBF KPIs combined (saves 1 full scan) ──
    cur.execute(f"""
        SELECT
            COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
                THEN {_MONTO} ELSE 0 END), 0)::bigint,
            COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1}
                THEN {_MONTO} ELSE 0 END), 0)::bigint,
            COUNT(DISTINCT oc.proveedor_rut),
            COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
                THEN oc.proveedor_rut END),
            COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1}
                THEN oc.proveedor_rut END),
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
                THEN {_MONTO} ELSE 0 END), 0)::bigint,
            COALESCE(SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                AND EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1}
                THEN {_MONTO} ELSE 0 END), 0)::bigint
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {dc_filter}
          AND EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})
    """)
    row = cur.fetchone()
    mercado_ytd = int(row[0])
    mercado_cerrado = int(row[1])
    n_providers_total = int(row[2])
    n_providers_ytd = int(row[3])
    n_providers_cerrado = int(row[4])
    lbf_ytd = int(row[5])
    lbf_cerrado = int(row[6])

    # ── Query 2: Target providers (blacklist runs ONCE, not 3x) ──
    cur.execute(f"""
        SELECT oc.proveedor_rut,
               SUM({_MONTO})::bigint AS revenue
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND {dc_filter}
          AND oc.proveedor_nombre_empresa NOT ILIKE '%%lbf%%'
          AND {bl}
          AND {yf}
        GROUP BY oc.proveedor_rut
        HAVING SUM({_MONTO})::bigint >= {_REVENUE_MIN}
    """)
    all_providers = cur.fetchall()

    # ── Brackets: computed in Python (instant, no DB) ──
    _BRACKET_DEFS = [
        ("$100M - $350M", 100_000_000, 350_000_000),
        ("$350M - $700M", 350_000_000, 700_000_000),
        ("$700M - $1.000M", 700_000_000, 1_000_000_000),
        ("$1.000M - $1.500M", 1_000_000_000, 1_500_000_000),
        ("$1.500M - $1.900M", 1_500_000_000, _REVENUE_CAP + 1),
    ]
    brackets = []
    n_targets = 0
    for label, lo, hi in _BRACKET_DEFS:
        in_b = [rev for _, rev in all_providers if lo <= rev < hi]
        if in_b:
            brackets.append({"bracket": label, "n": len(in_b), "total": sum(in_b)})
            n_targets += len(in_b)

    # Target RUTs for subcats + channels (no need to re-run blacklist)
    target_ruts = [rut for rut, rev in all_providers if rev <= _REVENUE_CAP]

    if target_ruts:
        # ── Query 3: Subcategories (filter by RUT list, no blacklist) ──
        cur.execute(f"""
            SELECT SPLIT_PART(oi.categoria, ' / ', 2) AS subcat,
                   COALESCE(SUM({_MONTO}), 0)::bigint AS total,
                   COUNT(DISTINCT oc.proveedor_rut) AS n_providers
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND {dc_filter}
              AND {yf}
              AND oc.proveedor_rut = ANY(%s)
              AND SPLIT_PART(oi.categoria, ' / ', 2) != ''
            GROUP BY 1
            ORDER BY 2 DESC
        """, (target_ruts,))
        subcategorias = [{"subcategoria": r[0], "total": int(r[1]), "n_providers": int(r[2])}
                         for r in cur.fetchall()]

        # ── Query 4: Channels (filter by RUT list, no blacklist) ──
        cur.execute(f"""
            SELECT oc.tipo_compra,
                   COALESCE(SUM({_MONTO}), 0)::bigint AS total
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND {dc_filter}
              AND {yf}
              AND oc.proveedor_rut = ANY(%s)
            GROUP BY oc.tipo_compra
            ORDER BY 2 DESC
        """, (target_ruts,))
        canales = [{"canal": r[0] or "Otro", "total": int(r[1])} for r in cur.fetchall()]
    else:
        subcategorias = []
        canales = []

    conn.close()

    return {
        "periodo_info": _periodo_label(periodo, ano),
        "mercado_ytd": mercado_ytd,
        "mercado_cerrado": mercado_cerrado,
        "n_providers_total": n_providers_total,
        "n_providers_ytd": n_providers_ytd,
        "n_providers_cerrado": n_providers_cerrado,
        "n_targets": n_targets,
        "lbf_ytd": lbf_ytd,
        "lbf_cerrado": lbf_cerrado,
        "lbf_n_subcats": len(lbf_subcats),
        "lbf_subcats": lbf_subcats,
        "brackets": brackets,
        "subcategorias": subcategorias,
        "canales": canales,
    }


@router.get("/overview")
async def get_ma_overview(
    ano: int = Query(2026),
    periodo: str = Query("total"),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"ma_overview:{ano}:{periodo}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_ma_overview(ano, periodo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════
# 2. Target Companies
# ═══════════════════════════════════════════════════════════════════

def _load_ma_targets(ano: int, periodo: str) -> dict:
    """Load all target companies. Filtering done in Python for cache efficiency."""
    conn = get_pg_conn()
    cur = conn.cursor()

    lbf_subcats = _get_lbf_subcats_cached(cur, ano)
    if not lbf_subcats:
        conn.close()
        return {"targets": [], "periodo_info": _periodo_label(periodo, ano)}

    quoted_subcats = ", ".join(f"'{s}'" for s in lbf_subcats)
    yf = _year_filter(periodo, ano)
    bl = _blacklist_sql()

    cur.execute(f"""
        WITH lbf_sc AS (
            SELECT unnest(ARRAY[{quoted_subcats}]) AS subcat
        ),
        provider_data AS (
            SELECT
                oc.proveedor_rut AS rut,
                MAX(oc.proveedor_nombre_empresa) AS nombre,
                MAX(oc.proveedor_actividad) FILTER (WHERE oc.proveedor_actividad IS NOT NULL AND oc.proveedor_actividad != '') AS actividad,
                SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano}
                    THEN {_MONTO} ELSE 0 END)::bigint AS rev_current,
                SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1}
                    THEN {_MONTO} ELSE 0 END)::bigint AS rev_prev,
                SUM({_MONTO})::bigint AS rev_total,
                COUNT(DISTINCT oc.comprador_rut_unidad) FILTER
                    (WHERE oc.comprador_rut_unidad IS NOT NULL) AS n_clients,
                COUNT(DISTINCT oc.id) AS n_ocs,
                COUNT(DISTINCT SPLIT_PART(oi.categoria, ' / ', 2))
                    FILTER (WHERE SPLIT_PART(oi.categoria, ' / ', 2) != '') AS n_subcats,
                COUNT(DISTINCT SPLIT_PART(oi.categoria, ' / ', 2))
                    FILTER (WHERE SPLIT_PART(oi.categoria, ' / ', 2) IN (SELECT subcat FROM lbf_sc)
                            AND SPLIT_PART(oi.categoria, ' / ', 2) != '') AS n_overlap,
                COUNT(DISTINCT oc.comprador_region_unidad)
                    FILTER (WHERE oc.comprador_region_unidad IS NOT NULL
                            AND oc.comprador_region_unidad != '') AS n_regions,
                SUM(CASE WHEN oc.tipo_compra = 'SE' THEN {_MONTO} ELSE 0 END)::bigint AS rev_se,
                SUM(CASE WHEN oc.tipo_compra = 'CM' THEN {_MONTO} ELSE 0 END)::bigint AS rev_cm,
                SUM(CASE WHEN oc.tipo_compra = 'AG' THEN {_MONTO} ELSE 0 END)::bigint AS rev_ag,
                SUM(CASE WHEN oc.tipo_compra NOT IN ('SE','CM','AG') THEN {_MONTO} ELSE 0 END)::bigint AS rev_otro
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND SPLIT_PART(oi.categoria, ' / ', 2) IN (SELECT subcat FROM lbf_sc)
              AND oc.proveedor_nombre_empresa NOT ILIKE '%%lbf%%'
              AND {bl}
              AND {yf}
            GROUP BY oc.proveedor_rut
            HAVING SUM({_MONTO})::bigint >= {_REVENUE_MIN}
               AND SUM({_MONTO})::bigint <= {_REVENUE_CAP}
        )
        SELECT * FROM provider_data
        ORDER BY rev_total DESC
    """)

    cols = [d[0] for d in cur.description]
    targets = []
    total_lbf_sc = len(lbf_subcats)
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        rev_current = int(row["rev_current"])
        rev_prev = int(row["rev_prev"])
        rev_total = int(row["rev_total"])
        yoy = round((rev_current - rev_prev) / rev_prev * 100, 1) if rev_prev > 0 else None
        overlap_pct = round(int(row["n_overlap"]) / total_lbf_sc * 100) if total_lbf_sc > 0 else 0

        targets.append({
            "rut": str(row["rut"] or "").strip(),
            "nombre": str(row["nombre"] or "").strip(),
            "actividad": str(row["actividad"] or "").strip(),
            "rev_total": rev_total,
            "rev_current": rev_current,
            "rev_prev": rev_prev,
            "yoy": yoy,
            "n_clients": int(row["n_clients"]),
            "n_ocs": int(row["n_ocs"]),
            "n_subcats": int(row["n_subcats"]),
            "n_overlap": int(row["n_overlap"]),
            "overlap_pct": overlap_pct,
            "n_regions": int(row["n_regions"]),
            "rev_se": int(row["rev_se"]),
            "rev_cm": int(row["rev_cm"]),
            "rev_ag": int(row["rev_ag"]),
            "rev_otro": int(row["rev_otro"]),
        })

    conn.close()
    return {"targets": targets, "periodo_info": _periodo_label(periodo, ano)}


@router.get("/targets")
async def get_ma_targets(
    ano: int = Query(2026),
    periodo: str = Query("total"),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"ma_targets:{ano}:{periodo}"
        cached = mem_get(ck)
        if cached is None:
            cached = _load_ma_targets(ano, periodo)
            mem_set(ck, cached)
        return cached
    except Exception as e:
        return {"error": str(e), "targets": [], "total": 0}


# ═══════════════════════════════════════════════════════════════════
# 3. Company Profile
# ═══════════════════════════════════════════════════════════════════

def _load_ma_empresa(rut: str, ano: int, periodo: str) -> dict:
    conn = get_pg_conn()
    cur = conn.cursor()

    lbf_subcats = _get_lbf_subcats_cached(cur, ano)
    quoted_subcats = ", ".join(f"'{s}'" for s in lbf_subcats) if lbf_subcats else "''"
    safe_rut = rut.replace("'", "")
    yf = _year_filter(periodo, ano)

    # Company header — always both years for comparison
    cur.execute(f"""
        SELECT
            MAX(oc.proveedor_nombre_empresa),
            MAX(oc.proveedor_actividad) FILTER (WHERE oc.proveedor_actividad IS NOT NULL AND oc.proveedor_actividad != ''),
            SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano} THEN {_MONTO} ELSE 0 END)::bigint,
            SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1} THEN {_MONTO} ELSE 0 END)::bigint,
            COUNT(DISTINCT oc.comprador_rut_unidad) FILTER (WHERE oc.comprador_rut_unidad IS NOT NULL),
            COUNT(DISTINCT oc.id)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})
    """)
    h = cur.fetchone()
    if not h or not h[0]:
        conn.close()
        return {"error": "Empresa no encontrada"}

    rev_current = int(h[2])
    rev_prev = int(h[3])
    info = {
        "rut": rut,
        "nombre": str(h[0] or "").strip(),
        "actividad": str(h[1] or "").strip(),
        "rev_current": rev_current,
        "rev_prev": rev_prev,
        "rev_total": rev_current + rev_prev,
        "yoy": round((rev_current - rev_prev) / rev_prev * 100, 1) if rev_prev > 0 else None,
        "n_clients": int(h[4]),
        "n_ocs": int(h[5]),
    }

    # Subcategorias — filtered by period, use positional ORDER BY
    cur.execute(f"""
        SELECT SPLIT_PART(oi.categoria, ' / ', 2) AS subcat,
               SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano} THEN {_MONTO} ELSE 0 END)::bigint,
               SUM(CASE WHEN EXTRACT(YEAR FROM oc.fecha_envio) = {ano - 1} THEN {_MONTO} ELSE 0 END)::bigint,
               COUNT(DISTINCT oc.id)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND {yf}
          AND SPLIT_PART(oi.categoria, ' / ', 2) != ''
        GROUP BY 1
        ORDER BY 2 + 3 DESC
    """)
    subcategorias = []
    for r in cur.fetchall():
        subcategorias.append({
            "subcategoria": r[0],
            "rev_current": int(r[1]),
            "rev_prev": int(r[2]),
            "n_ocs": int(r[3]),
            "overlap": r[0] in lbf_subcats,
        })
    # Sort in Python to be safe
    subcategorias.sort(key=lambda x: x["rev_current"] + x["rev_prev"], reverse=True)

    # Top products — filtered by period
    cur.execute(f"""
        SELECT COALESCE(NULLIF(oi.nombre, ''), oi.codigo_producto) AS producto,
               oi.codigo_producto,
               SPLIT_PART(oi.categoria, ' / ', 2) AS subcat,
               SUM({_MONTO})::bigint AS total,
               SUM(oi.cantidad)::bigint AS cantidad,
               COUNT(DISTINCT oc.id) AS n_ocs,
               CASE WHEN SUM(oi.cantidad) > 0
                    THEN (SUM({_MONTO}) / SUM(oi.cantidad))::bigint
                    ELSE 0 END AS precio_prom,
               MAX(oi.unidad) AS unidad
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND {yf}
        GROUP BY 1, 2, 3
        ORDER BY 4 DESC
        LIMIT 30
    """)
    productos = []
    for r in cur.fetchall():
        productos.append({
            "producto": str(r[0] or "").strip(),
            "codigo": str(r[1] or "").strip(),
            "subcategoria": str(r[2] or "").strip(),
            "total": int(r[3]),
            "cantidad": int(r[4]),
            "n_ocs": int(r[5]),
            "precio_prom": int(r[6]),
            "unidad": str(r[7] or "").strip(),
        })

    # Institutional clients — filtered by period
    cur.execute(f"""
        SELECT oc.comprador_rut_unidad,
               MAX(oc.comprador_nombre_unidad),
               SUM({_MONTO})::bigint,
               COUNT(DISTINCT oc.id),
               MAX(oc.comprador_region_unidad)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND {yf}
          AND oc.comprador_rut_unidad IS NOT NULL
        GROUP BY oc.comprador_rut_unidad
        ORDER BY 3 DESC
        LIMIT 25
    """)
    clientes = []
    for r in cur.fetchall():
        clientes.append({
            "rut": str(r[0] or "").strip(),
            "nombre": str(r[1] or "").strip(),
            "total": int(r[2]),
            "n_ocs": int(r[3]),
            "region": str(r[4] or "").strip(),
        })

    # Regional coverage — filtered by period
    cur.execute(f"""
        SELECT COALESCE(NULLIF(oc.comprador_region_unidad, ''), 'Sin info'),
               SUM({_MONTO})::bigint,
               COUNT(DISTINCT oc.comprador_rut_unidad),
               COUNT(DISTINCT oc.id)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND {yf}
        GROUP BY 1
        ORDER BY 2 DESC
    """)
    regiones = [{"region": r[0], "total": int(r[1]), "n_clients": int(r[2]), "n_ocs": int(r[3])}
                for r in cur.fetchall()]

    # Monthly trend — always both years for chart
    cur.execute(f"""
        SELECT EXTRACT(YEAR FROM oc.fecha_envio)::int,
               EXTRACT(MONTH FROM oc.fecha_envio)::int,
               SUM({_MONTO})::bigint,
               COUNT(DISTINCT oc.id)
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND EXTRACT(YEAR FROM oc.fecha_envio) IN ({ano}, {ano - 1})
        GROUP BY 1, 2
        ORDER BY 1, 2
    """)
    trend = {}
    for r in cur.fetchall():
        trend[(int(r[0]), int(r[1]))] = {"total": int(r[2]), "n_ocs": int(r[3])}

    tendencia = []
    for m in range(1, 13):
        c = trend.get((ano, m), {})
        p = trend.get((ano - 1, m), {})
        tendencia.append({
            "mes": m, "mes_nombre": MESES[m - 1],
            "rev_current": c.get("total", 0),
            "rev_prev": p.get("total", 0),
            "ocs_current": c.get("n_ocs", 0),
        })

    # Channel mix — filtered by period
    cur.execute(f"""
        SELECT oc.tipo_compra, SUM({_MONTO})::bigint
        FROM ordenes_compra oc
        JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
        WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
          AND oc.proveedor_rut = '{safe_rut}'
          AND {yf}
        GROUP BY oc.tipo_compra
        ORDER BY 2 DESC
    """)
    canales = [{"canal": r[0] or "Otro", "total": int(r[1])} for r in cur.fetchall()]

    # Client overlap with LBF — filtered by period
    cur.execute(f"""
        WITH target_clients AS (
            SELECT DISTINCT oc.comprador_rut_unidad
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.proveedor_rut = '{safe_rut}'
              AND {yf}
              AND oc.comprador_rut_unidad IS NOT NULL
        ),
        lbf_clients AS (
            SELECT DISTINCT oc.comprador_rut_unidad
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE oi.categoria ILIKE '{MEDICAL_CAT}%%'
              AND oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
              AND {yf}
              AND oc.comprador_rut_unidad IS NOT NULL
        )
        SELECT
            (SELECT COUNT(*) FROM target_clients),
            (SELECT COUNT(*) FROM target_clients
             WHERE comprador_rut_unidad IN (SELECT comprador_rut_unidad FROM lbf_clients))
    """)
    ov = cur.fetchone()
    total_t, shared = int(ov[0]), int(ov[1])
    client_overlap = {
        "total_target": total_t,
        "shared_with_lbf": shared,
        "pct": round(shared / total_t * 100) if total_t > 0 else 0,
    }

    conn.close()

    return {
        "periodo_info": _periodo_label(periodo, ano),
        "info": info,
        "subcategorias": subcategorias,
        "productos": productos,
        "clientes": clientes,
        "regiones": regiones,
        "tendencia": tendencia,
        "canales": canales,
        "client_overlap": client_overlap,
    }


@router.get("/empresa/{rut}")
async def get_ma_empresa(
    rut: str,
    ano: int = Query(2026),
    periodo: str = Query("total"),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"ma_empresa:{rut}:{ano}:{periodo}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_ma_empresa(rut, ano, periodo)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e)}
