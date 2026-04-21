"""
Guantes EQM — Monitoreo de precios de guantes en Mercado Publico.
Compara precios de LBF vs competidores a nivel de transaccion individual
para detectar alzas que se ocultan en promedios ponderados.

Subcategorias: Guantes medicos y accesorios (nitrilo, latex quirurgico, examen)
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db_mp import get_pg_conn, MEDICAL_CAT
from cache import mem_get, mem_set

router = APIRouter()

LBF_RUT = "93.366.000-1"
_MONTO = "COALESCE(oi.monto_total, oi.cantidad * oi.precio_unitario, 0)"

# Filter: products with "guante" in name OR in medical gloves category
_GUANTE_FILTER = "(LOWER(oi.nombre) LIKE '%%guante%%' OR oi.categoria ILIKE '%%Guantes m_dicos%%')"

# Principales competidores a monitorear
COMPETIDORES = [
    "MADEGOM",
    "FLEXING",
    "REUTTER",
    "PRONOMED",
    "HOSPITALIA",
    "GBG",
    "AAFLEX",
    "NIMOBRU",
    "MUNNICH",
]

# Tipos de guante para clasificacion
TIPOS_GUANTE = {
    "nitrilo": "Nitrilo",
    "latex": "Latex Quirurgico",
    "examen": "Examen",
    "vinilo": "Vinilo",
}


def _classify_product(nombre: str) -> str:
    """Classify glove product by type based on name."""
    n = (nombre or "").lower()
    if "nitrilo" in n:
        return "Nitrilo"
    if "latex" in n and ("quirur" in n or "ester" in n):
        return "Latex Quirurgico"
    if "vinilo" in n:
        return "Vinilo"
    if "examen" in n or "exam" in n:
        return "Examen"
    if "quirur" in n:
        return "Quirurgico"
    return "Otro"


def _is_box_price(precio: float, cantidad: int, nombre: str) -> bool:
    """Heuristic: detect if price is per box (50-100 units) vs per unit."""
    # Prices above $1000 with small quantities are likely box pricing
    if precio > 1000 and cantidad <= 500:
        return True
    return False


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/resumen")
async def guantes_resumen(
    meses: int = Query(4, description="Meses hacia atras a analizar"),
    current_user: dict = Depends(get_current_user),
):
    """
    Resumen general: evolucion de precios por proveedor y tipo de guante.
    Muestra transacciones individuales, no promedios.
    """
    ck = f"guantes_resumen:{meses}"
    if cached := mem_get(ck):
        return cached

    today = date.today()
    desde = today.replace(day=1) - timedelta(days=(meses - 1) * 30)
    desde = desde.replace(day=1)

    conn = get_pg_conn()
    try:
        cur = conn.cursor()

        # 1. Evolucion mensual por proveedor (precio ponderado)
        cur.execute(f"""
            SELECT
                TO_CHAR(oc.fecha_envio, 'YYYY-MM') AS mes,
                oc.proveedor_nombre_empresa AS proveedor,
                SUM(oi.cantidad)::bigint AS unidades,
                SUM({_MONTO})::bigint AS monto,
                CASE WHEN SUM(oi.cantidad) > 0
                     THEN (SUM({_MONTO}) / SUM(oi.cantidad))::int
                     ELSE 0 END AS precio_prom,
                COUNT(DISTINCT oc.id) AS n_ocs
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.fecha_envio >= '{desde.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
            GROUP BY 1, 2
            ORDER BY 1, 4 DESC
        """)
        cols = [d[0] for d in cur.description]
        evol_rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        # 2. Transacciones individuales del mes actual y anterior (para detectar alzas)
        mes_actual = today.replace(day=1)
        mes_anterior = (mes_actual - timedelta(days=1)).replace(day=1)

        cur.execute(f"""
            SELECT
                oc.fecha_envio::date AS fecha,
                oc.proveedor_nombre_empresa AS proveedor,
                oi.nombre AS producto,
                oi.cantidad::int AS cantidad,
                ({_MONTO})::bigint AS monto,
                CASE WHEN oi.cantidad > 0
                     THEN ({_MONTO} / oi.cantidad)::int
                     ELSE 0 END AS precio_unit,
                oc.comprador_nombre_organismo AS comprador,
                oi.unidad
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.fecha_envio >= '{mes_anterior.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
            ORDER BY oc.fecha_envio DESC, ({_MONTO}) DESC
            LIMIT 2000
        """)
        cols2 = [d[0] for d in cur.description]
        txn_rows = [dict(zip(cols2, r)) for r in cur.fetchall()]

        # Classify products
        for row in txn_rows:
            row["tipo"] = _classify_product(row["producto"])
            row["fecha"] = str(row["fecha"])

        # 3. Deteccion de alzas: mismo producto/proveedor con precio > baseline
        cur.execute(f"""
            WITH baseline AS (
                SELECT
                    oc.proveedor_nombre_empresa AS proveedor,
                    oi.nombre AS producto,
                    (SUM({_MONTO}) / NULLIF(SUM(oi.cantidad), 0))::int AS precio_base,
                    SUM(oi.cantidad)::bigint AS qty_base
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE {_GUANTE_FILTER}
                  AND oc.fecha_envio >= '{desde.isoformat()}'
                  AND oc.fecha_envio < '{mes_anterior.isoformat()}'
                  AND oi.cantidad > 0
                  AND {_MONTO} > 0
                GROUP BY 1, 2
                HAVING SUM(oi.cantidad) >= 50
            ),
            reciente AS (
                SELECT
                    oc.proveedor_nombre_empresa AS proveedor,
                    oi.nombre AS producto,
                    oc.fecha_envio::date AS fecha,
                    oi.cantidad::int AS cantidad,
                    CASE WHEN oi.cantidad > 0
                         THEN ({_MONTO} / oi.cantidad)::int
                         ELSE 0 END AS precio_unit,
                    oc.comprador_nombre_organismo AS comprador
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE {_GUANTE_FILTER}
                  AND oc.fecha_envio >= '{mes_anterior.isoformat()}'
                  AND oi.cantidad > 0
                  AND {_MONTO} > 0
            )
            SELECT
                r.proveedor,
                r.producto,
                r.fecha,
                r.cantidad,
                r.precio_unit,
                b.precio_base,
                ROUND((r.precio_unit::numeric / b.precio_base - 1) * 100, 1) AS pct_alza,
                r.comprador
            FROM reciente r
            JOIN baseline b ON b.proveedor = r.proveedor AND b.producto = r.producto
            WHERE r.precio_unit > b.precio_base * 1.15
              AND r.precio_unit < b.precio_base * 5
            ORDER BY pct_alza DESC
            LIMIT 200
        """)
        cols3 = [d[0] for d in cur.description]
        alzas = [dict(zip(cols3, r)) for r in cur.fetchall()]
        for row in alzas:
            row["fecha"] = str(row["fecha"])
            row["pct_alza"] = float(row["pct_alza"])

        # 4. Posicion LBF vs mercado
        cur.execute(f"""
            SELECT
                TO_CHAR(oc.fecha_envio, 'YYYY-MM') AS mes,
                SUM(oi.cantidad)::bigint AS unidades,
                SUM({_MONTO})::bigint AS monto,
                CASE WHEN SUM(oi.cantidad) > 0
                     THEN (SUM({_MONTO}) / SUM(oi.cantidad))::int
                     ELSE 0 END AS precio_prom,
                COUNT(DISTINCT oc.id) AS n_ocs
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.proveedor_rut = '{LBF_RUT}'
              AND oc.fecha_envio >= '{desde.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
            GROUP BY 1
            ORDER BY 1
        """)
        cols4 = [d[0] for d in cur.description]
        lbf_evol = [dict(zip(cols4, r)) for r in cur.fetchall()]

    finally:
        conn.close()

    result = {
        "evolucion": evol_rows,
        "transacciones": txn_rows,
        "alzas": alzas,
        "lbf": lbf_evol,
        "desde": desde.isoformat(),
        "hasta": today.isoformat(),
    }
    mem_set(ck, result)
    return result


@router.get("/producto")
async def guantes_por_producto(
    tipo: str = Query("nitrilo", description="nitrilo|latex|examen|vinilo|todos"),
    meses: int = Query(4),
    current_user: dict = Depends(get_current_user),
):
    """
    Precio por producto especifico — transaccion a transaccion.
    Permite ver alzas individuales sin promediar.
    """
    ck = f"guantes_prod:{tipo}:{meses}"
    if cached := mem_get(ck):
        return cached

    today = date.today()
    desde = today.replace(day=1) - timedelta(days=(meses - 1) * 30)
    desde = desde.replace(day=1)

    tipo_filter = ""
    if tipo != "todos":
        tipo_filter = f"AND LOWER(oi.nombre) ILIKE '%%{tipo}%%'"

    conn = get_pg_conn()
    try:
        cur = conn.cursor()

        # Transacciones individuales con filtro de tipo
        cur.execute(f"""
            SELECT
                oc.fecha_envio::date AS fecha,
                TO_CHAR(oc.fecha_envio, 'YYYY-MM') AS mes,
                oc.proveedor_nombre_empresa AS proveedor,
                oi.nombre AS producto,
                oi.cantidad::int AS cantidad,
                ({_MONTO})::bigint AS monto,
                CASE WHEN oi.cantidad > 0
                     THEN ({_MONTO} / oi.cantidad)::int
                     ELSE 0 END AS precio_unit,
                oc.comprador_nombre_organismo AS comprador,
                oi.unidad
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.fecha_envio >= '{desde.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
              {tipo_filter}
            ORDER BY oc.fecha_envio DESC
            LIMIT 3000
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            r["fecha"] = str(r["fecha"])
            r["tipo"] = _classify_product(r["producto"])

        # Evolucion mensual por proveedor para este tipo
        cur.execute(f"""
            SELECT
                TO_CHAR(oc.fecha_envio, 'YYYY-MM') AS mes,
                oc.proveedor_nombre_empresa AS proveedor,
                SUM(oi.cantidad)::bigint AS unidades,
                SUM({_MONTO})::bigint AS monto,
                CASE WHEN SUM(oi.cantidad) > 0
                     THEN (SUM({_MONTO}) / SUM(oi.cantidad))::int
                     ELSE 0 END AS precio_prom,
                COUNT(DISTINCT oc.id) AS n_ocs
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.fecha_envio >= '{desde.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
              {tipo_filter}
            GROUP BY 1, 2
            ORDER BY 1, 4 DESC
        """)
        cols2 = [d[0] for d in cur.description]
        evol = [dict(zip(cols2, r)) for r in cur.fetchall()]

    finally:
        conn.close()

    result = {
        "transacciones": rows,
        "evolucion": evol,
        "tipo": tipo,
        "desde": desde.isoformat(),
        "hasta": today.isoformat(),
    }
    mem_set(ck, result)
    return result


@router.get("/competidor")
async def guantes_competidor(
    proveedor: str = Query(..., description="Nombre del proveedor"),
    meses: int = Query(4),
    current_user: dict = Depends(get_current_user),
):
    """
    Detalle de un competidor especifico — todas sus transacciones de guantes.
    """
    ck = f"guantes_comp:{proveedor}:{meses}"
    if cached := mem_get(ck):
        return cached

    today = date.today()
    desde = today.replace(day=1) - timedelta(days=(meses - 1) * 30)
    desde = desde.replace(day=1)

    safe_prov = proveedor.replace("'", "''")

    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT
                oc.fecha_envio::date AS fecha,
                TO_CHAR(oc.fecha_envio, 'YYYY-MM') AS mes,
                oi.nombre AS producto,
                oi.cantidad::int AS cantidad,
                ({_MONTO})::bigint AS monto,
                CASE WHEN oi.cantidad > 0
                     THEN ({_MONTO} / oi.cantidad)::int
                     ELSE 0 END AS precio_unit,
                oc.comprador_nombre_organismo AS comprador,
                oi.unidad
            FROM ordenes_compra oc
            JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
            WHERE {_GUANTE_FILTER}
              AND oc.proveedor_nombre_empresa ILIKE '%%{safe_prov}%%'
              AND oc.fecha_envio >= '{desde.isoformat()}'
              AND oi.cantidad > 0
              AND {_MONTO} > 0
            ORDER BY oc.fecha_envio DESC
            LIMIT 500
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            r["fecha"] = str(r["fecha"])
            r["tipo"] = _classify_product(r["producto"])

    finally:
        conn.close()

    result = {"proveedor": proveedor, "transacciones": rows}
    mem_set(ck, result)
    return result


@router.get("/alertas")
async def guantes_alertas(
    umbral: int = Query(15, description="Porcentaje minimo de alza para alertar"),
    current_user: dict = Depends(get_current_user),
):
    """
    Alertas de alzas de precio: transacciones recientes donde el precio
    subio mas del umbral% vs el precio historico del mismo producto/proveedor.
    """
    ck = f"guantes_alertas:{umbral}"
    if cached := mem_get(ck):
        return cached

    today = date.today()
    mes_actual = today.replace(day=1)
    # Baseline: 2 meses atras
    baseline_desde = (mes_actual - timedelta(days=60)).replace(day=1)

    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"""
            WITH baseline AS (
                SELECT
                    oc.proveedor_nombre_empresa AS proveedor,
                    oi.nombre AS producto,
                    (SUM({_MONTO}) / NULLIF(SUM(oi.cantidad), 0))::int AS precio_base,
                    SUM(oi.cantidad)::bigint AS qty_base,
                    COUNT(DISTINCT oc.id) AS ocs_base
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE {_GUANTE_FILTER}
                  AND oc.fecha_envio >= '{baseline_desde.isoformat()}'
                  AND oc.fecha_envio < '{mes_actual.isoformat()}'
                  AND oi.cantidad > 0
                  AND {_MONTO} > 0
                GROUP BY 1, 2
                HAVING SUM(oi.cantidad) >= 20
            ),
            mes_actual AS (
                SELECT
                    oc.proveedor_nombre_empresa AS proveedor,
                    oi.nombre AS producto,
                    oc.fecha_envio::date AS fecha,
                    oi.cantidad::int AS cantidad,
                    CASE WHEN oi.cantidad > 0
                         THEN ({_MONTO} / oi.cantidad)::int
                         ELSE 0 END AS precio_unit,
                    oc.comprador_nombre_organismo AS comprador
                FROM ordenes_compra oc
                JOIN ordenes_compra_items oi ON oi.orden_compra_id = oc.id
                WHERE {_GUANTE_FILTER}
                  AND oc.fecha_envio >= '{mes_actual.isoformat()}'
                  AND oi.cantidad > 0
                  AND {_MONTO} > 0
            )
            SELECT
                m.proveedor,
                m.producto,
                m.fecha,
                m.cantidad,
                m.precio_unit,
                b.precio_base,
                ROUND((m.precio_unit::numeric / b.precio_base - 1) * 100, 1) AS pct_alza,
                m.comprador,
                b.qty_base,
                b.ocs_base
            FROM mes_actual m
            JOIN baseline b ON b.proveedor = m.proveedor AND b.producto = m.producto
            WHERE m.precio_unit > b.precio_base * (1 + {umbral}::numeric / 100)
              AND m.precio_unit < b.precio_base * 5
            ORDER BY pct_alza DESC
            LIMIT 100
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            r["fecha"] = str(r["fecha"])
            r["pct_alza"] = float(r["pct_alza"])
            r["tipo"] = _classify_product(r["producto"])

    finally:
        conn.close()

    result = {
        "alertas": rows,
        "umbral": umbral,
        "mes": mes_actual.isoformat(),
        "n_alertas": len(rows),
    }
    mem_set(ck, result)
    return result
