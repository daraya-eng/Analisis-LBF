"""
Oportunidades KAM — Mapa completo de clientes por KAM para preparar reuniones.
Cruza ventas (SQL Server) con Convenio Marco (PostgreSQL) para detectar
oportunidades de crecimiento: productos perdidos, licitaciones sin facturar,
clientes declinando, actividad CM de competidores.
Incluye meta del mes, proyeccion y scoring de oportunidad por cliente.
"""
import calendar
from datetime import date
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE, filtro_guias
from cache import mem_get, mem_set
import traceback

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

_ZONA_MERGE = {
    "07-V REGION": "V REGION",
    "19-V REGION II": "V REGION",
}


def _zona_label(zona: str) -> str:
    zona = zona.strip()
    if zona in _ZONA_MERGE:
        return _ZONA_MERGE[zona]
    parts = zona.split("-", 1)
    return parts[1] if len(parts) > 1 else zona


def _zona_raw_filters(zona_label: str) -> str:
    """Convert display label to SQL LIKE filters for VENDEDOR."""
    # Check if it's a merged zone
    raws = [k for k, v in _ZONA_MERGE.items() if v == zona_label]
    if raws:
        return " OR ".join(f"VENDEDOR = '{r}'" for r in raws)
    # Otherwise try to match by suffix
    return f"VENDEDOR LIKE '%-{zona_label}'"


def _dias_habiles(ano: int, mes: int) -> tuple[int, int]:
    """Return (dias habiles transcurridos, dias habiles totales) for a month."""
    hoy_date = date.today()
    _, total_days = calendar.monthrange(ano, mes)
    total_hab = sum(1 for d in range(1, total_days + 1)
                    if date(ano, mes, d).weekday() < 5)
    if ano == hoy_date.year and mes == hoy_date.month:
        trans = sum(1 for d in range(1, hoy_date.day + 1)
                    if date(ano, mes, d).weekday() < 5)
    elif date(ano, mes, 1) < hoy_date:
        trans = total_hab  # month completed
    else:
        trans = 0
    return trans, total_hab


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


# ═══════════════════════════════════════════════════════════════
# Endpoint 1: Lista de KAMs con KPIs resumen
# ═══════════════════════════════════════════════════════════════

@router.get("/")
async def get_kams(
    current_user: dict = Depends(get_current_user),
):
    """Returns list of KAMs with summary KPIs for tab rendering."""
    try:
        ck = "oport_kams"
        cached = mem_get(ck)
        if cached:
            return cached

        _ANO = hoy()["ano"]
        _MES = hoy()["mes"]
        conn = get_conn()
        cur = conn.cursor()

        # Get KAMs from Metas_KAM
        cur.execute("""
            SELECT LTRIM(RTRIM(ZONA)) AS zona,
                   LTRIM(RTRIM(KAM)) AS kam
            FROM Metas_KAM
            GROUP BY LTRIM(RTRIM(ZONA)), LTRIM(RTRIM(KAM))
        """)
        kam_map = {}  # label -> kam
        for r in cur.fetchall():
            label = _zona_label(str(r[0]).strip())
            kam = str(r[1]).strip()
            if label not in kam_map:
                kam_map[label] = kam
            elif kam and kam not in kam_map[label]:
                kam_map[label] += " / " + kam

        # Quick venta summary per zona YTD
        _FG = filtro_guias()
        meses_list = ",".join(str(m) for m in range(1, _MES + 1))
        cur.execute(f"""
            SELECT VENDEDOR AS zona,
                   SUM(CAST(VENTA AS float)) AS venta_26,
                   COUNT(DISTINCT RUT) AS n_clientes
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({meses_list}) AND {_EXCL_DW}
              AND {_FG}
            GROUP BY VENDEDOR
        """)
        zona_venta = {}
        for r in cur.fetchall():
            label = _zona_label(str(r[0]).strip())
            if label not in zona_venta:
                zona_venta[label] = {"venta": 0, "n_clientes": 0}
            zona_venta[label]["venta"] += float(r[1] or 0)
            zona_venta[label]["n_clientes"] += int(r[2] or 0)

        conn.close()

        kams = []
        for label in sorted(kam_map.keys()):
            v = zona_venta.get(label, {})
            kams.append({
                "zona": label,
                "kam": kam_map[label],
                "venta_ytd": round(v.get("venta", 0)),
                "n_clientes": v.get("n_clientes", 0),
            })

        result = {"kams": kams}
        mem_set(ck, result)
        return result
    except Exception as e:
        return {"error": str(e), "kams": []}


# ═══════════════════════════════════════════════════════════════
# Endpoint 2: Clientes de un KAM con señales de oportunidad
# ═══════════════════════════════════════════════════════════════

def _cat_filter_sql(categoria: str | None) -> str:
    """Build SQL AND clause for category filter. Returns '' if no filter."""
    if not categoria:
        return ""
    if categoria == "EQM":
        return " AND LTRIM(RTRIM(CATEGORIA)) IN ('EQM','SERVICIOS')"
    return f" AND LTRIM(RTRIM(CATEGORIA)) = '{categoria}'"


def _load_oportunidades(zona_label: str, meses: list[int], categoria: str | None = None) -> dict:
    _ANO = hoy()["ano"]
    _MES = hoy()["mes"]
    _HOY = hoy()["hoy"]
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)
    zona_filter = _zona_raw_filters(zona_label)
    _CF = _cat_filter_sql(categoria)

    # ═══ 0. META del KAM desde Metas_KAM ═══
    aniomes_list = ",".join(str(_ANO * 100 + m) for m in meses)
    aniomes_anual = ",".join(str(_ANO * 100 + m) for m in range(1, 13))
    aniomes_mes_actual = str(_ANO * 100 + _MES)

    cur.execute(f"""
        SELECT CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) AS mes,
               CAST(LTRIM(RTRIM([ META ])) AS float) AS meta
        FROM Metas_KAM
        WHERE ANIOMES IN ({aniomes_anual})
          AND ({zona_filter.replace('VENDEDOR', 'LTRIM(RTRIM(ZONA))')})
    """)
    meta_por_mes = {}
    for r in cur.fetchall():
        m = int(r[0])
        meta_por_mes[m] = meta_por_mes.get(m, 0) + float(r[1] or 0)

    meta_periodo = sum(meta_por_mes.get(m, 0) for m in meses)
    meta_anual = sum(meta_por_mes.values())
    meta_mes_actual = meta_por_mes.get(_MES, 0)

    # Venta del mes actual (para ritmo diario y proyeccion)
    _FG = filtro_guias()
    cur.execute(f"""
        SELECT SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {_MES}
          AND ({zona_filter}) AND {_EXCL_DW}
          AND {_FG}{_CF}
    """)
    venta_mes_actual = float((cur.fetchone()[0]) or 0)

    # Dias habiles
    dh_trans, dh_total = _dias_habiles(_ANO, _MES)
    ritmo_diario = round(venta_mes_actual / dh_trans) if dh_trans > 0 else 0
    ritmo_necesario = round((meta_mes_actual - venta_mes_actual) / max(dh_total - dh_trans, 1)) if meta_mes_actual > 0 else 0
    proyeccion_mes = round(venta_mes_actual + ritmo_diario * max(dh_total - dh_trans, 0))

    meta_info = {
        "meta_periodo": round(meta_periodo),
        "meta_anual": round(meta_anual),
        "meta_mes_actual": round(meta_mes_actual),
        "mes_actual_nombre": MESES_NOMBRE.get(_MES, ""),
        "venta_mes_actual": round(venta_mes_actual),
        "ritmo_diario": ritmo_diario,
        "ritmo_necesario": ritmo_necesario,
        "proyeccion_mes": proyeccion_mes,
        "dh_transcurridos": dh_trans,
        "dh_totales": dh_total,
        "dh_restantes": dh_total - dh_trans,
        "cumpl_mes": round(venta_mes_actual / meta_mes_actual * 100, 1) if meta_mes_actual > 0 else 0,
    }

    # ═══ 1. Clientes: venta 26/25, última compra, frecuencia, productos ═══
    _CF25 = _CF.replace('CATEGORIA', 'f25.CATEGORIA') if _CF else ""
    _CF26 = _CF.replace('CATEGORIA', 'f26.CATEGORIA') if _CF else ""
    cur.execute(f"""
        WITH v26 AS (
            SELECT RUT, MAX(NOMBRE) AS nombre,
                   MAX(LTRIM(RTRIM(ISNULL(SEGMENTO, '')))) AS segmento,
                   SUM(CAST(VENTA AS float)) AS venta,
                   SUM(CAST(CONTRIBUCION AS float)) AS contrib,
                   MAX(CAST(DIA AS date)) AS ultima_compra,
                   COUNT(DISTINCT MES) AS meses_activos,
                   COUNT(DISTINCT CODIGO) AS n_productos
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list})
              AND ({zona_filter}) AND {_EXCL_DW}
              AND {_FG}{_CF}
            GROUP BY RUT
        ),
        v25 AS (
            SELECT RUT,
                   SUM(CAST(VENTA AS float)) AS venta
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND MES IN ({mes_list})
              AND ({zona_filter}) AND {_EXCL_DW}
              AND {_FG}{_CF}
            GROUP BY RUT
        ),
        perdidos AS (
            -- Count products bought in 2025 but not in 2026
            SELECT f25.RUT,
                   COUNT(DISTINCT f25.CODIGO) AS n_perdidos,
                   SUM(CAST(f25.VENTA AS float)) AS monto_perdido
            FROM BI_TOTAL_FACTURA f25
            WHERE f25.ANO = {_ANO - 1} AND f25.MES IN ({mes_list})
              AND ({zona_filter.replace('VENDEDOR', 'f25.VENDEDOR')}) AND
              {_EXCL_DW.replace('VENDEDOR', 'f25.VENDEDOR').replace('CODIGO', 'f25.CODIGO')}
              AND {_FG}{_CF25}
              AND NOT EXISTS (
                  SELECT 1 FROM BI_TOTAL_FACTURA f26
                  WHERE f26.ANO = {_ANO} AND f26.MES IN ({mes_list})
                    AND f26.RUT = f25.RUT AND f26.CODIGO = f25.CODIGO
                    AND {_EXCL_DW.replace('VENDEDOR', 'f26.VENDEDOR').replace('CODIGO', 'f26.CODIGO')}
                    AND {_FG}{_CF26}
              )
            GROUP BY f25.RUT
        )
        SELECT v26.RUT, v26.nombre, v26.segmento,
               v26.venta AS venta_26, COALESCE(v25.venta, 0) AS venta_25,
               v26.contrib,
               v26.ultima_compra, v26.meses_activos, v26.n_productos,
               COALESCE(p.n_perdidos, 0) AS n_perdidos,
               COALESCE(p.monto_perdido, 0) AS monto_perdido
        FROM v26
        LEFT JOIN v25 ON v26.RUT = v25.RUT
        LEFT JOIN perdidos p ON p.RUT = v26.RUT
        ORDER BY v26.venta DESC
    """)

    clientes = []
    total_v26 = 0
    total_v25 = 0
    n_declinando = 0
    n_con_perdidos = 0

    for r in cur.fetchall():
        rut = str(r[0]).strip()
        nombre = str(r[1] or "").strip()
        seg = str(r[2] or "").strip() or "Sin Segmento"
        v26 = float(r[3] or 0)
        v25 = float(r[4] or 0)
        contrib = float(r[5] or 0)
        ult = r[6]
        meses_act = int(r[7] or 0)
        n_prod = int(r[8] or 0)
        n_perd = int(r[9] or 0)
        m_perd = float(r[10] or 0)

        crec = round((v26 / v25 - 1) * 100, 1) if v25 > 0 else None
        gap = round(v26 - v25)
        margen = round(contrib / v26 * 100, 1) if v26 > 0 else 0

        # Calculate days since last purchase
        dias_sin_compra = None
        ultima_compra_str = None
        if ult:
            try:
                from datetime import date
                ult_date = ult if isinstance(ult, date) else date.fromisoformat(str(ult)[:10])
                dias_sin_compra = (date.fromisoformat(_HOY) - ult_date).days
                ultima_compra_str = ult_date.isoformat()
            except Exception:
                pass

        # Build alerts
        alertas = []
        if crec is not None and crec < -10:
            alertas.append(f"Caida {crec}%")
        if dias_sin_compra is not None and dias_sin_compra > 30:
            alertas.append(f"{dias_sin_compra}d sin compra")
        if n_perd > 0:
            alertas.append(f"{n_perd} prod. perdidos")

        total_v26 += v26
        total_v25 += v25
        if crec is not None and crec < 0:
            n_declinando += 1
        if n_perd > 0:
            n_con_perdidos += 1

        clientes.append({
            "rut": rut,
            "nombre": nombre,
            "segmento": seg,
            "venta_26": round(v26),
            "venta_25": round(v25),
            "crec": crec,
            "gap": gap,
            "margen": margen,
            "contrib": round(contrib),
            "ultima_compra": ultima_compra_str,
            "dias_sin_compra": dias_sin_compra,
            "meses_activos": meses_act,
            "n_productos": n_prod,
            "n_perdidos": n_perd,
            "monto_perdido": round(m_perd),
            "alertas": alertas,
        })

    # ═══ 2. Licitaciones abiertas por cliente ═══
    lic_por_cliente = {}
    try:
        cur.execute(f"""
            SELECT l.rut_cliente, l.licitacion,
                   SUM(CASE WHEN l.EsLBF = 1 THEN CAST(ISNULL(l.monto_licitacion, '0') AS float) ELSE 0 END) AS adjudicado,
                   l.fecha_termino
            FROM vw_LICITACIONES_CATEGORIZADAS l
            WHERE l.EsLBF = 1 AND l.estado = 'Adjudicado'
              AND l.fecha_termino >= CAST(GETDATE() AS date)
            GROUP BY l.rut_cliente, l.licitacion, l.fecha_termino
        """)
        for r in cur.fetchall():
            rut = str(r[0]).strip()
            adj = float(r[2] or 0)
            if rut not in lic_por_cliente:
                lic_por_cliente[rut] = {"n_lic": 0, "adjudicado": 0}
            lic_por_cliente[rut]["n_lic"] += 1
            lic_por_cliente[rut]["adjudicado"] += adj

        # Get facturado per licitacion
        cur.execute(f"""
            SELECT RUT, SUM(CAST(VENTA AS float)) AS facturado
            FROM BI_TOTAL_FACTURA
            WHERE TIPO_OC = 'LICITACION' AND {_EXCL_DW}
              AND ANO = {hoy()['ano']}
              AND {_FG}
            GROUP BY RUT
        """)
        fac_por_rut = {}
        for r in cur.fetchall():
            rut = str(r[0]).strip()
            fac_por_rut[rut] = float(r[1] or 0)
    except Exception:
        pass

    # Merge licitaciones into clientes
    for c in clientes:
        rut = c["rut"]
        lic = lic_por_cliente.get(rut, {})
        c["n_licitaciones"] = lic.get("n_lic", 0)
        c["adjudicado"] = round(lic.get("adjudicado", 0))
        c["facturado_lic"] = round(fac_por_rut.get(rut, 0))
        adj_sin_fac = c["adjudicado"] - c["facturado_lic"]
        c["adj_sin_facturar"] = max(0, round(adj_sin_fac))
        if c["adj_sin_facturar"] > 1_000_000:
            c["alertas"].append(f"Adj. sin facturar")

    conn.close()

    # ═══ 3. CM data from PostgreSQL ═══
    cm_por_rut = {}
    try:
        from db_mp import get_pg_conn, MEDICAL_CAT
        ruts = [c["rut"] for c in clientes if c["segmento"] == "PUBLICO"]
        if ruts:
            pg = get_pg_conn()
            pgcur = pg.cursor()
            # Build parameterized query for batch RUT lookup
            placeholders = ",".join(["%s"] * len(ruts))
            pgcur.execute(f"""
                SELECT oc.comprador_rut_unidad AS rut,
                       SUM(CASE WHEN oc.proveedor_nombre_empresa ILIKE '%%lbf%%'
                           THEN COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)
                           ELSE 0 END) AS monto_lbf,
                       SUM(CASE WHEN oc.proveedor_nombre_empresa NOT ILIKE '%%lbf%%'
                           THEN COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)
                           ELSE 0 END) AS monto_comp,
                       COUNT(DISTINCT CASE WHEN oc.proveedor_nombre_empresa NOT ILIKE '%%lbf%%'
                           THEN oc.proveedor_nombre_empresa END) AS n_competidores
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE oc.tipo_compra = 'CM'
                  AND oi.categoria ILIKE %s
                  AND EXTRACT(YEAR FROM oc.fecha_envio) = %s
                  AND oc.comprador_rut_unidad IN ({placeholders})
                GROUP BY oc.comprador_rut_unidad
            """, [f"{MEDICAL_CAT}%%", hoy()["ano"]] + ruts)
            for r in pgcur.fetchall():
                rut = str(r[0]).strip()
                cm_por_rut[rut] = {
                    "monto_lbf_cm": round(float(r[1] or 0)),
                    "monto_comp_cm": round(float(r[2] or 0)),
                    "n_competidores_cm": int(r[3] or 0),
                }
            pg.close()
    except Exception:
        pass

    # Merge CM into clientes
    for c in clientes:
        cm = cm_por_rut.get(c["rut"], {})
        c["monto_lbf_cm"] = cm.get("monto_lbf_cm", 0)
        c["monto_comp_cm"] = cm.get("monto_comp_cm", 0)
        c["n_competidores_cm"] = cm.get("n_competidores_cm", 0)
        if c["monto_comp_cm"] > 0:
            c["alertas"].append("Compra a comp. por CM")

    # ═══ 4. Calcular potencial de oportunidad por cliente ═══
    for c in clientes:
        pot = 0
        desglose = []
        if c["monto_perdido"] > 0:
            pot += c["monto_perdido"]
            desglose.append({"tipo": "Prod. perdidos", "monto": c["monto_perdido"]})
        if c["adj_sin_facturar"] > 0:
            pot += c["adj_sin_facturar"]
            desglose.append({"tipo": "Adj. sin facturar", "monto": c["adj_sin_facturar"]})
        if c["monto_comp_cm"] > 0:
            pot += c["monto_comp_cm"]
            desglose.append({"tipo": "CM competencia", "monto": c["monto_comp_cm"]})
        gap_recuperable = max(0, c["venta_25"] - c["venta_26"])
        if gap_recuperable > 0 and c["monto_perdido"] == 0:
            # Only add gap if not already counted via lost products
            pot += gap_recuperable
            desglose.append({"tipo": "Caida vs 2025", "monto": round(gap_recuperable)})
        c["potencial"] = round(pot)
        c["potencial_desglose"] = desglose

    # Top oportunidades — top 10 clients by potential
    top_oportunidades = sorted(
        [c for c in clientes if c["potencial"] > 0],
        key=lambda c: -c["potencial"]
    )[:10]

    # Proyeccion anual del KAM
    meses_transcurridos = len([m for m in range(1, _MES + 1)])
    venta_ytd = total_v26
    promedio_mensual = venta_ytd / meses_transcurridos if meses_transcurridos > 0 else 0
    meses_restantes = 12 - _MES
    proyeccion_anual = round(venta_ytd + promedio_mensual * meses_restantes)
    cumpl_anual_proy = round(proyeccion_anual / meta_anual * 100, 1) if meta_anual > 0 else 0

    # KPIs
    crec_total = round((total_v26 / total_v25 - 1) * 100, 1) if total_v25 > 0 else 0
    cumpl_periodo = round(total_v26 / meta_periodo * 100, 1) if meta_periodo > 0 else 0
    gap_meta = round(total_v26 - meta_periodo)

    kpis = {
        "venta_26": round(total_v26),
        "venta_25": round(total_v25),
        "crec": crec_total,
        "n_clientes": len(clientes),
        "n_declinando": n_declinando,
        "n_con_perdidos": n_con_perdidos,
        "oportunidad_perdidos": round(sum(c["monto_perdido"] for c in clientes)),
        "adj_sin_facturar": round(sum(c["adj_sin_facturar"] for c in clientes)),
        "potencial_total": round(sum(c["potencial"] for c in clientes)),
        # Meta & projection
        "cumpl_periodo": cumpl_periodo,
        "gap_meta": gap_meta,
        "proyeccion_anual": proyeccion_anual,
        "cumpl_anual_proy": cumpl_anual_proy,
    }

    return {
        "kpis": kpis,
        "meta": meta_info,
        "clientes": clientes,
        "top_oportunidades": [{
            "rut": c["rut"],
            "nombre": c["nombre"],
            "potencial": c["potencial"],
            "desglose": c["potencial_desglose"],
            "venta_26": c["venta_26"],
            "alertas": c["alertas"],
        } for c in top_oportunidades],
    }


@router.get("/clientes")
async def get_clientes_kam(
    zona: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        # Validate categoria
        cat = categoria.upper() if categoria else None
        if cat and cat not in _CATS_VALIDAS:
            cat = None
        meses, label = _parse_periodo(periodo, mes)
        ck = f"oport_cli:{zona}:{periodo}:{mes}:{cat}"
        cached = mem_get(ck)
        if cached:
            return cached
        data = _load_oportunidades(zona, meses, cat)
        data["zona"] = zona
        data["periodo"] = periodo
        data["label"] = label
        data["categoria"] = cat
        mem_set(ck, data)
        return data
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "kpis": {}, "clientes": [], "zona": zona}


# ═══════════════════════════════════════════════════════════════
# Endpoint 3: Detalle de un cliente (productos perdidos + trend)
# ═══════════════════════════════════════════════════════════════

@router.get("/cliente-detalle")
async def get_cliente_detalle(
    rut: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    zona: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        cat = categoria.upper() if categoria else None
        if cat and cat not in _CATS_VALIDAS:
            cat = None
        _CF = _cat_filter_sql(cat)
        zona_filter = _zona_raw_filters(zona) if zona else "1=1"

        ck = f"oport_det:{rut}:{periodo}:{mes}:{cat}:{zona}"
        cached = mem_get(ck)
        if cached:
            return cached

        meses, _ = _parse_periodo(periodo, mes)
        _ANO = hoy()["ano"]
        conn = get_conn()
        cur = conn.cursor()
        mes_list = ",".join(str(m) for m in meses)

        # ═══ Products: current + lost + new ═══
        _FG = filtro_guias()
        cur.execute(f"""
            WITH p26 AS (
                SELECT CODIGO, MAX(DESCRIPCION) AS desc26,
                       {_CAT_CASE} AS cat,
                       SUM(CAST(VENTA AS float)) AS venta_26,
                       SUM(CAST(CANT AS float)) AS cant_26
                FROM BI_TOTAL_FACTURA
                WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
                  AND {_FG}{_CF}
                  AND RUT = ?
                GROUP BY CODIGO, {_CAT_CASE}
            ),
            p25 AS (
                SELECT CODIGO, MAX(DESCRIPCION) AS desc25,
                       SUM(CAST(VENTA AS float)) AS venta_25,
                       SUM(CAST(CANT AS float)) AS cant_25
                FROM BI_TOTAL_FACTURA
                WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
                  AND {_FG}{_CF}
                  AND ({zona_filter})
                  AND RUT = ?
                GROUP BY CODIGO
            )
            SELECT COALESCE(p26.CODIGO, p25.CODIGO) AS codigo,
                   COALESCE(p26.desc26, p25.desc25) AS descripcion,
                   COALESCE(p26.cat, '') AS categoria,
                   COALESCE(p26.venta_26, 0) AS venta_26,
                   COALESCE(p25.venta_25, 0) AS venta_25,
                   COALESCE(p26.cant_26, 0) AS cant_26,
                   COALESCE(p25.cant_25, 0) AS cant_25
            FROM p26
            FULL OUTER JOIN p25 ON p26.CODIGO = p25.CODIGO
            ORDER BY ABS(COALESCE(p26.venta_26, 0) - COALESCE(p25.venta_25, 0)) DESC
        """, (rut, rut))

        productos = []
        perdidos = []
        nuevos = []
        for r in cur.fetchall():
            codigo = str(r[0] or "").strip()
            desc = str(r[1] or "").strip()
            cat = str(r[2] or "").strip()
            v26 = float(r[3] or 0)
            v25 = float(r[4] or 0)

            if v25 > 0 and v26 == 0:
                perdidos.append({"codigo": codigo, "descripcion": desc, "categoria": cat, "venta_25": round(v25)})
            elif v26 > 0 and v25 == 0:
                nuevos.append({"codigo": codigo, "descripcion": desc, "categoria": cat, "venta_26": round(v26)})
            elif v26 > 0 and v25 > 0:
                productos.append({
                    "codigo": codigo, "descripcion": desc, "categoria": cat,
                    "venta_26": round(v26), "venta_25": round(v25),
                    "crec": round((v26 / v25 - 1) * 100, 1) if v25 > 0 else 0,
                })

        # ═══ Monthly trend ═══
        cur.execute(f"""
            SELECT MES, SUM(CAST(VENTA AS float)) AS venta
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND {_EXCL_DW} AND {_FG}{_CF} AND RUT = ?
            GROUP BY MES
            ORDER BY MES
        """, (rut,))
        trend_26 = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

        cur.execute(f"""
            SELECT MES, SUM(CAST(VENTA AS float)) AS venta
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND {_EXCL_DW} AND {_FG}{_CF} AND RUT = ?
            GROUP BY MES
            ORDER BY MES
        """, (rut,))
        trend_25 = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

        tendencia = []
        for m in range(1, hoy()["mes"] + 1):
            tendencia.append({
                "mes": m,
                "mes_nombre": MESES_NOMBRE.get(m, ""),
                "venta_26": round(trend_26.get(m, 0)),
                "venta_25": round(trend_25.get(m, 0)),
            })

        # ═══ Licitaciones activas del cliente ═══
        licitaciones = []
        try:
            cur.execute(f"""
                SELECT l.licitacion,
                       MIN(l.fecha_inicio) AS inicio,
                       MAX(l.fecha_termino) AS termino,
                       SUM(CAST(ISNULL(l.monto_licitacion, '0') AS float)) AS adjudicado,
                       COALESCE(fac.facturado, 0) AS facturado
                FROM vw_LICITACIONES_CATEGORIZADAS l
                LEFT JOIN (
                    SELECT LICITACION, SUM(CAST(VENTA AS float)) AS facturado
                    FROM BI_TOTAL_FACTURA
                    WHERE TIPO_OC = 'LICITACION' AND {_EXCL_DW}
                      AND {_FG}
                    GROUP BY LICITACION
                ) fac ON fac.LICITACION = l.licitacion
                WHERE l.EsLBF = 1 AND l.estado = 'Adjudicado'
                  AND l.rut_cliente = ?
                  AND l.fecha_termino >= CAST(GETDATE() AS date)
                GROUP BY l.licitacion, fac.facturado
                ORDER BY MAX(l.fecha_termino) DESC
            """, (rut,))
            for r in cur.fetchall():
                adj = float(r[3] or 0)
                fac = float(r[4] or 0)
                termino = r[2]
                dias_rest = None
                if termino:
                    try:
                        from datetime import date as _date
                        t = _date.fromisoformat(str(termino)[:10])
                        dias_rest = (t - _date.fromisoformat(hoy()["hoy"])).days
                    except Exception:
                        pass
                licitaciones.append({
                    "licitacion": str(r[0]),
                    "inicio": str(r[1])[:10] if r[1] else None,
                    "termino": str(r[2])[:10] if r[2] else None,
                    "adjudicado": round(adj),
                    "facturado": round(fac),
                    "cumplimiento": round(fac / adj * 100) if adj > 0 else 0,
                    "dias_restantes": dias_rest,
                })
        except Exception:
            pass

        conn.close()

        # ═══ CM detail from PostgreSQL ═══
        cm_detalle = []
        try:
            from db_mp import get_pg_conn, MEDICAL_CAT
            pg = get_pg_conn()
            pgcur = pg.cursor()
            pgcur.execute(f"""
                SELECT oc.proveedor_nombre_empresa,
                       SUM(COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)) AS monto,
                       COUNT(DISTINCT oc.id) AS n_ocs
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE oc.tipo_compra = 'CM'
                  AND oi.categoria ILIKE %s
                  AND EXTRACT(YEAR FROM oc.fecha_envio) = %s
                  AND oc.comprador_rut_unidad = %s
                GROUP BY oc.proveedor_nombre_empresa
                ORDER BY SUM(COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)) DESC
            """, (f"{MEDICAL_CAT}%%", hoy()["ano"], rut))
            for r in pgcur.fetchall():
                empresa = str(r[0] or "").strip()
                es_lbf = "lbf" in empresa.lower()
                cm_detalle.append({
                    "proveedor": empresa,
                    "monto": round(float(r[1] or 0)),
                    "n_ocs": int(r[2] or 0),
                    "es_lbf": es_lbf,
                })
            pg.close()
        except Exception:
            pass

        result = {
            "productos": sorted(productos, key=lambda p: p["venta_26"], reverse=True)[:30],
            "perdidos": sorted(perdidos, key=lambda p: -p["venta_25"])[:20],
            "nuevos": sorted(nuevos, key=lambda p: -p["venta_26"])[:20],
            "tendencia": tendencia,
            "licitaciones": licitaciones,
            "cm_detalle": cm_detalle,
        }
        mem_set(ck, result)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "productos": [], "perdidos": [], "nuevos": [],
                "tendencia": [], "licitaciones": [], "cm_detalle": []}
