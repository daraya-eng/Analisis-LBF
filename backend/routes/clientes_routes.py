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

    conn.close()

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
