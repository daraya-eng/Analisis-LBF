"""
Plan de Mes (PM) — Vista mensual por zona/KAM con PPTO vs real.
Muestra KPIs, desglose por categoría, gráfico de barras y tabla de productos.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, filtro_guias_mat, calc_dias_habiles
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
    """Genera fragmento WHERE para filtrar por zona en BI_TOTAL_FACTURA.
    El frontend envía el valor raw completo (ej: '08-MAULE-SUR'), usar igualdad directa."""
    if not zona:
        return "1=1"
    z = zona.strip().replace("'", "''")
    return f"VENDEDOR = '{z}'"


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


def _load_pm(zona: str = "", categorias: str = "", subclase: str = "", codigo: str = "") -> dict:
    ck = f"pm:resumen:{zona}:{categorias}:{subclase}:{codigo}"
    cached = mem_get(ck)
    if cached:
        return cached

    h = hoy()
    _ANO = h["ano"]
    _MES = h["mes"]
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
    _FG = filtro_guias_mat(cur)  # materialize GF list once to avoid correlated subquery plans

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

    # ═══ 2. PPTO mes + trimestre + YTD + anual desde Metas_KAM ═══
    _ytd_months_str = ",".join(f"'{str(m).zfill(2)}'" for m in range(1, _MES + 1))
    cur.execute(f"""
        SELECT
            COALESCE(SUM(CASE WHEN ANIOMES = {_ANO * 100 + _MES}
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_mes,
            COALESCE(SUM(CASE WHEN RIGHT(CAST(ANIOMES AS varchar), 2) IN ({','.join(f"'{str(m).zfill(2)}'" for m in _TRIM_MES)})
                              AND LEFT(CAST(ANIOMES AS varchar), 4) = '{_ANO}'
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_trim,
            COALESCE(SUM(CASE WHEN RIGHT(CAST(ANIOMES AS varchar), 2) IN ({_ytd_months_str})
                              AND LEFT(CAST(ANIOMES AS varchar), 4) = '{_ANO}'
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_ytd,
            COALESCE(SUM(CASE WHEN LEFT(CAST(ANIOMES AS varchar), 4) = '{_ANO}'
                              THEN TRY_CAST([ META ] AS float) END), 0) AS meta_anual
        FROM Metas_KAM
        WHERE ({z_ppto.replace('VENDEDOR_ACTUAL','Zona').replace('VENDEDOR','Zona')})
    """)
    r2 = cur.fetchone()
    meta_mes   = float(r2[0] or 0)
    meta_trim  = float(r2[1] or 0)
    meta_ytd   = float(r2[2] or 0)
    meta_anual = float(r2[3] or 0)

    # ═══ 2b. Margen PPTO desde Meta_Categoria (fuente canónica del Panel Principal) ═══
    # Siempre carga TODAS las categorías para que la tabla por categoría tenga datos completos.
    # El filtro de categoría del usuario sólo se aplica al promedio ponderado de los gauges KPI.
    _ytd_meses = list(range(1, _MES + 1))
    _cats_selected = (
        {c.strip() for c in categorias.split(",") if c.strip()}
        if categorias else set(_CATS_VALIDAS)
    )

    cur.execute(f"""
        SELECT
            CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END AS cat,
            MES,
            SUM(META_VENTA) AS meta_venta,
            SUM(MARGEN_PCT * META_VENTA) / NULLIF(SUM(META_VENTA), 0) AS margen_pct
        FROM Meta_Categoria
        WHERE CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END IN ({_CATS_IN})
        GROUP BY CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END, MES
    """)
    _meta_cat_mg: dict = {}  # cat -> {mes -> {meta_venta, margen_pct}}
    for row in cur.fetchall():
        _cat_r, _mes_r = str(row[0]), int(row[1])
        _mv, _mp = float(row[2] or 0), float(row[3] or 0)
        if _cat_r not in _meta_cat_mg:
            _meta_cat_mg[_cat_r] = {}
        _meta_cat_mg[_cat_r][_mes_r] = {"meta_venta": _mv, "margen_pct": _mp}

    def _wgt_mg(meses_list: list) -> float:
        # Promedia sólo las categorías seleccionadas por el usuario
        total_mv = sum(_meta_cat_mg.get(c, {}).get(m, {}).get("meta_venta", 0)
                       for c in _cats_selected for m in meses_list)
        total_wt = sum(_meta_cat_mg.get(c, {}).get(m, {}).get("margen_pct", 0) *
                       _meta_cat_mg.get(c, {}).get(m, {}).get("meta_venta", 0)
                       for c in _cats_selected for m in meses_list)
        raw = (total_wt / total_mv) if total_mv > 0 else 0.31
        # MARGEN_PCT en Meta_Categoria está en escala 0-1; convertir a %
        return round(raw * 100, 1) if raw <= 1.0 else round(raw, 1)

    ppto_mg_mes_pct  = _wgt_mg([_MES])
    ppto_mg_trim_pct = _wgt_mg(_TRIM_MES)
    ppto_mg_ytd_pct  = _wgt_mg(_ytd_meses)

    # ═══ 3. Venta año anterior mismo mes/trimestre/YTD ═══
    # Nota: categorías 2025 pueden tener nombres distintos (GD→EQM, SH→EVA en 2026)
    # Para comparar YoY correctamente, aplicamos el mismo filtro de categoría que en 2026
    cur.execute(f"""
        SELECT
            SUM(CASE WHEN MES = {_MES} THEN CAST(VENTA AS float) ELSE 0 END) AS v_mes_25,
            SUM(CASE WHEN MES IN ({trim_in}) THEN CAST(VENTA AS float) ELSE 0 END) AS v_trim_25,
            SUM(CAST(VENTA AS float)) AS v_ytd_25
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({c_sql})
          AND ({s_sql})
          AND ({k_sql})
    """)
    r4 = cur.fetchone()
    v_mes_25  = float(r4[0] or 0)
    v_trim_25 = float(r4[1] or 0)
    v_ytd_25  = float(r4[2] or 0)

    # ═══ 4. Desglose por categoría — mes actual + YTD ═══
    cur.execute(f"""
        SELECT ({_CAT_CASE}) AS cat,
               SUM(CASE WHEN MES = {_MES} THEN CAST(VENTA AS float) ELSE 0 END) AS v26,
               SUM(CASE WHEN MES = {_MES} THEN CAST(CONTRIBUCION AS float) ELSE 0 END) AS c26,
               SUM(CAST(VENTA AS float)) AS v26_ytd
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES <= {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
        GROUP BY ({_CAT_CASE})
    """)
    cat_v26 = {}
    for row in cur.fetchall():
        cat_v26[row[0]] = {
            "v26":     float(row[1] or 0),
            "c26":     float(row[2] or 0),
            "v26_ytd": float(row[3] or 0),
        }

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

    # ═══ 4b. Top 5 FAMILIA (clase) por categoría — mes actual ═══
    cur.execute(f"""
        SELECT ({_CAT_CASE}) AS cat,
               LTRIM(RTRIM(FAMILIA)) AS familia,
               SUM(CAST(VENTA AS float)) AS v26
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact})
          AND ({s_sql})
          AND ({k_sql})
          AND ({_CAT_CASE}) IN ({_CATS_IN})
          AND FAMILIA IS NOT NULL AND FAMILIA <> ''
        GROUP BY ({_CAT_CASE}), LTRIM(RTRIM(FAMILIA))
        ORDER BY ({_CAT_CASE}), SUM(CAST(VENTA AS float)) DESC
    """)
    top5_by_cat: dict = {}
    for row in cur.fetchall():
        cat_r = str(row[0])
        if cat_r not in top5_by_cat:
            top5_by_cat[cat_r] = []
        if len(top5_by_cat[cat_r]) < 5:
            top5_by_cat[cat_r].append({
                "familia": str(row[1] or "").strip(),
                "venta":   round(float(row[2] or 0)),
            })

    # PPTO mes por categoría — usa Meta_Categoria directamente (misma fuente que el dashboard)
    # Así el cumplimiento por categoría coincide con el Panel Principal.
    # cat_ppto_anual desde [PPTO 2026] se conserva solo para el desglose de productos.
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

    # Si hay filtro de categoría, los KPIs globales usan Meta_Categoria (= misma fuente que dashboard)
    if categorias and _cats_selected < set(_CATS_VALIDAS):
        meta_mes   = sum(_meta_cat_mg.get(c, {}).get(_MES, {}).get("meta_venta", 0) for c in _cats_selected)
        meta_trim  = sum(_meta_cat_mg.get(c, {}).get(m, {}).get("meta_venta", 0) for c in _cats_selected for m in _TRIM_MES)
        meta_ytd   = sum(_meta_cat_mg.get(c, {}).get(m, {}).get("meta_venta", 0) for c in _cats_selected for m in range(1, _MES + 1))
        meta_anual = sum(_meta_cat_mg.get(c, {}).get(m, {}).get("meta_venta", 0) for c in _cats_selected for m in range(1, 13))

    categorias_data = []
    for cat in _CATS_VALIDAS:
        v26      = cat_v26.get(cat, {}).get("v26", 0)
        c26      = cat_v26.get(cat, {}).get("c26", 0)
        v26_ytd  = cat_v26.get(cat, {}).get("v26_ytd", 0)
        v25      = cat_v25.get(cat, 0)
        ppto_c   = _meta_cat_mg.get(cat, {}).get(_MES, {}).get("meta_venta", 0)
        ppto_a   = sum(_meta_cat_mg.get(cat, {}).get(m, {}).get("meta_venta", 0) for m in range(1, 13))
        ppto_ytd_c = sum(_meta_cat_mg.get(cat, {}).get(m, {}).get("meta_venta", 0) for m in range(1, _MES + 1))
        cump_ppto = round(v26 / ppto_c * 100, 1)         if ppto_c     > 0 else 0.0
        cump_ytd  = round(v26_ytd / ppto_ytd_c * 100, 1) if ppto_ytd_c > 0 else 0.0
        var_ant   = round((v26 / v25 - 1) * 100, 1) if v25 > 0 else (100.0 if v26 > 0 else 0.0)
        mg_cat    = round(c26 / v26 * 100, 1) if v26 > 0 else 0.0
        _mg_raw   = _meta_cat_mg.get(cat, {}).get(_MES, {}).get("margen_pct", 0.0)
        ppto_mg_cat = round(_mg_raw * 100, 1) if 0 < _mg_raw <= 1.0 else round(_mg_raw, 1)
        categorias_data.append({
            "categoria":    cat,
            "venta_mes":    round(v26),
            "venta_ytd":    round(v26_ytd),
            "venta_ant":    round(v25),
            "ppto_mes":     round(ppto_c),
            "ppto_ytd":     round(ppto_ytd_c),
            "ppto_anual":   round(ppto_a),
            "cump_ppto":    cump_ppto,
            "cump_ytd":     cump_ytd,
            "var_ant":      var_ant,
            "pct_dias":     pct_dias,
            "contrib":      round(c26),
            "margen":       mg_cat,
            "ppto_margen":  ppto_mg_cat,
            "top5_clases":  top5_by_cat.get(cat, []),
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
        v_mes_p    = pd_data["v_mes"]
        v_prom6    = prods_6m.get(cod, 0)
        q_stock    = stock_por_cod.get(cod, 0)
        ppto_m     = ppto_cod_mes.get(cod, 0)
        ppto_anual = ppto_cod_anual.get(cod, 0)
        mg_prod    = round(pd_data["c_mes"] / v_mes_p * 100, 1) if v_mes_p > 0 else 0.0
        productos.append({
            "codigo":       cod,
            "descripcion":  pd_data["descripcion"],
            "familia":      pd_data["familia"],
            "venta_mes":    round(v_mes_p),
            "vta_prom_6m":  round(v_prom6),
            "q_stock":      q_stock,
            "ppto_mes":     round(ppto_m),
            "ppto_anual":   round(ppto_anual),
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
            "ppto_ytd":        round(meta_ytd),
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


@router.get("/resumen")
async def get_pm_resumen(
    zona: str = Query(""),
    categorias: str = Query(""),
    subclase: str = Query(""),
    codigo: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    return _load_pm(zona, categorias, subclase, codigo)


@router.get("/detalle_clase")
async def get_pm_detalle_clase(
    zona:      str = Query(""),
    categoria: str = Query(""),
    familia:   str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    """Devuelve todos los productos de una categoría + familia para el mes actual."""
    ck = f"pm:detalle_clase:{zona}:{categoria}:{familia}"
    cached = mem_get(ck)
    if cached:
        return cached

    h = hoy()
    _ANO, _MES = h["ano"], h["mes"]

    z_fact = _zona_sql(zona)
    fam_esc = familia.strip().replace("'", "''")
    fam_sql = f"LTRIM(RTRIM(FAMILIA)) = '{fam_esc}'" if fam_esc else "1=1"
    cat_f   = f"({_CAT_CASE}) = '{categoria.strip()}'" if categoria else f"({_CAT_CASE}) IN ({_CATS_IN})"

    conn = get_conn()
    cur  = conn.cursor()
    _FG  = filtro_guias_mat(cur)

    cur.execute(f"""
        SELECT LTRIM(RTRIM(CODIGO)) AS codigo,
               MAX(DESCRIPCION) AS descripcion,
               SUM(CAST(VENTA AS float)) AS v_mes,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib_mes
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES = {_MES} AND {_EXCL_DW} AND {_FG}
          AND ({z_fact}) AND ({fam_sql}) AND ({cat_f})
        GROUP BY LTRIM(RTRIM(CODIGO))
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    prods_mes: dict = {}
    for r in cur.fetchall():
        prods_mes[str(r[0]).strip()] = {
            "descripcion": str(r[1] or "").strip(),
            "v_mes":  float(r[2] or 0),
            "c_mes":  float(r[3] or 0),
        }

    # Promedio 6 meses anteriores
    _mes6_list = []
    for i in range(1, 7):
        m, y = _MES - i, _ANO
        if m <= 0: m += 12; y -= 1
        _mes6_list.append((y, m))
    m6_cond = " OR ".join(f"(ANO={y} AND MES={m})" for y, m in _mes6_list)
    cur.execute(f"""
        SELECT LTRIM(RTRIM(CODIGO)), SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE ({m6_cond}) AND {_EXCL_DW} AND {_FG}
          AND ({z_fact}) AND ({fam_sql}) AND ({cat_f})
        GROUP BY LTRIM(RTRIM(CODIGO))
    """)
    prods_6m = {str(r[0]).strip(): float(r[1] or 0) / 6 for r in cur.fetchall()}

    # Stock
    stock_por_cod: dict = {}
    if prods_mes:
        ph = ",".join(f"'{c}'" for c in list(prods_mes.keys())[:300])
        cur.execute(f"""
            SELECT codigo_producto, SUM(stock_unidades)
            FROM vw_stock_actual WHERE codigo_producto IN ({ph})
            GROUP BY codigo_producto
        """)
        stock_por_cod = {str(r[0]).strip(): int(r[1] or 0) for r in cur.fetchall()}

    conn.close()

    productos = []
    for cod, d in prods_mes.items():
        v = d["v_mes"]
        productos.append({
            "codigo":      cod,
            "descripcion": d["descripcion"],
            "venta_mes":   round(v),
            "vta_prom_6m": round(prods_6m.get(cod, 0)),
            "q_stock":     stock_por_cod.get(cod, 0),
            "margen":      round(d["c_mes"] / v * 100, 1) if v > 0 else 0.0,
        })

    result = {"productos": productos}
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
