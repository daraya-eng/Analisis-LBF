"""
Mercados Relevantes — Analisis del mercado de licitaciones publicas.
Fuente unica: DWLBF.dbo.dw_datos_abiertos_licitaciones (SQL Server).
Rubros: Equipamiento y Suministros Medicos + Equipamiento para Laboratorios.
"""
import traceback
from fastapi import APIRouter, Depends
from auth import get_current_user
from db import get_conn
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT = "93.366.000-1"

_RUBRO_FILTER = """
    (Rubro1 LIKE 'EQUIPAMIENTO Y SUMINISTROS M%DICOS'
     OR Rubro1 = 'EQUIPAMIENTO PARA LABORATORIOS')
"""


@router.get("/licitaciones-kpis")
async def licitaciones_kpis(
    current_user: dict = Depends(get_current_user),
):
    """
    KPIs generales del mercado total por ano (2024-2025-2026).
    Una fila por (licitacion, item) — colapsa todas las ofertas.
    """
    ck = "mercados_relevantes:lic_kpis_dw"
    if cached := mem_get(ck):
        return cached

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"""
            WITH items AS (
                SELECT
                    YEAR(FechaCierre)  AS ano,
                    Codigo,
                    Codigoitem,
                    MAX(Estado)        AS estado,
                    MAX(MontoEstimado) AS monto_estimado,
                    MAX(CASE WHEN Ofertaseleccionada = 'Seleccionada'
                             THEN MontoLineaAdjudica ELSE 0 END) AS monto_adj_item,
                    MAX(CASE WHEN Ofertaseleccionada = 'Seleccionada'
                             THEN 1 ELSE 0 END) AS item_adj
                FROM DWLBF.dbo.dw_datos_abiertos_licitaciones
                WHERE {_RUBRO_FILTER}
                  AND FechaCierre IS NOT NULL
                  AND YEAR(FechaCierre) BETWEEN 2024 AND 2026
                GROUP BY YEAR(FechaCierre), Codigo, Codigoitem
            ),
            lics AS (
                SELECT ano, Codigo,
                    MAX(estado)         AS estado,
                    MAX(monto_estimado) AS monto_estimado
                FROM items GROUP BY ano, Codigo
            ),
            lic_yr AS (
                SELECT ano,
                    COUNT(*) AS total_lics,
                    SUM(CASE WHEN estado = 'Adjudicada' THEN 1 ELSE 0 END) AS lics_adj,
                    SUM(monto_estimado) AS monto_estimado
                FROM lics GROUP BY ano
            ),
            item_yr AS (
                SELECT ano,
                    COUNT(*)            AS total_items,
                    SUM(item_adj)       AS items_adj,
                    SUM(monto_adj_item) AS monto_adjudicado
                FROM items GROUP BY ano
            )
            SELECT
                l.ano,
                l.total_lics,
                l.lics_adj,
                ROUND(CAST(l.lics_adj AS FLOAT) / NULLIF(l.total_lics,0) * 100, 1) AS tasa_adj_lics,
                i.total_items,
                i.items_adj,
                ROUND(CAST(i.items_adj AS FLOAT) / NULLIF(i.total_items,0) * 100, 1) AS tasa_adj_items,
                l.monto_estimado,
                i.monto_adjudicado,
                ROUND(CAST(i.monto_adjudicado AS FLOAT) / NULLIF(l.monto_estimado,0) * 100, 1) AS pct_adj_vs_estimado
            FROM lic_yr l JOIN item_yr i ON i.ano = l.ano ORDER BY l.ano
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            rows.append({
                "ano":                 int(d["ano"]),
                "total_lics":          int(d["total_lics"] or 0),
                "lics_adj":            int(d["lics_adj"] or 0),
                "tasa_adj_lics":       float(d["tasa_adj_lics"] or 0),
                "total_items":         int(d["total_items"] or 0),
                "items_adj":           int(d["items_adj"] or 0),
                "tasa_adj_items":      float(d["tasa_adj_items"] or 0),
                "monto_estimado":      float(d["monto_estimado"] or 0),
                "monto_adjudicado":    float(d["monto_adjudicado"] or 0),
                "pct_adj_vs_estimado": float(d["pct_adj_vs_estimado"] or 0),
            })

        result = {"anos": rows}
        mem_set(ck, result)
        return result

    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}
    finally:
        if conn:
            conn.close()


def _get_raw_lbf_data() -> list[dict]:
    """
    Carga o retorna desde cache la data LBF por (ano, tipo).
    Una sola query contra DWLBF — ambos endpoints consumen este cache.
    """
    ck = "mercados_relevantes:lic_lbf_dw_raw"
    if cached := mem_get(ck):
        return cached

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT YEAR(FechaCierre) AS ano, ISNULL(Tipo,'(sin tipo)') AS tipo,"
        " COUNT(DISTINCT Codigo) AS total_lics,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
        " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS total_items,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
        " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
        " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado"
        " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
        " WHERE RutProveedor='93.366.000-1' AND FechaCierre IS NOT NULL"
        "   AND YEAR(FechaCierre) IN (2025,2026)"
        " GROUP BY YEAR(FechaCierre), ISNULL(Tipo,'(sin tipo)')"
        " ORDER BY ano, monto_ofertado DESC"
    )
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    mem_set(ck, rows)
    return rows


@router.get("/licitaciones-lbf")
async def licitaciones_lbf(
    current_user: dict = Depends(get_current_user),
):
    """Resumen anual de participacion LBF (2025-2026). Agregado de _get_raw_lbf_data."""
    try:
        raw = _get_raw_lbf_data()
        # Agregar por ano sumando todos los tipos
        from collections import defaultdict
        by_ano: dict = defaultdict(lambda: dict(total_lics=set(), lics_adj=set(),
                                                 total_items=0, items_adj=0,
                                                 monto_ofertado=0.0, monto_adjudicado=0.0))
        # Re-query agrupado por ano (sin tipo) para contar lics correctamente
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT YEAR(FechaCierre) AS ano,"
            " COUNT(DISTINCT Codigo) AS total_lics,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
            " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS total_items,"
            " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
            "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
            " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
            " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado"
            " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
            " WHERE RutProveedor='93.366.000-1' AND FechaCierre IS NOT NULL"
            "   AND YEAR(FechaCierre) IN (2025,2026)"
            " GROUP BY YEAR(FechaCierre) ORDER BY ano"
        )
        cols = [d[0] for d in cur.description]
        conn.close()
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            ti = int(d["total_items"] or 0)
            ia = int(d["items_adj"] or 0)
            mo = float(d["monto_ofertado"] or 0)
            ma = float(d["monto_adjudicado"] or 0)
            rows.append({
                "ano":                 int(d["ano"]),
                "total_lics":          tl,
                "lics_adj":            la,
                "tasa_adj_lics":       round(la / tl * 100, 1) if tl else 0,
                "total_items":         ti,
                "items_adj":           ia,
                "tasa_adj_items":      round(ia / ti * 100, 1) if ti else 0,
                "monto_ofertado":      mo,
                "monto_adjudicado":    ma,
                "pct_ganado_ofertado": round(ma / mo * 100, 1) if mo else 0,
            })
        ck2 = "mercados_relevantes:lic_lbf_resumen"
        mem_set(ck2, {"anos": rows})
        return {"anos": rows}
    except Exception as e:
        return {"anos": [], "error": str(e), "detail": traceback.format_exc()}


@router.get("/licitaciones-lbf-tipo")
async def licitaciones_lbf_tipo(
    current_user: dict = Depends(get_current_user),
):
    """Desglose por tipo de licitacion (2025-2026). Lee del cache compartido."""
    try:
        raw = _get_raw_lbf_data()
        rows = []
        for d in raw:
            tl = int(d["total_lics"] or 0)
            la = int(d["lics_adj"] or 0)
            mo = float(d["monto_ofertado"] or 0)
            ma = float(d["monto_adjudicado"] or 0)
            rows.append({
                "ano":            int(d["ano"]),
                "tipo":           d["tipo"],
                "total_lics":     tl,
                "lics_adj":       la,
                "tasa_adj_lics":  round(la / tl * 100, 1) if tl else 0,
                "monto_ofertado":    mo,
                "monto_adjudicado":  ma,
                "pct_ganado":     round(ma / mo * 100, 1) if mo else 0,
            })
        return {"filas": rows}
    except Exception as e:
        return {"filas": [], "error": str(e), "detail": traceback.format_exc()}
