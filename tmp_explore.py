import pyodbc
import pandas as pd

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=192.0.0.48;DATABASE=BI;UID=daraya;PWD=Dar4y4$+;"
    "TrustServerCertificate=yes;Encrypt=yes;MARS_Connection=yes;"
)

queries = [
    ("1. Count by AnioMes (TOP 30)", """
SELECT TOP 30 AnioMes, COUNT(*) as cnt
FROM vw_LICITACIONES_CATEGORIZADAS
GROUP BY AnioMes ORDER BY AnioMes DESC
"""),
    ("2. Licitaciones vigentes LBF adjudicadas (TOP 10 por fecha_termino)", """
SELECT TOP 10 licitacion, nombre_cliente, fecha_termino, estado, EsLBF,
    TRY_CAST(monto_licitacion AS bigint) as monto
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE EsLBF = 1 AND estado = 'Adjudicado' AND fecha_termino IS NOT NULL
ORDER BY fecha_termino DESC
"""),
    ("3. Distribución fecha_termino (vigentes vs vencidas)", """
SELECT
    SUM(CASE WHEN TRY_CAST(fecha_termino AS date) >= '2026-04-12' THEN 1 ELSE 0 END) as vigentes,
    SUM(CASE WHEN TRY_CAST(fecha_termino AS date) < '2026-04-12' THEN 1 ELSE 0 END) as vencidas,
    SUM(CASE WHEN fecha_termino IS NULL THEN 1 ELSE 0 END) as sin_fecha
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE EsLBF = 1 AND estado = 'Adjudicado'
"""),
    ("4. Clientes únicos (total, LBF, competencia)", """
SELECT COUNT(DISTINCT rut_cliente) as total_clientes,
       COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN rut_cliente END) as clientes_lbf,
       COUNT(DISTINCT CASE WHEN EsLBF = 0 AND estado = 'Adjudicado' THEN rut_cliente END) as clientes_competencia
FROM vw_LICITACIONES_CATEGORIZADAS
"""),
    ("5. FFVV_ZONA values (TOP 20)", """
SELECT TOP 20 FFVV_ZONA, COUNT(DISTINCT rut_cliente) as n_clientes, COUNT(DISTINCT licitacion) as n_lic
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE estado = 'Adjudicado'
GROUP BY FFVV_ZONA
ORDER BY n_lic DESC
"""),
    ("6. Columnas tipo vendedor/kam/zona/region", """
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'vw_LICITACIONES_CATEGORIZADAS'
AND (COLUMN_NAME LIKE '%vend%' OR COLUMN_NAME LIKE '%kam%' OR COLUMN_NAME LIKE '%zona%' OR COLUMN_NAME LIKE '%region%' OR COLUMN_NAME LIKE '%ejecut%')
ORDER BY COLUMN_NAME
"""),
    ("7. Oportunidades Q1 2026 (competencia sin LBF)", """
SELECT COUNT(*) as total,
    COUNT(DISTINCT CASE WHEN EsLBF = 0 AND estado = 'Adjudicado' THEN rut_cliente END) as cli_comp_solo
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE AnioMes >= '2026-01' AND AnioMes <= '2026-03'
  AND estado = 'Adjudicado'
  AND NOT EXISTS (
      SELECT 1 FROM vw_LICITACIONES_CATEGORIZADAS l2
      WHERE l2.EsLBF = 1 AND l2.estado = 'Adjudicado'
        AND l2.rut_cliente = vw_LICITACIONES_CATEGORIZADAS.rut_cliente
        AND l2.AnioMes >= '2026-01' AND l2.AnioMes <= '2026-03'
  )
"""),
    ("8. Top 20 nombre_cliente por # licitaciones", """
SELECT TOP 20 nombre_cliente, COUNT(DISTINCT licitacion) as n_lic
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE estado = 'Adjudicado'
GROUP BY nombre_cliente
ORDER BY n_lic DESC
"""),
    ("9. Columnas tipo motivo/razón/causa/obs", """
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'vw_LICITACIONES_CATEGORIZADAS'
AND (COLUMN_NAME LIKE '%motiv%' OR COLUMN_NAME LIKE '%razon%' OR COLUMN_NAME LIKE '%causa%' OR COLUMN_NAME LIKE '%obs%')
"""),
    ("10. Todas las columnas de la vista", """
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'vw_LICITACIONES_CATEGORIZADAS'
ORDER BY ORDINAL_POSITION
"""),
    ("11. LBF participaciones por estado", """
SELECT estado, COUNT(*) as cnt,
    SUM(TRY_CAST(monto_licitacion AS bigint)) as monto_total
FROM vw_LICITACIONES_CATEGORIZADAS
WHERE EsLBF = 1
GROUP BY estado
"""),
    ("12. Licitaciones distintas: total vs LBF vs ganadas", """
SELECT
    COUNT(DISTINCT licitacion) as total_lic,
    COUNT(DISTINCT CASE WHEN EsLBF = 1 THEN licitacion END) as lic_con_lbf,
    COUNT(DISTINCT CASE WHEN EsLBF = 1 AND estado = 'Adjudicado' THEN licitacion END) as lic_ganadas_lbf
FROM vw_LICITACIONES_CATEGORIZADAS
"""),
]

for title, sql in queries:
    print("=" * 80)
    print(title)
    print("=" * 80)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        df = pd.DataFrame.from_records(rows, columns=cols)
        pd.set_option('display.max_columns', 20)
        pd.set_option('display.width', 200)
        pd.set_option('display.max_colwidth', 60)
        print(df.to_string(index=False))
    except Exception as e:
        print(f"ERROR: {e}")
    print()

conn.close()
print("Done.")
