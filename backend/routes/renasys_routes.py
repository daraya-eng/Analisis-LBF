"""
Renasys TPN — Módulo de análisis de Terapia de Presión Negativa.
2026+: CLASE = 'TPN'
2025-: CLASE = 'EQUIPOS MAH' AND SUBCLASE LIKE '%TERAPIA DE PRESION NEGATIVA%'
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, filtro_guias
from cache import mem_get, mem_set
import os, pathlib, datetime
import openpyxl
from bs4 import BeautifulSoup
from collections import defaultdict

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

# ── RUTs excluidos del análisis de rentabilidad ───────────────────────────────
_EXCLUIR_RUTS = {
    "37-K",       # Smith & Nephew — fabricante/importador, no cliente clínico
    "93366000-1", # LBF (bodega propia)
}

# ── Costos del programa TPN (datos reales contabilidad al 30/04/2026) ─────────
_PROG = {
    "valor_neto_parque":      1_349_156_572,  # valor neto activo fijo al 30/04/2026
    "depreciacion_anual":       102_554_152,  # depreciación 2026 según contabilidad
    "sueldo_anual_renasys":      24_000_000,  # ← PENDIENTE dato real RRHH
    "sueldo_anual_mah":          70_000_000,  # ← PENDIENTE dato real RRHH
}
_PROG["costo_fijo_anual"]   = _PROG["sueldo_anual_renasys"] + _PROG["sueldo_anual_mah"]
_PROG["costo_fijo_mensual"] = _PROG["costo_fijo_anual"] / 12


_DATA_DIR    = pathlib.Path(__file__).parent.parent / "data" / "renasys"
_BOMBAS_PATH = _DATA_DIR / "Bombas Renasys.xlsx"
_SEG_PATH    = _DATA_DIR / "Seguimiento Renasys (35).xls"

# Valor neto por grupo calculado desde Bombas Renasys.xlsx (al 30/04/2026)
_V_NETO_8 = 62_424_109      # equipos adquiridos ≤ 31.12.2022 (8 años)
_V_NETO_5 = 1_286_732_463   # equipos adquiridos ≥ 01.01.2023 (5 años)


def _build_serie_vu_map() -> dict[str, int]:
    """Lee Bombas Renasys.xlsx y retorna {serie: vida_util_meses} (60 o 96)."""
    if not os.path.exists(_BOMBAS_PATH):
        return {}
    try:
        wb = openpyxl.load_workbook(_BOMBAS_PATH, data_only=True)
        ws = wb["MAQ 0152"]
        serie_vu: dict[str, int] = {}
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i < 6:
                continue
            if not row[1]:
                continue
            desc = row[5]
            vu   = row[9]
            if not isinstance(vu, (int, float)) or not desc:
                continue
            parts = str(desc).split()
            if len(parts) > 1:
                serie_vu[parts[1]] = int(vu)
        return serie_vu
    except Exception:
        return {}


def _serie_year(serie: str) -> int:
    """Extrae año de adquisición aproximado desde el código de serie (posiciones 4-5)."""
    try:
        yy = int(serie[4:6])
        return 2000 + yy
    except Exception:
        return 2020  # fallback conservador → 8 años


def _load_parque_equipos() -> dict[str, dict]:
    """
    Lee Seguimiento Renasys (35).xls y retorna
    {rut: {'n8': int, 'n5': int}} donde n8=equipos 8 años, n5=equipos 5 años.
    Usa Bombas Renasys.xlsx para determinar vida útil por serie.
    Fallback: año del código de serie (≥2023 → 5 años, <2023 → 8 años).
    """
    serie_vu = _build_serie_vu_map()

    if not os.path.exists(_SEG_PATH):
        return {}
    try:
        with open(_SEG_PATH, "rb") as f:
            content = f.read().decode("latin-1", errors="replace")
        soup = BeautifulSoup(content, "html.parser")
        rows = soup.find_all("tr")
        parque: dict[str, dict] = {}
        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 8:
                continue
            rut   = cells[6].strip()
            serie = cells[0].strip()
            if rut in _EXCLUIR_RUTS:
                continue
            if rut not in parque:
                parque[rut] = {"n8": 0, "n5": 0}
            if serie in serie_vu:
                vu = serie_vu[serie]
            else:
                # Fallback: año del código de serie
                vu = 60 if _serie_year(serie) >= 2023 else 96
            if vu == 60:
                parque[rut]["n5"] += 1
            else:
                parque[rut]["n8"] += 1
        return parque
    except Exception:
        return {}


# Cargar parque al iniciar el módulo (se refresca con reinicio del backend)
_PARQUE: dict[str, dict] = _load_parque_equipos()
_TOTAL_EQUIPOS_8: int = sum(v["n8"] for v in _PARQUE.values())
_TOTAL_EQUIPOS_5: int = sum(v["n5"] for v in _PARQUE.values())
_TOTAL_EQUIPOS_CLIENTES: int = _TOTAL_EQUIPOS_8 + _TOTAL_EQUIPOS_5

# Depreciación anual por equipo según vida útil (ponderada por valor neto de libro)
# — preserva el total contable de 102,554,152 —
_V_NETO_TOTAL = _PROG["valor_neto_parque"]
_DEP_ANUAL_POR_EQUIPO_8: float = (
    (_PROG["depreciacion_anual"] * _V_NETO_8 / _V_NETO_TOTAL / _TOTAL_EQUIPOS_8)
    if _TOTAL_EQUIPOS_8 > 0 and _V_NETO_TOTAL > 0 else 0.0
)
_DEP_ANUAL_POR_EQUIPO_5: float = (
    (_PROG["depreciacion_anual"] * _V_NETO_5 / _V_NETO_TOTAL / _TOTAL_EQUIPOS_5)
    if _TOTAL_EQUIPOS_5 > 0 and _V_NETO_TOTAL > 0 else 0.0
)


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
               MAX(NOMBRE)                              AS nombre,
               MAX(LTRIM(RTRIM(ISNULL(REGION,''))))     AS region,
               MAX(LTRIM(RTRIM(ISNULL(CIUDAD,''))))     AS ciudad,
               MAX(VENDEDOR)                            AS vendedor,
               MAX(LTRIM(RTRIM(ISNULL(SEGMENTO,''))))   AS segmento,
               MAX(LTRIM(RTRIM(ISNULL(KAM,''))))        AS kam,
               MAX(LTRIM(RTRIM(ISNULL(TIPO,''))))       AS tipo,
               SUM(CAST(VENTA AS float))                AS venta_12m,
               SUM(CAST(CONTRIBUCION AS float))         AS contrib_12m
        FROM BI_TOTAL_FACTURA
        WHERE {ventana_sql}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
        GROUP BY RUT
    """)
    anual_data: dict[str, dict] = {
        str(r[0] or "").strip(): {
            "nombre":   str(r[1] or "").strip(),
            "region":   str(r[2] or "").strip(),
            "ciudad":   str(r[3] or "").strip(),
            "vendedor": str(r[4] or "").strip(),
            "segmento": str(r[5] or "").strip() or "PRIVADO",
            "kam":      str(r[6] or "").strip(),
            "tipo":     str(r[7] or "").strip(),
            "venta_12m":  float(r[8] or 0),
            "contrib_12m": float(r[9] or 0),
        }
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
        region   = dm.get("region",   "") or da.get("region",   "")
        ciudad   = dm.get("ciudad",   "") or da.get("ciudad",   "")
        vendedor = dm.get("vendedor", "") or da.get("vendedor", "")
        kam      = dm.get("kam",      "") or da.get("kam",      "")
        segmento = dm.get("segmento", "") or da.get("segmento", "PRIVADO")
        tipo     = dm.get("tipo",     "") or da.get("tipo",     "")
        nombre   = dm.get("nombre",   "") or da.get("nombre",   "") or rut

        # ── Parque de equipos (desde Seguimiento Renasys) ────────────────────
        eq = _PARQUE.get(rut, {"n8": 0, "n5": 0})
        n_equipos  = eq["n8"] + eq["n5"]
        pct_parque = round(n_equipos / _TOTAL_EQUIPOS_CLIENTES * 100, 2) if _TOTAL_EQUIPOS_CLIENTES > 0 else 0.0

        # ── Costos asignados al cliente ───────────────────────────────────────
        # Depreciación ponderada por vida útil (≤2022→8 años, ≥2023→5 años)
        dep_anual          = eq["n8"] * _DEP_ANUAL_POR_EQUIPO_8 + eq["n5"] * _DEP_ANUAL_POR_EQUIPO_5
        sueldo_renasys_prop = _PROG["sueldo_anual_renasys"] * (pct_parque / 100)
        sueldo_mah_prop     = _PROG["sueldo_anual_mah"]     * (pct_parque / 100)
        costo_total_anual   = dep_anual + sueldo_renasys_prop + sueldo_mah_prop

        # ── Resultado Operacional 12M ─────────────────────────────────────────
        # = Contribución 12M - Depreciación proporcional - Sueldos proporcionales
        resultado_op = c_12m - costo_total_anual
        margen_op    = round(resultado_op / v_12m * 100, 1) if v_12m > 0 else 0.0
        rentable     = resultado_op > 0

        # ── Eficiencia: contribución mensual por equipo ───────────────────────
        contrib_x_equipo_mes = round(c_mes / n_equipos) if n_equipos > 0 else None
        contrib_x_equipo_12m = round(c_12m / n_equipos) if n_equipos > 0 else None

        # ── Actividad relativa vs promedio histórico ──────────────────────────
        promedio_mensual = v_12m / 12 if v_12m > 0 else 0.0
        actividad_rel    = round(v_mes / promedio_mensual * 100, 1) if promedio_mensual > 0 else (100.0 if v_mes > 0 else 0.0)

        if v_mes == 0 and v_12m > 0:
            estado_equipo = "sin_compra"
        elif actividad_rel < 50:
            estado_equipo = "bajo"
        elif actividad_rel < 80:
            estado_equipo = "regular"
        else:
            estado_equipo = "activo"

        if c_12m >= 5_000_000:
            tier = "A"
        elif c_12m >= 1_000_000:
            tier = "B"
        else:
            tier = "C"

        clientes.append({
            "rut":         rut,
            "nombre":      nombre,
            "region":      region,
            "ciudad":      ciudad,
            "vendedor":    vendedor,
            "segmento":    segmento,
            "kam":         kam,
            "tipo":        tipo,
            "venta_mes":        round(v_mes),
            "contrib_mes":      round(c_mes),
            "margen_mes":       margen_mes,
            "venta_12m":        round(v_12m),
            "contrib_12m":      round(c_12m),
            "margen_12m":       margen_12m,
            "promedio_mensual": round(promedio_mensual),
            "actividad_rel":    actividad_rel,
            "estado_equipo":    estado_equipo,
            "tier":             tier,
            # Parque real
            "n_equipos":           n_equipos,
            "pct_parque":          pct_parque,
            # Rentabilidad operacional
            "dep_anual":           round(dep_anual),
            "costo_total_anual":   round(costo_total_anual),
            "resultado_op":        round(resultado_op),
            "margen_op":           margen_op,
            "rentable":            rentable,
            "contrib_x_equipo_mes": contrib_x_equipo_mes,
            "contrib_x_equipo_12m": contrib_x_equipo_12m,
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

    # ── Rentabilidad del programa (datos reales) ──────────────────────────────
    costo_total_prog_anual = (_PROG["depreciacion_anual"] + _PROG["costo_fijo_anual"])
    costo_total_prog_mes   = costo_total_prog_anual / 12
    contrib_neta_mes       = round(total_contrib_mes - costo_total_prog_mes)
    contrib_neta_12m       = round(total_contrib_12m - costo_total_prog_anual)
    roi_anualizado         = round(contrib_neta_12m / _PROG["valor_neto_parque"] * 100, 1) if _PROG["valor_neto_parque"] > 0 else 0.0
    contrib_x_equipo       = round(total_contrib_mes / _TOTAL_EQUIPOS_CLIENTES) if _TOTAL_EQUIPOS_CLIENTES > 0 else 0
    payback_meses          = round(_PROG["valor_neto_parque"] / total_contrib_12m * 12, 1) if total_contrib_12m > 0 else None
    n_rentables            = sum(1 for c in clientes if c.get("rentable", False))

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
        "programa": {
            "n_equipos_clientes":  _TOTAL_EQUIPOS_CLIENTES,
            "n_equipos_8":         _TOTAL_EQUIPOS_8,
            "n_equipos_5":         _TOTAL_EQUIPOS_5,
            "valor_neto_parque":   _PROG["valor_neto_parque"],
            "depreciacion_anual":  _PROG["depreciacion_anual"],
            "dep_por_equipo_8":    round(_DEP_ANUAL_POR_EQUIPO_8),
            "dep_por_equipo_5":    round(_DEP_ANUAL_POR_EQUIPO_5),
            "dep_por_equipo_anual": round(_PROG["depreciacion_anual"] / _TOTAL_EQUIPOS_CLIENTES) if _TOTAL_EQUIPOS_CLIENTES > 0 else 0,
            "costo_fijo_anual":    _PROG["costo_fijo_anual"],
            "costo_total_anual":   round(costo_total_prog_anual),
            "costo_total_mes":     round(costo_total_prog_mes),
            "contrib_neta_mes":    contrib_neta_mes,
            "contrib_neta_12m":    contrib_neta_12m,
            "roi_anualizado":      roi_anualizado,
            "contrib_x_equipo":    contrib_x_equipo,
            "payback_meses":       payback_meses,
            "n_rentables":         n_rentables,
            "n_clientes_parque":   len([c for c in clientes if c.get("n_equipos", 0) > 0]),
            "es_ejemplo":          False,
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


_CIUDAD_COORDS: dict[str, tuple[float, float]] = {
    "SANTIAGO": (-33.4569, -70.6483), "VITACURA": (-33.3833, -70.5833),
    "LAS CONDES": (-33.4167, -70.5667), "PROVIDENCIA": (-33.4333, -70.6167),
    "LA FLORIDA": (-33.5167, -70.6000), "PUDAHUEL": (-33.4333, -70.7667),
    "MAIPÚ": (-33.5167, -70.7667), "PUENTE ALTO": (-33.6000, -70.5833),
    "SAN MIGUEL": (-33.5000, -70.6500), "ÑUÑOA": (-33.4500, -70.6000),
    "RECOLETA": (-33.4167, -70.6333), "TALAGANTE": (-33.6667, -70.9167),
    "BUIN": (-33.7333, -70.7333), "MELIPILLA": (-33.7000, -71.2167),
    "VALPARAÍSO": (-33.0472, -71.6127), "VALPARAISO": (-33.0472, -71.6127),
    "VIÑA DEL MAR": (-33.0245, -71.5518), "VINA DEL MAR": (-33.0245, -71.5518),
    "VI?A DEL MAR": (-33.0245, -71.5518), "QUILPUÉ": (-33.0500, -71.4333),
    "QUILPUE": (-33.0500, -71.4333), "SAN ANTONIO": (-33.5936, -71.6211),
    "CONCEPCIÓN": (-36.8270, -73.0503), "CONCEPCION": (-36.8270, -73.0503),
    "TALCAHUANO": (-36.7167, -73.1167), "CHILLÁN": (-36.6067, -72.1036),
    "CHILLAN": (-36.6067, -72.1036), "LOS ÁNGELES": (-37.4667, -72.3500),
    "LOS ANGELES": (-37.4667, -72.3500), "CORONEL": (-37.0167, -73.1500),
    "TEMUCO": (-38.7359, -72.5904), "VILLARRICA": (-39.2833, -72.2333),
    "PITRUFQUÉN": (-38.9833, -72.6500), "PITRUFQUEN": (-38.9833, -72.6500),
    "NUEVA IMPERIAL": (-38.7333, -72.9500), "PADRE LAS CASAS": (-38.7667, -72.6000),
    "ANTOFAGASTA": (-23.6509, -70.3975), "CALAMA": (-22.4667, -68.9333),
    "IQUIQUE": (-20.2143, -70.1514), "ARICA": (-18.4783, -70.3275),
    "LA SERENA": (-29.9027, -71.2520), "COQUIMBO": (-29.9534, -71.3395),
    "OVALLE": (-30.6000, -71.2000), "RANCAGUA": (-34.1700, -70.7400),
    "SAN FERNANDO": (-34.5833, -70.9833), "TALCA": (-35.4264, -71.6553),
    "CURICÓ": (-34.9833, -71.2333), "CURICO": (-34.9833, -71.2333),
    "LINARES": (-35.8500, -71.6000), "VALDIVIA": (-39.8142, -73.2459),
    "OSORNO": (-40.5694, -73.1389), "PUERTO MONTT": (-41.4693, -72.9424),
    "PUERTO VARAS": (-41.3167, -72.9833), "COYHAIQUE": (-45.5752, -72.0662),
    "PUNTA ARENAS": (-53.1638, -70.9171), "PUERTO NATALES": (-51.7333, -72.5000),
}


def _load_ciudades(mes: int) -> list:
    """Agrega venta del mes por ciudad con coordenadas para mapa 3D."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"""
        SELECT
            LTRIM(RTRIM(UPPER(ISNULL(CIUDAD,'')))) AS ciudad,
            LTRIM(RTRIM(ISNULL(REGION,'')))        AS region,
            COUNT(DISTINCT RUT)                    AS n_clientes,
            SUM(CAST(VENTA AS float))              AS venta,
            SUM(CAST(CONTRIBUCION AS float))       AS contrib
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {mes}
          AND {_EXCL_DW} AND {_FG} AND {_FILTRO_TPN}
          AND CIUDAD IS NOT NULL AND LTRIM(RTRIM(CIUDAD)) <> ''
        GROUP BY LTRIM(RTRIM(UPPER(ISNULL(CIUDAD,'')))), LTRIM(RTRIM(ISNULL(REGION,'')))
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    ciudades = []
    for r in cur.fetchall():
        ciudad = str(r[0] or "").strip()
        coords = _CIUDAD_COORDS.get(ciudad)
        if not coords:
            # Intentar con región como fallback
            reg = str(r[2] or "").strip()
            meta = _REGION_META.get(reg)
            if meta:
                coords = (meta["lat"], meta["lon"])
            else:
                continue
        v = float(r[3] or 0)
        c = float(r[4] or 0)
        ciudades.append({
            "ciudad":     ciudad.title(),
            "region":     str(r[1] or "").strip(),
            "lat":        coords[0],
            "lon":        coords[1],
            "n_clientes": int(r[2] or 0),
            "venta":      round(v),
            "contrib":    round(c),
            "margen":     round(c / v * 100, 1) if v > 0 else 0.0,
        })
    conn.close()
    return ciudades


@router.get("/ciudades")
async def get_ciudades(
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if mes is None:
            mes = hoy()["mes"]
        ck = f"renasys:ciudades:{mes}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_ciudades(mes)
        mem_set(ck, data)
        return data
    except Exception as e:
        import traceback; traceback.print_exc()
        return []


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
