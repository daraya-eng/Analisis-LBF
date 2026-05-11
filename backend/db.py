"""
Database connection management.
Credentials loaded from environment or fallback to defaults.
Uses a simple Queue-based pool for SQL Server connection reuse.
"""
import os
import datetime
import queue
import pyodbc

# ── Feriados chilenos 2025-2027 ──────────────────────────────────────
# Fuente: Ley 2.977 + modificaciones. Actualizar anualmente.
FERIADOS_CL: set[datetime.date] = {
    # 2025
    datetime.date(2025, 1, 1),   # Año Nuevo
    datetime.date(2025, 4, 18),  # Viernes Santo
    datetime.date(2025, 4, 19),  # Sábado Santo
    datetime.date(2025, 5, 1),   # Día del Trabajador
    datetime.date(2025, 5, 21),  # Glorias Navales
    datetime.date(2025, 6, 20),  # Día Nacional de los Pueblos Indígenas
    datetime.date(2025, 6, 29),  # San Pedro y San Pablo
    datetime.date(2025, 7, 16),  # Virgen del Carmen
    datetime.date(2025, 8, 15),  # Asunción de la Virgen
    datetime.date(2025, 9, 18),  # Independencia Nacional
    datetime.date(2025, 9, 19),  # Glorias del Ejército
    datetime.date(2025, 10, 13), # Encuentro de Dos Mundos (Oct 12 domingo → lunes)
    datetime.date(2025, 10, 31), # Día Iglesias Evangélicas
    datetime.date(2025, 11, 1),  # Día de Todos los Santos
    datetime.date(2025, 12, 8),  # Inmaculada Concepción
    datetime.date(2025, 12, 25), # Navidad
    # 2026
    datetime.date(2026, 1, 1),   # Año Nuevo
    datetime.date(2026, 4, 3),   # Viernes Santo
    datetime.date(2026, 4, 4),   # Sábado Santo
    datetime.date(2026, 5, 1),   # Día del Trabajador
    datetime.date(2026, 5, 21),  # Glorias Navales
    datetime.date(2026, 6, 21),  # Día Nacional de los Pueblos Indígenas
    datetime.date(2026, 6, 29),  # San Pedro y San Pablo
    datetime.date(2026, 7, 16),  # Virgen del Carmen
    datetime.date(2026, 8, 15),  # Asunción de la Virgen
    datetime.date(2026, 9, 18),  # Independencia Nacional
    datetime.date(2026, 9, 19),  # Glorias del Ejército
    datetime.date(2026, 10, 12), # Encuentro de Dos Mundos
    datetime.date(2026, 11, 1),  # Día de Todos los Santos
    datetime.date(2026, 12, 8),  # Inmaculada Concepción
    datetime.date(2026, 12, 25), # Navidad
    # 2027
    datetime.date(2027, 1, 1),   # Año Nuevo
    datetime.date(2027, 3, 26),  # Viernes Santo
    datetime.date(2027, 3, 27),  # Sábado Santo
    datetime.date(2027, 5, 1),   # Día del Trabajador
    datetime.date(2027, 5, 21),  # Glorias Navales
    datetime.date(2027, 6, 21),  # Día Nacional de los Pueblos Indígenas
    datetime.date(2027, 6, 28),  # San Pedro y San Pablo (Jun 29 martes → lunes)
    datetime.date(2027, 7, 16),  # Virgen del Carmen
    datetime.date(2027, 8, 15),  # Asunción de la Virgen (domingo → lunes)
    datetime.date(2027, 9, 18),  # Independencia Nacional
    datetime.date(2027, 9, 19),  # Glorias del Ejército (sábado → no traslado)
    datetime.date(2027, 10, 12), # Encuentro de Dos Mundos
    datetime.date(2027, 11, 1),  # Día de Todos los Santos
    datetime.date(2027, 12, 8),  # Inmaculada Concepción
    datetime.date(2027, 12, 25), # Navidad
}

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


def calc_dias_habiles(meses: list[int], ano: int) -> tuple[int, int, int]:
    """Shared utility — (habiles_transcurridos, habiles_restantes, habiles_totales).
    Excluye fines de semana y feriados chilenos. El lunes usa el viernes anterior."""
    import calendar as _cal
    ref = ref_date()
    habiles_transcurridos = 0
    habiles_totales = 0
    for m in meses:
        for d in range(1, _cal.monthrange(ano, m)[1] + 1):
            dt = datetime.date(ano, m, d)
            if dt.weekday() < 5 and dt not in FERIADOS_CL:
                habiles_totales += 1
                if dt <= ref:
                    habiles_transcurridos += 1
    return habiles_transcurridos, habiles_totales - habiles_transcurridos, habiles_totales


def ref_date() -> datetime.date:
    """Fecha de corte para datos: el lunes usa el viernes anterior (semana cerrada).
    El resto de la semana usa ayer (datos del SP que corre a las 6am)."""
    today = datetime.date.today()
    if today.weekday() == 0:  # Lunes → viernes anterior
        return today - datetime.timedelta(days=3)
    return today - datetime.timedelta(days=1)


def filtro_guias() -> str:
    """Solo incluye GF del mes actual hasta ref_date Y cuyo GUIA_NUM aparece en
    vw_guias_por_facturar en la fecha de corte (ref_date). Esto replica el criterio de
    Power BI: solo guías pendientes al cierre del último día hábil, sin acumular
    guías de días anteriores que ya fueron resueltas."""
    t = datetime.date.today()
    ref = ref_date()
    return (
        f"(DOC_CODE <> 'GF' OR "
        f"(ANO = {t.year} AND MES = {t.month} AND CAST(DIA AS date) <= '{ref}' "
        f"AND TRY_CAST(GUIA_NUM AS bigint) IN "
        f"(SELECT DISTINCT guia_num FROM vw_guias_por_facturar "
        f"WHERE CAST(fecha AS date) = '{ref}')))"
    )


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
