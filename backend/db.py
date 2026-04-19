"""
Database connection management.
Credentials loaded from environment or fallback to defaults.
Uses a simple Queue-based pool for SQL Server connection reuse.
"""
import os
import datetime
import queue
import pyodbc

CONN_STR = os.getenv("DB_CONN_STR", (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=192.0.0.48;DATABASE=BI;UID=daraya;PWD=Dar4y4$+;"
    "TrustServerCertificate=yes;Encrypt=yes;MARS_Connection=yes;"
))

# ── Connection pool ──────────────────────────────────────────────────

_sql_pool = queue.Queue(maxsize=5)


class _PooledSqlConn:
    """Wraps pyodbc connection so .close() returns it to the pool."""
    __slots__ = ("_conn", "_pool")

    def __init__(self, conn, pool):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_pool", pool)

    def close(self):
        conn = object.__getattribute__(self, "_conn")
        pool = object.__getattribute__(self, "_pool")
        try:
            pool.put_nowait(conn)
        except queue.Full:
            conn.close()

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_conn"), name)


def get_conn():
    # Try to reuse a pooled connection
    while True:
        try:
            conn = _sql_pool.get_nowait()
            try:
                conn.cursor().execute("SELECT 1").fetchone()
                return _PooledSqlConn(conn, _sql_pool)
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
        except queue.Empty:
            break
    return _PooledSqlConn(pyodbc.connect(CONN_STR, timeout=30), _sql_pool)


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
