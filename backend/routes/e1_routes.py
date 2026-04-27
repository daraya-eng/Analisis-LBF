"""
E1 — Plan de Ventas 2026 vs Presupuesto vs Venta Real.
Fuentes: E1_Totales (KPIs por categoría x mes), E1_Detalle (subclases x mes)
         y BI_TOTAL_FACTURA (venta real).
"""
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn, filtro_guias, hoy
from cache import mem_get, mem_set

router = APIRouter()

MESES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]
MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
CATS = ["SQ", "MAH", "EQM", "EVA"]

_VEND_EXCLUIR = (
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
)
_EXCL_DW = (
    f"VENDEDOR NOT IN ({_VEND_EXCLUIR}) "
    "AND CODIGO NOT IN ('FLETE','NINV','SIN','')"
)

# Normaliza nombre de detalle para evitar diferencias de escritura entre categorías
_DETALLE_MAP = {
    "E1": "e1",
    "Presupuesto 2026": "ppto",
    "Cumplimiento %": "cumpl",
    "PPTO Margen 2026": "margen_ppto",
    "Marge proyectado": "margen_proy",
    "Margen proyectado (sin rebate)": "margen_proy",
    "Contribucion Macro": "contrib",
}


def _float(v):
    return float(v) if v is not None else None


@router.get("/totales")
async def get_e1_totales(current_user: dict = Depends(get_current_user)):
    """
    Retorna E1_Totales pivotado por categoría + venta real de BI_TOTAL_FACTURA.
    Cada categoría tiene: e1, ppto, cumpl, margen_ppto, margen_proy, contrib, venta_real.
    """
    cached = mem_get("e1_totales")
    if cached:
        return cached

    h = hoy()
    _ANO = h["ano"]
    _MES = h["mes"]
    _FG = filtro_guias()

    conn = get_conn()
    cur = conn.cursor()

    # ── Query 1: E1_Totales ─────────────────────────────────────────
    cur.execute(f"""
        SELECT CATEGORIA, DETALLE,
               {', '.join(MESES)},
               COALESCE(TOTAL, MARGEN_TOTAL_2026) AS TOTAL,
               MARGEN_TOTAL_2026
        FROM E1_Totales
        ORDER BY CATEGORIA, DETALLE
    """)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    # ── Query 2: PPTO mensual desde Meta_Categoria (misma fuente que Panel Principal) ──
    cur.execute("""
        SELECT CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END AS cat,
               MES,
               SUM(META_VENTA) AS meta_venta
        FROM Meta_Categoria
        GROUP BY CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END, MES
    """)
    meta_cat_mes: dict[str, dict[int, float]] = {cat: {} for cat in CATS}
    for row in cur.fetchall():
        cat, mes, venta = str(row[0]).strip(), int(row[1]), float(row[2] or 0)
        if cat in meta_cat_mes:
            meta_cat_mes[cat][mes] = meta_cat_mes[cat].get(mes, 0) + venta

    # ── Query 3: Venta real desde BI_TOTAL_FACTURA ──────────────────
    cur.execute(f"""
        SELECT CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS' THEN 'EQM'
                    ELSE LTRIM(RTRIM(CATEGORIA)) END AS cat,
               MES,
               SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO}
          AND {_EXCL_DW}
          AND {_FG}
          AND LTRIM(RTRIM(CATEGORIA)) IN ('SQ','MAH','EQM','EVA','SERVICIOS')
        GROUP BY CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS' THEN 'EQM'
                      ELSE LTRIM(RTRIM(CATEGORIA)) END,
                 MES
    """)
    venta_real_map: dict[str, dict[int, float]] = {cat: {} for cat in CATS}
    for row in cur.fetchall():
        cat, mes, venta = str(row[0]).strip(), int(row[1]), float(row[2] or 0)
        if cat in venta_real_map:
            venta_real_map[cat][mes] = venta_real_map[cat].get(mes, 0) + venta

    conn.close()

    # ── Pivot por categoría ─────────────────────────────────────────
    result_cats = []
    for cat in CATS:
        cat_rows = [r for r in rows if r["CATEGORIA"] == cat]
        metricas: dict = {}
        for r in cat_rows:
            key = _DETALLE_MAP.get(r["DETALLE"])
            if not key:
                continue
            metricas[key] = {
                "meses": [_float(r[m]) for m in MESES],
                "total": _float(r["TOTAL"]),
            }

        # Venta real por mes (mes 1..12 → índice 0..11)
        vr_meses = [venta_real_map[cat].get(m + 1) for m in range(12)]
        vr_total = sum(v for v in vr_meses if v is not None)
        metricas["venta_real"] = {
            "meses": vr_meses,
            "total": round(vr_total) if vr_total > 0 else None,
        }

        # Para meses ya cerrados con datos reales: E1 = venta real (no estimado)
        if "e1" in metricas:
            e1_meses = list(metricas["e1"]["meses"])
            for i in range(12):
                mes_num = i + 1
                vr = venta_real_map[cat].get(mes_num)
                if mes_num < _MES and vr is not None:
                    e1_meses[i] = vr
            metricas["e1"]["meses"] = e1_meses
            metricas["e1"]["total"] = sum(v for v in e1_meses if v is not None)

        # Meta_Categoria mensual (misma fuente que Panel Principal) → para cumplimiento
        meta_meses = [meta_cat_mes[cat].get(m + 1) for m in range(12)]
        meta_total_cat = sum(v for v in meta_meses if v is not None)
        metricas["meta_ppto"] = {
            "meses": meta_meses,
            "total": round(meta_total_cat) if meta_total_cat > 0 else None,
        }

        # KPIs anuales
        e1_total = metricas.get("e1", {}).get("total")
        ppto_total = metricas.get("ppto", {}).get("total")
        cumpl_total = (e1_total / ppto_total) if e1_total and ppto_total and ppto_total > 0 else None
        margen_proy = metricas.get("margen_proy", {}).get("total")
        margen_ppto = metricas.get("margen_ppto", {}).get("total")
        contrib_total = metricas.get("contrib", {}).get("total")

        # YTD: acumulado hasta mes actual (inclusive)
        e1_ytd = sum(
            v for v in (metricas.get("e1", {}).get("meses") or [])[:_MES]
            if v is not None
        )
        # Usar Meta_Categoria como PPTO YTD (igual que Panel Principal)
        meta_ytd = sum(v for v in meta_meses[:_MES] if v is not None)
        cumpl_venta_e1 = round(vr_total / e1_ytd * 100, 1) if e1_ytd > 0 and vr_total > 0 else None
        cumpl_venta_ppto = round(vr_total / meta_ytd * 100, 1) if meta_ytd > 0 and vr_total > 0 else None

        result_cats.append({
            "categoria": cat,
            "metricas": metricas,
            "kpis": {
                "e1_total": round(e1_total) if e1_total else None,
                "ppto_total": round(ppto_total) if ppto_total else None,
                "cumpl_total": round(cumpl_total * 100, 1) if cumpl_total else None,
                "margen_proy": round(margen_proy * 100, 1) if margen_proy else None,
                "margen_ppto": round(margen_ppto * 100, 1) if margen_ppto else None,
                "contrib_total": round(contrib_total) if contrib_total else None,
                "venta_real_ytd": round(vr_total) if vr_total else None,
                "cumpl_venta_e1": cumpl_venta_e1,
                "cumpl_venta_ppto": cumpl_venta_ppto,
                "e1_ytd": round(e1_ytd) if e1_ytd else None,
                "meta_ytd": round(meta_ytd) if meta_ytd else None,
            },
        })

    # ── Totales globales ────────────────────────────────────────────
    e1_global = sum(c["kpis"]["e1_total"] or 0 for c in result_cats)
    ppto_global = sum(c["kpis"]["ppto_total"] or 0 for c in result_cats)
    cumpl_global = round(e1_global / ppto_global * 100, 1) if ppto_global > 0 else None
    vr_global = sum(c["kpis"]["venta_real_ytd"] or 0 for c in result_cats)
    e1_ytd_global = sum(c["kpis"]["e1_ytd"] or 0 for c in result_cats)
    # Usar Meta_Categoria como PPTO global (igual que Panel Principal)
    meta_ytd_global = sum(c["kpis"]["meta_ytd"] or 0 for c in result_cats)
    # Meta mensual global = suma por mes de todas las categorías
    meta_mensual_global = [
        sum(
            c["metricas"]["meta_ppto"]["meses"][i] or 0
            for c in result_cats
            if c["metricas"].get("meta_ppto", {}).get("meses")
        )
        for i in range(12)
    ]

    result = {
        "categorias": result_cats,
        "meses_corto": MESES_CORTO,
        "mes_actual": _MES,
        "meta_mensual": meta_mensual_global,   # Para calcular CumplPPTO en frontend
        "global": {
            "e1_total": round(e1_global),
            "ppto_total": round(ppto_global),
            "cumpl_total": cumpl_global,
            "venta_real_ytd": round(vr_global) if vr_global else None,
            "cumpl_venta_e1": round(vr_global / e1_ytd_global * 100, 1) if e1_ytd_global > 0 and vr_global > 0 else None,
            "cumpl_venta_ppto": round(vr_global / meta_ytd_global * 100, 1) if meta_ytd_global > 0 and vr_global > 0 else None,
            "e1_ytd": round(e1_ytd_global),
            "meta_ytd": round(meta_ytd_global),
        },
    }
    mem_set("e1_totales", result)
    return result


@router.get("/detalle")
async def get_e1_detalle(
    categoria: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Subclases de E1 para una categoría, con valores mensuales y comentarios."""
    if categoria not in CATS:
        return {"subclases": [], "categoria": categoria}

    cache_key = f"e1_detalle:{categoria}"
    cached = mem_get(cache_key)
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"""
        SELECT SUBCLASE,
               {', '.join(MESES)},
               COMENTARIOS
        FROM E1_Detalle
        WHERE CATEGORIA = ?
        ORDER BY COALESCE(ENERO, 0) + COALESCE(FEBRERO, 0) + COALESCE(MARZO, 0) DESC
    """, (categoria,))
    cols = [d[0] for d in cur.description]
    rows_raw = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()

    subclases = []
    for r in rows_raw:
        meses_vals = [_float(r[m]) for m in MESES]
        total = sum(v for v in meses_vals if v is not None)
        subclases.append({
            "subclase": str(r["SUBCLASE"] or "").strip(),
            "meses": meses_vals,
            "total": round(total),
            "comentario": str(r["COMENTARIOS"] or "").strip() or None,
        })

    result = {"subclases": subclases, "categoria": categoria, "meses_corto": MESES_CORTO}
    mem_set(cache_key, result)
    return result
