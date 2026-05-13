"""
Renasys TPN — Módulo de análisis de Terapia de Presión Negativa.
2026+: CLASE = 'TPN'
2025-: CLASE = 'EQUIPOS MAH' AND SUBCLASE LIKE '%TERAPIA DE PRESION NEGATIVA%'
Columnas de equipos instalados son placeholder hasta integración con IT.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, filtro_guias
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

_FILTRO_TPN = (
    "(CLASE = 'TPN' OR "
    "(CLASE = 'EQUIPOS MAH' AND SUBCLASE LIKE '%TERAPIA DE PRESION NEGATIVA%'))"
)

_MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
          "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

_REGION_META = {
    "1":  {"nombre": "Tarapacá",            "lat": -20.21, "lon": -70.15},
    "2":  {"nombre": "Antofagasta",          "lat": -23.65, "lon": -70.40},
    "3":  {"nombre": "Atacama",              "lat": -27.37, "lon": -70.33},
    "4":  {"nombre": "Coquimbo",             "lat": -29.91, "lon": -71.25},
    "5":  {"nombre": "Valparaíso",           "lat": -33.04, "lon": -71.62},
    "6":  {"nombre": "O'Higgins",            "lat": -34.17, "lon": -70.74},
    "7":  {"nombre": "Maule",                "lat": -35.43, "lon": -71.67},
    "8":  {"nombre": "Biobío",               "lat": -36.82, "lon": -73.05},
    "9":  {"nombre": "La Araucanía",         "lat": -38.74, "lon": -72.60},
    "10": {"nombre": "Los Lagos",            "lat": -41.47, "lon": -72.94},
    "11": {"nombre": "Aysén",                "lat": -45.57, "lon": -72.07},
    "12": {"nombre": "Magallanes",           "lat": -53.16, "lon": -70.91},
    "13": {"nombre": "Metropolitana",        "lat": -33.46, "lon": -70.65},
    "14": {"nombre": "Los Ríos",             "lat": -39.81, "lon": -73.25},
    "15": {"nombre": "Arica y Parinacota",   "lat": -18.48, "lon": -70.32},
    "16": {"nombre": "Ñuble",               "lat": -36.61, "lon": -72.10},
}

_SUBCLASE_LABEL = {
    "TPN KITS":       "Kits",
    "TPN CANISTER":   "Canister",
    "TPN DESECHABLE": "Desechable",
}


def _load_renasys(mes: int) -> dict:
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()

    # ── 1. Clientes del mes con datos geo ─────────────────────────────────────
    cur.execute(f"""
        SELECT
            RUT,
            MAX(NOMBRE)                              AS nombre,
            MAX(LTRIM(RTRIM(ISNULL(REGION,''))))     AS region,
            MAX(LTRIM(RTRIM(ISNULL(CIUDAD,''))))     AS ciudad,
            MAX(VENDEDOR)                            AS vendedor,
            MAX(LTRIM(RTRIM(ISNULL(SEGMENTO,''))))   AS segmento,
            MAX(LTRIM(RTRIM(ISNULL(KAM,''))))        AS kam,
            MAX(LTRIM(RTRIM(ISNULL(TIPO,''))))       AS tipo,
            SUM(CAST(VENTA AS float))                AS venta_mes,
            SUM(CAST(CONTRIBUCION AS float))         AS contrib_mes,
            SUM(CAST(CANT AS float))                 AS cant_mes
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {mes}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
        GROUP BY RUT
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    mes_data: dict[str, dict] = {}
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        mes_data[rut] = {
            "rut":       rut,
            "nombre":    str(r[1] or "").strip(),
            "region":    str(r[2] or "").strip(),
            "ciudad":    str(r[3] or "").strip(),
            "vendedor":  str(r[4] or "").strip(),
            "segmento":  str(r[5] or "").strip() or "PRIVADO",
            "kam":       str(r[6] or "").strip(),
            "tipo":      str(r[7] or "").strip(),
            "venta_mes": float(r[8] or 0),
            "contrib_mes": float(r[9] or 0),
            "cant_mes":  float(r[10] or 0),
        }

    # ── 2. Venta últimos 12 meses por cliente ─────────────────────────────────
    mes_ini = mes + 1 if mes < 12 else 1
    ventana_sql = (
        f"((ANO = {_ANO - 1} AND MES >= {mes_ini}) OR (ANO = {_ANO} AND MES <= {mes}))"
        if mes < 12 else f"ANO = {_ANO} AND MES <= {mes}"
    )
    cur.execute(f"""
        SELECT RUT,
               SUM(CAST(VENTA AS float))        AS venta_12m,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_12m
        FROM BI_TOTAL_FACTURA
        WHERE {ventana_sql}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
        GROUP BY RUT
    """)
    anual_data: dict[str, dict] = {
        str(r[0] or "").strip(): {"venta_12m": float(r[1] or 0), "contrib_12m": float(r[2] or 0)}
        for r in cur.fetchall()
    }

    # ── 3. Modelos del mes (SUBCLASE + DESCRIPCION) ────────────────────────────
    cur.execute(f"""
        SELECT
            LTRIM(RTRIM(ISNULL(SUBCLASE,'')))       AS subclase,
            LTRIM(RTRIM(ISNULL(DESCRIPCION,'')))    AS descripcion,
            SUM(CAST(VENTA AS float))               AS venta,
            SUM(CAST(CONTRIBUCION AS float))        AS contrib,
            SUM(CAST(CANT AS float))                AS cant
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {mes}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
        GROUP BY LTRIM(RTRIM(ISNULL(SUBCLASE,''))), LTRIM(RTRIM(ISNULL(DESCRIPCION,'')))
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    modelos_raw = []
    subclase_agg: dict[str, dict] = {}
    for r in cur.fetchall():
        sc   = str(r[0] or "").strip()
        desc = str(r[1] or "").strip()
        v    = float(r[2] or 0)
        c    = float(r[3] or 0)
        cant = float(r[4] or 0)
        modelos_raw.append({"subclase": sc, "descripcion": desc, "venta": round(v), "contrib": round(c), "cant": round(cant, 1)})
        if sc not in subclase_agg:
            subclase_agg[sc] = {"subclase": sc, "label": _SUBCLASE_LABEL.get(sc, sc), "venta": 0.0, "contrib": 0.0, "cant": 0.0}
        subclase_agg[sc]["venta"]  += v
        subclase_agg[sc]["contrib"] += c
        subclase_agg[sc]["cant"]   += cant

    subclases = sorted(subclase_agg.values(), key=lambda x: -x["venta"])
    total_sc = sum(s["venta"] for s in subclases) or 1
    for s in subclases:
        s["pct"]    = round(s["venta"] / total_sc * 100, 1)
        s["margen"] = round(s["contrib"] / s["venta"] * 100, 1) if s["venta"] > 0 else 0.0
        s["venta"]  = round(s["venta"])
        s["contrib"] = round(s["contrib"])

    # ── 4. Tendencia mensual (año en curso) ───────────────────────────────────
    cur.execute(f"""
        SELECT MES,
               SUM(CAST(VENTA AS float))        AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib,
               COUNT(DISTINCT RUT)              AS n_clientes
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
        GROUP BY MES ORDER BY MES
    """)
    tendencia = []
    for r in cur.fetchall():
        m = int(r[0])
        v = float(r[1] or 0)
        c = float(r[2] or 0)
        tendencia.append({
            "mes":        m,
            "label":      _MESES[m][:3],
            "venta":      round(v),
            "contrib":    round(c),
            "margen":     round(c / v * 100, 1) if v > 0 else 0.0,
            "n_clientes": int(r[3] or 0),
        })

    # ── 5. Mes anterior para variación ────────────────────────────────────────
    mes_ant = mes - 1 if mes > 1 else 12
    ano_ant = _ANO if mes > 1 else _ANO - 1
    cur.execute(f"""
        SELECT SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {ano_ant} AND MES = {mes_ant}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
    """)
    r = cur.fetchone()
    venta_mes_ant = float(r[0] or 0) if r else 0.0
    conn.close()

    # ── 6. Armar tabla de clientes + regiones + zonas ─────────────────────────
    all_ruts = set(mes_data.keys()) | set(anual_data.keys())
    clientes = []
    regiones_agg: dict[str, dict] = {}
    zonas_agg: dict[str, dict] = {}

    for rut in all_ruts:
        dm = mes_data.get(rut, {})
        da = anual_data.get(rut, {})
        v_mes  = dm.get("venta_mes", 0)
        c_mes  = dm.get("contrib_mes", 0)
        v_12m  = da.get("venta_12m", 0)
        c_12m  = da.get("contrib_12m", 0)
        margen_mes = round(c_mes / v_mes * 100, 1) if v_mes > 0 else 0.0
        margen_12m = round(c_12m / v_12m * 100, 1) if v_12m > 0 else 0.0
        region  = dm.get("region", "")
        ciudad  = dm.get("ciudad", "")
        vendedor = dm.get("vendedor", "")
        kam     = dm.get("kam", "")
        nombre  = dm.get("nombre") or rut

        clientes.append({
            "rut":         rut,
            "nombre":      nombre,
            "region":      region,
            "ciudad":      ciudad,
            "vendedor":    vendedor,
            "segmento":    dm.get("segmento", "PRIVADO"),
            "kam":         kam,
            "tipo":        dm.get("tipo", ""),
            "venta_mes":   round(v_mes),
            "contrib_mes": round(c_mes),
            "margen_mes":  margen_mes,
            "venta_12m":   round(v_12m),
            "contrib_12m": round(c_12m),
            "margen_12m":  margen_12m,
            "n_equipos":        None,
            "pct_parque":       None,
            "eficiencia_mes":   None,
            "eficiencia_12m":   None,
            "resultado_op_12m": None,
            "margen_op_12m":    None,
        })

        # Regiones (solo clientes con venta en el mes)
        if v_mes > 0 and region:
            if region not in regiones_agg:
                meta = _REGION_META.get(region, {"nombre": f"Región {region}", "lat": -35.0, "lon": -71.0})
                regiones_agg[region] = {
                    "region": region, "nombre": meta["nombre"],
                    "lat": meta["lat"], "lon": meta["lon"],
                    "venta": 0.0, "contrib": 0.0, "n_clientes": 0,
                    "top_cliente": "",
                }
            regiones_agg[region]["venta"]  += v_mes
            regiones_agg[region]["contrib"] += c_mes
            regiones_agg[region]["n_clientes"] += 1
            if not regiones_agg[region]["top_cliente"] or v_mes > (
                next((c["venta_mes"] for c in clientes if c["nombre"] == regiones_agg[region]["top_cliente"]), 0)
            ):
                regiones_agg[region]["top_cliente"] = nombre

        # Zonas
        if v_mes > 0 and vendedor:
            zona_key = vendedor
            if zona_key not in zonas_agg:
                zonas_agg[zona_key] = {"vendedor": vendedor, "kam": kam, "venta": 0.0, "contrib": 0.0, "n_clientes": 0}
            zonas_agg[zona_key]["venta"]  += v_mes
            zonas_agg[zona_key]["contrib"] += c_mes
            zonas_agg[zona_key]["n_clientes"] += 1

    clientes.sort(key=lambda c: -c["venta_mes"])

    regiones = sorted(regiones_agg.values(), key=lambda r: -r["venta"])
    for r in regiones:
        r["venta"]  = round(r["venta"])
        r["contrib"] = round(r["contrib"])
        r["margen"] = round(r["contrib"] / r["venta"] * 100, 1) if r["venta"] > 0 else 0.0

    zonas = sorted(zonas_agg.values(), key=lambda z: -z["venta"])
    for z in zonas:
        z["venta"]  = round(z["venta"])
        z["contrib"] = round(z["contrib"])
        z["margen"] = round(z["contrib"] / z["venta"] * 100, 1) if z["venta"] > 0 else 0.0

    total_venta_mes   = sum(d["venta_mes"]   for d in mes_data.values())
    total_contrib_mes = sum(d["contrib_mes"] for d in mes_data.values())
    total_venta_12m   = sum(d["venta_12m"]   for d in anual_data.values())
    total_contrib_12m = sum(d["contrib_12m"] for d in anual_data.values())
    n_clientes        = len(mes_data)
    var_mes = ((total_venta_mes / venta_mes_ant) - 1) * 100 if venta_mes_ant > 0 else 0.0

    margen_mes_total = round(total_contrib_mes / total_venta_mes * 100, 1) if total_venta_mes > 0 else 0.0
    margen_12m_total = round(total_contrib_12m / total_venta_12m * 100, 1) if total_venta_12m > 0 else 0.0

    return {
        "mes":   mes,
        "ano":   _ANO,
        "label": f"{_MESES[mes]} {_ANO}",
        "kpis": {
            "venta_mes":     round(total_venta_mes),
            "contrib_mes":   round(total_contrib_mes),
            "margen_mes":    margen_mes_total,
            "venta_12m":     round(total_venta_12m),
            "contrib_12m":   round(total_contrib_12m),
            "margen_12m":    margen_12m_total,
            "n_clientes":    n_clientes,
            "var_mes":       round(var_mes, 1),
            "venta_mes_ant": round(venta_mes_ant),
        },
        "clientes":  clientes,
        "regiones":  regiones,
        "zonas":     zonas,
        "subclases": subclases,
        "modelos":   modelos_raw[:30],
        "tendencia": tendencia,
    }


def _load_detalle_cliente(rut: str, mes: int) -> dict:
    """Detalle de productos vendidos a un cliente en el mes."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"""
        SELECT
            LTRIM(RTRIM(ISNULL(SUBCLASE,'')))    AS subclase,
            LTRIM(RTRIM(ISNULL(DESCRIPCION,''))) AS descripcion,
            SUM(CAST(VENTA AS float))            AS venta,
            SUM(CAST(CONTRIBUCION AS float))     AS contrib,
            SUM(CAST(CANT AS float))             AS cant
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {mes}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
          AND LTRIM(RTRIM(RUT)) = ?
        GROUP BY LTRIM(RTRIM(ISNULL(SUBCLASE,''))), LTRIM(RTRIM(ISNULL(DESCRIPCION,'')))
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """, (rut,))
    productos = []
    for r in cur.fetchall():
        v = float(r[2] or 0)
        c = float(r[3] or 0)
        productos.append({
            "subclase":    str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "venta":       round(v),
            "contrib":     round(c),
            "cant":        round(float(r[4] or 0), 1),
            "margen":      round(c / v * 100, 1) if v > 0 else 0.0,
        })

    # Tendencia 12 meses del cliente
    mes_ini = mes + 1 if mes < 12 else 1
    ventana_sql = (
        f"((ANO = {_ANO - 1} AND MES >= {mes_ini}) OR (ANO = {_ANO} AND MES <= {mes}))"
        if mes < 12 else f"ANO = {_ANO} AND MES <= {mes}"
    )
    cur.execute(f"""
        SELECT ANO, MES,
               SUM(CAST(VENTA AS float)),
               SUM(CAST(CONTRIBUCION AS float))
        FROM BI_TOTAL_FACTURA
        WHERE {ventana_sql}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
          AND LTRIM(RTRIM(RUT)) = ?
        GROUP BY ANO, MES ORDER BY ANO, MES
    """, (rut,))
    tendencia = []
    for r in cur.fetchall():
        m = int(r[1])
        v = float(r[2] or 0)
        c = float(r[3] or 0)
        tendencia.append({
            "label":   f"{_MESES[m][:3]} {str(r[0])[2:]}",
            "venta":   round(v),
            "contrib": round(c),
            "margen":  round(c / v * 100, 1) if v > 0 else 0.0,
        })
    conn.close()
    return {"productos": productos, "tendencia": tendencia}


@router.get("/")
async def get_renasys(
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if mes is None:
            mes = hoy()["mes"]
        ck = f"renasys:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_renasys(mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e), "kpis": {}, "clientes": [], "regiones": [], "zonas": [], "subclases": [], "modelos": [], "tendencia": []}


@router.get("/detalle")
async def get_detalle_cliente(
    rut: str = Query(...),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if mes is None:
            mes = hoy()["mes"]
        return _load_detalle_cliente(rut, mes)
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e), "productos": [], "tendencia": []}
