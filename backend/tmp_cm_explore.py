from db import get_conn
import pandas as pd

conn = get_conn()
cur = conn.cursor()

# 1. Structure of vw_CM_Falcon
print("=== vw_CM_Falcon COLUMNS ===")
cur.execute("SELECT TOP 0 * FROM vw_CM_Falcon")
cols = [d[0] for d in cur.description]
for c in cols:
    print(f"  {c}")

# 2. Sample data from vw_CM_Falcon
print("\n=== vw_CM_Falcon SAMPLE (5 rows) ===")
cur.execute("SELECT TOP 5 * FROM vw_CM_Falcon")
rows = cur.fetchall()
for r in rows:
    print(dict(zip(cols, r)))

# 3. Row count
cur.execute("SELECT COUNT(*) FROM vw_CM_Falcon")
print(f"\nvw_CM_Falcon total rows: {cur.fetchone()[0]}")

# 4. Structure of Consolidado_CM
print("\n=== Consolidado_CM COLUMNS ===")
try:
    cur.execute("SELECT TOP 0 * FROM Consolidado_CM")
    cols2 = [d[0] for d in cur.description]
    for c in cols2:
        print(f"  {c}")
    cur.execute("SELECT COUNT(*) FROM Consolidado_CM")
    print(f"\nConsolidado_CM total rows: {cur.fetchone()[0]}")

    # Min/max dates
    cur.execute("""
        SELECT MIN(FechaEnvioOC) AS min_fecha, MAX(FechaEnvioOC) AS max_fecha
        FROM Consolidado_CM
    """)
    r = cur.fetchone()
    print(f"Consolidado_CM date range: {r[0]} to {r[1]}")
except Exception as e:
    print(f"Error: {e}")

# 5. Check if there's an existing SP for this
print("\n=== EXISTING PROCEDURES with 'CM' or 'Consolidado' ===")
cur.execute("""
    SELECT name FROM sys.procedures
    WHERE name LIKE '%CM%' OR name LIKE '%Consolidado%' OR name LIKE '%Falcon%'
    ORDER BY name
""")
for r in cur.fetchall():
    print(f"  {r[0]}")

# 6. Check vw_CM_Falcon date range
print("\n=== vw_CM_Falcon date range ===")
try:
    cur.execute("SELECT MIN(FechaEnvioOC) AS min_fecha, MAX(FechaEnvioOC) AS max_fecha FROM vw_CM_Falcon")
    r = cur.fetchone()
    print(f"Date range: {r[0]} to {r[1]}")
except:
    # Try other date columns
    cur.execute("SELECT TOP 0 * FROM vw_CM_Falcon")
    date_cols = [d[0] for d in cur.description if 'fecha' in d[0].lower() or 'date' in d[0].lower()]
    print(f"Date columns found: {date_cols}")
    for dc in date_cols:
        cur.execute(f"SELECT MIN([{dc}]) AS mn, MAX([{dc}]) AS mx FROM vw_CM_Falcon")
        r = cur.fetchone()
        print(f"  {dc}: {r[0]} to {r[1]}")

# 7. Check key columns for dedup
print("\n=== vw_CM_Falcon potential key columns ===")
try:
    cur.execute("""
        SELECT TOP 0 * FROM vw_CM_Falcon
    """)
    all_cols = [d[0] for d in cur.description]
    id_cols = [c for c in all_cols if 'id' in c.lower() or 'codigo' in c.lower() or 'oc' in c.lower() or 'orden' in c.lower() or 'licitacion' in c.lower()]
    print(f"Potential key columns: {id_cols}")
    for ic in id_cols[:5]:
        cur.execute(f"SELECT COUNT(DISTINCT [{ic}]) FROM vw_CM_Falcon")
        print(f"  {ic} distinct values: {cur.fetchone()[0]}")
except Exception as e:
    print(f"Error: {e}")

# 8. Check licitaciones view structure for cross-reference
print("\n=== vw_LICITACIONES_CATEGORIZADAS key columns ===")
cur.execute("SELECT TOP 0 * FROM vw_LICITACIONES_CATEGORIZADAS")
lic_cols = [d[0] for d in cur.description]
print("Columns:", lic_cols)

# 9. Check if there are common fields between CM and licitaciones (rut, nombre_empresa, etc.)
print("\n=== Common fields analysis ===")
cm_cols_lower = {c.lower(): c for c in cols}
lic_cols_lower = {c.lower(): c for c in lic_cols}
common = set(cm_cols_lower.keys()) & set(lic_cols_lower.keys())
print(f"Common column names: {common}")

# 10. Sample CM data with key fields
print("\n=== vw_CM_Falcon key data sample ===")
cur.execute("SELECT TOP 10 * FROM vw_CM_Falcon")
key_data = cur.fetchall()
for r in key_data:
    d = dict(zip(cols, r))
    # Print a subset of interesting fields
    interesting = {k: v for k, v in d.items() if any(x in k.lower() for x in ['rut', 'nombre', 'empresa', 'proveedor', 'producto', 'monto', 'fecha', 'estado', 'oc', 'id', 'licitacion', 'comprador', 'institucion'])}
    print(interesting)

conn.close()
