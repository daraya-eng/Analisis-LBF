# -*- coding: utf-8 -*-
from db import get_conn

conn = get_conn()
cur = conn.cursor()

# 1. Instituciones con licitacion LBF que compran CM a competidor
print("=== Instituciones con licitacion LBF que compran CM a competidor ===")
cur.execute("""
    WITH lbf_licit AS (
        SELECT DISTINCT rut_cliente, nombre_cliente
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE EsLBF = 1
    ),
    cm_competidor AS (
        SELECT rut,
               COUNT(DISTINCT oc) AS ocs,
               SUM(CAST(total_producto AS bigint)) AS monto
        FROM vw_CM_Falcon
        WHERE proveedor <> 'Comercial Lbf Limitada'
          AND YEAR(fecha_envio) >= 2024
        GROUP BY rut
    )
    SELECT TOP 15
        l.nombre_cliente, l.rut_cliente,
        c.ocs, c.monto
    FROM lbf_licit l
    INNER JOIN cm_competidor c ON c.rut = l.rut_cliente
    ORDER BY c.monto DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[2]} OCs competidor CM, ${r[3]:,.0f}")

# 2. Competidores CM en instituciones donde LBF tiene licitacion
print("\n=== Competidores CM en instituciones LBF ===")
cur.execute("""
    WITH instituciones_lbf AS (
        SELECT DISTINCT rut_cliente
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE EsLBF = 1
    )
    SELECT TOP 15
        cm.proveedor,
        COUNT(DISTINCT cm.rut) AS instituciones,
        COUNT(DISTINCT cm.oc) AS ocs,
        SUM(CAST(cm.total_producto AS bigint)) AS monto
    FROM vw_CM_Falcon cm
    INNER JOIN instituciones_lbf i ON cm.rut = i.rut_cliente
    WHERE cm.proveedor <> 'Comercial Lbf Limitada'
      AND YEAR(cm.fecha_envio) >= 2024
    GROUP BY cm.proveedor
    ORDER BY monto DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} instituc, {r[2]} OCs, ${r[3]:,.0f}")

# 3. Market share LBF en CM 2025+
print("\n=== Market share CM 2025+ ===")
cur.execute("""
    SELECT
        CASE WHEN proveedor = 'Comercial Lbf Limitada' THEN 'LBF' ELSE 'Otros' END AS quien,
        COUNT(DISTINCT oc) AS ocs,
        SUM(CAST(total_producto AS bigint)) AS monto
    FROM vw_CM_Falcon
    WHERE YEAR(fecha_envio) >= 2025
    GROUP BY CASE WHEN proveedor = 'Comercial Lbf Limitada' THEN 'LBF' ELSE 'Otros' END
""")
total_mkt = 0
rows = cur.fetchall()
for r in rows:
    total_mkt += r[2]
for r in rows:
    pct = r[2] / total_mkt * 100 if total_mkt > 0 else 0
    print(f"  {r[0]}: {r[1]} OCs, ${r[2]:,.0f} ({pct:.1f}%)")

# 4. Tipos producto donde LBF vende en CM
print("\n=== Tipos producto LBF en CM ===")
cur.execute("""
    SELECT TOP 10 tipo, COUNT(*) AS n, SUM(CAST(total_producto AS bigint)) AS monto
    FROM vw_CM_Falcon
    WHERE proveedor = 'Comercial Lbf Limitada'
      AND YEAR(fecha_envio) >= 2024
    GROUP BY tipo
    ORDER BY monto DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} OCs, ${r[2]:,.0f}")

# 5. Instituciones que compran a LBF por CM
print("\n=== Top instituciones que compran LBF por CM ===")
cur.execute("""
    SELECT TOP 10 comprador, rut,
           COUNT(DISTINCT oc) AS ocs,
           SUM(CAST(total_producto AS bigint)) AS monto
    FROM vw_CM_Falcon
    WHERE proveedor = 'Comercial Lbf Limitada'
      AND YEAR(fecha_envio) >= 2024
    GROUP BY comprador, rut
    ORDER BY monto DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[2]} OCs, ${r[3]:,.0f}")

# 6. Cruce: misma institucion, LBF en licitacion, competidor en CM con productos similares
print("\n=== Cruce: LBF licita + competidor vende CM en misma institucion (por tipo producto) ===")
cur.execute("""
    WITH lbf_lic_tipos AS (
        SELECT DISTINCT rut_cliente, nombre_cliente, DescripcionMaestro
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE EsLBF = 1 AND DescripcionMaestro IS NOT NULL AND DescripcionMaestro <> ''
    )
    SELECT TOP 15
        l.nombre_cliente,
        cm.proveedor,
        cm.tipo AS tipo_cm,
        l.DescripcionMaestro AS tipo_licitacion,
        COUNT(DISTINCT cm.oc) AS ocs_cm,
        SUM(CAST(cm.total_producto AS bigint)) AS monto_cm
    FROM vw_CM_Falcon cm
    INNER JOIN lbf_lic_tipos l ON cm.rut = l.rut_cliente
    WHERE cm.proveedor <> 'Comercial Lbf Limitada'
      AND YEAR(cm.fecha_envio) >= 2024
    GROUP BY l.nombre_cliente, cm.proveedor, cm.tipo, l.DescripcionMaestro
    HAVING SUM(CAST(cm.total_producto AS bigint)) > 10000000
    ORDER BY monto_cm DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]} | Competidor: {r[1]} | CM:{r[2]} | Lic:{r[3]} | {r[4]} OCs ${r[5]:,.0f}")

conn.close()
