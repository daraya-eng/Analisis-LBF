"""
Maestro de Productos Mercado Público
Cruza ítems donde LBF participó con todos los oferentes del mismo ítem.
Categoría LBF asignada via MAP_CODIGO_MP (cruce con BI_TOTAL_FACTURA por RUT+año).
Fuente: SQL Server BI (post-ETL) + PostgreSQL (JSONB competidores).
"""
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn
from db_mp import get_pg_conn
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT  = "93.366.000-1"
CAT_LIKE = "EQUIPAMIENTO%"

CATS = ["SQ", "EVA", "MAH", "EQM"]


def _load_maestro(ano: int) -> dict:
    """Carga maestro de productos desde SQL Server + competidores desde PostgreSQL."""

    # ── 1. Productos desde SQL Server (con categoria ya mapeada) ──────────────
    ss  = get_conn()
    cur = ss.cursor()

    ano_filter = f"AND l.Ano = {ano}" if ano else ""

    cur.execute(f"""
        SELECT
            i.CodigoMP,
            MAX(i.Nombre)                                       AS NombreMP,
            m.CodigoLBF,
            m.DescLBF,
            m.CategoriaLBF,
            COUNT(DISTINCT i.LicitacionId)                      AS n_lics,
            COUNT(i.Id)                                         AS n_items,
            SUM(CASE WHEN i.LBF_Adjudico = 1 THEN 1 ELSE 0 END) AS n_adj_lbf,
            SUM(CASE WHEN i.LBF_Adjudico = 1
                     THEN ISNULL(i.LBF_MontoAdj, 0) ELSE 0 END) AS monto_lbf
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        LEFT JOIN MAP_CODIGO_MP m ON m.CodigoMP = i.CodigoMP
        WHERE i.LBF_Participo = 1
          AND i.CodigoMP IS NOT NULL
          {ano_filter}
        GROUP BY i.CodigoMP, m.CodigoLBF, m.DescLBF, m.CategoriaLBF
        ORDER BY COUNT(i.Id) DESC
    """)
    cols = [d[0] for d in cur.description]
    ss_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    ss.close()

    # Índice CodigoMP → row
    by_codmp = {r["CodigoMP"]: r for r in ss_rows}
    codigos_mp = list(by_codmp.keys())

    if not codigos_mp:
        return {"productos": [], "resumen": {}}

    # ── 2. Competidores desde PostgreSQL (JSONB) ───────────────────────────────
    ano_pg = f"AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}" if ano else ""
    codigos_in = ",".join(str(c) for c in codigos_mp)

    pg  = get_pg_conn()
    pgc = pg.cursor()
    pgc.execute(f"""
        SELECT
            li.codigo_producto,
            o->>'rut'                           AS rut,
            INITCAP(MAX(o->>'nombre'))           AS nombre,
            COUNT(li.id)                         AS n_items,
            SUM(CASE WHEN (o->>'seleccionada')::boolean = true
                          OR li.rut_proveedor_adj = o->>'rut'
                     THEN 1 ELSE 0 END)          AS n_adj
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
          AND li.codigo_producto IN ({codigos_in})
          AND o->>'rut' <> '{LBF_RUT}'
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(li.oferentes) ox
              WHERE ox->>'rut' = '{LBF_RUT}'
          )
          {ano_pg}
        GROUP BY li.codigo_producto, o->>'rut'
        ORDER BY li.codigo_producto, COUNT(li.id) DESC
    """)

    # Agrupar competidores por codigo_mp
    comp_by_codmp: dict[int, list] = {}
    for r in pgc.fetchall():
        cod = int(r[0])
        if cod not in comp_by_codmp:
            comp_by_codmp[cod] = []
        comp_by_codmp[cod].append({
            "rut":    r[1],
            "nombre": r[2] or "Sin nombre",
            "items":  int(r[3] or 0),
            "adj":    int(r[4] or 0),
        })
    pg.close()

    # ── 3. Combinar y calcular líder ───────────────────────────────────────────
    productos = []
    for cod, row in by_codmp.items():
        comps  = comp_by_codmp.get(cod, [])
        n_items    = int(row["n_items"] or 0)
        n_adj_lbf  = int(row["n_adj_lbf"] or 0)
        monto_lbf  = float(row["monto_lbf"] or 0)

        lbf_entry = {"rut": LBF_RUT, "nombre": "LBF (tú)", "items": n_items, "adj": n_adj_lbf}
        todos     = [lbf_entry] + comps
        lider     = max(todos, key=lambda x: x["adj"])

        productos.append({
            "codigo_mp":    cod,
            "nombre":       row["NombreMP"] or "",
            "codigo_lbf":   row["CodigoLBF"],
            "desc_lbf":     row["DescLBF"],
            "categoria_lbf": row["CategoriaLBF"],
            "n_lics":       int(row["n_lics"] or 0),
            "n_items":      n_items,
            "n_adj_lbf":    n_adj_lbf,
            "pct_lbf":      round(n_adj_lbf / n_items * 100, 1) if n_items > 0 else 0,
            "monto_lbf":    int(monto_lbf),
            "n_comp":       len(comps),
            "lider":        lider["nombre"],
            "lider_es_lbf": lider["rut"] == LBF_RUT,
            "competidores": comps,
        })

    # ── 4. Resumen por categoría ───────────────────────────────────────────────
    resumen: dict[str, dict] = {}
    sin_cat = []
    for p in productos:
        cat = p["categoria_lbf"]
        if cat in CATS:
            if cat not in resumen:
                resumen[cat] = {"cat": cat, "n_productos": 0, "n_items": 0,
                                "n_adj": 0, "monto": 0, "lideres": 0}
            resumen[cat]["n_productos"] += 1
            resumen[cat]["n_items"]     += p["n_items"]
            resumen[cat]["n_adj"]       += p["n_adj_lbf"]
            resumen[cat]["monto"]       += p["monto_lbf"]
            if p["lider_es_lbf"]:
                resumen[cat]["lideres"] += 1
        else:
            sin_cat.append(p)

    for cat in resumen:
        d = resumen[cat]
        d["pct_win"] = round(d["n_adj"] / d["n_items"] * 100, 1) if d["n_items"] > 0 else 0

    return {
        "productos": productos,
        "resumen":   resumen,
        "sin_cat":   len(sin_cat),
    }


@router.get("/productos")
def get_productos(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:v2:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_maestro(ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"productos": [], "resumen": {}, "sin_cat": 0, "error": str(e)}


def _load_categoria_ms(ano: int) -> list:
    """MS% por categoría LBF usando BI_MP_ITEMS + MAP_CODIGO_MP."""
    ss  = get_conn()
    cur = ss.cursor()
    cur.execute(f"""
        SELECT
            m.CategoriaLBF,
            SUM(i.MontoTotalAdj)                                        AS mercado_total,
            SUM(CASE WHEN i.LBF_Adjudico = 1
                     THEN ISNULL(i.LBF_MontoAdj, 0)
                     ELSE 0 END)                                         AS venta_lbf,
            COUNT(DISTINCT i.LicitacionId)                              AS n_lics,
            COUNT(i.Id)                                                 AS n_items,
            SUM(CASE WHEN i.LBF_Adjudico = 1 THEN 1 ELSE 0 END)        AS n_adj_lbf
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        JOIN MAP_CODIGO_MP m ON m.CodigoMP = i.CodigoMP
        WHERE m.CategoriaLBF IN ('SQ','EVA','MAH','EQM')
          AND l.Ano = {ano}
        GROUP BY m.CategoriaLBF
        ORDER BY SUM(i.MontoTotalAdj) DESC
    """)
    rows = []
    for r in cur.fetchall():
        cat, mkt, lbf, n_lics, n_items, n_adj = r
        mkt  = float(mkt  or 0)
        lbf  = float(lbf  or 0)
        ms   = round(lbf / mkt * 100, 1) if mkt > 0 else 0
        rows.append({
            "categoria":     cat,
            "mercado_total": round(mkt),
            "venta_lbf":     round(lbf),
            "ms_pct":        ms,
            "n_lics":        int(n_lics or 0),
            "n_items":       int(n_items or 0),
            "n_adj_lbf":     int(n_adj or 0),
        })
    ss.close()
    return rows


@router.get("/categoria-ms")
def get_categoria_ms(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:cat_ms:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_categoria_ms(ano)
    mem_set(ck, data)
    return data


# ─── Liderazgo por Producto ───────────────────────────────────────────────────

def _load_liderazgo(ano: int) -> list:
    """Por producto LBF: win rate, líder, top competidores. SQL Server + PostgreSQL."""
    ss  = get_conn()
    cur = ss.cursor()
    cur.execute(f"""
        SELECT
            i.CodigoMP,
            m.CodigoLBF,
            m.DescLBF,
            m.CategoriaLBF,
            MAX(i.Nombre)                                                              AS NombreMP,
            COUNT(DISTINCT l.Id)                                                       AS n_lics,
            COUNT(i.Id)                                                                AS n_items,
            SUM(CASE WHEN i.LBF_Adjudico = 1 THEN 1 ELSE 0 END)                       AS n_adj_lbf,
            SUM(CASE WHEN i.LBF_Adjudico = 1 THEN ISNULL(i.LBF_MontoAdj, 0) ELSE 0 END) AS venta_lbf,
            SUM(CASE WHEN i.LBF_Adjudico = 0 AND i.MontoTotalAdj > 0
                     THEN i.MontoTotalAdj ELSE 0 END)                                 AS monto_perdido,
            COUNT(DISTINCT CASE WHEN i.LBF_Adjudico = 0 AND i.MontoTotalAdj > 0
                     THEN l.CompradorRutUnidad END)                                   AS n_inst_objetivo
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        LEFT JOIN MAP_CODIGO_MP m ON m.CodigoMP = i.CodigoMP
        WHERE i.LBF_Participo = 1
          AND l.Ano = {ano}
          AND l.Tipo <> 'CM'
        GROUP BY i.CodigoMP, m.CodigoLBF, m.DescLBF, m.CategoriaLBF
        ORDER BY COUNT(i.Id) DESC
    """)
    cols    = [d[0] for d in cur.description]
    ss_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    ss.close()

    if not ss_rows:
        return []

    by_codmp   = {r["CodigoMP"]: r for r in ss_rows}
    codigos_mp = list(by_codmp.keys())
    codigos_in = ",".join(str(c) for c in codigos_mp)

    # ── Competidores desde PostgreSQL ─────────────────────────────────────────
    pg  = get_pg_conn()
    pgc = pg.cursor()
    pgc.execute(f"""
        SELECT
            li.codigo_producto,
            o->>'rut'                              AS rut,
            INITCAP(MAX(o->>'nombre'))             AS nombre,
            COUNT(li.id)                           AS n_items,
            SUM(CASE WHEN (o->>'seleccionada')::boolean = true
                          OR li.rut_proveedor_adj = o->>'rut'
                     THEN 1 ELSE 0 END)            AS n_adj
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        CROSS JOIN LATERAL jsonb_array_elements(li.oferentes) o
        WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
          AND li.codigo_producto IN ({codigos_in})
          AND o->>'rut' <> '{LBF_RUT}'
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(li.oferentes) ox
              WHERE ox->>'rut' = '{LBF_RUT}'
          )
          AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) = {ano}
        GROUP BY li.codigo_producto, o->>'rut'
        ORDER BY li.codigo_producto, n_adj DESC
    """)
    comp_by_codmp: dict[int, list] = {}
    for r in pgc.fetchall():
        cod = int(r[0])
        if cod not in comp_by_codmp:
            comp_by_codmp[cod] = []
        comp_by_codmp[cod].append({
            "rut":    r[1],
            "nombre": r[2] or "Sin nombre",
            "items":  int(r[3] or 0),
            "adj":    int(r[4] or 0),
        })
    pg.close()

    # ── Combinar y determinar líder ────────────────────────────────────────────
    productos = []
    for cod, row in by_codmp.items():
        comps      = comp_by_codmp.get(cod, [])
        n_items    = int(row["n_items"]    or 0)
        n_adj_lbf  = int(row["n_adj_lbf"] or 0)
        venta_lbf  = float(row["venta_lbf"]  or 0)
        monto_perd = float(row["monto_perdido"] or 0)

        lbf_entry = {"rut": LBF_RUT, "nombre": "LBF", "items": n_items, "adj": n_adj_lbf}
        todos     = [lbf_entry] + comps
        lider     = max(todos, key=lambda x: x["adj"])
        # LBF solo lidera si realmente adjudicó al menos 1 ítem
        lider_es_lbf = (lider["rut"] == LBF_RUT) and (n_adj_lbf > 0)

        productos.append({
            "codigo_mp":      cod,
            "nombre_mp":      row["NombreMP"] or "",
            "codigo_lbf":     row["CodigoLBF"] or "",
            "desc_lbf":       row["DescLBF"] or "",
            "categoria":      row["CategoriaLBF"] or "",
            "n_lics":         int(row["n_lics"] or 0),
            "n_items":        n_items,
            "n_adj_lbf":      n_adj_lbf,
            "win_rate":       round(n_adj_lbf / n_items * 100, 1) if n_items > 0 else 0,
            "venta_lbf":      round(venta_lbf),
            "monto_perdido":  round(monto_perd),
            "n_inst_objetivo": int(row["n_inst_objetivo"] or 0),
            "lider_es_lbf":   lider_es_lbf,
            "lider_nombre":   lider["nombre"],
            "lider_adj":      lider["adj"],
            "competidores":   comps[:5],
        })

    # No líderes primero (mayor oportunidad), luego líderes
    productos.sort(key=lambda p: (p["lider_es_lbf"], -p["monto_perdido"] if not p["lider_es_lbf"] else -p["venta_lbf"]))
    return productos


def _load_oportunidades(ano: int) -> list:
    """Instituciones donde LBF participó y perdió, con detalle por producto."""
    ss  = get_conn()
    cur = ss.cursor()
    cur.execute(f"""
        SELECT
            LTRIM(RTRIM(l.CompradorRutUnidad))                AS comp_rut,
            MAX(LTRIM(RTRIM(l.CompradorNombre)))              AS comp_nombre,
            MAX(LTRIM(RTRIM(l.CompradorRegion)))              AS comp_region,
            i.CodigoMP,
            m.CodigoLBF,
            m.DescLBF,
            m.CategoriaLBF,
            COUNT(i.Id)                                       AS n_items_perdidos,
            SUM(i.MontoTotalAdj)                              AS monto_perdido,
            MAX(ISNULL(i.NombreAdj, 'Sin datos'))             AS ganador_nombre,
            MAX(i.RutAdj)                                     AS ganador_rut
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        LEFT JOIN MAP_CODIGO_MP m ON m.CodigoMP = i.CodigoMP
        WHERE i.LBF_Participo = 1
          AND i.LBF_Adjudico  = 0
          AND i.MontoTotalAdj > 0
          AND l.Tipo <> 'CM'
          AND l.Ano = {ano}
        GROUP BY LTRIM(RTRIM(l.CompradorRutUnidad)),
                 i.CodigoMP, m.CodigoLBF, m.DescLBF, m.CategoriaLBF
        ORDER BY SUM(i.MontoTotalAdj) DESC
    """)

    inst_by_rut: dict[str, dict] = {}
    for r in cur.fetchall():
        rut    = str(r[0] or "").strip()
        if not rut:
            continue
        nombre = str(r[1] or "").strip()
        region = str(r[2] or "").strip()
        monto  = float(r[8] or 0)
        ganador = str(r[9] or "Sin datos").strip()

        if rut not in inst_by_rut:
            inst_by_rut[rut] = {
                "rut": rut, "nombre": nombre, "region": region,
                "n_productos": 0, "n_items_perdidos": 0, "monto_perdido": 0.0,
                "top_competidor": "", "productos": [],
            }
        inst = inst_by_rut[rut]
        inst["n_productos"]     += 1
        inst["n_items_perdidos"] += int(r[7] or 0)
        inst["monto_perdido"]   += monto
        inst["productos"].append({
            "codigo_lbf": r[4] or "",
            "desc_lbf":   r[5] or "",
            "categoria":  r[6] or "",
            "n_items":    int(r[7] or 0),
            "monto":      round(monto),
            "ganador":    ganador,
        })

    ss.close()

    result = sorted(inst_by_rut.values(), key=lambda x: -x["monto_perdido"])
    for inst in result:
        inst["monto_perdido"] = round(inst["monto_perdido"])
        inst["productos"].sort(key=lambda p: -p["monto"])
        # top competitor by total amount
        comp_totals: dict[str, float] = {}
        for p in inst["productos"]:
            g = p["ganador"]
            if g and g != "Sin datos":
                comp_totals[g] = comp_totals.get(g, 0) + p["monto"]
        inst["top_competidor"] = max(comp_totals, key=comp_totals.__getitem__) if comp_totals else "Sin datos"

    return result


@router.get("/liderazgo")
def get_liderazgo(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:liderazgo:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    try:
        data = _load_liderazgo(ano)
        mem_set(ck, data)
        return data
    except Exception as e:
        return {"error": str(e), "data": []}


@router.get("/oportunidades")
def get_oportunidades(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:oportunidades:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_oportunidades(ano)
    mem_set(ck, data)
    return data


# ─── Región ───────────────────────────────────────────────────────────────────

def _load_region_data(ano: int) -> dict:
    """MS% por región. Mercado = todos los ítems adj. Excluye CM."""
    ss  = get_conn()
    cur = ss.cursor()
    cur.execute(f"""
        SELECT
            ISNULL(NULLIF(LTRIM(RTRIM(l.CompradorRegion)), ''), 'Sin Región') AS region,
            COUNT(DISTINCT l.Id)                                                AS n_lics,
            SUM(CASE WHEN i.LBF_Participo = 1 THEN 1 ELSE 0 END)              AS n_items,
            SUM(CASE WHEN i.LBF_Adjudico  = 1 THEN 1 ELSE 0 END)              AS n_adj_lbf,
            SUM(CASE WHEN i.MontoTotalAdj > 0 THEN i.MontoTotalAdj ELSE 0 END) AS mercado_total,
            SUM(CASE WHEN i.LBF_Adjudico  = 1
                     THEN ISNULL(i.LBF_MontoAdj, 0) ELSE 0 END)               AS venta_lbf
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        WHERE l.Ano = {ano}
          AND l.Tipo <> 'CM'
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(l.CompradorRegion)), ''), 'Sin Región')
        ORDER BY SUM(CASE WHEN i.MontoTotalAdj > 0 THEN i.MontoTotalAdj ELSE 0 END) DESC
    """)

    rows = []
    tot = {"n_lics": 0, "n_items": 0, "n_adj_lbf": 0, "mercado_total": 0, "venta_lbf": 0}
    for r in cur.fetchall():
        region = r[0]
        n_lics  = int(r[1] or 0)
        n_items = int(r[2] or 0)
        n_adj   = int(r[3] or 0)
        mkt     = float(r[4] or 0)
        lbf     = float(r[5] or 0)
        rows.append({
            "region":        region,
            "n_lics":        n_lics,
            "n_items":       n_items,
            "n_adj_lbf":     n_adj,
            "mercado_total": round(mkt),
            "venta_lbf":     round(lbf),
            "ms_pct":        round(lbf / mkt * 100, 2) if mkt > 0 else 0,
            "win_rate":      round(n_adj / n_items * 100, 1) if n_items > 0 else 0,
        })
        tot["n_lics"]        += n_lics
        tot["n_items"]       += n_items
        tot["n_adj_lbf"]     += n_adj
        tot["mercado_total"] += round(mkt)
        tot["venta_lbf"]     += round(lbf)

    ss.close()
    tot["ms_pct"]   = round(tot["venta_lbf"] / tot["mercado_total"] * 100, 2) if tot["mercado_total"] > 0 else 0
    tot["win_rate"] = round(tot["n_adj_lbf"] / tot["n_items"] * 100, 1) if tot["n_items"] > 0 else 0
    return {"regiones": rows, "total": tot}


def _load_region_clientes(region: str, ano: int) -> list:
    """Hospitales/compradores de una región con sus métricas."""
    ss  = get_conn()
    cur = ss.cursor()
    cur.execute("""
        SELECT
            LTRIM(RTRIM(l.CompradorRutUnidad))                                  AS rut,
            MAX(LTRIM(RTRIM(l.CompradorNombre)))                                AS nombre,
            COUNT(DISTINCT l.Id)                                                 AS n_lics,
            SUM(CASE WHEN i.LBF_Participo = 1 THEN 1 ELSE 0 END)               AS n_items,
            SUM(CASE WHEN i.LBF_Adjudico  = 1 THEN 1 ELSE 0 END)               AS n_adj_lbf,
            SUM(CASE WHEN i.MontoTotalAdj > 0 THEN i.MontoTotalAdj ELSE 0 END) AS mercado_total,
            SUM(CASE WHEN i.LBF_Adjudico  = 1
                     THEN ISNULL(i.LBF_MontoAdj, 0) ELSE 0 END)                AS venta_lbf
        FROM BI_MP_ITEMS i
        JOIN BI_MP_LICITACIONES l ON l.Id = i.LicitacionId
        WHERE l.Ano = ?
          AND l.Tipo <> 'CM'
          AND ISNULL(NULLIF(LTRIM(RTRIM(l.CompradorRegion)), ''), 'Sin Región') = ?
        GROUP BY LTRIM(RTRIM(l.CompradorRutUnidad))
        ORDER BY
            SUM(CASE WHEN i.LBF_Adjudico = 1
                     THEN ISNULL(i.LBF_MontoAdj, i.MontoTotalAdj) ELSE 0 END) DESC
    """, (ano, region))

    clientes = []
    for r in cur.fetchall():
        rut, nombre, n_lics, n_items, n_adj, mkt, lbf = r
        mkt     = float(mkt or 0)
        lbf     = float(lbf or 0)
        n_items = int(n_items or 0)
        n_adj   = int(n_adj or 0)
        clientes.append({
            "rut":           rut or "",
            "nombre":        nombre or rut or "",
            "n_lics":        int(n_lics or 0),
            "n_items":       n_items,
            "n_adj_lbf":     n_adj,
            "mercado_total": round(mkt),
            "venta_lbf":     round(lbf),
            "ms_pct":        round(lbf / mkt * 100, 2) if mkt > 0 else 0,
            "win_rate":      round(n_adj / n_items * 100, 1) if n_items > 0 else 0,
        })
    ss.close()
    return clientes


@router.get("/region")
def get_region(
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:region:{ano}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_region_data(ano)
    mem_set(ck, data)
    return data


@router.get("/region/clientes")
def get_region_clientes(
    region: str = Query(...),
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    ck = f"maestro_mp:region_cli:{ano}:{region}"
    cached = mem_get(ck)
    if cached:
        return cached
    data = _load_region_clientes(region, ano)
    mem_set(ck, data)
    return data
