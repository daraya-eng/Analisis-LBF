"""
Client analysis — Unified: segmento, top gainers/losers, price/volume effect.
2026: filtered by active categories (SQ, EVA, MAH, EQM).
2025: total per client (no category filter) for fair comparison.
Uses BI_TOTAL_FACTURA (includes guías).
"""
import datetime
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE, filtro_guias
from cache import mem_get, mem_set

router = APIRouter()

_EXCL_DW = (
    "VENDEDOR NOT IN ("
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
    ") AND CODIGO NOT IN ('FLETE','NINV','SIN','')"
)

_CAT_CASE = """
    CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS'
         THEN 'EQM' ELSE LTRIM(RTRIM(CATEGORIA)) END
"""
_CATS_VALIDAS = ('SQ', 'EVA', 'MAH', 'EQM')
_CATS_IN = ",".join(f"'{c}'" for c in _CATS_VALIDAS)


def _parse_periodo(periodo: str, mes: int | None) -> tuple[list[int], str]:
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
    return list(range(1, _MES + 1)), f"YTD (Ene - {MESES_NOMBRE.get(_MES, '')})"


def _load_clientes_data(meses: list[int]) -> dict:
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)

    # ═══ 0. seg_map: resolver segmento real por RUT (una sola vez) ═══
    cur.execute("""
        SELECT RUT, MAX(LTRIM(RTRIM(SEGMENTO))) AS SEGMENTO
        FROM DW_TOTAL_FACTURA
        WHERE SEGMENTO IS NOT NULL AND SEGMENTO <> ''
        GROUP BY RUT
    """)
    _seg_map: dict = {str(r[0]).strip(): str(r[1]).strip() for r in cur.fetchall()}

    def _resolver_seg(rut: str, seg_raw: str) -> str:
        seg = seg_raw.strip() if seg_raw else ""
        if not seg:
            seg = _seg_map.get(rut.strip(), "PRIVADO")
        return "PUBLICO" if "PUBLICO" in seg else "PRIVADO"

    # ═══ 1. Venta 2026 por cliente — FILTRADO por categorías activas ═══
    cur.execute(f"""
        SELECT RUT, MAX(NOMBRE) AS NOMBRE,
               MAX(LTRIM(RTRIM(ISNULL(SEGMENTO, '')))) AS segmento,
               SUM(CAST(VENTA AS float)) AS venta_26,
               SUM(CAST(CANT AS float)) AS cant_26,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_26
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
          AND {_CAT_CASE} IN ({_CATS_IN})
          AND {_FG}
        GROUP BY RUT
    """)
    cli_26 = {}
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        seg = _resolver_seg(rut, str(r[2] or ""))
        cli_26[rut] = {
            "rut": rut,
            "nombre": str(r[1] or "").strip(),
            "segmento": seg,
            "venta_26": float(r[3] or 0),
            "cant_26": float(r[4] or 0),
            "contrib_26": float(r[5] or 0),
        }

    # ═══ 2. Venta 2025 por cliente — SIN filtro de categoría (total) ═══
    cur.execute(f"""
        SELECT RUT,
               MAX(NOMBRE) AS nombre,
               SUM(CAST(VENTA AS float)) AS venta_25,
               SUM(CAST(CANT AS float)) AS cant_25,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_25
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
          AND {_FG}
        GROUP BY RUT
    """)
    cli_25 = {}
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        cli_25[rut] = {
            "nombre": str(r[1] or "").strip(),
            "venta_25": float(r[2] or 0),
            "cant_25": float(r[3] or 0),
            "contrib_25": float(r[4] or 0),
        }

    # ═══ 3. Variación por Categoría 2026 ═══
    cur.execute(f"""
        SELECT {_CAT_CASE} AS categoria,
               SUM(CAST(VENTA AS float)) AS venta_26,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_26
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
          AND {_CAT_CASE} IN ({_CATS_IN})
          AND {_FG}
        GROUP BY {_CAT_CASE}
    """)
    cat_data = []
    total_venta_26 = 0
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        v26 = float(r[1] or 0)
        c26 = float(r[2] or 0)
        total_venta_26 += v26
        cat_data.append({
            "categoria": cat,
            "venta_26": round(v26),
            "contrib_26": round(c26),
            "margen": round(c26 / v26 * 100, 1) if v26 > 0 else 0,
        })
    # Add % of total
    for cd in cat_data:
        cd["pct"] = round(cd["venta_26"] / total_venta_26 * 100, 1) if total_venta_26 > 0 else 0
    cat_data.sort(key=lambda x: -x["venta_26"])

    # ═══ 4. Merge: unir 2026 (por cat) + 2025 (total) ═══
    all_ruts = set(cli_26.keys()) | set(cli_25.keys())
    clientes = []
    for rut in all_ruts:
        d26 = cli_26.get(rut, {})
        d25 = cli_25.get(rut, {})
        v26 = d26.get("venta_26", 0)
        v25 = d25.get("venta_25", 0)
        c26 = d26.get("cant_26", 0)
        c25 = d25.get("cant_25", 0)
        diff = v26 - v25
        crec = ((v26 / v25) - 1) * 100 if v25 > 0 else (100.0 if v26 > 0 else 0)
        precio_25 = v25 / c25 if c25 > 0 else 0
        precio_26 = v26 / c26 if c26 > 0 else 0

        clientes.append({
            "rut": rut,
            "nombre": d26.get("nombre", "") or d25.get("nombre", ""),
            "segmento": d26.get("segmento") or _resolver_seg(rut, ""),
            "venta_26": round(v26),
            "venta_25": round(v25),
            "diff": round(diff),
            "crec": round(crec, 1),
            "precio_25": round(precio_25),
            "precio_26": round(precio_26),
            "cant_25": round(c25),
            "cant_26": round(c26),
            "contrib_26": round(d26.get("contrib_26", 0)),
            "contrib_25": round(d25.get("contrib_25", 0)),
        })

    # ═══ 5. Totales por segmento — query directa (igual que dashboard_routes.py) ═══
    # Se consulta BI_TOTAL_FACTURA directamente por RUT+SEGMENTO para que los
    # totales de venta_26/venta_25 coincidan exactamente con el Panel Principal.
    # La resolución de segmento es por registro (no MAX por cliente), eliminando
    # cualquier diferencia de asignación para clientes con SEGMENTO mixto.

    cur.execute(f"""
        SELECT LTRIM(RTRIM(ISNULL(f.SEGMENTO, ''))) AS seg_raw,
               f.RUT,
               SUM(CAST(f.VENTA AS float)) AS venta_26
        FROM BI_TOTAL_FACTURA f
        WHERE f.ANO = {_ANO} AND f.MES IN ({mes_list}) AND {_EXCL_DW}
          AND {_CAT_CASE} IN ({_CATS_IN})
          AND {_FG}
        GROUP BY LTRIM(RTRIM(ISNULL(f.SEGMENTO, ''))), f.RUT
    """)
    seg_v26: dict[str, float] = {"PUBLICO": 0.0, "PRIVADO": 0.0}
    seg_ruts_26: dict[str, set] = {"PUBLICO": set(), "PRIVADO": set()}
    for r in cur.fetchall():
        rut = str(r[1] or "").strip()
        seg = _resolver_seg(rut, str(r[0] or ""))
        seg_v26[seg] += float(r[2] or 0)
        seg_ruts_26[seg].add(rut)

    cur.execute(f"""
        SELECT LTRIM(RTRIM(ISNULL(f.SEGMENTO, ''))) AS seg_raw,
               f.RUT,
               SUM(CAST(f.VENTA AS float)) AS venta_25
        FROM BI_TOTAL_FACTURA f
        WHERE f.ANO = {_ANO - 1} AND f.MES IN ({mes_list}) AND {_EXCL_DW} AND {_FG}
        GROUP BY LTRIM(RTRIM(ISNULL(f.SEGMENTO, ''))), f.RUT
    """)
    seg_v25: dict[str, float] = {"PUBLICO": 0.0, "PRIVADO": 0.0}
    for r in cur.fetchall():
        rut = str(r[1] or "").strip()
        seg = _resolver_seg(rut, str(r[0] or ""))
        seg_v25[seg] += float(r[2] or 0)

    # Efecto precio/volumen sigue desde la lista de clientes (requiere granularidad cliente)
    kpis_seg: dict[str, dict] = {}
    for seg in ("PUBLICO", "PRIVADO"):
        seg_cli = [c for c in clientes if c["segmento"] == seg]
        v26 = seg_v26[seg]
        v25 = seg_v25[seg]
        crec = ((v26 / v25) - 1) * 100 if v25 > 0 else (100.0 if v26 > 0 else 0.0)
        ef_precio = 0.0
        ef_volumen = 0.0
        for c in seg_cli:
            if c["cant_25"] > 0 and c["cant_26"] > 0:
                p25 = c["venta_25"] / c["cant_25"]
                p26 = c["venta_26"] / c["cant_26"]
                ef_precio  += (p26 - p25) * c["cant_26"]
                ef_volumen += (c["cant_26"] - c["cant_25"]) * p25
        kpis_seg[seg] = {
            "venta_26":       round(v26),
            "venta_25":       round(v25),
            "crec":           round(crec, 1),
            "n_clientes":     len(seg_ruts_26[seg]),
            "efecto_precio":  round(ef_precio),
            "efecto_volumen": round(ef_volumen),
            "diff":           round(v26 - v25),
        }

    conn.close()

    # ═══ 6. Todos los clientes ordenados por diferencia ═══
    with_history = [c for c in clientes if c["venta_25"] > 0 or c["venta_26"] > 0]
    perdedores = sorted([c for c in with_history if c["diff"] < 0], key=lambda c: c["diff"])
    ganadores = sorted([c for c in with_history if c["diff"] >= 0], key=lambda c: -c["diff"])

    return {
        "kpis_segmento": kpis_seg,
        "categorias": cat_data,
        "perdedores": perdedores,
        "ganadores": ganadores,
    }


def _load_cliente_detalle(rut: str, meses: list[int]) -> dict:
    """Price/Volume effect + gained/lost products for a single client.
    2026: filtered by active categories. 2025: all products (no cat filter)."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)

    cur.execute(f"""
        WITH p26 AS (
            SELECT CODIGO, DESCRIPCION,
                   SUM(CAST(VENTA AS float)) AS venta_26,
                   SUM(CAST(CANT AS float)) AS cant_26
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_CAT_CASE} IN ({_CATS_IN})
              AND {_FG}
              AND RUT = ?
            GROUP BY CODIGO, DESCRIPCION
        ),
        p25 AS (
            SELECT CODIGO, DESCRIPCION,
                   SUM(CAST(VENTA AS float)) AS venta_25,
                   SUM(CAST(CANT AS float)) AS cant_25
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
              AND RUT = ?
            GROUP BY CODIGO, DESCRIPCION
        )
        SELECT COALESCE(p26.CODIGO, p25.CODIGO) AS codigo,
               COALESCE(p26.DESCRIPCION, p25.DESCRIPCION) AS descripcion,
               COALESCE(p26.venta_26, 0) AS venta_26,
               COALESCE(p25.venta_25, 0) AS venta_25,
               COALESCE(p26.cant_26, 0) AS cant_26,
               COALESCE(p25.cant_25, 0) AS cant_25
        FROM p26
        FULL OUTER JOIN p25 ON p26.CODIGO = p25.CODIGO
        ORDER BY ABS(COALESCE(p26.venta_26, 0) - COALESCE(p25.venta_25, 0)) DESC
    """, (rut, rut))

    productos = []
    total_efecto_precio = 0
    total_efecto_volumen = 0
    productos_perdidos = []
    productos_nuevos = []

    for r in cur.fetchall():
        codigo = str(r[0] or "").strip()
        desc = str(r[1] or "").strip()
        v26 = float(r[2] or 0)
        v25 = float(r[3] or 0)
        c26 = float(r[4] or 0)
        c25 = float(r[5] or 0)

        if v25 > 0 and v26 > 0 and c25 > 0 and c26 > 0:
            precio_25 = v25 / c25
            precio_26 = v26 / c26
            efecto_precio = (precio_26 - precio_25) * c26
            efecto_volumen = (c26 - c25) * precio_25
            total_efecto_precio += efecto_precio
            total_efecto_volumen += efecto_volumen
            productos.append({
                "codigo": codigo,
                "descripcion": desc,
                "venta_26": round(v26),
                "venta_25": round(v25),
                "cant_26": round(c26),
                "cant_25": round(c25),
                "precio_26": round(precio_26),
                "precio_25": round(precio_25),
                "efecto_precio": round(efecto_precio),
                "efecto_volumen": round(efecto_volumen),
            })
        elif v25 > 0 and v26 == 0:
            total_efecto_volumen -= v25
            productos_perdidos.append({
                "codigo": codigo,
                "descripcion": desc,
                "venta_25": round(v25),
                "cant_25": round(c25),
            })
        elif v26 > 0 and v25 == 0:
            total_efecto_volumen += v26
            productos_nuevos.append({
                "codigo": codigo,
                "descripcion": desc,
                "venta_26": round(v26),
                "cant_26": round(c26),
            })

    conn.close()

    vol_perdidos = -sum(p["venta_25"] for p in productos_perdidos)
    vol_nuevos   =  sum(p["venta_26"] for p in productos_nuevos)
    vol_ambos    = round(total_efecto_volumen - vol_perdidos - vol_nuevos)

    return {
        "efecto_precio":    round(total_efecto_precio),
        "efecto_volumen":   round(total_efecto_volumen),
        "vol_ambos":        vol_ambos,
        "vol_perdidos":     round(vol_perdidos),
        "vol_nuevos":       round(vol_nuevos),
        "productos":         sorted(productos, key=lambda p: abs(p["efecto_precio"]), reverse=True)[:30],
        "productos_perdidos": sorted(productos_perdidos, key=lambda p: -p["venta_25"])[:20],
        "productos_nuevos":   sorted(productos_nuevos, key=lambda p: -p["venta_26"])[:20],
    }


@router.get("/")
async def get_clientes(
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cache_key = f"clientes:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, label = _parse_periodo(periodo, mes)
        data = _load_clientes_data(meses)
        data["periodo"] = periodo
        data["label"] = label
        mem_set(cache_key, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis_segmento": {}, "categorias": [],
                "perdedores": [], "ganadores": []}


@router.get("/detalle")
async def get_cliente_detalle(
    rut: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cache_key = f"cli_det:{rut}:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, _ = _parse_periodo(periodo, mes)
        result = _load_cliente_detalle(rut, meses)
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "efecto_precio": 0, "efecto_volumen": 0,
                "productos": [], "productos_perdidos": [], "productos_nuevos": []}


def _load_efecto_pv(meses: list[int]) -> dict:
    """P/V effect aggregated by total, segment, category.
    Calculated at (RUT x CODIGO) level for accurate unit prices.
    """
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)

    # seg_map: resolve real segmento by RUT
    cur.execute("""
        SELECT RUT, MAX(LTRIM(RTRIM(SEGMENTO)))
        FROM DW_TOTAL_FACTURA
        WHERE SEGMENTO IS NOT NULL AND SEGMENTO <> ''
        GROUP BY RUT
    """)
    seg_map: dict = {str(r[0]).strip(): str(r[1]).strip() for r in cur.fetchall()}

    def _seg(rut: str, seg_raw: str) -> str:
        s = seg_raw.strip() if seg_raw else seg_map.get(rut.strip(), "PRIVADO")
        return "PUBLICO" if "PUBLICO" in s else "PRIVADO"

    # Year 2026: product x client (active categories only)
    cur.execute(f"""
        SELECT LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)),
               {_CAT_CASE} AS cat,
               MAX(LTRIM(RTRIM(ISNULL(SEGMENTO,'')))) AS seg_raw,
               SUM(CAST(VENTA AS float)), SUM(CAST(CANT AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES IN ({mes_list})
          AND {_EXCL_DW} AND {_FG}
          AND {_CAT_CASE} IN ({_CATS_IN})
        GROUP BY LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)), {_CAT_CASE}
    """)
    data_26: dict = {}
    for r in cur.fetchall():
        rut, cod = str(r[0]).strip(), str(r[1]).strip()
        cat = str(r[2] or "").strip()
        seg = _seg(rut, str(r[3] or ""))
        key = (rut, cod)
        if key in data_26:
            data_26[key]["v"] += float(r[4] or 0)
            data_26[key]["c"] += float(r[5] or 0)
        else:
            data_26[key] = {"cat": cat, "seg": seg, "v": float(r[4] or 0), "c": float(r[5] or 0)}

    # Mapa CODIGO → categoría 2026 (para asignar a productos 2025)
    cod_to_cat26: dict[str, str] = {}
    for (rut, cod), d in data_26.items():
        if cod not in cod_to_cat26:
            cod_to_cat26[cod] = d["cat"]

    # Mapeo estructural histórico: categorías 2025 que fueron renombradas en 2026
    # GD → EQM, SH → EVA (confirmado por análisis de 212 productos)
    _HIST_CAT: dict[str, str | None] = {
        "GD": "EQM", "SH": "EVA", "SERVICIOS": "EQM",
    }

    def _resolve_cat_25(cod: str, cat_raw: str) -> str | None:
        # Prioridad 1: categoría real del producto en 2026
        if cod in cod_to_cat26:
            return cod_to_cat26[cod]
        # Prioridad 2: mapeo estructural histórico
        cat = (cat_raw or "").strip().upper()
        if cat in _CATS_VALIDAS:
            return cat
        return _HIST_CAT.get(cat)  # None = excluir

    # Year 2025: sin filtro de categoría → se asigna la cat 2026 del producto
    cur.execute(f"""
        SELECT LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)),
               MAX(LTRIM(RTRIM(ISNULL(CATEGORIA,'')))) AS cat_raw,
               MAX(LTRIM(RTRIM(ISNULL(SEGMENTO,'')))) AS seg_raw,
               SUM(CAST(VENTA AS float)), SUM(CAST(CANT AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES IN ({mes_list})
          AND {_EXCL_DW} AND {_FG}
        GROUP BY LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO))
    """)
    data_25: dict = {}
    for r in cur.fetchall():
        rut, cod = str(r[0]).strip(), str(r[1]).strip()
        cat_raw = str(r[2] or "").strip()
        seg = _seg(rut, str(r[3] or ""))
        cat = _resolve_cat_25(cod, cat_raw)
        if cat is None:
            continue  # producto sin categoría activa en 2026 ni mapeo histórico
        data_25[(rut, cod)] = {"cat": cat, "seg": seg, "v": float(r[4] or 0), "c": float(r[5] or 0)}

    conn.close()

    # Accumulators — iterate over union of both years so lost products are counted in v25
    from collections import defaultdict
    acc_seg: dict = defaultdict(lambda: {"ef_p": 0.0, "ef_v": 0.0, "v25": 0.0, "v26": 0.0})
    acc_cat: dict = defaultdict(lambda: {"ef_p": 0.0, "ef_v": 0.0, "v25": 0.0, "v26": 0.0})
    total   = {"ef_p": 0.0, "ef_v": 0.0, "v25": 0.0, "v26": 0.0}

    all_keys = set(data_26.keys()) | set(data_25.keys())
    for key in all_keys:
        d26 = data_26.get(key)
        d25 = data_25.get(key)
        # Resolve seg/cat: prefer 2026 metadata, fall back to 2025
        meta = d26 or d25
        seg = meta["seg"]
        cat = meta["cat"]

        v26 = d26["v"] if d26 else 0.0
        c26 = d26["c"] if d26 else 0.0
        v25 = d25["v"] if d25 else 0.0
        c25 = d25["c"] if d25 else 0.0

        acc_seg[seg]["v26"] += v26
        acc_cat[cat]["v26"] += v26
        total["v26"] += v26
        acc_seg[seg]["v25"] += v25
        acc_cat[cat]["v25"] += v25
        total["v25"] += v25

        if v25 > 0 and v26 > 0 and c25 > 0 and c26 > 0:
            p25, p26 = v25 / c25, v26 / c26
            ef_p = (p26 - p25) * c26
            ef_v = (c26 - c25) * p25
            acc_seg[seg]["ef_p"] += ef_p
            acc_seg[seg]["ef_v"] += ef_v
            acc_cat[cat]["ef_p"] += ef_p
            acc_cat[cat]["ef_v"] += ef_v
            total["ef_p"] += ef_p
            total["ef_v"] += ef_v
        elif v25 != 0 or v26 != 0:
            # Casos restantes: valores negativos (NC/devoluciones), sin cantidad, o producto nuevo/perdido
            # Toda la diferencia va a efecto volumen para garantizar balance del waterfall
            ev = v26 - v25
            acc_seg[seg]["ef_v"] += ev
            acc_cat[cat]["ef_v"] += ev
            total["ef_v"] += ev

    def _fmt(a):
        return {
            "venta_25":      round(a["v25"]),
            "venta_26":      round(a["v26"]),
            "efecto_precio":  round(a["ef_p"]),
            "efecto_volumen": round(a["ef_v"]),
        }

    cat_order = ["MAH", "EQM", "SQ", "EVA"]
    categorias = [
        {"categoria": cat, **_fmt(acc_cat[cat])}
        for cat in cat_order if cat in acc_cat
    ]
    # Append any unexpected categories
    for cat in acc_cat:
        if cat not in cat_order:
            categorias.append({"categoria": cat, **_fmt(acc_cat[cat])})

    return {
        "total":      _fmt(total),
        "segmentos":  {seg: _fmt(vals) for seg, vals in acc_seg.items()},
        "categorias": categorias,
    }


def _load_efecto_pv_productos(meses: list[int]) -> list[dict]:
    """P/V effect at product (CODIGO) level.
    Same category mapping logic as _load_efecto_pv.
    Returns list sorted by abs(efecto_precio) desc."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)

    # 2026: active categories, RUT x CODIGO x CAT
    cur.execute(f"""
        SELECT LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)),
               MAX(ISNULL(DESCRIPCION,'')) AS nom,
               {_CAT_CASE} AS cat,
               SUM(CAST(VENTA AS float)), SUM(CAST(CANT AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES IN ({mes_list})
          AND {_EXCL_DW} AND {_FG}
          AND {_CAT_CASE} IN ({_CATS_IN})
        GROUP BY LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)), {_CAT_CASE}
    """)
    data_26: dict = {}
    cod_meta: dict = {}  # cod -> {desc, cat}
    for r in cur.fetchall():
        rut, cod = str(r[0]).strip(), str(r[1]).strip()
        desc = str(r[2] or "").strip()
        cat = str(r[3] or "").strip()
        key = (rut, cod)
        if cod not in cod_meta:
            cod_meta[cod] = {"desc": desc, "cat": cat}
        v, c = float(r[4] or 0), float(r[5] or 0)
        if key in data_26:
            data_26[key]["v"] += v
            data_26[key]["c"] += c
        else:
            data_26[key] = {"v": v, "c": c}

    cod_to_cat26: dict[str, str] = {cod: m["cat"] for cod, m in cod_meta.items()}

    _HIST_CAT: dict[str, str | None] = {"GD": "EQM", "SH": "EVA", "SERVICIOS": "EQM"}

    def _resolve_cat_25(cod: str, cat_raw: str) -> str | None:
        if cod in cod_to_cat26:
            return cod_to_cat26[cod]
        cat = (cat_raw or "").strip().upper()
        if cat in _CATS_VALIDAS:
            return cat
        return _HIST_CAT.get(cat)

    # 2025: no category filter, RUT x CODIGO
    cur.execute(f"""
        SELECT LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO)),
               MAX(ISNULL(CATEGORIA,'')) AS cat_raw,
               MAX(ISNULL(DESCRIPCION,'')) AS nom,
               SUM(CAST(VENTA AS float)), SUM(CAST(CANT AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES IN ({mes_list})
          AND {_EXCL_DW} AND {_FG}
        GROUP BY LTRIM(RTRIM(RUT)), LTRIM(RTRIM(CODIGO))
    """)
    data_25: dict = {}
    for r in cur.fetchall():
        rut, cod = str(r[0]).strip(), str(r[1]).strip()
        cat_raw = str(r[2] or "").strip()
        desc = str(r[3] or "").strip()
        cat = _resolve_cat_25(cod, cat_raw)
        if cat is None:
            continue
        if cod not in cod_meta:
            cod_meta[cod] = {"desc": desc, "cat": cat}
        data_25[(rut, cod)] = {"v": float(r[4] or 0), "c": float(r[5] or 0), "cat": cat}

    conn.close()

    # Accumulate per CODIGO
    from collections import defaultdict
    by_cod: dict = defaultdict(lambda: {"v25": 0.0, "c25": 0.0, "v26": 0.0, "c26": 0.0, "ef_p": 0.0, "ef_v": 0.0})

    all_keys = set(data_26.keys()) | set(data_25.keys())
    for key in all_keys:
        rut, cod = key
        d26 = data_26.get(key)
        d25 = data_25.get(key)
        v26 = d26["v"] if d26 else 0.0
        c26 = d26["c"] if d26 else 0.0
        v25 = d25["v"] if d25 else 0.0
        c25 = d25["c"] if d25 else 0.0

        by_cod[cod]["v25"] += v25
        by_cod[cod]["c25"] += c25
        by_cod[cod]["v26"] += v26
        by_cod[cod]["c26"] += c26

        if v25 > 0 and v26 > 0 and c25 > 0 and c26 > 0:
            p25, p26 = v25 / c25, v26 / c26
            by_cod[cod]["ef_p"] += (p26 - p25) * c26
            by_cod[cod]["ef_v"] += (c26 - c25) * p25
        elif v25 != 0 or v26 != 0:
            by_cod[cod]["ef_v"] += (v26 - v25)

    productos = []
    for cod, a in by_cod.items():
        v25, v26, c25, c26 = a["v25"], a["v26"], a["c25"], a["c26"]
        p25 = v25 / c25 if c25 > 0 else 0.0
        p26 = v26 / c26 if c26 > 0 else 0.0
        if p25 > 0:
            delta_pct = ((p26 / p25) - 1) * 100
        else:
            delta_pct = 100.0 if p26 > 0 else 0.0
        meta = cod_meta.get(cod, {"desc": "", "cat": ""})
        productos.append({
            "codigo":        cod,
            "descripcion":   meta["desc"],
            "categoria":     meta["cat"],
            "venta_25":      round(v25),
            "venta_26":      round(v26),
            "cant_25":       round(c25),
            "cant_26":       round(c26),
            "precio_25":     round(p25),
            "precio_26":     round(p26),
            "delta_precio_pct": round(delta_pct, 1),
            "efecto_precio": round(a["ef_p"]),
            "efecto_volumen": round(a["ef_v"]),
        })

    return sorted(productos, key=lambda p: abs(p["efecto_precio"]), reverse=True)


@router.get("/efecto-pv/productos")
async def get_efecto_pv_productos(
    periodo: str = Query("mes"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if mes is None:
            mes = hoy()["mes"]
        meses, _ = _parse_periodo(periodo, mes)
        ck = f"cli:efecto_pv_prod:{periodo}:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_efecto_pv_productos(meses)
        mem_set(ck, data)
        return data
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e)}


@router.get("/efecto-pv")
async def get_efecto_pv(
    periodo: str = Query("mes"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if mes is None:
            mes = hoy()["mes"]
        meses, label = _parse_periodo(periodo, mes)
        ck = f"cli:efecto_pv:{periodo}:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_efecto_pv(meses)
        data["label"] = label
        mem_set(ck, data)
        return data
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e)}
