"""
Market Analysis — Licitaciones: desempeño LBF, productos, competidores.
Source: vw_LICITACIONES_CATEGORIZADAS.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy
from cache import mem_get, mem_set

router = APIRouter()


def _parse_periodo(periodo: str, mes: int | None) -> tuple[str, str]:
    h = hoy()
    _ANO, _MES = h["ano"], h["mes"]
    if periodo == "ytd":
        return f"{_ANO}-01", f"{_ANO}-{_MES:02d}"
    elif periodo == "q1":
        return f"{_ANO}-01", f"{_ANO}-03"
    elif periodo == "q2":
        return f"{_ANO}-04", f"{_ANO}-06"
    elif periodo == "q3":
        return f"{_ANO}-07", f"{_ANO}-09"
    elif periodo == "q4":
        return f"{_ANO}-10", f"{_ANO}-12"
    elif periodo == "ultimo_ano":
        y = _ANO - 1
        return f"{y}-{_MES:02d}", f"{_ANO}-{_MES:02d}"
    elif periodo == "mes" and mes:
        return f"{_ANO}-{mes:02d}", f"{_ANO}-{mes:02d}"
    elif periodo == "todo":
        return "2020-01", f"{_ANO}-12"
    return f"{_ANO}-01", f"{_ANO}-{_MES:02d}"


def _am(alias: str, desde: str, hasta: str) -> str:
    p = f"{alias}." if alias else ""
    return f"{p}AnioMes >= '{desde}' AND {p}AnioMes <= '{hasta}'"


# ═══════════════════════════════════════════════════════════════════
# 1. Desempeño LBF
# ═══════════════════════════════════════════════════════════════════

def _load_desempeno(desde: str, hasta: str) -> dict:
    conn = get_conn()
    cur = conn.cursor()

    # ── KPIs ──
    cur.execute(f"""
        SELECT
            COUNT(DISTINCT licitacion) AS total_lic,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'No Adjudicado' THEN licitacion END) AS perdidas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto_ganado,
            SUM(CASE WHEN estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto_mercado,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN rut_cliente END) AS clientes_activos,
            COUNT(DISTINCT rut_cliente) AS clientes_totales,
            COUNT(DISTINCT CASE WHEN EsLBF = 0 AND estado = 'Adjudicado' THEN nombre_empresa END) AS n_competidores
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)}
    """)
    r = cur.fetchone()
    ganadas = r[1] or 0
    perdidas = r[2] or 0
    participadas = ganadas + perdidas
    kpis = {
        "total_licitaciones": r[0] or 0,
        "ganadas": ganadas, "perdidas": perdidas, "participadas": participadas,
        "win_rate": round(ganadas / participadas * 100, 1) if participadas > 0 else 0,
        "monto_ganado": int(r[3] or 0),
        "monto_mercado": int(r[4] or 0),
        "participacion_mercado": round(int(r[3] or 0) / int(r[4] or 1) * 100, 1) if r[4] else 0,
        "clientes_activos": r[5] or 0,
        "clientes_totales": r[6] or 0,
        "cobertura": round((r[5] or 0) / (r[6] or 1) * 100, 1) if r[6] else 0,
        "n_competidores": r[7] or 0,
    }

    # ── Win rate por categoría ──
    cur.execute(f"""
        SELECT Categoria,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'No Adjudicado' THEN licitacion END) AS perdidas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto_lbf,
            SUM(CASE WHEN estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto_mercado
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)} AND Categoria IS NOT NULL AND Categoria != ''
        GROUP BY Categoria ORDER BY monto_mercado DESC
    """)
    categorias = []
    for r in cur.fetchall():
        g = r[1] or 0; p = r[2] or 0
        mm = int(r[4] or 0); ml = int(r[3] or 0)
        categorias.append({
            "categoria": str(r[0] or "").strip(),
            "ganadas": g, "perdidas": p,
            "win_rate": round(g / (g + p) * 100, 1) if (g + p) > 0 else 0,
            "monto_lbf": ml, "monto_mercado": mm,
            "participacion": round(ml / mm * 100, 1) if mm > 0 else 0,
        })

    # ── Win rate por zona ──
    cur.execute(f"""
        SELECT ISNULL(FFVV_ZONA, 'Sin Zona') AS zona,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'No Adjudicado' THEN licitacion END) AS perdidas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto_lbf,
            COUNT(DISTINCT rut_cliente) AS n_clientes
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)}
        GROUP BY ISNULL(FFVV_ZONA, 'Sin Zona') ORDER BY monto_lbf DESC
    """)
    zonas = []
    for r in cur.fetchall():
        g = r[1] or 0; p = r[2] or 0
        zonas.append({
            "zona": str(r[0] or "").strip(),
            "ganadas": g, "perdidas": p,
            "win_rate": round(g / (g + p) * 100, 1) if (g + p) > 0 else 0,
            "monto_lbf": int(r[3] or 0), "n_clientes": r[4] or 0,
        })

    # ── Win rate por tipo ──
    cur.execute(f"""
        SELECT ISNULL(tipo, '(sin tipo)') AS tipo,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'No Adjudicado' THEN licitacion END) AS perdidas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)}
        GROUP BY ISNULL(tipo, '(sin tipo)') ORDER BY monto DESC
    """)
    tipos = []
    for r in cur.fetchall():
        g = r[1] or 0; p = r[2] or 0
        tipos.append({
            "tipo": str(r[0] or "").strip(),
            "ganadas": g, "perdidas": p,
            "win_rate": round(g / (g + p) * 100, 1) if (g + p) > 0 else 0,
            "monto": int(r[3] or 0),
        })

    # ── Top 5 competidores para resumen ──
    cur.execute(f"""
        SELECT TOP 5 nombre_empresa,
            SUM(TRY_CAST(monto_licitacion AS bigint)) AS monto,
            COUNT(DISTINCT licitacion) AS n_lic
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE estado = 'Adjudicado' AND EsLBF = 0 AND {_am('', desde, hasta)}
        GROUP BY nombre_empresa ORDER BY monto DESC
    """)
    top5_comp = [{"empresa": str(r[0] or "").strip(), "monto": int(r[1] or 0), "n_lic": r[2] or 0}
                 for r in cur.fetchall()]

    # ── Top productos LBF por win rate (min 5 participaciones) ──
    cur.execute(f"""
        SELECT TOP 10 DescripcionMaestro,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END) AS participadas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)} AND DescripcionMaestro IS NOT NULL AND DescripcionMaestro != ''
        GROUP BY DescripcionMaestro
        HAVING COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END) >= 5
        ORDER BY COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) * 1.0
               / NULLIF(COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END), 0) DESC
    """)
    top_productos = []
    for r in cur.fetchall():
        g = r[1] or 0; p = r[2] or 0
        top_productos.append({
            "producto": str(r[0] or "").strip(),
            "ganadas": g, "participadas": p,
            "win_rate": round(g / p * 100, 1) if p > 0 else 0,
            "monto": int(r[3] or 0),
        })

    # ── Top productos con peor win rate (min 5 participaciones) ──
    cur.execute(f"""
        SELECT TOP 10 DescripcionMaestro,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) AS ganadas,
            COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END) AS participadas,
            SUM(CASE WHEN EsLBF = 1 AND estado = 'Adjudicado'
                THEN TRY_CAST(monto_licitacion AS bigint) ELSE 0 END) AS monto
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE {_am('', desde, hasta)} AND DescripcionMaestro IS NOT NULL AND DescripcionMaestro != ''
        GROUP BY DescripcionMaestro
        HAVING COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END) >= 5
        ORDER BY COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) * 1.0
               / NULLIF(COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END), 0) ASC
    """)
    worst_productos = []
    for r in cur.fetchall():
        g = r[1] or 0; p = r[2] or 0
        worst_productos.append({
            "producto": str(r[0] or "").strip(),
            "ganadas": g, "participadas": p,
            "win_rate": round(g / p * 100, 1) if p > 0 else 0,
            "monto": int(r[3] or 0),
        })

    conn.close()
    return {
        "kpis": kpis, "categorias": categorias, "zonas": zonas, "tipos": tipos,
        "top5_competidores": top5_comp,
        "top_productos": top_productos, "worst_productos": worst_productos,
    }


# ═══════════════════════════════════════════════════════════════════
# 2. Competidores
# ═══════════════════════════════════════════════════════════════════

def _load_competidores(desde: str, hasta: str) -> dict:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(f"""
        SELECT TOP 30 nombre_empresa,
            SUM(TRY_CAST(monto_licitacion AS bigint)) AS monto,
            COUNT(DISTINCT licitacion) AS n_lic,
            COUNT(DISTINCT rut_cliente) AS n_clientes,
            COUNT(DISTINCT Categoria) AS n_categorias
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE estado = 'Adjudicado' AND EsLBF = 0
          AND {_am('', desde, hasta)}
        GROUP BY nombre_empresa
        ORDER BY monto DESC
    """)
    ranking = []
    for r in cur.fetchall():
        ranking.append({
            "empresa": str(r[0] or "").strip(),
            "monto": int(r[1] or 0),
            "n_licitaciones": r[2] or 0,
            "n_clientes": r[3] or 0,
            "n_categorias": r[4] or 0,
        })

    conn.close()
    return {"ranking": ranking}


def _load_competidor_detalle(empresa: str, desde: str, hasta: str) -> dict:
    conn = get_conn()
    cur = conn.cursor()

    # Head-to-head
    cur.execute(f"""
        WITH lic_emp AS (
            SELECT DISTINCT licitacion FROM vw_LICITACIONES_CATEGORIZADAS
            WHERE nombre_empresa = ? AND estado = 'Adjudicado' AND {_am('', desde, hasta)}
        ),
        lic_lbf AS (
            SELECT DISTINCT licitacion FROM vw_LICITACIONES_CATEGORIZADAS
            WHERE EsLBF = 1 AND estado = 'Adjudicado' AND {_am('', desde, hasta)}
        )
        SELECT
            (SELECT COUNT(*) FROM lic_emp) AS emp,
            (SELECT COUNT(*) FROM lic_lbf) AS lbf,
            (SELECT COUNT(*) FROM lic_emp e JOIN lic_lbf l ON e.licitacion = l.licitacion) AS compartidas
    """, (empresa,))
    r = cur.fetchone()
    h2h = {"ganadas_competidor": r[0] or 0, "ganadas_lbf": r[1] or 0, "compartidas": r[2] or 0}

    # Productos
    cur.execute(f"""
        SELECT TOP 20 DescripcionMaestro, Categoria,
            COUNT(DISTINCT licitacion) AS n_lic,
            SUM(TRY_CAST(monto_licitacion AS bigint)) AS monto
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE nombre_empresa = ? AND estado = 'Adjudicado' AND {_am('', desde, hasta)}
        GROUP BY DescripcionMaestro, Categoria ORDER BY monto DESC
    """, (empresa,))
    productos = [{"producto": str(r[0] or "").strip(), "categoria": str(r[1] or "").strip(),
                   "n_licitaciones": r[2] or 0, "monto": int(r[3] or 0)} for r in cur.fetchall()]

    # Clientes donde compite y LBF no gana
    cur.execute(f"""
        SELECT TOP 15 c.rut_cliente, c.nombre_cliente,
            SUM(TRY_CAST(c.monto_licitacion AS bigint)) AS monto,
            COUNT(DISTINCT c.licitacion) AS n_lic
        FROM vw_LICITACIONES_CATEGORIZADAS c
        WHERE c.nombre_empresa = ? AND c.estado = 'Adjudicado' AND {_am('c', desde, hasta)}
          AND NOT EXISTS (
              SELECT 1 FROM vw_LICITACIONES_CATEGORIZADAS l
              WHERE l.EsLBF = 1 AND l.estado = 'Adjudicado'
                AND l.rut_cliente = c.rut_cliente AND {_am('l', desde, hasta)}
          )
        GROUP BY c.rut_cliente, c.nombre_cliente ORDER BY monto DESC
    """, (empresa,))
    clientes_excl = [{"rut": str(r[0] or "").strip(), "nombre": str(r[1] or "").strip(),
                       "monto": int(r[2] or 0), "n_licitaciones": r[3] or 0} for r in cur.fetchall()]

    # Tendencia
    cur.execute(f"""
        SELECT AnioMes, SUM(TRY_CAST(monto_licitacion AS bigint)) AS monto,
            COUNT(DISTINCT licitacion) AS n_lic
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE nombre_empresa = ? AND estado = 'Adjudicado'
          AND AnioMes >= '{int(desde[:4])-1}-01' AND AnioMes <= '{hasta}'
        GROUP BY AnioMes ORDER BY AnioMes
    """, (empresa,))
    tendencia = [{"periodo": str(r[0] or ""), "monto": int(r[1] or 0), "n_licitaciones": r[2] or 0}
                 for r in cur.fetchall()]

    conn.close()
    return {"empresa": empresa, "head_to_head": h2h, "productos": productos,
            "clientes_exclusivos": clientes_excl, "tendencia": tendencia}


# ═══════════════════════════════════════════════════════════════════
# 3. Convenio Marco
# ═══════════════════════════════════════════════════════════════════

def _load_convenio_marco() -> dict:
    conn = get_conn()
    cur = conn.cursor()

    # ── KPIs: market share LBF 2025+ ──
    cur.execute("""
        SELECT
            CASE WHEN proveedor = 'Comercial Lbf Limitada' THEN 'LBF' ELSE 'Otros' END AS quien,
            COUNT(DISTINCT oc) AS ocs,
            SUM(CAST(total_producto AS bigint)) AS monto
        FROM vw_CM_Falcon
        WHERE YEAR(fecha_envio) >= 2025
        GROUP BY CASE WHEN proveedor = 'Comercial Lbf Limitada' THEN 'LBF' ELSE 'Otros' END
    """)
    mkt = {}
    for r in cur.fetchall():
        mkt[r[0]] = {"ocs": r[1] or 0, "monto": int(r[2] or 0)}
    lbf_monto = mkt.get("LBF", {}).get("monto", 0)
    lbf_ocs = mkt.get("LBF", {}).get("ocs", 0)
    otros_monto = mkt.get("Otros", {}).get("monto", 0)
    total_mkt = lbf_monto + otros_monto
    share = round(lbf_monto / total_mkt * 100, 1) if total_mkt > 0 else 0

    # Productos distintos LBF en CM
    cur.execute("""
        SELECT COUNT(DISTINCT tipo) FROM vw_CM_Falcon
        WHERE proveedor = 'Comercial Lbf Limitada' AND YEAR(fecha_envio) >= 2024
    """)
    n_productos = cur.fetchone()[0] or 0

    kpis = {
        "share": share,
        "monto_lbf": lbf_monto,
        "ocs_lbf": lbf_ocs,
        "monto_mercado": total_mkt,
        "n_productos": n_productos,
    }

    # ── Top 15 competidores en instituciones donde LBF tiene licitación ──
    cur.execute("""
        WITH instituciones_lbf AS (
            SELECT DISTINCT rut_cliente
            FROM vw_LICITACIONES_CATEGORIZADAS
            WHERE EsLBF = 1
        )
        SELECT TOP 15
            cm.proveedor,
            COUNT(DISTINCT cm.rut) AS instituciones,
            COUNT(DISTINCT cm.oc) AS ocs,
            SUM(CAST(cm.total_producto AS bigint)) AS monto
        FROM vw_CM_Falcon cm
        INNER JOIN instituciones_lbf i ON cm.rut = i.rut_cliente
        WHERE cm.proveedor <> 'Comercial Lbf Limitada'
          AND YEAR(cm.fecha_envio) >= 2024
        GROUP BY cm.proveedor
        ORDER BY monto DESC
    """)
    competidores = []
    for r in cur.fetchall():
        competidores.append({
            "proveedor": str(r[0] or "").strip(),
            "instituciones": r[1] or 0,
            "ocs": r[2] or 0,
            "monto": int(r[3] or 0),
        })

    # ── Fuga: instituciones con licitación LBF que compran CM a competidor ──
    cur.execute("""
        WITH lbf_licit AS (
            SELECT DISTINCT rut_cliente, nombre_cliente
            FROM vw_LICITACIONES_CATEGORIZADAS
            WHERE EsLBF = 1
        ),
        cm_competidor AS (
            SELECT rut,
                   COUNT(DISTINCT oc) AS ocs,
                   SUM(CAST(total_producto AS bigint)) AS monto,
                   COUNT(DISTINCT proveedor) AS n_proveedores
            FROM vw_CM_Falcon
            WHERE proveedor <> 'Comercial Lbf Limitada'
              AND YEAR(fecha_envio) >= 2024
            GROUP BY rut
        )
        SELECT TOP 20
            l.nombre_cliente, l.rut_cliente,
            c.ocs, c.monto, c.n_proveedores
        FROM lbf_licit l
        INNER JOIN cm_competidor c ON c.rut = l.rut_cliente
        ORDER BY c.monto DESC
    """)
    fuga = []
    for r in cur.fetchall():
        fuga.append({
            "nombre": str(r[0] or "").strip(),
            "rut": str(r[1] or "").strip(),
            "ocs_competidor": r[2] or 0,
            "monto_competidor": int(r[3] or 0),
            "n_proveedores": r[4] or 0,
        })

    # ── Productos LBF en CM ──
    cur.execute("""
        SELECT TOP 15 tipo, COUNT(DISTINCT oc) AS ocs,
               SUM(CAST(total_producto AS bigint)) AS monto
        FROM vw_CM_Falcon
        WHERE proveedor = 'Comercial Lbf Limitada'
          AND YEAR(fecha_envio) >= 2024
        GROUP BY tipo
        ORDER BY monto DESC
    """)
    productos_lbf = []
    for r in cur.fetchall():
        productos_lbf.append({
            "tipo": str(r[0] or "").strip(),
            "ocs": r[1] or 0,
            "monto": int(r[2] or 0),
        })

    # ── Top instituciones que compran a LBF por CM ──
    cur.execute("""
        SELECT TOP 15 comprador, rut,
               COUNT(DISTINCT oc) AS ocs,
               SUM(CAST(total_producto AS bigint)) AS monto
        FROM vw_CM_Falcon
        WHERE proveedor = 'Comercial Lbf Limitada'
          AND YEAR(fecha_envio) >= 2024
        GROUP BY comprador, rut
        ORDER BY monto DESC
    """)
    clientes_lbf = []
    for r in cur.fetchall():
        clientes_lbf.append({
            "nombre": str(r[0] or "").strip(),
            "rut": str(r[1] or "").strip(),
            "ocs": r[2] or 0,
            "monto": int(r[3] or 0),
        })

    conn.close()
    return {
        "kpis": kpis,
        "competidores": competidores,
        "fuga": fuga,
        "productos_lbf": productos_lbf,
        "clientes_lbf": clientes_lbf,
    }


# ═══════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/")
async def get_desempeno(
    periodo: str = Query("todo"), mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mercado_desemp:{periodo}:{mes}"
        cached = mem_get(ck)
        if cached: return cached
        desde, hasta = _parse_periodo(periodo, mes)
        data = _load_desempeno(desde, hasta)
        data["periodo"] = periodo
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "categorias": [], "zonas": [],
                "tipos": [], "top5_competidores": [], "top_productos": [], "worst_productos": []}


@router.get("/competidores")
async def get_competidores(
    periodo: str = Query("todo"), mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mercado_comp:{periodo}:{mes}"
        cached = mem_get(ck)
        if cached: return cached
        desde, hasta = _parse_periodo(periodo, mes)
        data = _load_competidores(desde, hasta)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "ranking": []}


@router.get("/cm")
async def get_convenio_marco(current_user: dict = Depends(get_current_user)):
    try:
        cached = mem_get("mercado_cm")
        if cached:
            return cached
        data = _load_convenio_marco()
        mem_set("mercado_cm", data)
        return data
    except Exception as e:
        return {"error": str(e), "kpis": {}, "competidores": [],
                "fuga": [], "productos_lbf": [], "clientes_lbf": []}


@router.get("/competidores/detalle")
async def get_competidor_detalle(
    empresa: str = Query(...), periodo: str = Query("todo"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        ck = f"mercado_compd:{empresa}:{periodo}:{mes}"
        cached = mem_get(ck)
        if cached: return cached
        desde, hasta = _parse_periodo(periodo, mes)
        data = _load_competidor_detalle(empresa, desde, hasta)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "empresa": empresa, "head_to_head": {},
                "productos": [], "clientes_exclusivos": [], "tendencia": []}
