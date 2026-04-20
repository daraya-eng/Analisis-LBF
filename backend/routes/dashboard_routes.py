"""
Dashboard Principal — PPTO vs Venta total + por Categoría + Segmento Público/Privado.
Excluye vendedores internos.
Fuentes:
  - Meta_Categoria: meta venta/margen/contribución por categoría x mes
  - Metas_KAM: meta total por zona/mes (para KPIs globales)
  - PPTO_VS_VENTA: presupuesto trazable + incrementales + sin cliente
  - BI_TOTAL_FACTURA: ventas reales
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE, filtro_guias
from cache import mem_get, mem_set

router = APIRouter()

_VEND_EXCLUIR = (
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
)
_EXCL_VEND = f"VENDEDOR_ACTUAL NOT IN ({_VEND_EXCLUIR})"
_EXCL_DW = (
    f"VENDEDOR NOT IN ({_VEND_EXCLUIR}) "
    "AND CODIGO NOT IN ('FLETE','NINV','SIN','')"
)

_CAT_CASE = """
    CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS'
         THEN 'EQM' ELSE LTRIM(RTRIM(CATEGORIA)) END
"""
_CATS_VALIDAS = ('SQ', 'EVA', 'MAH', 'EQM')


def _load_dashboard_raw() -> dict:
    """Load all raw data from DB, organized by month for flexible filtering."""
    h = hoy()
    _ANO, _MES = h["ano"], h["mes"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()

    # ═══ 1. META por categoría x mes desde Meta_Categoria ═══
    # SER → EQM
    cur.execute("""
        SELECT
            CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END AS cat,
            MES,
            SUM(META_VENTA) AS meta_venta,
            SUM(MARGEN_PCT * META_VENTA) / NULLIF(SUM(META_VENTA), 0) AS margen_pct,
            SUM(META_CONTRIBUCION) AS meta_contrib
        FROM Meta_Categoria
        GROUP BY CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END, MES
        ORDER BY cat, MES
    """)
    # meta_cat_mes[cat][mes] = {venta, margen, contrib}
    meta_cat_mes: dict = {}
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        mes = int(r[1])
        if cat not in _CATS_VALIDAS:
            continue
        if cat not in meta_cat_mes:
            meta_cat_mes[cat] = {}
        meta_cat_mes[cat][mes] = {
            "venta": float(r[2] or 0),
            "margen": float(r[3] or 0),
            "contrib": float(r[4] or 0),
        }

    # ═══ 2. META global desde Metas_KAM (por mes, todas las zonas) ═══
    cur.execute(f"""
        SELECT
            CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) AS MES,
            SUM(CAST(LTRIM(RTRIM([ META ])) AS float)) AS meta
        FROM Metas_KAM
        WHERE ANIOMES >= {_ANO}01 AND ANIOMES <= {_ANO}12
        GROUP BY CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int)
        ORDER BY 1
    """)
    meta_global_mes: dict = {}
    for r in cur.fetchall():
        meta_global_mes[int(r[0])] = float(r[1] or 0)

    # ═══ 3. VENTA + CONTRIBUCION 2026 por categoría x mes ═══
    cur.execute(f"""
        SELECT {_CAT_CASE} AS cat, MES,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib
        FROM BI_TOTAL_FACTURA
        WHERE {_EXCL_DW} AND ANO = {_ANO}
          AND {_FG}
        GROUP BY {_CAT_CASE}, MES
    """)
    venta_cat_mes: dict = {}
    contrib_cat_mes: dict = {}
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        mes = int(r[1])
        venta = float(r[2] or 0)
        contrib = float(r[3] or 0)
        if cat in _CATS_VALIDAS:
            if cat not in venta_cat_mes:
                venta_cat_mes[cat] = {}
            venta_cat_mes[cat][mes] = venta
            if cat not in contrib_cat_mes:
                contrib_cat_mes[cat] = {}
            contrib_cat_mes[cat][mes] = contrib

    # ═══ 4. VENTA 2025 total por mes (sin categoría — la categorización cambió) ═══
    cur.execute(f"""
        SELECT f25.MES,
               SUM(CAST(f25.VENTA AS float)) AS venta_25
        FROM BI_TOTAL_FACTURA f25
        WHERE f25.ANO = {_ANO-1} AND f25.MES <= {_MES}
          AND f25.VENDEDOR NOT IN ({_VEND_EXCLUIR})
          AND f25.CODIGO NOT IN ('FLETE','NINV','SIN','')
          AND {_FG}
        GROUP BY f25.MES
    """)
    venta25_mes: dict = {}  # mes -> venta_25 total
    for r in cur.fetchall():
        mes = int(r[0])
        venta25_mes[mes] = float(r[1] or 0)

    # ═══ 5. VENTA por segmento x categoría x mes ═══
    cur.execute(f"""
        SELECT
            LTRIM(RTRIM(ISNULL(SEGMENTO, ''))) AS seg,
            {_CAT_CASE} AS cat,
            MES,
            SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND {_EXCL_DW}
          AND {_FG}
        GROUP BY LTRIM(RTRIM(ISNULL(SEGMENTO, ''))), {_CAT_CASE}, MES
    """)
    seg_mes_data: dict = {}
    for r in cur.fetchall():
        seg = str(r[0]).strip()
        cat = str(r[1]).strip()
        mes = int(r[2])
        venta = float(r[3] or 0)
        if seg not in ('PUBLICO', 'PRIVADO') or cat not in _CATS_VALIDAS:
            continue
        if seg not in seg_mes_data:
            seg_mes_data[seg] = {}
        if mes not in seg_mes_data[seg]:
            seg_mes_data[seg][mes] = {}
        seg_mes_data[seg][mes][cat] = seg_mes_data[seg][mes].get(cat, 0) + venta

    conn.close()

    return {
        "meta_cat_mes": meta_cat_mes,
        "meta_global_mes": meta_global_mes,
        "venta_cat_mes": venta_cat_mes,
        "contrib_cat_mes": contrib_cat_mes,
        "venta25_mes": venta25_mes,
        "seg_mes_data": seg_mes_data,
    }


def _build_for_period(raw: dict, meses: list[int]) -> dict:
    """Build all dashboard data for a given set of months."""
    meta_cat_mes = raw["meta_cat_mes"]
    meta_global_mes = raw["meta_global_mes"]
    venta_cat_mes = raw["venta_cat_mes"]
    contrib_cat_mes = raw["contrib_cat_mes"]
    venta25_mes = raw["venta25_mes"]
    seg_mes_data = raw["seg_mes_data"]

    n_meses = len(meses)

    # ─── KPIs ───
    meta_periodo = sum(meta_global_mes.get(m, 0) for m in meses)
    meta_anual = sum(meta_global_mes.get(m, 0) for m in range(1, 13))

    # Total venta 2025 (sin categoría — la categorización cambió entre años)
    total_v25 = sum(venta25_mes.get(m, 0) for m in meses)

    # Category table
    cat_table = []
    total_meta_cat = 0
    total_meta_contrib = 0
    total_venta = 0
    total_contrib = 0
    for cat in _CATS_VALIDAS:
        meta_v = sum(meta_cat_mes.get(cat, {}).get(m, {}).get("venta", 0) for m in meses)
        meta_c = sum(meta_cat_mes.get(cat, {}).get(m, {}).get("contrib", 0) for m in meses)
        meta_anual_cat = sum(meta_cat_mes.get(cat, {}).get(m, {}).get("venta", 0) for m in range(1, 13))
        margen_meta = (meta_c / meta_v * 100) if meta_v > 0 else 0

        venta = sum(venta_cat_mes.get(cat, {}).get(m, 0) for m in meses)
        contrib_real = sum(contrib_cat_mes.get(cat, {}).get(m, 0) for m in meses)
        margen_real = (contrib_real / venta * 100) if venta > 0 else 0
        cumpl = (venta / meta_v * 100) if meta_v > 0 else 0
        cumpl_contrib = (contrib_real / meta_c * 100) if meta_c > 0 else 0
        cumpl_margen = (margen_real / margen_meta * 100) if margen_meta > 0 else 0

        cat_table.append({
            "categoria": cat,
            "meta_anual": round(meta_anual_cat),
            "meta_periodo": round(meta_v),
            "meta_contrib": round(meta_c),
            "margen_meta": round(margen_meta, 1),
            "contrib_real": round(contrib_real),
            "margen_real": round(margen_real, 1),
            "cumpl_contrib": round(cumpl_contrib, 1),
            "cumpl_margen": round(cumpl_margen, 1),
            "venta": round(venta),
            "cumpl": round(cumpl, 1),
            "gap": round(venta - meta_v),
        })
        total_meta_cat += meta_v
        total_meta_contrib += meta_c
        total_venta += venta
        total_contrib += contrib_real

    cat_table.sort(key=lambda r: -r["meta_anual"])

    cumpl_t = (total_venta / total_meta_cat * 100) if total_meta_cat > 0 else 0
    crec_t = ((total_venta / total_v25) - 1) * 100 if total_v25 > 0 else 0
    margen_meta_t = (total_meta_contrib / total_meta_cat * 100) if total_meta_cat > 0 else 0
    margen_real_t = (total_contrib / total_venta * 100) if total_venta > 0 else 0
    cumpl_contrib_t = (total_contrib / total_meta_contrib * 100) if total_meta_contrib > 0 else 0
    cumpl_margen_t = (margen_real_t / margen_meta_t * 100) if margen_meta_t > 0 else 0
    meta_anual_total = sum(
        sum(meta_cat_mes.get(c, {}).get(m, {}).get("venta", 0) for m in range(1, 13))
        for c in _CATS_VALIDAS
    )
    cat_table.append({
        "categoria": "Total",
        "meta_anual": round(meta_anual_total),
        "meta_periodo": round(total_meta_cat),
        "meta_contrib": round(total_meta_contrib),
        "margen_meta": round(margen_meta_t, 1),
        "contrib_real": round(total_contrib),
        "margen_real": round(margen_real_t, 1),
        "cumpl_contrib": round(cumpl_contrib_t, 1),
        "cumpl_margen": round(cumpl_margen_t, 1),
        "venta": round(total_venta),
        "cumpl": round(cumpl_t, 1),
        "gap": round(total_venta - total_meta_cat),
    })

    # Segment table
    seg_table = []
    for seg in ("PUBLICO", "PRIVADO"):
        row: dict = {"segmento": seg, "total": 0}
        for cat in _CATS_VALIDAS:
            cat_total = sum(seg_mes_data.get(seg, {}).get(m, {}).get(cat, 0) for m in meses)
            row[cat] = round(cat_total)
            row["total"] += row[cat]
        row["total"] = round(row["total"])
        seg_table.append(row)

    # Monthly chart (always all 12 months)
    ventas_mensuales = []
    for m in range(1, 13):
        meta_m = sum(meta_cat_mes.get(c, {}).get(m, {}).get("venta", 0) for c in _CATS_VALIDAS)
        venta_m = sum(venta_cat_mes.get(c, {}).get(m, 0) for c in _CATS_VALIDAS)
        contrib_m = sum(contrib_cat_mes.get(c, {}).get(m, 0) for c in _CATS_VALIDAS)
        cumpl_m = (venta_m / meta_m * 100) if meta_m > 0 and venta_m > 0 else None
        margen_m = (contrib_m / venta_m * 100) if venta_m > 0 else None
        row = {
            "MES": m,
            "mes_nombre": MESES_NOMBRE.get(m, str(m))[:3],
            "meta": round(meta_m),
            "venta": round(venta_m),
            "cumplimiento": round(cumpl_m, 1) if cumpl_m is not None else None,
            "contrib": round(contrib_m),
            "margen": round(margen_m, 1) if margen_m is not None else None,
        }
        for cat in _CATS_VALIDAS:
            row[cat] = round(venta_cat_mes.get(cat, {}).get(m, 0))
        ventas_mensuales.append(row)

    # Global KPIs
    cumpl_meta = (total_venta / meta_periodo * 100) if meta_periodo > 0 else 0

    return {
        "kpis": {
            "meta_anual": round(meta_anual_total),
            "meta_periodo": round(meta_periodo),
            "meta_contrib_periodo": round(total_meta_contrib),
            "contrib_real": round(total_contrib),
            "margen_meta": round(margen_meta_t, 1),
            "margen_real": round(margen_real_t, 1),
            "cumpl_contrib": round(cumpl_contrib_t, 1),
            "cumpl_margen": round(cumpl_margen_t, 1),
            "venta": round(total_venta),
            "venta_25": round(total_v25),  # total sin desglose por categoría
            "cumpl": round(cumpl_t, 1),
            "cumpl_meta_global": round(cumpl_meta, 1),
            "crec_vs_25": round(crec_t, 1),
            "gap": round(total_venta - total_meta_cat),
            "gap_meta_global": round(total_venta - meta_periodo),
            "mes_nombre": MESES_NOMBRE.get(hoy()["mes"], ""),
            "n_meses": n_meses,
        },
        "categoria": cat_table,
        "segmento": seg_table,
        "ventas_mensuales": ventas_mensuales,
    }


def _parse_periodo(periodo: str, mes: int | None) -> tuple[list[int], str]:
    """Parse period string to list of months and label."""
    _MES = hoy()["mes"]
    if periodo == "ytd":
        return list(range(1, _MES + 1)), f"YTD (Ene - {MESES_NOMBRE.get(_MES, '')})"
    elif periodo == "q1":
        return [1, 2, 3], "Q1 (Ene - Mar)"
    elif periodo == "q2":
        return [4, 5, 6], "Q2 (Abr - Jun)"
    elif periodo == "q3":
        return [7, 8, 9], "Q3 (Jul - Sep)"
    elif periodo == "q4":
        return [10, 11, 12], "Q4 (Oct - Dic)"
    elif periodo == "mes" and mes:
        return [mes], MESES_NOMBRE.get(mes, str(mes))
    elif periodo == "anual":
        return list(range(1, 13)), "Anual 2026"
    return list(range(1, _MES + 1)), f"YTD (Ene - {MESES_NOMBRE.get(_MES, '')})"


@router.get("/all")
async def get_dashboard_all(
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Main dashboard endpoint. Accepts periodo filter to recalculate everything."""
    try:
        cache_key = f"dashboard:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        raw = _load_dashboard_raw()
        meses, label = _parse_periodo(periodo, mes)
        result = _build_for_period(raw, meses)
        result["periodo"] = periodo
        result["label"] = label
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "kpis": {}, "categoria": [],
                "segmento": [], "ventas_mensuales": []}


@router.get("/categoria-detail")
async def get_categoria_detail(
    categoria: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Zone-level breakdown for a specific category — used by dashboard drill-down."""
    try:
        if categoria not in _CATS_VALIDAS:
            return {"error": "Categoria invalida", "zonas": []}
        cache_key = f"dash_catdet:{categoria}:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached

        meses, label = _parse_periodo(periodo, mes)
        h = hoy()
        _ANO = h["ano"]
        mes_list = ",".join(str(m) for m in meses)

        cat_filter = f"= '{categoria}'"
        if categoria == "EQM":
            cat_filter = "IN ('EQM','SERVICIOS')"

        _FG = filtro_guias()
        conn = get_conn()
        cur = conn.cursor()

        # Venta + contrib 2026 por zona para esta categoría
        cur.execute(f"""
            SELECT VENDEDOR AS zona,
                   SUM(CAST(VENTA AS float)) AS venta,
                   SUM(CAST(CONTRIBUCION AS float)) AS contrib
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list})
              AND {_EXCL_DW}
              AND LTRIM(RTRIM(CATEGORIA)) {cat_filter}
              AND {_FG}
            GROUP BY VENDEDOR
            ORDER BY SUM(CAST(VENTA AS float)) DESC
        """)
        zona_rows = []
        for r in cur.fetchall():
            zona_raw = str(r[0]).strip()
            # Strip numeric prefix
            parts = zona_raw.split("-", 1)
            zona_label = parts[1] if len(parts) > 1 else zona_raw
            venta = float(r[1] or 0)
            contrib = float(r[2] or 0)
            margen = (contrib / venta * 100) if venta > 0 else 0
            zona_rows.append({
                "zona": zona_label,
                "venta": round(venta),
                "contrib": round(contrib),
                "margen": round(margen, 1),
            })

        # Merge V REGION zones
        merged: dict = {}
        for zr in zona_rows:
            key = "V REGION" if zr["zona"] in ("V REGION", "V REGION II") else zr["zona"]
            if key not in merged:
                merged[key] = {"zona": key, "venta": 0, "contrib": 0}
            merged[key]["venta"] += zr["venta"]
            merged[key]["contrib"] += zr["contrib"]
        final_rows = []
        for z in merged.values():
            z["margen"] = round((z["contrib"] / z["venta"] * 100) if z["venta"] > 0 else 0, 1)
            final_rows.append(z)
        final_rows.sort(key=lambda r: -r["venta"])

        # Top 10 clientes para esta categoría
        cur.execute(f"""
            SELECT TOP 10 RUT, MAX(NOMBRE) AS nombre,
                   SUM(CAST(VENTA AS float)) AS venta
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list})
              AND {_EXCL_DW}
              AND LTRIM(RTRIM(CATEGORIA)) {cat_filter}
              AND {_FG}
            GROUP BY RUT
            ORDER BY SUM(CAST(VENTA AS float)) DESC
        """)
        top_clientes = []
        for r in cur.fetchall():
            top_clientes.append({
                "rut": str(r[0] or "").strip(),
                "nombre": str(r[1] or "").strip(),
                "venta": round(float(r[2] or 0)),
            })

        conn.close()

        result = {
            "categoria": categoria,
            "label": label,
            "zonas": final_rows,
            "top_clientes": top_clientes,
        }
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "zonas": [], "top_clientes": []}


# Legacy endpoint
@router.get("/kpis")
async def get_kpis(current_user: dict = Depends(get_current_user)):
    try:
        raw = _load_dashboard_raw()
        meses, _ = _parse_periodo("ytd", None)
        result = _build_for_period(raw, meses)
        return {"kpis": result["kpis"], "last_update": ""}
    except Exception as e:
        return {"kpis": {"error": str(e)}, "last_update": ""}
