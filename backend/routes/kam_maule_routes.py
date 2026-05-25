"""
KAM Maule Sur — Plan Estratégico 3 meses (Noelia Parra).
Módulo restringido: solo superadmin.
"""
import re, json, os
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn, hoy
from db_mp import get_pg_conn
from cache import mem_get, mem_set

_NOTAS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "notas_licitaciones.json")

def _load_notas() -> dict:
    if os.path.exists(_NOTAS_PATH):
        with open(_NOTAS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

router = APIRouter()

ZONA        = "08-MAULE-SUR"
LBF_RUT_CM  = "93.366.000-1"
_EXCL_COD   = "CODIGO NOT IN ('FLETE','NINV','SIN','')"
_EXCL_VEND  = """VENDEDOR NOT IN (
    '89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',
    '96-FACTURACION FALTANTES','97-DONACIONES',
    '98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'
)"""
_CAT_CASE = """CASE WHEN LTRIM(RTRIM(UPPER(CATEGORIA))) IN ('SERVICIOS','EQM') THEN 'EQM'
                    ELSE LTRIM(RTRIM(UPPER(CATEGORIA))) END"""
_MAULE_KW = [
    "MAULE","TALCA","CURICO","CAUQUENES","LINARES","PARRAL",
    "SAN JAVIER","LIRCAY","CHILLAN","SAN CARLOS","HERMINDA","CONSTITUCION",
]

MESES_NOM = {1:"Ene",2:"Feb",3:"Mar",4:"Abr",5:"May",6:"Jun",
             7:"Jul",8:"Ago",9:"Sep",10:"Oct",11:"Nov",12:"Dic"}

# ── helpers ───────────────────────────────────────────────────────────────────

def _mes_list(meses):
    return ",".join(str(m) for m in meses)


def _sanitize_rut(rut: str) -> str:
    return re.sub(r"[^0-9A-Za-z\-]", "", str(rut))[:20]


def _sanitize_cat(cat: str) -> str:
    return re.sub(r"[^A-Z0-9\-_ /]", "", cat.upper())[:20].strip()


def _load_data(meses: list[int]) -> dict:
    conn = get_conn()
    cur  = conn.cursor()
    ml   = _mes_list(meses)

    # ── 1. Meta YTD ──────────────────────────────────────────────────────────
    aniomes = ",".join(str(202600 + m) for m in meses)
    cur.execute(f"""
        SELECT ISNULL(SUM(CAST(ISNULL([ META ],0) AS float)),0)
        FROM Metas_KAM WHERE ZONA = '{ZONA}' AND ANIOMES IN ({aniomes})
    """)
    meta_ytd = float(cur.fetchone()[0] or 0)

    # ── 2. Venta 2026 YTD por categoría ──────────────────────────────────────
    cur.execute(f"""
        SELECT {_CAT_CASE} AS cat,
               SUM(CAST(VENTA AS float)),
               SUM(CAST(CONTRIBUCION AS float)),
               COUNT(DISTINCT RUT),
               COUNT(DISTINCT CODIGO)
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND {_EXCL_VEND} AND {_EXCL_COD}
        GROUP BY {_CAT_CASE}
        ORDER BY SUM(CAST(VENTA AS float)) DESC
    """)
    cats_26_raw = cur.fetchall()
    cats_26 = []
    for r in cats_26_raw:
        v = float(r[1] or 0); c = float(r[2] or 0)
        cats_26.append({
            "cat": r[0], "venta": v, "contrib": c,
            "margen": round(c / v * 100, 1) if v > 0 else 0.0,
            "n_clientes": int(r[3]), "n_skus": int(r[4]),
        })

    # ── 3. Venta 2025 YTD ────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT ISNULL(SUM(CAST(VENTA AS float)),0)
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2025 AND MES IN ({ml})
          AND {_EXCL_VEND} AND {_EXCL_COD}
    """)
    venta_25 = float(cur.fetchone()[0] or 0)

    # ── 4. Venta mensual 2026 vs 2025 ────────────────────────────────────────
    cur.execute(f"""
        SELECT MES, SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND {_EXCL_VEND} AND {_EXCL_COD}
        GROUP BY MES ORDER BY MES
    """)
    mens_26 = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}
    cur.execute(f"""
        SELECT MES, SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2025 AND MES IN ({ml})
          AND {_EXCL_VEND} AND {_EXCL_COD}
        GROUP BY MES ORDER BY MES
    """)
    mens_25 = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

    meses_data = []
    for m in meses:
        meses_data.append({
            "mes": m, "label": MESES_NOM[m],
            "venta_26": round(mens_26.get(m, 0)),
            "venta_25": round(mens_25.get(m, 0)),
        })

    # ── 5. Clientes activos 2026 + caída ─────────────────────────────────────
    cur.execute(f"""
        SELECT f26.RUT, f26.NOMBRE, f26.SEGMENTO,
               f26.v26, f26.c26, f26.ultima,
               ISNULL(f25.v25, 0)
        FROM (
            SELECT RUT, MAX(NOMBRE) AS NOMBRE, MAX(SEGMENTO) AS SEGMENTO,
                   SUM(CAST(VENTA AS float)) AS v26,
                   SUM(CAST(CONTRIBUCION AS float)) AS c26,
                   MAX(DIA) AS ultima
            FROM BI_TOTAL_FACTURA
            WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
              AND {_EXCL_VEND} AND {_EXCL_COD}
            GROUP BY RUT
        ) f26
        LEFT JOIN (
            SELECT RUT, SUM(CAST(VENTA AS float)) AS v25
            FROM BI_TOTAL_FACTURA
            WHERE VENDEDOR = '{ZONA}' AND ANO = 2025 AND MES IN ({ml})
              AND {_EXCL_VEND} AND {_EXCL_COD}
            GROUP BY RUT
        ) f25 ON f26.RUT = f25.RUT
        ORDER BY f26.v26 DESC
    """)
    clientes = []
    for rut, nom, seg, v26, c26, ult, v25 in cur.fetchall():
        v26f = float(v26 or 0); c26f = float(c26 or 0); v25f = float(v25 or 0)
        crec = round((v26f/v25f - 1)*100, 1) if v25f > 0 else (100.0 if v26f > 0 else 0.0)
        mg   = round(c26f/v26f*100, 1) if v26f > 0 else 0
        dias = None
        if ult:
            import datetime
            d = ult.date() if hasattr(ult, "date") else ult
            dias = (datetime.date.today() - d).days
        clientes.append({
            "rut": str(rut or "").strip(),
            "nombre": str(nom or "").strip(),
            "segmento": str(seg or "").strip() or "—",
            "venta_26": round(v26f),
            "venta_25": round(v25f),
            "contrib":  round(c26f),
            "margen":   mg,
            "crec":     crec,
            "gap":      round(v26f - v25f),
            "dias_sin_compra": dias,
            "es_nuevo": v25f == 0,
            "en_caida": crec < -10 and v25f > 0,
        })

    # ── 6. SKUs perdidos ──────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT f25.RUT, MAX(f25.NOMBRE) AS CLI,
               f25.CODIGO, MAX(f25.DESCRIPCION) AS DESC_PROD,
               {_CAT_CASE.replace('CATEGORIA','f25.CATEGORIA')} AS cat,
               SUM(CAST(f25.VENTA AS float)) AS v25_sku
        FROM BI_TOTAL_FACTURA f25
        WHERE f25.VENDEDOR = '{ZONA}' AND f25.ANO = 2025 AND f25.MES IN ({ml})
          AND f25.{_EXCL_COD}
          AND NOT EXISTS (
              SELECT 1 FROM BI_TOTAL_FACTURA f26
              WHERE f26.VENDEDOR = '{ZONA}' AND f26.ANO = 2026 AND f26.MES IN ({ml})
                AND f26.RUT = f25.RUT AND f26.CODIGO = f25.CODIGO
          )
        GROUP BY f25.RUT, f25.CODIGO,
                 {_CAT_CASE.replace('CATEGORIA','f25.CATEGORIA')}
        ORDER BY v25_sku DESC
    """)
    skus_perdidos = []
    for rut, cli, cod, desc, cat, v25s in cur.fetchall():
        skus_perdidos.append({
            "rut": str(rut or "").strip(),
            "cliente": str(cli or "").strip(),
            "codigo": str(cod or "").strip(),
            "descripcion": str(desc or "").strip(),
            "categoria": str(cat or "").strip(),
            "venta_25": round(float(v25s or 0)),
        })

    cli_perdidos: dict = defaultdict(lambda: {"cliente": "", "total_perdido": 0, "n_skus": 0, "skus": []})
    for s in skus_perdidos:
        k = s["rut"]
        cli_perdidos[k]["cliente"] = s["cliente"]
        cli_perdidos[k]["total_perdido"] += s["venta_25"]
        cli_perdidos[k]["n_skus"] += 1
        cli_perdidos[k]["skus"].append(s)
    skus_por_cliente = sorted(
        [{"rut": k, **v} for k, v in cli_perdidos.items()],
        key=lambda x: -x["total_perdido"]
    )

    # ── 7. Licitaciones adjudicadas sin facturar ──────────────────────────────
    ruts_zona = list({c["rut"] for c in clientes} | {s["rut"] for s in skus_perdidos})
    adj_sin_fact = []
    if ruts_zona:
        ruts_sql = ",".join(f"'{r}'" for r in ruts_zona)
        cur.execute(f"""
            SELECT l.rut_cliente, MAX(l.nombre_cliente) AS nombre,
                   COUNT(DISTINCT l.licitacion) AS n_lic,
                   SUM(TRY_CAST(l.monto_licitacion AS float)) AS monto_adj
            FROM vw_LICITACIONES_CATEGORIZADAS l
            WHERE l.EsLBF = 1
              AND l.estado = 'Adjudicado'
              AND l.fecha_termino >= GETDATE()
              AND l.rut_cliente IN ({ruts_sql})
            GROUP BY l.rut_cliente
            ORDER BY monto_adj DESC
        """)
        for rut, nom, n_lic, monto in cur.fetchall():
            adj_sin_fact.append({
                "rut": str(rut or "").strip(),
                "cliente": str(nom or "").strip(),
                "n_licitaciones": int(n_lic),
                "monto": round(float(monto or 0)),
            })

    # ── 8. Licitaciones vigentes perdidas ante competidores ───────────────────
    cur.execute(f"""
        SELECT l.rut_cliente, MAX(l.nombre_cliente) AS nombre,
               MAX(l.nombre_empresa) AS empresa,
               SUM(TRY_CAST(l.monto_licitacion AS float)) AS monto
        FROM vw_LICITACIONES_CATEGORIZADAS l
        WHERE l.estado = 'Adjudicado'
          AND l.fecha_termino >= GETDATE()
          AND l.FFVV_ZONA LIKE '%MAULE%'
          AND l.EsLBF = 0
          AND NOT EXISTS (
              SELECT 1 FROM vw_LICITACIONES_CATEGORIZADAS lbf
              WHERE lbf.licitacion = l.licitacion AND lbf.EsLBF = 1
          )
        GROUP BY l.rut_cliente
        ORDER BY monto DESC
    """)
    lics_competidor = [
        {"rut": str(r[0] or "").strip(), "cliente": str(r[1] or "").strip(),
         "competidor": str(r[2] or "").strip(), "monto": round(float(r[3] or 0))}
        for r in cur.fetchall()
    ]

    conn.close()

    # ── 9. Convenio Marco (PostgreSQL) ────────────────────────────────────────
    maule_filter = " OR ".join(f"UPPER(oc.comprador_nombre_organismo) LIKE '%{k}%'" for k in _MAULE_KW)
    cm_lbf: list   = []
    cm_captacion: list = []
    try:
        pg  = get_pg_conn()
        pgc = pg.cursor()
        pgc.execute(f"""
            SELECT oc.comprador_nombre_organismo,
                   oc.proveedor_nombre_empresa,
                   oc.proveedor_rut,
                   SUM(COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)) AS monto
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oc.id = oi.orden_compra_id
            WHERE ({maule_filter})
              AND oi.categoria ILIKE '%Equipamiento y suministros m%'
              AND EXTRACT(YEAR FROM oc.fecha_creacion) = 2026
            GROUP BY oc.comprador_nombre_organismo,
                     oc.proveedor_nombre_empresa, oc.proveedor_rut
            ORDER BY monto DESC
        """)
        rows = pgc.fetchall()

        lbf_orgs: dict  = defaultdict(float)
        comp_orgs: dict = defaultdict(lambda: {"total": 0.0, "proveedores": set()})
        for org, prov, rut, monto in rows:
            m = float(monto or 0)
            if rut == LBF_RUT_CM:
                lbf_orgs[org] += m
            else:
                comp_orgs[org]["total"] += m
                comp_orgs[org]["proveedores"].add(str(prov or "").strip())

        for org, m in sorted(lbf_orgs.items(), key=lambda x: -x[1]):
            comp_m = comp_orgs[org]["total"] if org in comp_orgs else 0
            cm_lbf.append({
                "organismo": org,
                "monto_lbf": round(m),
                "monto_comp": round(comp_m),
                "share_lbf": round(m/(m+comp_m)*100, 1) if (m+comp_m) > 0 else 0,
                "proveedores_comp": sorted(list(comp_orgs[org]["proveedores"]))[:4] if org in comp_orgs else [],
            })
        solo_comp = {o for o in comp_orgs if o not in lbf_orgs}
        for org in sorted(solo_comp, key=lambda o: -comp_orgs[o]["total"])[:15]:
            d = comp_orgs[org]
            cm_captacion.append({
                "organismo": org,
                "monto_comp": round(d["total"]),
                "proveedores": sorted(list(d["proveedores"]))[:4],
            })

        pgc.close()
        pg.close()
    except Exception:
        pass

    # ── Build response ────────────────────────────────────────────────────────
    venta_26   = sum(c["venta"] for c in cats_26)
    contrib_26 = sum(c["contrib"] for c in cats_26)
    margen_26  = contrib_26 / venta_26 * 100 if venta_26 > 0 else 0
    cumpl      = venta_26 / meta_ytd * 100 if meta_ytd > 0 else 0
    crec_zona  = (venta_26 / venta_25 - 1) * 100 if venta_25 > 0 else 0

    total_adj      = sum(a["monto"] for a in adj_sin_fact)
    total_perdido  = sum(s["total_perdido"] for s in skus_por_cliente)
    total_cm_comp  = sum(c["monto_comp"] for c in cm_lbf)
    total_captac   = sum(c["monto_comp"] for c in cm_captacion)

    return {
        "zona": ZONA,
        "kam": "Noelia Parra",
        "periodo_label": f"Ene-May 2026",
        "meses": meses,

        "kpis": {
            "venta_26":    round(venta_26),
            "venta_25":    round(venta_25),
            "meta_ytd":    round(meta_ytd),
            "cumpl":       round(cumpl, 1),
            "crec":        round(crec_zona, 1),
            "gap_meta":    round(venta_26 - meta_ytd),
            "margen":      round(margen_26, 1),
            "n_clientes":  len(clientes),
            "n_caida":     sum(1 for c in clientes if c["en_caida"]),
            "n_nuevos":    sum(1 for c in clientes if c["es_nuevo"]),
        },

        "potencial": {
            "adj_sin_facturar": round(total_adj),
            "skus_perdidos":    round(total_perdido),
            "cm_share_gap":     round(total_cm_comp),
            "cm_captacion":     round(total_captac),
        },

        "categorias":       cats_26,
        "meses_data":       meses_data,
        "clientes":         clientes,
        "skus_por_cliente": skus_por_cliente,
        "adj_sin_facturar": adj_sin_fact,
        "lics_competidor":  lics_competidor,
        "cm_lbf":           cm_lbf,
        "cm_captacion":     cm_captacion,
    }


@router.get("/resumen")
def get_resumen(current_user: dict = Depends(get_current_user)):
    ck = "kam_maule:resumen"
    cached = mem_get(ck)
    if cached:
        return cached
    h = hoy()
    meses = list(range(1, h["mes"] + 1))
    data = _load_data(meses)
    mem_set(ck, data)
    return data


# ── Drill-down: detalle de cliente ────────────────────────────────────────────

@router.get("/cliente/{rut}")
def get_cliente_detail(rut: str, meses: str = Query("1,2,3,4,5"), current_user: dict = Depends(get_current_user)):
    rut_clean = _sanitize_rut(rut)
    try:
        meses_list = [int(m) for m in meses.split(",") if m.strip()]
    except Exception:
        meses_list = list(range(1, 6))
    ml = _mes_list(meses_list)

    conn = get_conn()
    cur  = conn.cursor()

    # Tendencia mensual 2026
    cur.execute(f"""
        SELECT MES, SUM(CAST(VENTA AS float)), SUM(CAST(CONTRIBUCION AS float))
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND RUT = '{rut_clean}' AND {_EXCL_COD}
        GROUP BY MES ORDER BY MES
    """)
    mens_26 = {int(r[0]): (float(r[1] or 0), float(r[2] or 0)) for r in cur.fetchall()}

    # Tendencia mensual 2025
    cur.execute(f"""
        SELECT MES, SUM(CAST(VENTA AS float))
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2025 AND MES IN ({ml})
          AND RUT = '{rut_clean}' AND {_EXCL_COD}
        GROUP BY MES ORDER BY MES
    """)
    mens_25 = {int(r[0]): float(r[1] or 0) for r in cur.fetchall()}

    meses_data = [
        {"mes": m, "label": MESES_NOM[m],
         "venta_26": round(mens_26.get(m, (0, 0))[0]),
         "venta_25": round(mens_25.get(m, 0))}
        for m in meses_list
    ]

    # Top productos comprados 2026
    cur.execute(f"""
        SELECT CODIGO, MAX(DESCRIPCION) AS desc_prod,
               {_CAT_CASE},
               SUM(CAST(VENTA AS float)) AS v26,
               SUM(CAST(CONTRIBUCION AS float)) AS c26
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND RUT = '{rut_clean}' AND {_EXCL_COD}
        GROUP BY CODIGO, {_CAT_CASE}
        ORDER BY v26 DESC
    """)
    top_productos = []
    for cod, desc, cat, v, c in cur.fetchall():
        vf = float(v or 0); cf = float(c or 0)
        top_productos.append({
            "codigo": str(cod or "").strip(),
            "descripcion": str(desc or "").strip(),
            "categoria": str(cat or "").strip(),
            "venta_26": round(vf),
            "margen": round(cf / vf * 100, 1) if vf > 0 else 0.0,
        })

    # SKUs que compró en 2025 y no en 2026
    cur.execute(f"""
        SELECT f25.CODIGO, MAX(f25.DESCRIPCION),
               {_CAT_CASE.replace('CATEGORIA','f25.CATEGORIA')},
               SUM(CAST(f25.VENTA AS float)) AS v25
        FROM BI_TOTAL_FACTURA f25
        WHERE f25.VENDEDOR = '{ZONA}' AND f25.ANO = 2025 AND f25.MES IN ({ml})
          AND f25.RUT = '{rut_clean}' AND f25.{_EXCL_COD}
          AND NOT EXISTS (
              SELECT 1 FROM BI_TOTAL_FACTURA f26
              WHERE f26.VENDEDOR = '{ZONA}' AND f26.ANO = 2026 AND f26.MES IN ({ml})
                AND f26.RUT = f25.RUT AND f26.CODIGO = f25.CODIGO
          )
        GROUP BY f25.CODIGO, {_CAT_CASE.replace('CATEGORIA','f25.CATEGORIA')}
        ORDER BY v25 DESC
    """)
    skus_perdidos = [
        {"codigo": str(r[0] or "").strip(),
         "descripcion": str(r[1] or "").strip(),
         "categoria": str(r[2] or "").strip(),
         "venta_25": round(float(r[3] or 0))}
        for r in cur.fetchall()
    ]

    # Licitaciones adjudicadas vigentes sin facturar
    cur.execute(f"""
        SELECT l.licitacion,
               MAX(l.DescripcionMaestro) AS cat_lic,
               COUNT(DISTINCT l.descripcion_producto) AS n_items,
               SUM(TRY_CAST(l.monto_licitacion AS float)) AS monto,
               MAX(CONVERT(varchar, l.fecha_termino, 23)) AS fecha_term
        FROM vw_LICITACIONES_CATEGORIZADAS l
        WHERE l.EsLBF = 1 AND l.estado = 'Adjudicado'
          AND l.fecha_termino >= GETDATE()
          AND l.rut_cliente = '{rut_clean}'
        GROUP BY l.licitacion
        ORDER BY monto DESC
    """)
    adj_lics = [
        {"licitacion": str(r[0] or "").strip(),
         "categoria": str(r[1] or "").strip(),
         "n_items": int(r[2] or 0),
         "monto": round(float(r[3] or 0)),
         "fecha_termino": str(r[4] or "")}
        for r in cur.fetchall()
    ]

    conn.close()

    notas = _load_notas()
    for lic in adj_lics:
        nota = notas.get(lic["licitacion"], {})
        lic["obs"] = nota.get("texto", "")

    v26_tot = sum(v for v, _ in mens_26.values())
    c26_tot = sum(c for _, c in mens_26.values())
    v25_tot = sum(mens_25.values())

    return {
        "rut": rut_clean,
        "venta_26": round(v26_tot),
        "venta_25": round(v25_tot),
        "margen": round(c26_tot / v26_tot * 100, 1) if v26_tot > 0 else 0.0,
        "meses_data": meses_data,
        "top_productos": top_productos,
        "skus_perdidos": skus_perdidos,
        "adj_sin_facturar": adj_lics,
    }


# ── Drill-down: detalle de categoría ─────────────────────────────────────────

@router.get("/categoria/{cat}")
def get_categoria_detail(cat: str, meses: str = Query("1,2,3,4,5"), current_user: dict = Depends(get_current_user)):
    cat_clean = _sanitize_cat(cat)
    try:
        meses_list = [int(m) for m in meses.split(",") if m.strip()]
    except Exception:
        meses_list = list(range(1, 6))
    ml = _mes_list(meses_list)

    conn = get_conn()
    cur  = conn.cursor()

    # Top clientes en esta categoría
    cur.execute(f"""
        SELECT RUT, MAX(NOMBRE) AS nom,
               SUM(CAST(VENTA AS float)) AS v26,
               SUM(CAST(CONTRIBUCION AS float)) AS c26,
               COUNT(DISTINCT CODIGO) AS n_skus
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND {_EXCL_COD} AND {_CAT_CASE} = '{cat_clean}'
        GROUP BY RUT
        ORDER BY v26 DESC
    """)
    top_clientes = []
    for rut, nom, v, c, ns in cur.fetchall():
        vf = float(v or 0); cf = float(c or 0)
        top_clientes.append({
            "rut": str(rut or "").strip(),
            "nombre": str(nom or "").strip(),
            "venta_26": round(vf),
            "margen": round(cf / vf * 100, 1) if vf > 0 else 0.0,
            "n_skus": int(ns),
        })

    # Top SKUs en esta categoría
    cur.execute(f"""
        SELECT CODIGO, MAX(DESCRIPCION) AS desc_prod,
               SUM(CAST(VENTA AS float)) AS v26,
               SUM(CAST(CONTRIBUCION AS float)) AS c26,
               COUNT(DISTINCT RUT) AS n_cli
        FROM BI_TOTAL_FACTURA
        WHERE VENDEDOR = '{ZONA}' AND ANO = 2026 AND MES IN ({ml})
          AND {_EXCL_COD} AND {_CAT_CASE} = '{cat_clean}'
        GROUP BY CODIGO
        ORDER BY v26 DESC
    """)
    top_skus = []
    for cod, desc, v, c, nc in cur.fetchall():
        vf = float(v or 0); cf = float(c or 0)
        top_skus.append({
            "codigo": str(cod or "").strip(),
            "descripcion": str(desc or "").strip(),
            "venta_26": round(vf),
            "margen": round(cf / vf * 100, 1) if vf > 0 else 0.0,
            "n_clientes": int(nc),
        })

    conn.close()
    return {"cat": cat_clean, "top_clientes": top_clientes, "top_skus": top_skus}
