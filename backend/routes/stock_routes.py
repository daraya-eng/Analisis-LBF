"""
Stock & Ventas Perdidas — Inventario actual + quiebres de stock.
Fuentes (vistas en BI que leen de DWLBF):
  - vw_stock_actual: stock diario por producto (dw_stock_ubicacion)
  - vw_ventas_perdidas: notas de venta no despachadas (dw_no_fueron_venta)
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from auth import get_current_user
from db import get_conn, hoy
from cache import mem_get, mem_set

router = APIRouter()


@router.get("/")
async def get_stock_resumen(current_user: dict = Depends(get_current_user)):
    """Stock actual por categoría + resumen de ventas perdidas 2026."""
    cached = mem_get("stock:resumen")
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()
    h = hoy()

    # ── 1. Stock actual por categoría ──
    cur.execute("""
        SELECT categoria,
               COUNT(DISTINCT codigo_producto) AS articulos,
               SUM(stock_unidades) AS unidades,
               fecha_snapshot
        FROM vw_stock_actual
        GROUP BY categoria, fecha_snapshot
        ORDER BY SUM(stock_unidades) DESC
    """)
    cols = [d[0] for d in cur.description]
    stock_cat = []
    fecha_stock = None
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        if fecha_stock is None:
            fecha_stock = str(row["fecha_snapshot"])
        row["fecha_snapshot"] = str(row["fecha_snapshot"])
        row["unidades"] = int(row["unidades"] or 0)
        row["articulos"] = int(row["articulos"] or 0)
        stock_cat.append(row)

    total_articulos = sum(r["articulos"] for r in stock_cat)
    total_unidades = sum(r["unidades"] for r in stock_cat)

    # ── 2. Ventas perdidas 2026 resumen ──
    cur.execute(f"""
        SELECT clasificacion,
               COUNT(*) AS registros,
               SUM(monto_perdido) AS total_perdido,
               COUNT(DISTINCT codigo_producto) AS productos_afectados,
               COUNT(DISTINCT rut_cliente) AS clientes_afectados
        FROM vw_ventas_perdidas
        WHERE YEAR(fecha_documento) = {h['ano']}
        GROUP BY clasificacion
    """)
    cols2 = [d[0] for d in cur.description]
    vp_resumen = []
    for r in cur.fetchall():
        row = dict(zip(cols2, r))
        row["total_perdido"] = int(row["total_perdido"] or 0)
        row["registros"] = int(row["registros"])
        row["productos_afectados"] = int(row["productos_afectados"])
        row["clientes_afectados"] = int(row["clientes_afectados"])
        vp_resumen.append(row)

    # ── 3. Ventas perdidas por mes (2026) ──
    cur.execute(f"""
        SELECT MONTH(fecha_documento) AS mes,
               clasificacion,
               COUNT(*) AS registros,
               SUM(monto_perdido) AS total_perdido
        FROM vw_ventas_perdidas
        WHERE YEAR(fecha_documento) = {h['ano']}
        GROUP BY MONTH(fecha_documento), clasificacion
        ORDER BY MONTH(fecha_documento)
    """)
    cols3 = [d[0] for d in cur.description]
    vp_mensual = []
    for r in cur.fetchall():
        row = dict(zip(cols3, r))
        row["total_perdido"] = int(row["total_perdido"] or 0)
        vp_mensual.append(row)

    conn.close()

    result = {
        "stock": {
            "fecha_snapshot": fecha_stock,
            "total_articulos": total_articulos,
            "total_unidades": total_unidades,
            "por_categoria": stock_cat,
        },
        "ventas_perdidas": {
            "ano": h["ano"],
            "resumen": vp_resumen,
            "mensual": vp_mensual,
        },
    }
    mem_set("stock:resumen", result)
    return result


@router.get("/detalle")
async def get_stock_detalle(
    categoria: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Detalle de stock por producto, con filtro opcional de categoría."""
    cache_key = f"stock:detalle:{categoria or 'all'}"
    cached = mem_get(cache_key)
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()

    where = ""
    if categoria:
        where = f"WHERE categoria = '{categoria}'"

    cur.execute(f"""
        SELECT codigo_producto, descripcion, categoria,
               SUM(stock_unidades) AS stock_unidades,
               SUM(n_ubicaciones) AS n_ubicaciones,
               fecha_snapshot
        FROM vw_stock_actual
        {where}
        GROUP BY codigo_producto, descripcion, categoria, fecha_snapshot
        ORDER BY SUM(stock_unidades) DESC
    """)
    cols = [d[0] for d in cur.description]
    rows = []
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        row["fecha_snapshot"] = str(row["fecha_snapshot"])
        row["stock_unidades"] = int(row["stock_unidades"] or 0)
        row["n_ubicaciones"] = int(row["n_ubicaciones"] or 0)
        rows.append(row)

    conn.close()
    result = {"productos": rows}
    mem_set(cache_key, result)
    return result


@router.get("/quiebres")
async def get_quiebres(
    categoria: Optional[str] = Query(None),
    mes: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Top productos con quiebre de stock, con filtro por categoría y mes."""
    cache_key = f"stock:quiebres:{categoria or 'all'}:{mes or 'all'}"
    cached = mem_get(cache_key)
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()
    h = hoy()

    filters = [
        f"YEAR(nfv.fecha_documento) = {h['ano']}",
        "nfv.clasificacion = 'Quiebre'",
    ]
    if categoria:
        filters.append(f"sa.categoria = '{categoria}'")
    if mes:
        filters.append(f"MONTH(nfv.fecha_documento) = {mes}")

    where = " AND ".join(filters)

    cur.execute(f"""
        SELECT
            nfv.codigo_producto,
            nfv.descripcion_producto,
            sa.categoria,
            COUNT(*) AS veces_quiebre,
            SUM(nfv.monto_perdido) AS total_perdido,
            COALESCE(sa.stock_unidades, 0) AS stock_actual
        FROM vw_ventas_perdidas nfv
        LEFT JOIN (
            SELECT codigo_producto, categoria, SUM(stock_unidades) AS stock_unidades
            FROM vw_stock_actual
            GROUP BY codigo_producto, categoria
        ) sa ON sa.codigo_producto = nfv.codigo_producto
        WHERE {where}
        GROUP BY nfv.codigo_producto, nfv.descripcion_producto, sa.categoria, sa.stock_unidades
        ORDER BY SUM(nfv.monto_perdido) DESC
    """)
    cols = [d[0] for d in cur.description]
    rows = []
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        row["total_perdido"] = int(row["total_perdido"] or 0)
        row["stock_actual"] = int(row["stock_actual"] or 0)
        row["veces_quiebre"] = int(row["veces_quiebre"])
        rows.append(row)

    conn.close()
    result = {"quiebres": rows, "ano": h["ano"]}
    mem_set(cache_key, result)
    return result


@router.get("/quiebres-stats")
async def get_quiebres_stats(current_user: dict = Depends(get_current_user)):
    """Estadísticas de quiebres por mes y categoría para gráficos."""
    cached = mem_get("stock:quiebres-stats")
    if cached:
        return cached

    conn = get_conn()
    cur = conn.cursor()
    h = hoy()

    # Quiebres por mes × categoría
    cur.execute(f"""
        SELECT
            MONTH(nfv.fecha_documento) AS mes,
            COALESCE(sa.categoria, 'Otro') AS categoria,
            COUNT(*) AS registros,
            SUM(nfv.monto_perdido) AS total_perdido,
            COUNT(DISTINCT nfv.codigo_producto) AS productos
        FROM vw_ventas_perdidas nfv
        LEFT JOIN (
            SELECT DISTINCT codigo_producto, categoria FROM vw_stock_actual
        ) sa ON sa.codigo_producto = nfv.codigo_producto
        WHERE YEAR(nfv.fecha_documento) = {h['ano']}
          AND nfv.clasificacion = 'Quiebre'
        GROUP BY MONTH(nfv.fecha_documento), COALESCE(sa.categoria, 'Otro')
        ORDER BY MONTH(nfv.fecha_documento), COALESCE(sa.categoria, 'Otro')
    """)
    cols = [d[0] for d in cur.description]
    por_mes_cat = []
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        row["total_perdido"] = int(row["total_perdido"] or 0)
        por_mes_cat.append(row)

    # Top 10 clientes con más quiebres
    cur.execute(f"""
        SELECT TOP 10
            nfv.nombre_cliente,
            nfv.vendedor,
            COUNT(*) AS registros,
            SUM(nfv.monto_perdido) AS total_perdido,
            COUNT(DISTINCT nfv.codigo_producto) AS productos
        FROM vw_ventas_perdidas nfv
        WHERE YEAR(nfv.fecha_documento) = {h['ano']}
          AND nfv.clasificacion = 'Quiebre'
        GROUP BY nfv.nombre_cliente, nfv.vendedor
        ORDER BY SUM(nfv.monto_perdido) DESC
    """)
    cols2 = [d[0] for d in cur.description]
    top_clientes = []
    for r in cur.fetchall():
        row = dict(zip(cols2, r))
        row["total_perdido"] = int(row["total_perdido"] or 0)
        top_clientes.append(row)

    conn.close()
    result = {"por_mes_cat": por_mes_cat, "top_clientes": top_clientes, "ano": h["ano"]}
    mem_set("stock:quiebres-stats", result)
    return result


@router.get("/quiebres-detalle")
async def get_quiebres_detalle(
    codigo: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Detalle de un producto con quiebre: cada evento con cliente, fecha, monto."""
    conn = get_conn()
    cur = conn.cursor()
    h = hoy()

    cur.execute(f"""
        SELECT nota_venta, rut_cliente, nombre_cliente, vendedor,
               fecha_documento, cantidad_pendiente, precio_unitario,
               monto_perdido, stock_al_momento, clasificacion
        FROM vw_ventas_perdidas
        WHERE codigo_producto = ?
          AND YEAR(fecha_documento) = {h['ano']}
        ORDER BY fecha_documento DESC
    """, codigo)
    cols = [d[0] for d in cur.description]
    rows = []
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        row["fecha_documento"] = str(row["fecha_documento"])[:10] if row["fecha_documento"] else None
        row["monto_perdido"] = int(row["monto_perdido"] or 0)
        row["cantidad_pendiente"] = int(row["cantidad_pendiente"] or 0)
        row["precio_unitario"] = int(row["precio_unitario"] or 0)
        row["stock_al_momento"] = int(row["stock_al_momento"] or 0)
        rows.append(row)

    conn.close()
    return {"eventos": rows}
