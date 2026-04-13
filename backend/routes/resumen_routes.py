"""
Resumen PPTO vs Venta — replicates the Power BI budget overview dashboard.
Uses VW_RESUMEN_KPIS_DASHBOARD for top KPIs and PPTO_VS_VENTA for detail tables.
Extracted from ppto_analisis_app.py pvv_update_main().
"""
import pandas as pd
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE

router = APIRouter()

_TIPO_TRAZ   = "PRESUPUESTO_TRAZABLE"
_TIPO_INCR   = "INCREMENTALES_SIN_PRODUCTOS_NUEVOS"
_TIPO_NUEVOS = "INCREMENTALES_CON_PRODUCTOS_NUEVOS"
_TIPO_SIN_CLI = "PRESUPUESTO_SIN_CLIENTE"


def _load_kpis_dashboard() -> dict:
    """Load KPIs from VW_RESUMEN_KPIS_DASHBOARD (pre-calculated, same as Power BI)."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM VW_RESUMEN_KPIS_DASHBOARD")
        cols = [d[0].strip() for d in cur.description]
        row = cur.fetchone()
        conn.close()

        if not row:
            return {}

        kd = dict(zip(cols, row))
        return {
            "ppto_total":       float(kd.get("PPTO_TOTAL_2026", 0) or 0),
            "ppto_trazable":    float(kd.get("PPTO_TRAZABLE_2026", 0) or 0),
            "ppto_sin_cliente": float(kd.get("PPTO_SIN_CLIENTE_2026", 0) or 0),
            "ppto_incr_sin_pn": float(kd.get("PPTO_INCREMENTAL_SIN_PN_2026", 0) or 0),
            "ppto_incr_con_pn": float(kd.get("PPTO_INCREMENTAL_CON_PN_2026", 0) or 0),
            "venta_ytd":        float(kd.get("VENTA_YTD_2026", 0) or 0),
            "venta_ytd_25":     float(kd.get("VENTA_YTD_2025", 0) or 0),
            "meta_ytd":         float(kd.get("META_YTD_2026", 0) or 0),
            "alcance_ytd":      float(kd.get("ALCANCE_YTD", 0) or 0),
            "cumpl_ppto":       float(kd.get("CUMPLIMIENTO_PPTO_TOTAL", 0) or 0),
            "cumpl_trazable":   float(kd.get("CUMPLIMIENTO_TRAZABLE", 0) or 0),
            "gap_meta":         float(kd.get("GAP_META_YTD", 0) or 0),
            "gap_ppto":         float(kd.get("GAP_PPTO_TOTAL", 0) or 0),
            "var_abs_25":       float(kd.get("VAR_ABS_VS_2025", 0) or 0),
            "mes_nombre":       MESES_NOMBRE.get(hoy()["mes"], ""),
        }
    except Exception as e:
        return {"error": str(e)}


def _load_ppto_vs_venta_df() -> pd.DataFrame:
    """Load full PPTO_VS_VENTA table."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM PPTO_VS_VENTA")
        rows = cur.fetchall()
        cols = [d[0].strip() for d in cur.description]
        conn.close()

        df = pd.DataFrame.from_records(rows, columns=cols)

        # Normalize numeric columns
        for c in cols:
            if any(k in c.upper() for k in ["PPTO", "VENTA", "CANT", "PRECIO", "MONTO"]):
                df[c] = pd.to_numeric(
                    df[c].astype(str).str.replace(",", ".", regex=False) if df[c].dtype == object else df[c],
                    errors="coerce"
                ).fillna(0)

        # Clean text columns
        for c in ["VENDEDOR_ACTUAL", "CATEGORIA_2026", "TIPO_ANALISIS", "ESTADO_ANALISIS"]:
            if c in df.columns:
                df[c] = df[c].astype(str).str.strip()

        return df
    except Exception as e:
        print(f"[ERROR _load_ppto_vs_venta] {e}")
        return pd.DataFrame()


def _build_categoria_table(df: pd.DataFrame) -> list:
    """Build category breakdown table matching Power BI 'Detalle de Presupuesto 2026'."""
    valid_cats = ["EQM", "EVA", "MAH", "SQ"]
    df_f = df[df["CATEGORIA_2026"].isin(valid_cats)].copy()

    rows = []
    for cat_name, gdf in df_f.groupby("CATEGORIA_2026"):
        traz     = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_TRAZ,    "PPTO_2026"].sum())
        prod_new = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_NUEVOS,  "PPTO_2026"].sum())
        incr     = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_INCR,    "PPTO_2026"].sum())
        sin_cli  = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_SIN_CLI, "PPTO_2026"].sum())
        ppto_t   = float(gdf["PPTO_2026"].sum())
        rows.append({
            "categoria":    str(cat_name),
            "ppto_2026":    ppto_t,
            "ppto_trazable": traz,
            "ppto_prod_nuevo": prod_new,
            "ppto_incremental": incr,
            "ppto_sin_cliente": sin_cli,
        })
    rows.sort(key=lambda r: -r["ppto_2026"])

    # Total row
    total = {
        "categoria":    "Total",
        "ppto_2026":    sum(r["ppto_2026"] for r in rows),
        "ppto_trazable": sum(r["ppto_trazable"] for r in rows),
        "ppto_prod_nuevo": sum(r["ppto_prod_nuevo"] for r in rows),
        "ppto_incremental": sum(r["ppto_incremental"] for r in rows),
        "ppto_sin_cliente": sum(r["ppto_sin_cliente"] for r in rows),
    }
    rows.append(total)
    return rows


def _build_zona_table(df: pd.DataFrame) -> list:
    """Build zone breakdown table matching Power BI 'Presupuesto 2026 por Zonas'."""
    valid_cats = ["EQM", "EVA", "MAH", "SQ"]
    df_f = df[df["CATEGORIA_2026"].isin(valid_cats)].copy()

    rows = []
    for zona_name, gdf in df_f.groupby("VENDEDOR_ACTUAL"):
        if not zona_name or zona_name == "nan":
            continue
        traz     = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_TRAZ,    "PPTO_2026"].sum())
        incr_pn  = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_NUEVOS,  "PPTO_2026"].sum())
        incr_spn = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_INCR,    "PPTO_2026"].sum())
        sin_cli  = float(gdf.loc[gdf["TIPO_ANALISIS"] == _TIPO_SIN_CLI, "PPTO_2026"].sum())
        ppto_t   = float(gdf["PPTO_2026"].sum())
        rows.append({
            "zona":             str(zona_name),
            "ppto_2026":        ppto_t,
            "ppto_trazable":    traz,
            "ppto_incr_con_pn": incr_pn,
            "ppto_incr_sin_pn": incr_spn,
            "ppto_sin_cliente": sin_cli,
        })
    rows.sort(key=lambda r: -r["ppto_incr_con_pn"])
    return rows


@router.get("/kpis")
async def get_resumen_kpis(current_user: dict = Depends(get_current_user)):
    return _load_kpis_dashboard()


@router.get("/all")
async def get_resumen_all(current_user: dict = Depends(get_current_user)):
    """Single endpoint that loads PPTO_VS_VENTA once and returns both tables + KPIs."""
    kpis = _load_kpis_dashboard()
    df = _load_ppto_vs_venta_df()
    cat_data = _build_categoria_table(df) if not df.empty else []
    zona_data = _build_zona_table(df) if not df.empty else []
    return {
        "kpis": kpis,
        "categoria": cat_data,
        "zona": zona_data,
    }


@router.get("/categoria")
async def get_resumen_categoria(current_user: dict = Depends(get_current_user)):
    df = _load_ppto_vs_venta_df()
    if df.empty:
        return {"data": []}
    return {"data": _build_categoria_table(df)}


@router.get("/zona")
async def get_resumen_zona(current_user: dict = Depends(get_current_user)):
    df = _load_ppto_vs_venta_df()
    if df.empty:
        return {"data": []}
    return {"data": _build_zona_table(df)}
