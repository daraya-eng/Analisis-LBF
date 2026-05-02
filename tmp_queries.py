import pyodbc
import pandas as pd

conn_str = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=192.0.0.48;DATABASE=BI;UID=daraya;PWD=Dar4y4$+;"
    "TrustServerCertificate=yes;Encrypt=yes;MARS_Connection=yes;"
)

conn = pyodbc.connect(conn_str)

queries = [
    ("1. All columns in vw_LICITACIONES_CATEGORIZADAS",
     """SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'vw_LICITACIONES_CATEGORIZADAS' ORDER BY COLUMN_NAME"""),

    ("2. TIPO distinct values and counts in vw_LICITACIONES_CATEGORIZADAS",
     "SELECT TOP 20 TIPO, COUNT(*) as cnt FROM vw_LICITACIONES_CATEGORIZADAS GROUP BY TIPO ORDER BY cnt DESC"),

    ("3. OCOMPRA in BI_TOTAL_FACTURA - distinct values sample",
     "SELECT TOP 20 OCOMPRA, COUNT(*) as cnt FROM BI_TOTAL_FACTURA WHERE OCOMPRA IS NOT NULL AND OCOMPRA != '' GROUP BY OCOMPRA ORDER BY cnt DESC"),

    ("4. TIPO_OC in BI_TOTAL_FACTURA - distinct values",
     "SELECT TOP 20 TIPO_OC, COUNT(*) as cnt FROM BI_TOTAL_FACTURA GROUP BY TIPO_OC ORDER BY cnt DESC"),

    ("5. Sample rows from BI_TOTAL_FACTURA with OCOMPRA",
     """SELECT TOP 10 RUT, NOMBRE, CODIGO, OCOMPRA, TIPO_OC, LICITACION, VENTA, DIA
        FROM BI_TOTAL_FACTURA
        WHERE OCOMPRA IS NOT NULL AND OCOMPRA != ''
        ORDER BY DIA DESC"""),

    ("6. Sample adjudicado rows from vw_LICITACIONES_CATEGORIZADAS",
     """SELECT TOP 10 licitacion, rut_cliente, nombre_cliente, TIPO, estado, EsLBF, monto_licitacion
        FROM vw_LICITACIONES_CATEGORIZADAS
        WHERE EsLBF = 1 AND estado = 'Adjudicado'"""),

    ("7. Relationship TIPO x estado in vw_LICITACIONES_CATEGORIZADAS (EsLBF=1)",
     """SELECT TOP 20 TIPO, estado, COUNT(*) as cnt
        FROM vw_LICITACIONES_CATEGORIZADAS WHERE EsLBF = 1
        GROUP BY TIPO, estado ORDER BY cnt DESC"""),

    ("8. Can LICITACION link the two tables? Sample from BI_TOTAL_FACTURA",
     """SELECT TOP 10 LICITACION, COUNT(*) as cnt
        FROM BI_TOTAL_FACTURA WHERE LICITACION IS NOT NULL AND LICITACION != ''
        GROUP BY LICITACION ORDER BY cnt DESC"""),
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
        pd.set_option('display.max_colwidth', 60)
        pd.set_option('display.width', 200)
        print(df.to_string(index=False))
        print(f"\n({len(df)} rows)\n")
    except Exception as e:
        print(f"ERROR: {e}\n")

conn.close()
print("Done.")
