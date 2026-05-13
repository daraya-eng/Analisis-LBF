"""
Renasys TPN — Módulo de análisis de Terapia de Presión Negativa.
Filtra BI_TOTAL_FACTURA por CLASE = 'EQUIPOS MAH' y SUBCLASE LIKE '%TERAPIA DE PRESION NEGATIVA%'.
Columnas de equipos instalados son placeholder hasta integración con IT.
"""
import datetime
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
    "CLASE = 'EQUIPOS MAH' "
    "AND SUBCLASE LIKE '%TERAPIA DE PRESION NEGATIVA%'"
)

_MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
          "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]


def _load_renasys(mes: int) -> dict:
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()

    # ── 1. Venta del mes por cliente ──────────────────────────────────────────
    cur.execute(f"""
        SELECT RUT, MAX(NOMBRE) AS nombre,
               SUM(CAST(VENTA AS float))        AS venta_mes,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_mes,
               SUM(CAST(CANT AS float))         AS cant_mes
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {mes}
          AND {_EXCL_DW} AND {_FG}
          AND {_FILTRO_TPN}
        GROUP BY RUT
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    mes_data: dict[str, dict] = {}
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        mes_data[rut] = {
            "rut": rut,
            "nombre": str(r[1] or "").strip(),
            "venta_mes": float(r[2] or 0),
            "contrib_mes": float(r[3] or 0),
            "cant_mes": float(r[4] or 0),
        }

    # ── 2. Venta últimos 12 meses por cliente ─────────────────────────────────
    # Calcula ventana: mes actual incluido, hacia atrás 12 meses
    if mes >= 1:
        ano_ini = _ANO - 1 if mes < 12 else _ANO
        mes_ini = mes + 1 if mes < 12 else 1
    # Ventana: (ano_ini, mes_ini) → (ano, mes) inclusive
    ventana_sql = f"""(
        (ANO = {_ANO - 1} AND MES >= {mes_ini if mes < 12 else 1})
        OR (ANO = {_ANO} AND MES <= {mes})
    )""" if mes < 12 else f"ANO = {_ANO} AND MES <= {mes}"

    cur.execute(f"""
        SELECT RUT, MAX(NOMBRE) AS nombre,
               SUM(CAST(VENTA AS float))        AS venta_12m,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_12m
        FROM BI_TOTAL_FACTURA
        WHERE {ventana_sql}
          AND {_EXCL_DW} AND {_FG}
          AND {_FILTRO_TPN}
        GROUP BY RUT
    """)
    anual_data: dict[str, dict] = {}
    for r in cur.fetchall():
        rut = str(r[0] or "").strip()
        anual_data[rut] = {
            "venta_12m": float(r[2] or 0),
            "contrib_12m": float(r[3] or 0),
        }

    # ── 3. KPIs totales del mes ───────────────────────────────────────────────
    total_venta_mes  = sum(d["venta_mes"]  for d in mes_data.values())
    total_contrib_mes = sum(d["contrib_mes"] for d in mes_data.values())
    total_venta_12m  = sum(d.get("venta_12m", 0)  for d in anual_data.values())
    total_contrib_12m = sum(d.get("contrib_12m", 0) for d in anual_data.values())
    n_clientes = len(mes_data)

    # ── 4. Mes anterior para variación ───────────────────────────────────────
    mes_ant = mes - 1 if mes > 1 else 12
    ano_ant = _ANO if mes > 1 else _ANO - 1
    cur.execute(f"""
        SELECT SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {ano_ant} AND MES = {mes_ant}
          AND {_EXCL_DW} AND {_FG}
          AND {_FILTRO_TPN}
    """)
    r = cur.fetchone()
    venta_mes_ant = float(r[0] or 0) if r else 0.0
    var_mes = ((total_venta_mes / venta_mes_ant) - 1) * 100 if venta_mes_ant > 0 else 0.0

    conn.close()

    # ── 5. Armar tabla de clientes ────────────────────────────────────────────
    all_ruts = set(mes_data.keys()) | set(anual_data.keys())
    clientes = []
    for rut in all_ruts:
        d_mes  = mes_data.get(rut, {})
        d_año  = anual_data.get(rut, {})
        v_mes  = d_mes.get("venta_mes", 0)
        c_mes  = d_mes.get("contrib_mes", 0)
        v_12m  = d_año.get("venta_12m", 0)
        c_12m  = d_año.get("contrib_12m", 0)
        margen_mes = round(c_mes / v_mes * 100, 1) if v_mes > 0 else 0.0
        margen_12m = round(c_12m / v_12m * 100, 1) if v_12m > 0 else 0.0

        clientes.append({
            "rut":         rut,
            "nombre":      d_mes.get("nombre") or d_año.get("nombre", rut),
            "venta_mes":   round(v_mes),
            "contrib_mes": round(c_mes),
            "margen_mes":  margen_mes,
            "venta_12m":   round(v_12m),
            "contrib_12m": round(c_12m),
            "margen_12m":  margen_12m,
            # Placeholders — pendiente de integración con IT (parque de equipos)
            "n_equipos":         None,
            "pct_parque":        None,
            "eficiencia_mes":    None,
            "eficiencia_12m":    None,
            "resultado_op_12m":  None,
            "margen_op_12m":     None,
        })

    clientes.sort(key=lambda c: -c["venta_mes"])

    margen_mes_total = round(total_contrib_mes / total_venta_mes * 100, 1) if total_venta_mes > 0 else 0.0
    margen_12m_total = round(total_contrib_12m / total_venta_12m * 100, 1) if total_venta_12m > 0 else 0.0

    return {
        "mes": mes,
        "ano": _ANO,
        "label": f"{_MESES[mes]} {_ANO}",
        "kpis": {
            "venta_mes":      round(total_venta_mes),
            "contrib_mes":    round(total_contrib_mes),
            "margen_mes":     margen_mes_total,
            "venta_12m":      round(total_venta_12m),
            "contrib_12m":    round(total_contrib_12m),
            "margen_12m":     margen_12m_total,
            "n_clientes":     n_clientes,
            "var_mes":        round(var_mes, 1),
            "venta_mes_ant":  round(venta_mes_ant),
        },
        "clientes": clientes,
    }


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
        return {"error": str(e), "kpis": {}, "clientes": []}
