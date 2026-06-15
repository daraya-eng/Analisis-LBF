"""
Carga la hoja Base de LBF_Licitaciones_Oferta_Rechazada (1).xlsx
a la tabla [rechazos] en la base BI (192.0.0.48).
"""
import sys
import math
sys.path.insert(0, r"C:\Users\comer\lbf-analytics\backend")

import pandas as pd
from db import get_conn

EXCEL = r"C:\Users\comer\Proyecto Dash\LBF_Licitaciones_Oferta_Rechazada (1).xlsx"

# ── Leer Excel ────────────────────────────────────────────────────────────────
df = pd.read_excel(EXCEL, sheet_name="Base", header=0)
print(f"Leídas {len(df)} filas, {len(df.columns)} columnas")
print("Columnas:", list(df.columns))

# ── Limpiar nombres de columnas ───────────────────────────────────────────────
col_map = {
    df.columns[0]:  "usuario",
    df.columns[1]:  "licitacion_id",
    df.columns[2]:  "mar_25",
    df.columns[3]:  "abr_25",
    df.columns[4]:  "may_25",
    df.columns[5]:  "jun_25",
    df.columns[6]:  "jul_25",
    df.columns[7]:  "ago_25",
    df.columns[8]:  "sept_25",
    df.columns[9]:  "nov_25",
    df.columns[10]: "dic_25",
    df.columns[11]: "total_2025",
    df.columns[12]: "ene_26",
    df.columns[13]: "feb_26",
    df.columns[14]: "mar_26",
    df.columns[15]: "abr_26",
    df.columns[16]: "may_26",
    df.columns[17]: "total_2026",
    df.columns[18]: "total_general",
    df.columns[19]: "motivo_rechazo",
    df.columns[20]: "responsable",
}
df = df.rename(columns=col_map)

# ── Limpiar valores monetarios (pueden venir como float o como string) ────────
MONEY_COLS = ["mar_25","abr_25","may_25","jun_25","jul_25","ago_25",
              "sept_25","nov_25","dic_25","total_2025",
              "ene_26","feb_26","mar_26","abr_26","may_26",
              "total_2026","total_general"]

def safe_int(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return 0 if (math.isnan(v) if isinstance(v, float) else False) else int(round(v))
    s = str(v).strip().replace("$","").replace(" ","").replace(".","").replace(",","")
    if not s or s == "-":
        return 0
    try:
        return int(float(s))
    except Exception:
        return 0

for col in MONEY_COLS:
    df[col] = df[col].apply(safe_int)

df["usuario"]        = df["usuario"].fillna("").astype(str).str.strip()
df["licitacion_id"]  = df["licitacion_id"].fillna("").astype(str).str.strip()
df["motivo_rechazo"] = df["motivo_rechazo"].fillna("").astype(str).str.strip()
df["responsable"]    = df["responsable"].fillna("").astype(str).str.strip()

# Filtrar filas vacías (sin licitacion_id)
df = df[df["licitacion_id"] != ""]
print(f"Filas limpias a insertar: {len(df)}")

# ── Crear tabla y cargar ──────────────────────────────────────────────────────
conn = get_conn()
cur  = conn.cursor()

cur.execute("IF OBJECT_ID('rechazos','U') IS NOT NULL DROP TABLE rechazos")

cur.execute("""
CREATE TABLE rechazos (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    usuario        NVARCHAR(150),
    licitacion_id  NVARCHAR(50),
    mar_25         BIGINT DEFAULT 0,
    abr_25         BIGINT DEFAULT 0,
    may_25         BIGINT DEFAULT 0,
    jun_25         BIGINT DEFAULT 0,
    jul_25         BIGINT DEFAULT 0,
    ago_25         BIGINT DEFAULT 0,
    sept_25        BIGINT DEFAULT 0,
    nov_25         BIGINT DEFAULT 0,
    dic_25         BIGINT DEFAULT 0,
    total_2025     BIGINT DEFAULT 0,
    ene_26         BIGINT DEFAULT 0,
    feb_26         BIGINT DEFAULT 0,
    mar_26         BIGINT DEFAULT 0,
    abr_26         BIGINT DEFAULT 0,
    may_26         BIGINT DEFAULT 0,
    total_2026     BIGINT DEFAULT 0,
    total_general  BIGINT DEFAULT 0,
    motivo_rechazo NVARCHAR(500),
    responsable    NVARCHAR(100)
)
""")

INSERT_SQL = """
INSERT INTO rechazos
  (usuario, licitacion_id,
   mar_25, abr_25, may_25, jun_25, jul_25, ago_25, sept_25, nov_25, dic_25, total_2025,
   ene_26, feb_26, mar_26, abr_26, may_26, total_2026, total_general,
   motivo_rechazo, responsable)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

rows_inserted = 0
for _, row in df.iterrows():
    cur.execute(INSERT_SQL, (
        row["usuario"], row["licitacion_id"],
        row["mar_25"], row["abr_25"], row["may_25"], row["jun_25"],
        row["jul_25"], row["ago_25"], row["sept_25"], row["nov_25"],
        row["dic_25"], row["total_2025"],
        row["ene_26"], row["feb_26"], row["mar_26"], row["abr_26"],
        row["may_26"], row["total_2026"], row["total_general"],
        row["motivo_rechazo"], row["responsable"],
    ))
    rows_inserted += 1

conn.commit()
cur.close()
conn.close()
print(f"✓ Tabla [rechazos] creada con {rows_inserted} filas en BD BI")
