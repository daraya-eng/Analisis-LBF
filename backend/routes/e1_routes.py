"""
E1 — Plan de Ventas 2026 vs Presupuesto.
Fuentes: E1_Totales (KPIs por categoría x mes) y E1_Detalle (subclases x mes).
"""
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn
from cache import mem_get, mem_set

router = APIRouter()

MESES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]
MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
CATS = ["SQ", "MAH", "EQM", "EVA"]

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
    Retorna E1_Totales pivotado por categoría.
    Cada categoría tiene: e1, ppto, cumpl, margen_ppto, margen_proy, contrib.
    Cada uno con lista de 12 valores mensuales + total.
    """
    cached = mem_get("e1_totales")
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()
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
    conn.close()

    # Pivot por categoría
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

        # KPIs anuales de resumen
        e1_total = metricas.get("e1", {}).get("total")
        ppto_total = metricas.get("ppto", {}).get("total")
        cumpl_total = (e1_total / ppto_total) if e1_total and ppto_total and ppto_total > 0 else None
        margen_proy = metricas.get("margen_proy", {}).get("total")
        margen_ppto = metricas.get("margen_ppto", {}).get("total")
        contrib_total = metricas.get("contrib", {}).get("total")

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
            },
        })

    # Totales globales (suma de categorías)
    e1_global = sum(c["kpis"]["e1_total"] or 0 for c in result_cats)
    ppto_global = sum(c["kpis"]["ppto_total"] or 0 for c in result_cats)
    cumpl_global = round(e1_global / ppto_global * 100, 1) if ppto_global > 0 else None

    result = {
        "categorias": result_cats,
        "meses_corto": MESES_CORTO,
        "global": {
            "e1_total": round(e1_global),
            "ppto_total": round(ppto_global),
            "cumpl_total": cumpl_global,
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
