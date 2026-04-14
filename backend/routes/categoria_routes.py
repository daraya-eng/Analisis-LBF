"""
Category analysis routes — extracted from ppto_analisis_app.py _load_categoria().
"""
import pandas as pd
from fastapi import APIRouter, Depends
from auth import get_current_user
from db import get_conn, hoy, DW_FILTRO
from cache import mem_get, mem_set

router = APIRouter()

_SQL_CAT_PPTO = """CASE WHEN [CATEGORÍA 2026] = 'Servicios' THEN 'EQM'
                        ELSE [CATEGORÍA 2026] END"""
_SQL_CAT_BI = """CASE WHEN CATEGORIA = 'Servicios' THEN 'EQM'
                      ELSE COALESCE(NULLIF(CATEGORIA,''), '(sin cat)') END"""


def _load_categoria() -> list:
    """PPTO vs Venta by category.
    2026: usa CATEGORÍA 2026 del PPTO + venta real por categoría.
    2025: venta total por cliente+período SIN filtrar por categoría
          (la categorización cambió entre años).
    """
    try:
        h = hoy()
        ANO_ACT, MES_ACT = h["ano"], h["mes"]
        conn = get_conn()

        # PPTO + venta 2026 por categoría
        sql_cat = f"""
        WITH ppto AS (
            SELECT {_SQL_CAT_PPTO} AS categoria,
                   SUM([PPTO 2026]) AS ppto_total
            FROM [PPTO 2026]
            GROUP BY {_SQL_CAT_PPTO}
        ),
        venta26 AS (
            SELECT {_SQL_CAT_BI} AS categoria,
                   SUM(CAST(VENTA AS float)) AS venta_2026_ytd
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {ANO_ACT} AND MES <= {MES_ACT}
              AND {DW_FILTRO}
            GROUP BY {_SQL_CAT_BI}
        )
        SELECT COALESCE(p.categoria, v.categoria) AS categoria,
               COALESCE(p.ppto_total, 0) AS ppto_total,
               COALESCE(v.venta_2026_ytd, 0) AS venta_2026_ytd
        FROM ppto p
        FULL OUTER JOIN venta26 v ON p.categoria = v.categoria
        ORDER BY ppto_total DESC
        """
        df = pd.read_sql(sql_cat, conn)

        # Venta 2025 total (sin categoría)
        sql_25 = f"""
        SELECT SUM(CAST(VENTA AS float)) AS venta_2025_ytd
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {ANO_ACT - 1} AND MES <= {MES_ACT}
          AND {DW_FILTRO}
        """
        df_25 = pd.read_sql(sql_25, conn)
        venta_2025_total = float(df_25.iloc[0]["venta_2025_ytd"] or 0) if len(df_25) > 0 else 0
        conn.close()

        df["cumpl_pct"] = (
            (df["venta_2026_ytd"] / df["ppto_total"].replace(0, float("nan"))) * 100
        ).fillna(0).round(1)
        df["gap"] = df["venta_2026_ytd"] - df["ppto_total"]
        # Crecimiento solo a nivel total, no por categoría
        df["venta_2025_ytd"] = 0  # placeholder per row
        df["crec_pct"] = 0.0

        # Agregar venta_2025 total solo en el contexto general
        records = df.to_dict("records")
        # Agregar fila con el total 2025 para referencia
        venta_2026_total = float(df["venta_2026_ytd"].sum())
        crec_total = round(((venta_2026_total / venta_2025_total) - 1) * 100, 1) if venta_2025_total > 0 else 0
        for rec in records:
            rec["venta_2025_total"] = round(venta_2025_total)
            rec["crec_total"] = crec_total

        return records
    except Exception as e:
        return []


@router.get("/")
async def get_categorias(current_user: dict = Depends(get_current_user)):
    cached = mem_get("categoria:all")
    if cached:
        return cached
    result = {"data": _load_categoria()}
    mem_set("categoria:all", result)
    return result
