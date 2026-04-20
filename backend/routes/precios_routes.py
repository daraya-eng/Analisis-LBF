"""
Price/Volume analysis — Category variation, client impact, product decomposition.
Uses BI_TOTAL_FACTURA (includes guías).
"""
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


def _load_precios_data(meses: list[int], categoria: str | None) -> dict:
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)
    cat_filter = f"AND {_CAT_CASE} = '{categoria}'" if categoria else ""

    # ═══ 1. Variación por Categoría ═══
    cur.execute(f"""
        SELECT {_CAT_CASE} AS categoria, ANO,
               SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE {_EXCL_DW}
          AND {_FG}
          AND ANO IN ({_ANO - 1}, {_ANO}) AND MES IN ({mes_list})
        GROUP BY {_CAT_CASE}, ANO
    """)
    cat_raw: dict = {}
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        if cat not in _CATS_VALIDAS:
            continue
        ano = int(r[1])
        if cat not in cat_raw:
            cat_raw[cat] = {"categoria": cat, "venta_25": 0, "venta_26": 0}
        if ano == _ANO:
            cat_raw[cat]["venta_26"] = float(r[2] or 0)
        else:
            cat_raw[cat]["venta_25"] = float(r[2] or 0)

    categorias = []
    total_25 = 0
    total_26 = 0
    for cat in ("SQ", "MAH", "EQM", "EVA"):
        d = cat_raw.get(cat, {"categoria": cat, "venta_25": 0, "venta_26": 0})
        v25 = d["venta_25"]
        v26 = d["venta_26"]
        variacion = v26 - v25
        pct = ((v26 / v25) - 1) * 100 if v25 > 0 else 0
        total_25 += v25
        total_26 += v26
        categorias.append({
            "categoria": cat,
            "venta_25": round(v25),
            "venta_26": round(v26),
            "variacion": round(variacion),
            "variacion_pct": round(pct, 2),
            "perdida_abs": round(abs(variacion)),
        })
    # Total row
    var_total = total_26 - total_25
    categorias.append({
        "categoria": "Total",
        "venta_25": round(total_25),
        "venta_26": round(total_26),
        "variacion": round(var_total),
        "variacion_pct": round(((total_26 / total_25) - 1) * 100, 2) if total_25 > 0 else 0,
        "perdida_abs": round(abs(var_total)),
    })

    # ═══ 2. Detalle por Cliente — top 30 con mayor pérdida absoluta ═══
    cur.execute(f"""
        WITH v26 AS (
            SELECT RUT, NOMBRE,
                   SUM(CAST(VENTA AS float)) AS venta_26,
                   SUM(CAST(CANT AS float)) AS cant_26
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
              {cat_filter}
            GROUP BY RUT, NOMBRE
        ),
        v25 AS (
            SELECT RUT,
                   SUM(CAST(VENTA AS float)) AS venta_25,
                   SUM(CAST(CANT AS float)) AS cant_25
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
              {cat_filter}
            GROUP BY RUT
        )
        SELECT COALESCE(v26.RUT, v25.RUT) AS rut,
               COALESCE(v26.NOMBRE, '') AS nombre,
               COALESCE(v26.venta_26, 0) AS venta_26,
               COALESCE(v25.venta_25, 0) AS venta_25,
               COALESCE(v26.cant_26, 0) AS cant_26,
               COALESCE(v25.cant_25, 0) AS cant_25
        FROM v26
        FULL OUTER JOIN v25 ON v26.RUT = v25.RUT
        WHERE COALESCE(v25.venta_25, 0) > 0
        ORDER BY (COALESCE(v26.venta_26, 0) - COALESCE(v25.venta_25, 0)) ASC
    """)
    clientes = []
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        nombre = str(r[1] or "").strip()
        v26 = float(r[2] or 0)
        v25 = float(r[3] or 0)
        c26 = float(r[4] or 0)
        c25 = float(r[5] or 0)
        variacion = v26 - v25
        var_pct = ((v26 / v25) - 1) * 100 if v25 > 0 else 0
        precio_25 = v25 / c25 if c25 > 0 else 0
        precio_26 = v26 / c26 if c26 > 0 else 0
        clientes.append({
            "rut": rut,
            "nombre": nombre,
            "venta_25": round(v25),
            "venta_26": round(v26),
            "variacion": round(variacion),
            "variacion_pct": round(var_pct, 2),
            "perdida_abs": round(abs(variacion)),
            "precio_25": round(precio_25),
            "precio_26": round(precio_26),
            "cant_25": round(c25),
            "cant_26": round(c26),
        })

    conn.close()

    return {
        "categorias": categorias,
        "clientes": clientes[:50],
    }


def _load_precios_productos(rut: str, meses: list[int], categoria: str | None) -> dict:
    """Product-level price/volume decomposition for a single client."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)
    cat_filter = f"AND {_CAT_CASE} = '{categoria}'" if categoria else ""

    cur.execute(f"""
        WITH p26 AS (
            SELECT CODIGO, DESCRIPCION,
                   SUM(CAST(VENTA AS float)) AS venta_26,
                   SUM(CAST(CANT AS float)) AS cant_26
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
              AND RUT = ? {cat_filter}
            GROUP BY CODIGO, DESCRIPCION
        ),
        p25 AS (
            SELECT CODIGO, DESCRIPCION,
                   SUM(CAST(VENTA AS float)) AS venta_25,
                   SUM(CAST(CANT AS float)) AS cant_25
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
              AND RUT = ? {cat_filter}
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
    total_impacto_precio = 0
    total_impacto_volumen = 0

    for r in cur.fetchall():
        codigo = str(r[0] or "").strip()
        desc = str(r[1] or "").strip()
        v26 = float(r[2] or 0)
        v25 = float(r[3] or 0)
        c26 = float(r[4] or 0)
        c25 = float(r[5] or 0)
        variacion = v26 - v25
        var_pct = ((v26 / v25) - 1) * 100 if v25 > 0 else (100.0 if v26 > 0 else 0)

        if v25 > 0 and v26 > 0 and c25 > 0 and c26 > 0:
            precio_25 = v25 / c25
            precio_26 = v26 / c26
            imp_precio = (precio_26 - precio_25) * c26
            imp_volumen = (c26 - c25) * precio_25
            total_impacto_precio += imp_precio
            total_impacto_volumen += imp_volumen
        else:
            precio_25 = v25 / c25 if c25 > 0 else 0
            precio_26 = v26 / c26 if c26 > 0 else 0
            imp_precio = 0
            if v25 > 0 and v26 == 0:
                imp_volumen = -v25
                total_impacto_volumen -= v25
            elif v26 > 0 and v25 == 0:
                imp_volumen = v26
                total_impacto_volumen += v26
            else:
                imp_volumen = 0

        productos.append({
            "codigo": codigo,
            "descripcion": desc,
            "venta_25": round(v25),
            "venta_26": round(v26),
            "perdida_abs": round(abs(variacion)),
            "variacion_pct": round(var_pct, 2),
            "precio_25": round(precio_25),
            "precio_26": round(precio_26),
            "cant_25": round(c25),
            "cant_26": round(c26),
            "impacto_precio": round(imp_precio),
            "impacto_volumen": round(imp_volumen),
        })

    conn.close()

    return {
        "total_impacto_precio": round(total_impacto_precio),
        "total_impacto_volumen": round(total_impacto_volumen),
        "productos": productos[:50],
    }


@router.get("/")
async def get_precios(
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cache_key = f"precios:{periodo}:{mes}:{categoria}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, label = _parse_periodo(periodo, mes)
        data = _load_precios_data(meses, categoria)
        data["periodo"] = periodo
        data["label"] = label
        mem_set(cache_key, data)
        return data
    except Exception as e:
        return {"error": str(e), "categorias": [], "clientes": []}


@router.get("/productos")
async def get_precios_productos(
    rut: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cache_key = f"precios_prod:{rut}:{periodo}:{mes}:{categoria}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, _ = _parse_periodo(periodo, mes)
        result = _load_precios_productos(rut, meses, categoria)
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "total_impacto_precio": 0,
                "total_impacto_volumen": 0, "productos": []}
