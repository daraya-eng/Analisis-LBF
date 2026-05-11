"""
Plan de Mes (PM) — Vista mensual por zona/KAM con PPTO vs real.
Muestra KPIs, desglose por categoría, gráfico de barras y tabla de productos.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, filtro_guias, calc_dias_habiles
from cache import mem_get, mem_set

router = APIRouter()

_CATS_VALIDAS = ("SQ", "EVA", "MAH", "EQM")
_CATS_IN = ",".join(f"'{c}'" for c in _CATS_VALIDAS)

_EXCL_DW = (
    "VENDEDOR NOT IN ("
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
    ") AND CODIGO NOT IN ('FLETE','NINV','SIN','')"
)

_CAT_CASE = (
    "CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS' "
    "THEN 'EQM' ELSE LTRIM(RTRIM(CATEGORIA)) END"
)
_CAT_CASE_PPTO = (
    "CASE WHEN LTRIM(RTRIM([CATEGORÍA 2026])) = 'SERVICIOS' "
    "THEN 'EQM' ELSE LTRIM(RTRIM([CATEGORÍA 2026])) END"
)


def _zona_sql(zona: str) -> str:
    """Genera fragmento WHERE para filtrar por zona en BI_TOTAL_FACTURA."""
    if not zona:
        return "1=1"
    return f"VENDEDOR LIKE '%-{zona.strip()}' OR VENDEDOR = '{zona.strip()}'"


def _zona_ppto_sql(zona: str) -> str:
    """Genera fragmento WHERE para filtrar zona en [PPTO 2026]."""
    if not zona:
        return "1=1"
    return (
        f"VENDEDOR_ACTUAL LIKE '%-{zona.strip()}' "
        f"OR VENDEDOR_ACTUAL = '{zona.strip()}'"
    )


def _cat_sql(categorias: str, alias: str = "") -> str:
    """Genera fragmento AND para filtrar categorías (BI_TOTAL_FACTURA)."""
    if not categorias:
        return "1=1"
    cats = [c.strip() for c in categorias.split(",") if c.strip()]
    if not cats:
        return "1=1"
    pref = f"{alias}." if alias else ""
    lista = ",".join(f"'{c}'" for c in cats)
    return f"({_CAT_CASE}) IN ({lista})"


def _subclase_sql(subclase: str, alias: str = "") -> str:
    """Genera fragmento AND para filtrar por FAMILIA (subclase)."""
    if not subclase:
        return "1=1"
    pref = f"{alias}." if alias else ""
    sub = subclase.replace("'", "''")
    return f"{pref}FAMILIA = '{sub}'"


def _codigo_sql(codigo: str, alias: str = "") -> str:
    if not codigo:
        return "1=1"
    pref = f"{alias}." if alias else ""
    cod = codigo.replace("'", "''")
    return f"{pref}CODIGO = '{cod}'"


@router.get("/resumen")
async def get_pm_resumen(
    zona: str = Query(""),
    categorias: str = Query(""),
    subclase: str = Query(""),
    codigo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    ck = f"pm:resumen:{zona}:{categorias}:{subclase}:{codigo}"
    cached = mem_get(ck)
    if cached:
        return cached

    h = hoy()
    _ANO = h["ano"]
    _MES = h["mes"]
    _FG = filtro_guias()
    hab_trans, hab_rest, hab_total = calc_dias_habiles([_MES], _ANO)
    pct_dias = round(hab_trans / hab_total * 100, 2) if hab_total > 0 else 0

    # Filtros SQL
    z_fact = _zona_sql(zona)
    z_ppto = _zona_ppto_sql(zona)
    c_sql  = _cat_sql(categorias)
    s_sql  = _subclase_sql(subclase)
    k_sql  = _codigo_sql(codigo)

    # Meses para trimestre (Q actual)
    _TRIM_MES = list(range((_MES - 1) // 3 * 3 + 1, (_MES - 1) // 3 * 3 + 4))
    trim_in = ",".join(str(m) for m in _TRIM_MES)

    conn = get_conn()
    cur = conn.cursor()

    # ═══ 1. Venta real mes + trimestre + YTD (filtrada) ═══
    cur.execute(f"""
        SELECT
            SUM(CASE WHEN MES = {_MES} THEN CAST(VENTA AS float) ELSE 0 END) AS v_mes,
            SUM(CASE WHEN MES = {_MES} THEN CAST(CONTRIBUCION AS float) ELSE 0 END) AS c_mes,
            SUM(CASE WHEN MES IN ({trim_in}) THEN CAST(VENTA AS float) ELSE 0 END) AS v_trim,
            SUM(CASE WHEN MES IN ({trim_in}) THEN CAST(CONTRIBUCION AS float) ELSE 0 END) AS c_trim,
            SUM(CAST(VENTA AS float)) AS v_ytd,
            SUM(CAST(CONTRIBUCION AS float)) AS c_ytd
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({c_sql})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
    """)
    r = cur.fetchone()
    v_mes, c_mes = float(r[0] or 0), float(r[1] or 0)
    v_trim, c_trim = float(r[2] or 0), float(r[3] or 0)
    v_ytd, c_ytd = float(r[4] or 0), float(r[5] or 0)

    mg_mes  = round(c_mes / v_mes * 100, 1)   if v_mes  > 0 else 0.0
    mg_trim = round(c_trim / v_trim * 100, 1) if v_trim > 0 else 0.0
    mg_ytd  = round(c_ytd / v_ytd * 100, 1)  if v_ytd  > 0 else 0.0

    # ═══ 2. PPTO mes + trimestre + anual desde Metas_KAM ═══
    cur.execute(f"""
        SELECT
            COALESCE(SUM(CASE WHEN ANIOMES = {_ANO * 100 + _MES}
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_mes,
            COALESCE(SUM(CASE WHEN RIGHT(CAST(ANIOMES AS varchar), 2) IN ({','.join(f"'{str(m).zfill(2)}'" for m in _TRIM_MES)})
                              AND LEFT(CAST(ANIOMES AS varchar), 4) = '{_ANO}'
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_trim,
            COALESCE(SUM(CASE WHEN LEFT(CAST(ANIOMES AS varchar), 4) = '{_ANO}'
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_anual
        FROM Metas_KAM
        WHERE ({z_ppto.replace('VENDEDOR_ACTUAL','Zona').replace('VENDEDOR','Zona')})
    """)
    r2 = cur.fetchone()
    meta_mes   = float(r2[0] or 0)
    meta_trim  = float(r2[1] or 0)
    meta_anual = float(r2[2] or 0)

    # Margen PPTO — desde tabla [PPTO 2026] (precio * cant / sum)
    cur.execute(f"""
        SELECT
            SUM(TRY_CAST([PPTO 2026] AS float)) AS ppto_total,
            SUM(TRY_CAST([CANT 2026] AS float) * TRY_CAST([PRECIO 2026] AS float)) AS ingreso_bruto
        FROM [PPTO 2026]
        WHERE ({z_ppto})
          AND ({_CAT_CASE_PPTO}) IN ({_CATS_IN})
    """)
    r3 = cur.fetchone()
    ppto_tot = float(r3[0] or 0)

    # Usar margen PPTO de ppto_analisis si está disponible, sino default 31%
    ppto_mg_mes_pct  = 31.0
    ppto_mg_trim_pct = 31.0
    ppto_mg_ytd_pct  = 31.0

    # ═══ 3. Venta año anterior mismo mes/trimestre/YTD ═══
    cur.execute(f"""
        SELECT
            SUM(CASE WHEN MES = {_MES} THEN CAST(VENTA AS float) ELSE 0 END) AS v_mes_25,
            SUM(CASE WHEN MES IN ({trim_in}) THEN CAST(VENTA AS float) ELSE 0 END) AS v_trim_25,
            SUM(CAST(VENTA AS float)) AS v_ytd_25
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({s_sql})
          AND ({k_sql})
    """)
    r4 = cur.fetchone()
    v_mes_25  = float(r4[0] or 0)
    v_trim_25 = float(r4[1] or 0)
    v_ytd_25  = float(r4[2] or 0)

    # ═══ 4. Desglose por categoría — mes actual ═══
    cur.execute(f"""
        SELECT ({_CAT_CASE}) AS cat,
               SUM(CAST(VENTA AS float)) AS v26,
               SUM(CAST(CONTRIBUCION AS float)) AS c26
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
        GROUP BY ({_CAT_CASE})
    """)
    cat_v26 = {}
    for row in cur.fetchall():
        cat_v26[row[0]] = {"v26": float(row[1] or 0), "c26": float(row[2] or 0)}

    # Venta año anterior por categoría
    cur.execute(f"""
        SELECT ({_CAT_CASE}) AS cat,
               SUM(CAST(VENTA AS float)) AS v25
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES = {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({s_sql})
          AND ({k_sql})
        GROUP BY ({_CAT_CASE})
    """)
    cat_v25 = {row[0]: float(row[1] or 0) for row in cur.fetchall()}

    # PPTO mes por categoría (desde Metas_KAM — prorratear por participación en PPTO total)
    cur.execute(f"""
        SELECT ({_CAT_CASE_PPTO}) AS cat,
               SUM(TRY_CAST([PPTO 2026] AS float)) AS ppto_cat
        FROM [PPTO 2026]
        WHERE ({z_ppto})
          AND ({_CAT_CASE_PPTO}) IN ({_CATS_IN})
        GROUP BY ({_CAT_CASE_PPTO})
    """)
    cat_ppto_anual = {row[0]: float(row[1] or 0) for row in cur.fetchall()}
    ppto_anual_total = sum(cat_ppto_anual.values()) or 1

    # meta_mes para cada categoría = prorrateo por peso en PPTO anual
    cat_ppto_mes = {
        cat: (v / ppto_anual_total) * meta_mes
        for cat, v in cat_ppto_anual.items()
    }

    categorias_data = []
    for cat in _CATS_VALIDAS:
        v26 = cat_v26.get(cat, {}).get("v26", 0)
        c26 = cat_v26.get(cat, {}).get("c26", 0)
        v25 = cat_v25.get(cat, 0)
        ppto_c = cat_ppto_mes.get(cat, 0)
        ppto_a = cat_ppto_anual.get(cat, 0)
        cump_ppto = round(v26 / ppto_c * 100, 1) if ppto_c > 0 else 0.0
        var_ant   = round((v26 / v25 - 1) * 100, 1) if v25 > 0 else (100.0 if v26 > 0 else 0.0)
        mg_cat    = round(c26 / v26 * 100, 1) if v26 > 0 else 0.0
        categorias_data.append({
            "categoria":   cat,
            "venta_mes":   round(v26),
            "venta_ant":   round(v25),
            "ppto_mes":    round(ppto_c),
            "ppto_anual":  round(ppto_a),
            "cump_ppto":   cump_ppto,
            "var_ant":     var_ant,
            "pct_dias":    pct_dias,
            "contrib":     round(c26),
            "margen":      mg_cat,
        })

    # ═══ 5. Tabla de productos — mes actual ═══
    cur.execute(f"""
        SELECT LTRIM(RTRIM(CODIGO)) AS codigo,
               MAX(DESCRIPCION) AS descripcion,
               MAX(FAMILIA) AS familia,
               SUM(CAST(VENTA AS float)) AS v_mes,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_mes
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({c_sql})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
        GROUP BY LTRIM(RTRIM(CODIGO))
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    prods_mes = {
        str(r[0]).strip(): {
            "descripcion": str(r[1] or "").strip(),
            "familia":     str(r[2] or "").strip(),
            "v_mes":       float(r[3] or 0),
            "c_mes":       float(r[4] or 0),
        }
        for r in cur.fetchall()
    }

    # Promedio 6 meses anteriores
    _mes6_list = []
    for i in range(1, 7):
        m = _MES - i
        y = _ANO
        if m <= 0:
            m += 12
            y -= 1
        _mes6_list.append((y, m))

    m6_conditions = " OR ".join(f"(ANO={y} AND MES={m})" for y, m in _mes6_list)
    cur.execute(f"""
        SELECT LTRIM(RTRIM(CODIGO)) AS codigo,
               SUM(CAST(VENTA AS float)) AS v_6m
        FROM BI_TOTAL_FACTURA
        WHERE ({m6_conditions}) AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({c_sql})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
        GROUP BY LTRIM(RTRIM(CODIGO))
    """)
    prods_6m = {str(r[0]).strip(): float(r[1] or 0) / 6 for r in cur.fetchall()}

    # PPTO anual por código → prorratear a mes por peso en PPTO total
    cur.execute(f"""
        SELECT LTRIM(RTRIM(CODIGO)) AS codigo,
               SUM(TRY_CAST([PPTO 2026] AS float)) AS ppto_cod
        FROM [PPTO 2026]
        WHERE ({z_ppto})
          AND ({_CAT_CASE_PPTO}) IN ({_CATS_IN})
          AND LTRIM(RTRIM(CODIGO)) IN ({','.join(f"'{c}'" for c in prods_mes.keys()) if prods_mes else "'__none__'"})
        GROUP BY LTRIM(RTRIM(CODIGO))
    """)
    ppto_cod_anual = {str(r[0]).strip(): float(r[1] or 0) for r in cur.fetchall()}
    # Distribuir PPTO anual proporcional al mes (1/12)
    ppto_cod_mes = {cod: v / 12 for cod, v in ppto_cod_anual.items()}

    # Stock por código desde vw_stock_actual
    codigos_list = list(prods_mes.keys())
    stock_por_cod = {}
    if codigos_list:
        placeholders = ",".join(f"'{c}'" for c in codigos_list[:200])
        cur.execute(f"""
            SELECT codigo_producto, SUM(stock_unidades) AS stock
            FROM vw_stock_actual
            WHERE codigo_producto IN ({placeholders})
            GROUP BY codigo_producto
        """)
        stock_por_cod = {str(r[0]).strip(): int(r[1] or 0) for r in cur.fetchall()}

    conn.close()

    # Armar lista de productos
    productos = []
    for cod, pd_data in prods_mes.items():
        v_mes_p  = pd_data["v_mes"]
        v_prom6  = prods_6m.get(cod, 0)
        q_stock  = stock_por_cod.get(cod, 0)
        ppto_m   = ppto_cod_mes.get(cod, 0)
        mg_prod  = round(pd_data["c_mes"] / v_mes_p * 100, 1) if v_mes_p > 0 else 0.0
        productos.append({
            "codigo":       cod,
            "descripcion":  pd_data["descripcion"],
            "familia":      pd_data["familia"],
            "venta_mes":    round(v_mes_p),
            "vta_prom_6m":  round(v_prom6),
            "q_stock":      q_stock,
            "ppto_mes":     round(ppto_m),
            "margen":       mg_prod,
        })
    productos.sort(key=lambda p: -p["venta_mes"])

    result = {
        "kpis": {
            "venta_mes":       round(v_mes),
            "ppto_mes":        round(meta_mes),
            "mg_mes":          mg_mes,
            "ppto_mg_mes":     ppto_mg_mes_pct,
            "venta_trim":      round(v_trim),
            "ppto_trim":       round(meta_trim),
            "mg_trim":         mg_trim,
            "ppto_mg_trim":    ppto_mg_trim_pct,
            "venta_ytd":       round(v_ytd),
            "ppto_ytd":        round(meta_anual),
            "mg_ytd":          mg_ytd,
            "ppto_mg_ytd":     ppto_mg_ytd_pct,
            "venta_mes_25":    round(v_mes_25),
            "venta_trim_25":   round(v_trim_25),
            "venta_ytd_25":    round(v_ytd_25),
            "dias_trans":      hab_trans,
            "dias_rest":       hab_rest,
            "dias_total":      hab_total,
            "pct_dias":        pct_dias,
            "mes":             _MES,
            "ano":             _ANO,
        },
        "categorias":  categorias_data,
        "productos":   productos[:100],
        "zona":        zona,
    }
    mem_set(ck, result)
    return result


@router.get("/filtros")
async def get_pm_filtros(current_user: dict = Depends(get_current_user)):
    """Devuelve listas para los dropdowns: zonas, familias, categorías."""
    cached = mem_get("pm:filtros")
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT LTRIM(RTRIM(Zona)) AS zona
        FROM Metas_KAM
        WHERE ANIOMES LIKE '2026%'
          AND Zona NOT LIKE '%TELEV%'
          AND Zona NOT LIKE '8%' AND Zona NOT LIKE '9%'
        ORDER BY zona
    """)
    zonas = [r[0] for r in cur.fetchall() if r[0]]

    cur.execute(f"""
        SELECT DISTINCT LTRIM(RTRIM(FAMILIA)) AS familia
        FROM BI_TOTAL_FACTURA
        WHERE FAMILIA IS NOT NULL AND FAMILIA <> ''
          AND ({_CAT_CASE}) IN ({_CATS_IN})
        ORDER BY FAMILIA
    """)
    familias = [r[0] for r in cur.fetchall() if r[0]]

    conn.close()
    result = {
        "zonas":      zonas,
        "familias":   familias,
        "categorias": list(_CATS_VALIDAS),
    }
    mem_set("pm:filtros", result)
    return result
