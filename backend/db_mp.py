"""
PostgreSQL connection for Mercado Publico database.
Uses ThreadedConnectionPool for connection reuse across requests.
"""
import os
import psycopg2
from psycopg2 import pool as pg_pool

PG_PARAMS = {
    "host": os.getenv("MP_DB_HOST", "89.117.72.251"),
    "port": int(os.getenv("MP_DB_PORT", "54329")),
    "database": os.getenv("MP_DB_NAME", "mercado_publico"),
    "user": os.getenv("MP_DB_USER", "daraya"),
    "password": os.getenv("MP_DB_PASS", "Daraya1003.,"),
}

# Medical supplies filter
MEDICAL_CAT = "Equipamiento y suministros m"
LBF_NAME = "%%lbf%%"

# Channel mapping
CHANNELS = {"se": "SE", "cm": "CM", "td": "TD"}

# ── Connection pool ──────────────────────────────────────────────────

_pg_poolobj = None


class _PooledPgConn:
    """Wraps psycopg2 connection so .close() returns it to the pool."""
    __slots__ = ("_conn", "_pool")

    def __init__(self, conn, pool):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_pool", pool)

    def close(self):
        conn = object.__getattribute__(self, "_conn")
        pool = object.__getattribute__(self, "_pool")
        try:
            conn.rollback()
            pool.putconn(conn)
        except Exception:
            try:
                pool.putconn(conn, close=True)
            except Exception:
                pass

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_conn"), name)


def get_pg_conn():
    global _pg_poolobj
    if _pg_poolobj is None:
        _pg_poolobj = pg_pool.ThreadedConnectionPool(
            2, 10, **PG_PARAMS, connect_timeout=30
        )
    try:
        raw = _pg_poolobj.getconn()
        return _PooledPgConn(raw, _pg_poolobj)
    except Exception:
        # Fallback: direct connection if pool fails
        return psycopg2.connect(**PG_PARAMS, connect_timeout=30)
