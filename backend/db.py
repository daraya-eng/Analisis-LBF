"""
Database connection management.
Credentials loaded from environment or fallback to defaults.
"""
import os
import datetime
import pyodbc

CONN_STR = os.getenv("DB_CONN_STR", (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=192.0.0.48;DATABASE=BI;UID=daraya;PWD=Dar4y4$+;"
    "TrustServerCertificate=yes;Encrypt=yes;MARS_Connection=yes;"
))


def get_conn():
    return pyodbc.connect(CONN_STR, timeout=30)


# Vendedores y códigos a excluir (filtro canónico Power BI)
_VEND_EXCLUIR = [
    "89-FACTURACION MUESTRA Y U OBSEQU",
    "90-FACTURACION USO INTERNO",
    "96-FACTURACION FALTANTES",
    "97-DONACIONES",
    "98-FACTURACION OTROS CONCEPTOS",
    "99-FACTURACION MERMAS",
]
_COD_EXCLUIR = ("FLETE", "NINV", "SIN", "")

DW_FILTRO = (
    "VENDEDOR NOT IN ("
    + ",".join(f"'{v}'" for v in _VEND_EXCLUIR)
    + ") AND CODIGO NOT IN ("
    + ",".join(f"'{c}'" for c in _COD_EXCLUIR)
    + ")"
)

MESES_NOMBRE = {1:'Enero',2:'Febrero',3:'Marzo',4:'Abril',5:'Mayo',6:'Junio',
                7:'Julio',8:'Agosto',9:'Septiembre',10:'Octubre',11:'Noviembre',12:'Diciembre'}


def hoy():
    """Return today's date info — always fresh, never stale."""
    t = datetime.date.today()
    return {
        "ano": t.year,
        "mes": t.month,
        "hoy": t.isoformat(),
        "mes_nombre": MESES_NOMBRE[t.month],
        "mes_prefix": f"{t.year}-{t.month:02d}",
    }
