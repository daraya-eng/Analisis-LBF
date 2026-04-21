"""
Televentas module — PPTO vs Venta (DW + Guías) + Top 10 + Avance semanal +
Clientes nuevos + Q4 sin compra.
Filtro: VENDEDOR='16-TELEVENTAS' (incluye MULTIPRODUCTO).
"""
import datetime
import calendar
import pandas as pd
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, DW_FILTRO, hoy, MESES_NOMBRE, filtro_guias
from cache import mem_get, mem_set

router = APIRouter()

# Filtro Televentas canónico (incluye MULTIPRODUCTO)
_TV_FILTRO = "VENDEDOR = '16-TELEVENTAS'"


def _calc_dias_habiles(meses: list[int], ano: int) -> tuple[int, int, int]:
    """Returns (habiles_transcurridos, habiles_restantes, habiles_totales)."""
    today = datetime.date.today()
    habiles_transcurridos = 0
    habiles_totales = 0
    for m in meses:
        days_in_m = calendar.monthrange(ano, m)[1]
        for d in range(1, days_in_m + 1):
            dt = datetime.date(ano, m, d)
            if dt.weekday() < 5:
                habiles_totales += 1
                if dt <= today:
                    habiles_transcurridos += 1
    habiles_restantes = habiles_totales - habiles_transcurridos
    return habiles_transcurridos, habiles_restantes, habiles_totales


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


def _week_boundaries(year: int, month: int) -> list[dict]:
    """Calculate Mon-Sun week boundaries for a given month.
    Returns list of {semana, inicio, fin, inicio_label, fin_label}."""
    first_day = datetime.date(year, month, 1)
    last_day = datetime.date(year, month, calendar.monthrange(year, month)[1])

    # Start from first Monday on or before the 1st
    current = first_day
    # Walk back to Monday if 1st is not Monday
    if current.weekday() != 0:
        # Start from the 1st itself for the first partial week
        pass

    weeks = []
    week_start = first_day
    week_num = 1

    while week_start <= last_day:
        # End of week = next Sunday or end of month
        days_to_sunday = (6 - week_start.weekday()) % 7
        if days_to_sunday == 0 and week_start.weekday() != 6:
            days_to_sunday = 6  # if Monday, go to Sunday
        week_end = min(week_start + datetime.timedelta(days=days_to_sunday), last_day)

        weeks.append({
            "semana": f"S{week_num}",
            "inicio": week_start,
            "fin": week_end,
            "inicio_label": week_start.strftime("%d/%m"),
            "fin_label": week_end.strftime("%d/%m"),
        })
        week_num += 1
        week_start = week_end + datetime.timedelta(days=1)

    return weeks


def _load_televentas_all(meses: list[int]) -> dict:
    """Load all Televentas data in a single DB connection."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)
    max_mes = max(meses)

    # ═══ 1. CLIENTES / PRODUCTOS en PPTO ═══
    cur.execute("""
        SELECT
            COUNT(DISTINCT RUT) AS n_clientes_ppto,
            COUNT(DISTINCT CODIGO) AS n_productos_ppto
        FROM [PPTO 2026]
        WHERE VENDEDOR_ACTUAL = '16-TELEVENTAS'
          AND RUT IS NOT NULL AND RUT <> '' AND RUT <> '0'
    """)
    row = cur.fetchone()
    n_cli_ppto = int(row[0] or 0)
    n_prod_ppto = int(row[1] or 0)

    # ═══ 1b. META / PPTO desde Metas_KAM ═══
    cur.execute(f"""
        SELECT
            SUM(CAST(LTRIM(RTRIM([ META ])) AS float)) AS meta_anual,
            SUM(CASE WHEN CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) IN ({mes_list})
                THEN CAST(LTRIM(RTRIM([ META ])) AS float) ELSE 0 END) AS meta_periodo,
            SUM(CASE WHEN CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) = {max_mes}
                THEN CAST(LTRIM(RTRIM([ META ])) AS float) ELSE 0 END) AS meta_mes
        FROM Metas_KAM
        WHERE LTRIM(RTRIM(Zona)) = '16-TELEVENTAS'
          AND ANIOMES >= {_ANO}01 AND ANIOMES <= {_ANO}12
    """)
    mr = cur.fetchone()
    ppto_anual = float(mr[0] or 0)
    meta_periodo = float(mr[1] or 0)
    ppto_mes = float(mr[2] or 0)
    ppto_ytd = meta_periodo

    # ═══ 1c. PPTO MENSUAL (para gráfico PPTO vs Venta) ═══
    cur.execute(f"""
        SELECT
            CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) AS MES,
            CAST(LTRIM(RTRIM([ META ])) AS float) AS ppto
        FROM Metas_KAM
        WHERE LTRIM(RTRIM(Zona)) = '16-TELEVENTAS'
          AND ANIOMES >= {_ANO}01 AND ANIOMES <= {_ANO}12
        ORDER BY ANIOMES
    """)
    ppto_mensual = {}
    for r in cur.fetchall():
        ppto_mensual[int(r[0])] = float(r[1] or 0)

    # ═══ 2. VENTAS BI_TOTAL_FACTURA (facturas + guías DOC_CODE='GF') ═══
    cur.execute(f"""
        SELECT
            SUM(CASE WHEN ANO = {_ANO} AND MES IN ({mes_list})
                THEN CAST(VENTA AS float) ELSE 0 END) AS venta_periodo,
            SUM(CASE WHEN ANO = {_ANO} AND MES = {max_mes}
                THEN CAST(VENTA AS float) ELSE 0 END) AS venta_mes,
            SUM(CASE WHEN ANO = {_ANO} AND MES IN ({mes_list}) AND ISNULL(DOC_CODE,'') = 'GF'
                THEN CAST(VENTA AS float) ELSE 0 END) AS guias_periodo,
            SUM(CASE WHEN ANO = {_ANO} AND MES = {max_mes} AND ISNULL(DOC_CODE,'') = 'GF'
                THEN CAST(VENTA AS float) ELSE 0 END) AS guias_mes,
            SUM(CASE WHEN ANO = {_ANO - 1} AND MES IN ({mes_list})
                THEN CAST(VENTA AS float) ELSE 0 END) AS venta_periodo_25,
            SUM(CASE WHEN ANO = {_ANO - 1} AND MES = {max_mes}
                THEN CAST(VENTA AS float) ELSE 0 END) AS venta_mes_25
        FROM BI_TOTAL_FACTURA
        WHERE {_TV_FILTRO}
          AND {DW_FILTRO}
          AND {_FG}
          AND ANO IN ({_ANO}, {_ANO - 1})
    """)
    vr = cur.fetchone()
    venta_periodo_total = float(vr[0] or 0)
    venta_mes_total = float(vr[1] or 0)
    guias_periodo = float(vr[2] or 0)
    guias_mes = float(vr[3] or 0)
    venta_periodo_fact = venta_periodo_total - guias_periodo
    venta_mes_fact = venta_mes_total - guias_mes
    venta_periodo_25 = float(vr[4] or 0)
    venta_mes_25 = float(vr[5] or 0)

    # ═══ 4. CLIENTES NUEVOS 2026 ═══
    cur.execute(f"""
        SELECT f26.RUT, f26.NOMBRE,
               SUM(CAST(f26.VENTA AS float)) AS venta_2026,
               SUM(CAST(f26.CONTRIBUCION AS float)) AS contribucion_2026
        FROM BI_TOTAL_FACTURA f26
        WHERE f26.ANO = {_ANO} AND f26.MES IN ({mes_list})
          AND f26.VENDEDOR = '16-TELEVENTAS'
          AND f26.CODIGO NOT IN ('FLETE','NINV','SIN','')
          AND {_FG}
          AND NOT EXISTS (
              SELECT 1 FROM BI_TOTAL_FACTURA f_hist
              WHERE f_hist.ANO < {_ANO}
                AND f_hist.RUT = f26.RUT
                AND f_hist.VENDEDOR = '16-TELEVENTAS'
                AND {_FG}
          )
        GROUP BY f26.RUT, f26.NOMBRE
        HAVING SUM(CAST(f26.VENTA AS float)) > 0
        ORDER BY venta_2026 DESC
    """)
    cols_nuevos = [d[0].strip() for d in cur.description]
    rows_nuevos = cur.fetchall()

    # ═══ 5. CLIENTES Q4-2025 SIN COMPRA 2026 ═══
    cur.execute(f"""
        SELECT q4.RUT, q4.NOMBRE,
               SUM(q4.venta_q4) AS venta_q4_2025,
               SUM(q4.contrib_q4) AS contribucion_q4_2025
        FROM (
            SELECT RUT, NOMBRE,
                   SUM(CAST(VENTA AS float)) AS venta_q4,
                   SUM(CAST(CONTRIBUCION AS float)) AS contrib_q4
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1}
              AND MES IN (10, 11, 12)
              AND {_TV_FILTRO}
              AND {DW_FILTRO}
              AND {_FG}
            GROUP BY RUT, NOMBRE
            HAVING SUM(CAST(VENTA AS float)) > 0
        ) q4
        WHERE NOT EXISTS (
            SELECT 1 FROM BI_TOTAL_FACTURA f26
            WHERE f26.ANO = {_ANO}
              AND f26.RUT = q4.RUT
              AND f26.VENDEDOR = '16-TELEVENTAS'
              AND {_FG}
        )
        GROUP BY q4.RUT, q4.NOMBRE
        ORDER BY venta_q4_2025 DESC
    """)
    cols_q4 = [d[0].strip() for d in cur.description]
    rows_q4 = cur.fetchall()

    # ═══ 6. VENTA MENSUAL 2026 — siempre todos los meses (gráfico fijo YTD) ═══
    cur.execute(f"""
        SELECT MES,
               SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE {_TV_FILTRO}
          AND {DW_FILTRO}
          AND {_FG}
          AND ANO = {_ANO}
        GROUP BY MES
        ORDER BY MES
    """)
    venta_mensual_map = {}
    for r in cur.fetchall():
        venta_mensual_map[int(r[0])] = float(r[1] or 0)

    # ═══ 7. TOP 10 CLIENTES 2026 (por venta período) + margen + venta 2025 ═══
    cur.execute(f"""
        WITH top10_2026 AS (
            SELECT TOP 10 RUT, NOMBRE,
                   SUM(CAST(VENTA AS float)) AS venta_2026,
                   SUM(CAST(CONTRIBUCION AS float)) AS contribucion_2026
            FROM BI_TOTAL_FACTURA
            WHERE {_TV_FILTRO}
              AND {DW_FILTRO}
              AND {_FG}
              AND ANO = {_ANO} AND MES IN ({mes_list})
            GROUP BY RUT, NOMBRE
            HAVING SUM(CAST(VENTA AS float)) > 0
            ORDER BY venta_2026 DESC
        )
        SELECT t.RUT, t.NOMBRE, t.venta_2026, t.contribucion_2026,
               ISNULL(SUM(CAST(f25.VENTA AS float)), 0) AS venta_2025
        FROM top10_2026 t
        LEFT JOIN BI_TOTAL_FACTURA f25
            ON f25.RUT = t.RUT
           AND f25.ANO = {_ANO - 1}
           AND f25.MES IN ({mes_list})
           AND f25.VENDEDOR = '16-TELEVENTAS'
           AND f25.CODIGO NOT IN ('FLETE','NINV','SIN','')
           AND {_FG}
        GROUP BY t.RUT, t.NOMBRE, t.venta_2026, t.contribucion_2026
        ORDER BY t.venta_2026 DESC
    """)
    cols_top10 = [d[0].strip() for d in cur.description]
    rows_top10 = cur.fetchall()

    # ═══ 8. AVANCE SEMANAL DEL ÚLTIMO MES DEL PERIODO ═══
    cur.execute(f"""
        SELECT DAY(DIA) AS dia,
               SUM(CAST(VENTA AS float)) AS venta
        FROM BI_TOTAL_FACTURA
        WHERE {_TV_FILTRO}
          AND {DW_FILTRO}
          AND {_FG}
          AND ANO = {_ANO} AND MES = {max_mes}
        GROUP BY DAY(DIA)
    """)
    venta_diaria = {}
    for r in cur.fetchall():
        venta_diaria[int(r[0])] = float(r[1] or 0)

    conn.close()

    # ─── Build weekly progress (only weeks with data, not future) ───
    weeks = _week_boundaries(_ANO, max_mes)
    today = datetime.date.today()
    avance_semanal = []
    acumulado = 0
    for w in weeks:
        # Skip weeks that haven't started yet
        if w["inicio"] > today:
            break
        venta_sem = 0
        for d in range(w["inicio"].day, w["fin"].day + 1):
            venta_sem += venta_diaria.get(d, 0)
        acumulado += venta_sem
        cumpl_sem = (acumulado / ppto_mes * 100) if ppto_mes > 0 else 0
        avance_semanal.append({
            "semana": w["semana"],
            "periodo": f"{w['inicio_label']} - {w['fin_label']}",
            "venta_semana": round(venta_sem),
            "acumulado": round(acumulado),
            "meta_mes": round(ppto_mes),
            "cumplimiento": round(cumpl_sem, 1),
        })

    # ─── Build monthly chart data (PPTO vs Venta + cumplimiento) ───
    ventas_mensuales = []
    for m in range(1, 13):
        ppto_m = ppto_mensual.get(m, 0)
        venta_m = venta_mensual_map.get(m, 0)
        cumpl_m = (venta_m / ppto_m * 100) if ppto_m > 0 else 0
        ventas_mensuales.append({
            "MES": m,
            "mes_nombre": MESES_NOMBRE.get(m, str(m))[:3],
            "ppto": round(ppto_m),
            "venta": round(venta_m),
            "cumplimiento": round(cumpl_m, 1) if venta_m > 0 else None,
        })

    # Build record lists with computed margin
    def _to_records(rows, cols, venta_key, contrib_key):
        """Convert rows to dicts and add margen_pct."""
        records = []
        for row in rows:
            d = dict(zip(cols, row))
            v = float(d.get(venta_key) or 0)
            c = float(d.get(contrib_key) or 0)
            d["margen_pct"] = round(c / v * 100, 1) if v > 0 else 0
            records.append(d)
        return records

    top10_records = _to_records(rows_top10, cols_top10, "venta_2026", "contribucion_2026") if rows_top10 else []
    nuevos_records = _to_records(rows_nuevos, cols_nuevos, "venta_2026", "contribucion_2026") if rows_nuevos else []
    q4_records = _to_records(rows_q4, cols_q4, "venta_q4_2025", "contribucion_q4_2025") if rows_q4 else []

    # Totals for badges
    total_venta_nuevos = sum(r.get("venta_2026", 0) or 0 for r in nuevos_records)
    total_venta_q4 = sum(r.get("venta_q4_2025", 0) or 0 for r in q4_records)

    # Cumplimiento
    cumpl_periodo = (venta_periodo_total / ppto_ytd * 100) if ppto_ytd > 0 else 0
    cumpl_mes = (venta_mes_total / ppto_mes * 100) if ppto_mes > 0 else 0
    crec_periodo = ((venta_periodo_total / venta_periodo_25) - 1) * 100 if venta_periodo_25 > 0 else 0
    crec_mes = ((venta_mes_total / venta_mes_25) - 1) * 100 if venta_mes_25 > 0 else 0

    # Ritmo diario / Proyección (días hábiles)
    hab_trans, hab_rest, hab_total = _calc_dias_habiles(meses, _ANO)
    ritmo_diario_ytd = (venta_periodo_total / hab_trans) if hab_trans > 0 else 0
    necesario_ytd = ((ppto_ytd - venta_periodo_total) / hab_rest) if hab_rest > 0 else 0
    proyeccion_ytd = venta_periodo_total + (ritmo_diario_ytd * hab_rest) if hab_trans > 0 else 0
    # Mensual
    hab_trans_m, hab_rest_m, _ = _calc_dias_habiles([max_mes], _ANO)
    ritmo_diario_mes = (venta_mes_total / hab_trans_m) if hab_trans_m > 0 else 0
    necesario_mes = ((ppto_mes - venta_mes_total) / hab_rest_m) if hab_rest_m > 0 else 0
    proyeccion_mes = venta_mes_total + (ritmo_diario_mes * hab_rest_m) if hab_trans_m > 0 else 0

    result = {
        "kpis": {
            "ppto_anual": ppto_anual,
            "ppto_ytd": ppto_ytd,
            "ppto_mes": ppto_mes,
            "meta_ytd": meta_periodo,
            "venta_ytd": venta_periodo_total,
            "venta_ytd_facturas": venta_periodo_fact,
            "venta_ytd_guias": guias_periodo,
            "venta_mes": venta_mes_total,
            "venta_mes_facturas": venta_mes_fact,
            "venta_mes_guias": guias_mes,
            "venta_ytd_25": venta_periodo_25,
            "venta_mes_25": venta_mes_25,
            "cumpl_ytd": round(cumpl_periodo, 1),
            "cumpl_mes": round(cumpl_mes, 1),
            "crec_ytd": round(crec_periodo, 1),
            "crec_mes": round(crec_mes, 1),
            "gap_ytd": venta_periodo_total - ppto_ytd,
            "gap_mes": venta_mes_total - ppto_mes,
            "n_clientes_ppto": n_cli_ppto,
            "n_productos_ppto": n_prod_ppto,
            "n_clientes_nuevos": len(nuevos_records),
            "n_clientes_q4_sin_compra": len(q4_records),
            "total_venta_nuevos": round(total_venta_nuevos),
            "total_venta_q4": round(total_venta_q4),
            "mes_nombre": MESES_NOMBRE.get(max_mes, str(max_mes)),
            "ritmo_diario_ytd": round(ritmo_diario_ytd),
            "necesario_ytd": round(necesario_ytd),
            "proyeccion_ytd": round(proyeccion_ytd),
            "hab_rest_ytd": hab_rest,
            "ritmo_diario_mes": round(ritmo_diario_mes),
            "necesario_mes": round(necesario_mes),
            "proyeccion_mes": round(proyeccion_mes),
            "hab_rest_mes": hab_rest_m,
        },
        "clientes_nuevos": nuevos_records,
        "clientes_q4_sin_compra": q4_records,
        "top10_clientes": top10_records,
        "ventas_mensuales": ventas_mensuales,
        "avance_semanal": avance_semanal,
    }
    return result


@router.get("/all")
async def get_televentas_all(
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cache_key = f"televentas:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, label = _parse_periodo(periodo, mes)
        result = _load_televentas_all(meses)
        result["periodo"] = periodo
        result["label"] = label
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "kpis": {}, "clientes_nuevos": [],
                "clientes_q4_sin_compra": [], "top10_clientes": [],
                "ventas_mensuales": [], "avance_semanal": []}


@router.get("/cliente-productos")
async def get_cliente_productos(
    rut: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Product drill-down for a client: venta 2025, 2026, growth, margin."""
    try:
        _ANO = hoy()["ano"]
        _FG = filtro_guias()
        meses_list, _ = _parse_periodo(periodo, mes)
        mes_sql = ",".join(str(m) for m in meses_list)
        cache_key = f"tv_cli_prod:{rut}:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"""
            WITH v26 AS (
                SELECT CODIGO, DESCRIPCION,
                       SUM(CAST(VENTA AS float)) AS venta_2026,
                       SUM(CAST(CONTRIBUCION AS float)) AS contribucion_2026
                FROM BI_TOTAL_FACTURA
                WHERE VENDEDOR = '16-TELEVENTAS'
                  AND CODIGO NOT IN ('FLETE','NINV','SIN','')
                  AND {_FG}
                  AND ANO = {_ANO} AND MES IN ({mes_sql})
                  AND RUT = ?
                GROUP BY CODIGO, DESCRIPCION
            ),
            v25 AS (
                SELECT CODIGO,
                       SUM(CAST(VENTA AS float)) AS venta_2025,
                       SUM(CAST(CONTRIBUCION AS float)) AS contribucion_2025
                FROM BI_TOTAL_FACTURA
                WHERE VENDEDOR = '16-TELEVENTAS'
                  AND CODIGO NOT IN ('FLETE','NINV','SIN','')
                  AND {_FG}
                  AND ANO = {_ANO - 1} AND MES IN ({mes_sql})
                  AND RUT = ?
                GROUP BY CODIGO
            )
            SELECT
                ISNULL(v26.CODIGO, v25.CODIGO) AS CODIGO,
                v26.DESCRIPCION,
                ISNULL(v25.venta_2025, 0) AS venta_2025,
                ISNULL(v26.venta_2026, 0) AS venta_2026,
                ISNULL(v26.contribucion_2026, 0) AS contribucion_2026
            FROM v26
            FULL OUTER JOIN v25 ON v25.CODIGO = v26.CODIGO
            ORDER BY ISNULL(v26.venta_2026, 0) DESC
        """, (rut, rut))
        cols = [d[0].strip() for d in cur.description]
        rows = cur.fetchall()
        conn.close()

        productos = []
        for row in rows:
            d = dict(zip(cols, row))
            v26 = float(d.get("venta_2026") or 0)
            v25 = float(d.get("venta_2025") or 0)
            c26 = float(d.get("contribucion_2026") or 0)
            crec = ((v26 / v25) - 1) * 100 if v25 > 0 else None
            margen = (c26 / v26 * 100) if v26 > 0 else 0
            productos.append({
                "CODIGO": d.get("CODIGO", ""),
                "DESCRIPCION": d.get("DESCRIPCION", ""),
                "venta_2025": round(v25),
                "venta_2026": round(v26),
                "crecimiento": round(crec, 1) if crec is not None else None,
                "margen_pct": round(margen, 1),
            })
        result = {"productos": productos}
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "productos": []}
