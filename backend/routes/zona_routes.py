"""
Zona / KAM analysis — Meta 2026 vs Venta, contribución por categoría.
Unifica V REGION + V REGION II.
Excluye zonas sin facturación.
"""
import calendar
import datetime
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy, MESES_NOMBRE, filtro_guias
from cache import mem_get, mem_set

router = APIRouter()

_VEND_EXCLUIR = (
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
)
_EXCL_DW = (
    f"VENDEDOR NOT IN ({_VEND_EXCLUIR}) "
    "AND CODIGO NOT IN ('FLETE','NINV','SIN','')"
)

_CAT_CASE = """
    CASE WHEN LTRIM(RTRIM(CATEGORIA)) = 'SERVICIOS'
         THEN 'EQM' ELSE LTRIM(RTRIM(CATEGORIA)) END
"""
_CATS_VALIDAS = ('SQ', 'EVA', 'MAH', 'EQM')


def _calc_ritmo_days(meses: list[int], ano: int) -> tuple[int, int, bool]:
    """Returns (elapsed_days, total_days, periodo_completo)."""
    today = datetime.date.today()
    mes_actual = today.month if today.year == ano else (13 if today.year > ano else 0)
    total_days = 0
    elapsed_days = 0
    for m in meses:
        days_in_m = calendar.monthrange(ano, m)[1]
        total_days += days_in_m
        if m < mes_actual:
            elapsed_days += days_in_m
        elif m == mes_actual:
            elapsed_days += today.day
    return elapsed_days, total_days, elapsed_days >= total_days


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

# V REGION unification: both zones map to a single display name
_ZONA_MERGE = {
    "07-V REGION": "V REGION",
    "19-V REGION II": "V REGION",
}


def _zona_label(zona: str) -> str:
    """Normalize zone name: strip number prefix, apply merges."""
    zona = zona.strip()
    if zona in _ZONA_MERGE:
        return _ZONA_MERGE[zona]
    # Remove numeric prefix like "102-" → "STGO 1"
    parts = zona.split("-", 1)
    return parts[1] if len(parts) > 1 else zona


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
    elif periodo == "anual":
        return list(range(1, 13)), "Anual 2026"
    return list(range(1, _MES + 1)), f"YTD (Ene - {MESES_NOMBRE.get(_MES, '')})"


def _load_zona_data(meses: list[int]) -> dict:
    """Load all zona/KAM data for a given set of months."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()

    mes_list = ",".join(str(m) for m in meses)

    # ═══ 1. META por zona × mes desde Metas_KAM ═══
    aniomes_list = ",".join(str(_ANO * 100 + m) for m in meses)
    aniomes_anual = ",".join(str(_ANO * 100 + m) for m in range(1, 13))

    cur.execute(f"""
        SELECT LTRIM(RTRIM(ZONA)) AS zona,
               LTRIM(RTRIM(KAM)) AS kam,
               CAST(RIGHT(CAST(ANIOMES AS varchar), 2) AS int) AS mes,
               CAST(LTRIM(RTRIM([ META ])) AS float) AS meta
        FROM Metas_KAM
        WHERE ANIOMES IN ({aniomes_anual})
    """)
    # meta_zona[zona_raw] = {kam, meta_periodo, meta_anual}
    meta_zona_raw: dict = {}
    for r in cur.fetchall():
        zona_raw = str(r[0]).strip()
        kam = str(r[1]).strip()
        mes = int(r[2])
        meta = float(r[3] or 0)
        if zona_raw not in meta_zona_raw:
            meta_zona_raw[zona_raw] = {"kam": kam, "meta_periodo": 0, "meta_anual": 0}
        meta_zona_raw[zona_raw]["meta_anual"] += meta
        if mes in meses:
            meta_zona_raw[zona_raw]["meta_periodo"] += meta

    # ═══ 2. META por categoría desde Meta_Categoria (para margen meta) ═══
    cur.execute(f"""
        SELECT
            CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END AS cat,
            MES,
            SUM(META_VENTA) AS meta_venta,
            SUM(META_CONTRIBUCION) AS meta_contrib
        FROM Meta_Categoria
        GROUP BY CASE WHEN CATEGORIA = 'SER' THEN 'EQM' ELSE CATEGORIA END, MES
    """)
    meta_cat_global: dict = {}  # cat -> {meta_venta, meta_contrib} for period
    for r in cur.fetchall():
        cat = str(r[0]).strip()
        mes = int(r[1])
        if cat not in _CATS_VALIDAS or mes not in meses:
            continue
        if cat not in meta_cat_global:
            meta_cat_global[cat] = {"venta": 0, "contrib": 0}
        meta_cat_global[cat]["venta"] += float(r[2] or 0)
        meta_cat_global[cat]["contrib"] += float(r[3] or 0)

    # Margen meta por categoría
    margen_meta_cat: dict = {}
    for cat, d in meta_cat_global.items():
        margen_meta_cat[cat] = (d["contrib"] / d["venta"] * 100) if d["venta"] > 0 else 0

    # ═══ 2b. PPTO por zona × categoría ═══
    _SQL_CAT_PPTO = """CASE WHEN [CATEGORÍA 2026] = 'Servicios' THEN 'EQM'
                             ELSE [CATEGORÍA 2026] END"""
    cur.execute(f"""
        SELECT VENDEDOR_ACTUAL AS zona,
               {_SQL_CAT_PPTO} AS cat,
               SUM(TRY_CAST([PPTO 2026] AS float)) AS ppto
        FROM [PPTO 2026]
        GROUP BY VENDEDOR_ACTUAL, {_SQL_CAT_PPTO}
    """)
    ppto_zona_cat_raw: dict = {}  # zona_raw -> cat -> ppto
    for r in cur.fetchall():
        zona_raw = str(r[0]).strip()
        cat = str(r[1]).strip()
        if cat not in _CATS_VALIDAS:
            continue
        if zona_raw not in ppto_zona_cat_raw:
            ppto_zona_cat_raw[zona_raw] = {}
        ppto_zona_cat_raw[zona_raw][cat] = ppto_zona_cat_raw[zona_raw].get(cat, 0) + float(r[2] or 0)

    # ═══ 3. VENTA + CONTRIB por zona × categoría ═══
    cur.execute(f"""
        SELECT VENDEDOR AS zona,
               {_CAT_CASE} AS cat,
               SUM(CAST(VENTA AS float)) AS venta,
               SUM(CAST(CONTRIBUCION AS float)) AS contrib
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
        GROUP BY VENDEDOR, {_CAT_CASE}
    """)
    venta_zona_cat_raw: dict = {}  # zona_raw -> cat -> {venta, contrib}
    for r in cur.fetchall():
        zona_raw = str(r[0]).strip()
        cat = str(r[1]).strip()
        if cat not in _CATS_VALIDAS:
            continue
        if zona_raw not in venta_zona_cat_raw:
            venta_zona_cat_raw[zona_raw] = {}
        if cat not in venta_zona_cat_raw[zona_raw]:
            venta_zona_cat_raw[zona_raw][cat] = {"venta": 0, "contrib": 0}
        venta_zona_cat_raw[zona_raw][cat]["venta"] += float(r[2] or 0)
        venta_zona_cat_raw[zona_raw][cat]["contrib"] += float(r[3] or 0)

    # ═══ 4. VENTA 2025 por zona × mes (sin categoría — la categorización cambió) ═══
    cur.execute(f"""
        SELECT VENDEDOR AS zona, MES,
               SUM(CAST(VENTA AS float)) AS venta_25
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES IN ({mes_list}) AND {_EXCL_DW}
              AND {_FG}
        GROUP BY VENDEDOR, MES
    """)
    venta25_raw: dict = {}       # zona_raw -> total (sum of all months)
    venta25_zona_mes_raw: dict = {}  # zona_raw -> {mes -> venta}
    for r in cur.fetchall():
        zona_raw = str(r[0]).strip()
        mes = int(r[1])
        v25 = float(r[2] or 0)
        venta25_raw[zona_raw] = venta25_raw.get(zona_raw, 0) + v25
        if zona_raw not in venta25_zona_mes_raw:
            venta25_zona_mes_raw[zona_raw] = {}
        venta25_zona_mes_raw[zona_raw][mes] = venta25_zona_mes_raw[zona_raw].get(mes, 0) + v25

    # ═══ 4b. VENTA 2025 parcial por zona: hasta día X del mes actual ═══
    today = datetime.date.today()
    _MES_ACTUAL = hoy()["mes"]
    cur.execute(f"""
        SELECT VENDEDOR AS zona,
               SUM(CAST(VENTA AS float)) AS venta_25p
        FROM BI_TOTAL_FACTURA
        WHERE ANO = {_ANO - 1} AND MES = {_MES_ACTUAL}
          AND DAY(DIA) <= {today.day}
          AND {_EXCL_DW}
          AND {_FG}
        GROUP BY VENDEDOR
    """)
    venta25_parcial_raw: dict = {}
    for r in cur.fetchall():
        zona_raw = str(r[0]).strip()
        venta25_parcial_raw[zona_raw] = venta25_parcial_raw.get(zona_raw, 0) + float(r[1] or 0)

    conn.close()

    # ═══ 5. Merge zones (V REGION unification) and build results ═══
    # Collect all zona_raw keys
    all_zonas_raw = set(meta_zona_raw.keys()) | set(venta_zona_cat_raw.keys())

    # Group by display label
    zona_merged: dict = {}  # label -> {kam, meta_periodo, meta_anual, cats: {cat: {v,c}}, v25}
    for zona_raw in all_zonas_raw:
        label = _zona_label(zona_raw)
        if label not in zona_merged:
            zona_merged[label] = {
                "kam": "",
                "meta_periodo": 0,
                "meta_anual": 0,
                "cats": {},
                "ppto_cats": {},
                "v25": 0,
                "v25_mes": {},
                "v25_parcial": 0,
            }
        z = zona_merged[label]
        # Meta
        if zona_raw in meta_zona_raw:
            m = meta_zona_raw[zona_raw]
            if z["kam"] and m["kam"] and m["kam"] not in z["kam"]:
                z["kam"] += " / " + m["kam"]
            elif not z["kam"]:
                z["kam"] = m["kam"]
            z["meta_periodo"] += m["meta_periodo"]
            z["meta_anual"] += m["meta_anual"]
        # Venta by category
        if zona_raw in venta_zona_cat_raw:
            for cat, vc in venta_zona_cat_raw[zona_raw].items():
                if cat not in z["cats"]:
                    z["cats"][cat] = {"venta": 0, "contrib": 0}
                z["cats"][cat]["venta"] += vc["venta"]
                z["cats"][cat]["contrib"] += vc["contrib"]
        # PPTO by category
        if zona_raw in ppto_zona_cat_raw:
            for cat, ppto_val in ppto_zona_cat_raw[zona_raw].items():
                z["ppto_cats"][cat] = z["ppto_cats"].get(cat, 0) + ppto_val
        # Venta 2025 (total, sin categoría)
        z["v25"] += venta25_raw.get(zona_raw, 0)
        # Venta 2025 por mes (para ritmo)
        for m_v25, val_v25 in venta25_zona_mes_raw.get(zona_raw, {}).items():
            z["v25_mes"][m_v25] = z["v25_mes"].get(m_v25, 0) + val_v25
        # Venta 2025 parcial (mes actual hasta día X)
        z["v25_parcial"] += venta25_parcial_raw.get(zona_raw, 0)

    # ═══ 6. Build response rows ═══
    # Ritmo: calcular días una vez (compartido para todas las zonas)
    elapsed, total_d, periodo_completo = _calc_ritmo_days(meses, _ANO)
    time_pct = (elapsed / total_d * 100) if total_d > 0 else 100
    hab_trans, hab_rest, hab_total = _calc_dias_habiles(meses, _ANO)

    rows = []
    for label, z in zona_merged.items():
        venta_total = sum(c["venta"] for c in z["cats"].values())
        contrib_total = sum(c["contrib"] for c in z["cats"].values())

        # Skip zones with no sales
        if venta_total == 0:
            continue

        meta_p = z["meta_periodo"]
        meta_a = z["meta_anual"]
        cumpl = (venta_total / meta_p * 100) if meta_p > 0 else 0
        gap = venta_total - meta_p
        margen = (contrib_total / venta_total * 100) if venta_total > 0 else 0
        crec = ((venta_total / z["v25"]) - 1) * 100 if z["v25"] > 0 else 0

        # Ritmo por zona
        z_actual_pct = (venta_total / meta_p * 100) if meta_p > 0 else 0
        z_ritmo_meta = z_actual_pct - time_pct
        # v25 al mismo día: meses completos previos + parcial mes actual
        v25_completed = sum(z["v25_mes"].get(m, 0) for m in meses if m < _MES_ACTUAL)
        v25_al_dia = v25_completed + z["v25_parcial"]
        z_ritmo_25 = ((venta_total / v25_al_dia) - 1) * 100 if v25_al_dia > 0 else 0

        # Category breakdown (sin venta_25 por categoría)
        cat_detail = {}
        ppto_total_zona = sum(z["ppto_cats"].get(c, 0) for c in _CATS_VALIDAS)
        for cat in _CATS_VALIDAS:
            cv = z["cats"].get(cat, {"venta": 0, "contrib": 0})
            cat_venta = cv["venta"]
            cat_contrib = cv["contrib"]
            cat_margen = (cat_contrib / cat_venta * 100) if cat_venta > 0 else 0
            cat_pct = (cat_venta / venta_total * 100) if venta_total > 0 else 0
            cat_ppto = z["ppto_cats"].get(cat, 0)
            cat_ppto_pct = (cat_ppto / ppto_total_zona * 100) if ppto_total_zona > 0 else 0
            cat_detail[cat] = {
                "venta": round(cat_venta),
                "contrib": round(cat_contrib),
                "margen": round(cat_margen, 1),
                "pct_zona": round(cat_pct, 1),
                "ppto_pct": round(cat_ppto_pct, 1),
            }

        # Ritmo diario / proyección por zona
        z_ritmo_diario = (venta_total / hab_trans) if hab_trans > 0 else 0
        z_necesario = ((meta_p - venta_total) / hab_rest) if hab_rest > 0 else 0
        z_proyeccion = venta_total + (z_ritmo_diario * hab_rest) if hab_trans > 0 else 0

        rows.append({
            "zona": label,
            "kam": z["kam"],
            "meta_anual": round(meta_a),
            "meta_periodo": round(meta_p),
            "venta": round(venta_total),
            "contrib": round(contrib_total),
            "margen": round(margen, 1),
            "gap": round(gap),
            "cumpl": round(cumpl, 1),
            "venta_25": round(z["v25"]),
            "crec_vs_25": round(crec, 1),
            "ritmo_meta": round(z_ritmo_meta, 1),
            "ritmo_25": round(z_ritmo_25, 1),
            "ritmo_diario": round(z_ritmo_diario),
            "necesario_diario": round(z_necesario),
            "proyeccion": round(z_proyeccion),
            "categorias": cat_detail,
        })

    rows.sort(key=lambda r: -r["venta"])

    # Total row
    t_meta_a = sum(r["meta_anual"] for r in rows)
    t_meta_p = sum(r["meta_periodo"] for r in rows)
    t_venta = sum(r["venta"] for r in rows)
    t_contrib = sum(r["contrib"] for r in rows)
    t_v25 = sum(r["venta_25"] for r in rows)
    t_cumpl = (t_venta / t_meta_p * 100) if t_meta_p > 0 else 0
    t_margen = (t_contrib / t_venta * 100) if t_venta > 0 else 0
    t_crec = ((t_venta / t_v25) - 1) * 100 if t_v25 > 0 else 0
    t_cats = {}
    t_ppto_total = sum(sum(z["ppto_cats"].get(c, 0) for c in _CATS_VALIDAS)
                       for z in zona_merged.values())
    for cat in _CATS_VALIDAS:
        cv = sum(r["categorias"][cat]["venta"] for r in rows)
        cc = sum(r["categorias"][cat]["contrib"] for r in rows)
        cp = sum(z["ppto_cats"].get(cat, 0) for z in zona_merged.values())
        t_cats[cat] = {
            "venta": round(cv),
            "contrib": round(cc),
            "margen": round((cc / cv * 100) if cv > 0 else 0, 1),
            "pct_zona": round((cv / t_venta * 100) if t_venta > 0 else 0, 1),
            "ppto_pct": round((cp / t_ppto_total * 100) if t_ppto_total > 0 else 0, 1),
        }

    # Total ritmo
    t_actual_pct = (t_venta / t_meta_p * 100) if t_meta_p > 0 else 0
    t_ritmo_meta = t_actual_pct - time_pct
    # v25 al día total: sumar parciales de cada zona merged
    t_v25_completed = sum(
        sum(z["v25_mes"].get(m, 0) for m in meses if m < _MES_ACTUAL)
        for z in zona_merged.values()
    )
    t_v25_parcial = sum(z["v25_parcial"] for z in zona_merged.values())
    t_v25_al_dia = t_v25_completed + t_v25_parcial
    t_ritmo_25 = ((t_venta / t_v25_al_dia) - 1) * 100 if t_v25_al_dia > 0 else 0

    # Total ritmo diario / proyección
    t_ritmo_diario = (t_venta / hab_trans) if hab_trans > 0 else 0
    t_necesario = ((t_meta_p - t_venta) / hab_rest) if hab_rest > 0 else 0
    t_proyeccion = t_venta + (t_ritmo_diario * hab_rest) if hab_trans > 0 else 0

    total_row = {
        "zona": "Total",
        "kam": "",
        "meta_anual": round(t_meta_a),
        "meta_periodo": round(t_meta_p),
        "venta": round(t_venta),
        "contrib": round(t_contrib),
        "margen": round(t_margen, 1),
        "gap": round(t_venta - t_meta_p),
        "cumpl": round(t_cumpl, 1),
        "venta_25": round(t_v25),
        "crec_vs_25": round(t_crec, 1),
        "ritmo_meta": round(t_ritmo_meta, 1),
        "ritmo_25": round(t_ritmo_25, 1),
        "ritmo_diario": round(t_ritmo_diario),
        "necesario_diario": round(t_necesario),
        "proyeccion": round(t_proyeccion),
        "categorias": t_cats,
    }

    return {
        "zonas": rows,
        "total": total_row,
        "margen_meta_cat": {cat: round(v, 1) for cat, v in margen_meta_cat.items()},
        "ritmo": {
            "time_pct": round(time_pct, 1),
            "dias_transcurridos": elapsed,
            "dias_totales": total_d,
            "periodo_completo": periodo_completo,
            "hab_restantes": hab_rest,
        },
    }


def _zona_raw_filters(zona_label: str) -> str:
    """Convert display label back to SQL filter for VENDEDOR column."""
    # Check if it's a merged zone
    raw_zones = [k for k, v in _ZONA_MERGE.items() if v == zona_label]
    if raw_zones:
        return "(" + " OR ".join(f"VENDEDOR = '{z}'" for z in raw_zones) + ")"
    # Otherwise, find the raw zone that matches the label
    # Label is the part after the dash, so match with LIKE
    return f"VENDEDOR LIKE '%-{zona_label}'"


def _load_clientes_zona(zona_label: str, categoria: str, meses: list[int]) -> list:
    """Load client detail for a zona + category in a period."""
    _ANO = hoy()["ano"]
    _FG = filtro_guias()
    conn = get_conn()
    cur = conn.cursor()
    mes_list = ",".join(str(m) for m in meses)
    zona_filter = _zona_raw_filters(zona_label)

    cat_filter = f"= '{categoria}'"
    if categoria == "EQM":
        cat_filter = "IN ('EQM','SERVICIOS')"

    cur.execute(f"""
        WITH v26 AS (
            SELECT RUT, NOMBRE,
                   SUM(CAST(VENTA AS float)) AS venta_26
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO} AND MES IN ({mes_list})
              AND {_EXCL_DW} AND {zona_filter}
              AND LTRIM(RTRIM(CATEGORIA)) {cat_filter}
              AND {_FG}
            GROUP BY RUT, NOMBRE
        ),
        v25 AS (
            SELECT RUT,
                   MAX(NOMBRE) AS NOMBRE,
                   SUM(CAST(VENTA AS float)) AS venta_25
            FROM BI_TOTAL_FACTURA
            WHERE ANO = {_ANO - 1} AND MES IN ({mes_list})
              AND {_EXCL_DW} AND {zona_filter}
              AND {_FG}
            GROUP BY RUT
        )
        SELECT COALESCE(v26.RUT, v25.RUT) AS rut,
               COALESCE(v26.NOMBRE, v25.NOMBRE, '') AS nombre,
               COALESCE(v26.venta_26, 0) AS venta_26,
               COALESCE(v25.venta_25, 0) AS venta_25
        FROM v26
        FULL OUTER JOIN v25 ON v26.RUT = v25.RUT
        ORDER BY venta_26 DESC
    """)

    rows = []
    for r in cur.fetchall():
        v26 = float(r[2] or 0)
        v25 = float(r[3] or 0)
        crec = ((v26 / v25) - 1) * 100 if v25 > 0 else (100.0 if v26 > 0 else 0)
        rows.append({
            "rut": str(r[0] or "").strip(),
            "nombre": str(r[1] or "").strip(),
            "venta_26": round(v26),
            "venta_25": round(v25),
            "crec": round(crec, 1),
        })
    conn.close()
    return rows


@router.get("/")
async def get_zonas(
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Zona/KAM analysis with period filter."""
    try:
        cache_key = f"zona:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, label = _parse_periodo(periodo, mes)
        data = _load_zona_data(meses)
        data["periodo"] = periodo
        data["label"] = label
        mem_set(cache_key, data)
        return data
    except Exception as e:
        return {"error": str(e), "zonas": [], "total": {}, "margen_meta_cat": {}}


@router.get("/clientes")
async def get_zona_clientes(
    zona: str = Query(...),
    categoria: str = Query(...),
    periodo: str = Query("ytd"),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Client detail for a zona + category."""
    try:
        cache_key = f"zona_cli:{zona}:{categoria}:{periodo}:{mes}"
        cached = mem_get(cache_key)
        if cached:
            return cached
        meses, label = _parse_periodo(periodo, mes)
        clientes = _load_clientes_zona(zona, categoria, meses)
        result = {"clientes": clientes, "zona": zona, "categoria": categoria, "label": label}
        mem_set(cache_key, result)
        return result
    except Exception as e:
        return {"error": str(e), "clientes": []}
