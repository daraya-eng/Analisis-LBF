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
    """PPTO vs Venta by category."""
    try:
        h = hoy()
        ANO_ACT, MES_ACT = h["ano"], h["mes"]
        conn = get_conn()
        sql = f"""
        WITH ppto AS (
            SELECT {_SQL_CAT_PPTO} AS categoria,
                   SUM([PPTO 2026]) AS ppto_total
            FROM [PPTO 2026]
            GROUP BY {_SQL_CAT_PPTO}
        ),
        venta AS (
            SELECT {_SQL_CAT_BI} AS categoria,
                   SUM(CASE WHEN ANO={ANO_ACT} THEN VENTA ELSE 0 END) AS venta_2026_ytd,
                   SUM(CASE WHEN ANO={ANO_ACT - 1} AND MES <= {MES_ACT}
                       THEN VENTA ELSE 0 END) AS venta_2025_ytd
            FROM BI_TOTAL_FACTURA
            WHERE ANO IN ({ANO_ACT}, {ANO_ACT - 1})
              AND {DW_FILTRO}
            GROUP BY {_SQL_CAT_BI}
        )
        SELECT COALESCE(p.categoria, v.categoria) AS categoria,
               COALESCE(p.ppto_total, 0) AS ppto_total,
               COALESCE(v.venta_2026_ytd, 0) AS venta_2026_ytd,
               COALESCE(v.venta_2025_ytd, 0) AS venta_2025_ytd
        FROM ppto p
        FULL OUTER JOIN venta v ON p.categoria = v.categoria
        ORDER BY ppto_total DESC
        """
        df = pd.read_sql(sql, conn)
        conn.close()

        df["cumpl_pct"] = (
            (df["venta_2026_ytd"] / df["ppto_total"].replace(0, float("nan"))) * 100
        ).fillna(0).round(1)
        df["gap"] = df["venta_2026_ytd"] - df["ppto_total"]
        df["crec_pct"] = (
            ((df["venta_2026_ytd"] / df["venta_2025_ytd"].replace(0, float("nan"))) - 1) * 100
        ).fillna(0).round(1)

        return df.to_dict("records")
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
