"""
MultiProducto analysis — partner client with special pricing.
Tracks venta 2025 vs 2026 by month and week, category breakdown, top products.
Uses BI_TOTAL_FACTURA (includes guías).
"""
import datetime
import calendar
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE
from cache import mem_get, mem_set

router = APIRouter()

_MP_FILTER = "NOMBRE LIKE '%MULTIPRODUCTO%'"
_EXCL_COD = "CODIGO NOT IN ('FLETE','NINV','SIN','')"

_CATS_VALIDAS = ('SQ', 'EVA', 'MAH', 'EQM')

_CAT_CASE = """
    CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS'
         THEN 'EQM' ELSE LTRIM(RTRIM(CATEGORIA)) END
"""


def _load_multiproducto_all() -> dict:
    h = hoy()
    _ANO, _MES = h["ano"], h["mes"]
    conn = get_conn()
    cur = conn.cursor()

    # ═══ 1. KPIs: YTD 2026 vs 2025, mes actual vs mismo mes 2025 ═══
    cur.execute(f"""
        SELECT ANO,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contribucion,
               COUNT(DISTINCT CODIGO) AS productos
        FROM BI_TOTAL_FACTURA
        WHERE {_MP_FILTER} AND {_EXCL_COD}
          AND ANO IN ({_ANO - 1}, {_ANO}) AND MES <= {_MES}
        GROUP BY ANO
    """)
    kpi_raw = {}
    for r in cur.fetchall():
        kpi_raw[int(r[0])] = {"venta": float(r[1] or 0), "contrib": float(r[2] or 0), "productos": int(r[3] or 0)}

    v26_ytd = kpi_raw.get(_ANO, {}).get("venta", 0)
    v25_ytd = kpi_raw.get(_ANO - 1, {}).get("venta", 0)
    c26_ytd = kpi_raw.get(_ANO, {}).get("contrib", 0)
    margen_ytd = (c26_ytd / v26_ytd * 100) if v26_ytd > 0 else 0
    crec_ytd = ((v26_ytd / v25_ytd) - 1) * 100 if v25_ytd > 0 else 0

    # Mes actual
    cur.execute(f"""
        SELECT ANO,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contribucion
        FROM BI_TOTAL_FACTURA
        WHERE {_MP_FILTER} AND {_EXCL_COD}
          AND ANO IN ({_ANO - 1}, {_ANO}) AND MES = {_MES}
        GROUP BY ANO
    """)
    mes_raw = {}
    for r in cur.fetchall():
        mes_raw[int(r[0])] = {"venta": float(r[1] or 0), "contrib": float(r[2] or 0)}

    v26_mes = mes_raw.get(_ANO, {}).get("venta", 0)
    v25_mes = mes_raw.get(_ANO - 1, {}).get("venta", 0)
    crec_mes = ((v26_mes / v25_mes) - 1) * 100 if v25_mes > 0 else 0

    # ═══ 2. Tendencia mensual 2025 vs 2026 ═══
    cur.execute(f"""
        SELECT ANO, MES,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contribucion
        FROM BI_TOTAL_FACTURA
        WHERE {_MP_FILTER} AND {_EXCL_COD}
          AND ANO IN ({_ANO - 1}, {_ANO}) AND MES <= {_MES}
        GROUP BY ANO, MES
        ORDER BY ANO, MES
    """)
    tendencia = []
    tend_map: dict = {}  # mes -> {v25, v26}
    for r in cur.fetchall():
        ano, mes_n = int(r[0]), int(r[1])
        if mes_n not in tend_map:
            tend_map[mes_n] = {"mes": mes_n, "mes_nombre": MESES_NOMBRE.get(mes_n, str(mes_n))[:3], "venta_25": 0, "venta_26": 0, "contrib_25": 0, "contrib_26": 0}
        key_v = f"venta_{str(ano)[-2:]}"
        key_c = f"contrib_{str(ano)[-2:]}"
        tend_map[mes_n][key_v] = float(r[2] or 0)
        tend_map[mes_n][key_c] = float(r[3] or 0)

    for m in sorted(tend_map.keys()):
        d = tend_map[m]
        d["crec"] = round(((d["venta_26"] / d["venta_25"]) - 1) * 100, 1) if d["venta_25"] > 0 else None
        d["venta_25"] = round(d["venta_25"])
        d["venta_26"] = round(d["venta_26"])
        d["contrib_25"] = round(d["contrib_25"])
        d["contrib_26"] = round(d["contrib_26"])
        tendencia.append(d)

    # ═══ 3. Avance semanal: mes actual vs mes anterior ═══
    mes_ant = _MES - 1 if _MES > 1 else 12
    ano_ant = _ANO if _MES > 1 else _ANO - 1
    mes_ant_nombre = MESES_NOMBRE.get(mes_ant, str(mes_ant))

    cur.execute(f"""
        SELECT MES, DAY(DIA) AS dia,
               SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE {_MP_FILTER} AND {_EXCL_COD}
          AND ((ANO = {_ANO} AND MES = {_MES})
            OR (ANO = {ano_ant} AND MES = {mes_ant}))
        GROUP BY MES, DAY(DIA)
    """)
    diaria_actual: dict = {}   # dia -> venta (mes actual)
    diaria_anterior: dict = {} # dia -> venta (mes anterior)
    for r in cur.fetchall():
        mes_r = int(r[0])
        dia = int(r[1])
        v = float(r[2] or 0)
        if mes_r == _MES:
            diaria_actual[dia] = v
        else:
            diaria_anterior[dia] = v

    # Build weeks
    last_day = calendar.monthrange(_ANO, _MES)[1]
    today = datetime.date.today()
    avance_semanal = []
    acum_act = 0
    acum_ant = 0
    week_start = 1
    week_num = 1
    while week_start <= last_day:
        week_end = min(week_start + 6, last_day)
        if datetime.date(_ANO, _MES, week_start) > today:
            break
        v_act = sum(diaria_actual.get(d, 0) for d in range(week_start, week_end + 1))
        v_ant = sum(diaria_anterior.get(d, 0) for d in range(week_start, week_end + 1))
        acum_act += v_act
        acum_ant += v_ant
        avance_semanal.append({
            "semana": f"S{week_num}",
            "periodo": f"{week_start:02d}/{_MES:02d} - {week_end:02d}/{_MES:02d}",
            "venta_actual": round(v_act),
            "venta_anterior": round(v_ant),
            "acum_actual": round(acum_act),
            "acum_anterior": round(acum_ant),
            "crec": round(((v_act / v_ant) - 1) * 100, 1) if v_ant > 0 else None,
        })
        week_num += 1
        week_start = week_end + 1

    # ═══ 4. Categorías: venta 2026 vs 2025 YTD ═══
    cur.execute(f"""
        SELECT {_CAT_CASE} AS categoria, ANO,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contribucion
        FROM BI_TOTAL_FACTURA
        WHERE {_MP_FILTER} AND {_EXCL_COD}
          AND ANO IN ({_ANO - 1}, {_ANO}) AND MES <= {_MES}
        GROUP BY {_CAT_CASE}, ANO
    """)
    cat_raw: dict = {}
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        if cat not in _CATS_VALIDAS:
            continue
        ano = int(r[1])
        if cat not in cat_raw:
            cat_raw[cat] = {"categoria": cat, "venta_26": 0, "venta_25": 0, "contrib_26": 0}
        if ano == _ANO:
            cat_raw[cat]["venta_26"] = float(r[2] or 0)
            cat_raw[cat]["contrib_26"] = float(r[3] or 0)
        else:
            cat_raw[cat]["venta_25"] = float(r[2] or 0)

    categorias = []
    for cat, d in sorted(cat_raw.items(), key=lambda x: -x[1]["venta_26"]):
        crec = ((d["venta_26"] / d["venta_25"]) - 1) * 100 if d["venta_25"] > 0 else None
        margen = (d["contrib_26"] / d["venta_26"] * 100) if d["venta_26"] > 0 else 0
        pct = (d["venta_26"] / v26_ytd * 100) if v26_ytd > 0 else 0
        categorias.append({
            "categoria": cat,
            "venta_26": round(d["venta_26"]),
            "venta_25": round(d["venta_25"]),
            "crec": round(crec, 1) if crec is not None else None,
            "margen": round(margen, 1),
            "pct": round(pct, 1),
        })

    # ═══ 5. Top productos mes actual ═══
    cur.execute(f"""
        WITH p26 AS (
            SELECT CODIGO, DESCRIPCION,
                   SUM(CAST(VENTA AS float)) AS venta_26,
                   SUM(CAST(CONTRIBUCION AS float)) AS contrib_26,
                   SUM(CAST(CANT AS float)) AS cant_26
            FROM BI_TOTAL_FACTURA
            WHERE {_MP_FILTER} AND {_EXCL_COD}
              AND ANO = {_ANO} AND MES = {_MES}
            GROUP BY CODIGO, DESCRIPCION
        ),
        p25 AS (
            SELECT CODIGO,
                   SUM(CAST(VENTA AS float)) AS venta_25
            FROM BI_TOTAL_FACTURA
            WHERE {_MP_FILTER} AND {_EXCL_COD}
              AND ANO = {_ANO - 1} AND MES = {_MES}
            GROUP BY CODIGO
        )
        SELECT COALESCE(p26.CODIGO, p25.CODIGO) AS CODIGO,
               p26.DESCRIPCION,
               COALESCE(p26.venta_26, 0) AS venta_26,
               COALESCE(p25.venta_25, 0) AS venta_25,
               COALESCE(p26.contrib_26, 0) AS contrib_26,
               COALESCE(p26.cant_26, 0) AS cant_26
        FROM p26
        FULL OUTER JOIN p25 ON p26.CODIGO = p25.CODIGO
        ORDER BY COALESCE(p26.venta_26, 0) DESC
    """)
    productos = []
    for r in cur.fetchall():
        v26 = float(r[2] or 0)
        v25 = float(r[3] or 0)
        c26 = float(r[4] or 0)
        crec = ((v26 / v25) - 1) * 100 if v25 > 0 else None
        margen = (c26 / v26 * 100) if v26 > 0 else 0
        productos.append({
            "codigo": str(r[0] or "").strip(),
            "descripcion": str(r[1] or "").strip(),
            "venta_26": round(v26),
            "venta_25": round(v25),
            "crec": round(crec, 1) if crec is not None else None,
            "margen": round(margen, 1),
            "cant": round(float(r[5] or 0)),
        })

    conn.close()

    return {
        "kpis": {
            "venta_ytd_26": round(v26_ytd),
            "venta_ytd_25": round(v25_ytd),
            "crec_ytd": round(crec_ytd, 1),
            "margen_ytd": round(margen_ytd, 1),
            "venta_mes_26": round(v26_mes),
            "venta_mes_25": round(v25_mes),
            "crec_mes": round(crec_mes, 1),
            "productos": kpi_raw.get(_ANO, {}).get("productos", 0),
            "mes_nombre": MESES_NOMBRE.get(_MES, str(_MES)),
            "mes_anterior": mes_ant_nombre,
        },
        "tendencia": tendencia,
        "avance_semanal": avance_semanal,
        "categorias": categorias,
        "productos": productos,
    }


@router.get("/all")
async def get_multiproducto(current_user: dict = Depends(get_current_user)):
    try:
        cached = mem_get("multiproducto:all")
        if cached:
            return cached
        result = _load_multiproducto_all()
        mem_set("multiproducto:all", result)
        return result
    except Exception as e:
        return {"error": str(e), "kpis": {}, "tendencia": [],
                "avance_semanal": [], "categorias": [], "productos": []}
