"""
Pickle cache manager + in-memory TTL cache for fast API responses.
"""
import os
import json
import time
import pickle
import pandas as pd
from datetime import datetime

# ═══ In-memory TTL cache ═══
# Stores API responses so repeated requests don't hit the DB.
# Invalidated by clear_mem_cache() (called from refresh button).

_mem_cache: dict[str, tuple[float, object]] = {}   # key → (timestamp, data)
_TTL = 900  # 15 minutes


def mem_get(key: str) -> object | None:
    """Return cached value if still fresh, else None."""
    entry = _mem_cache.get(key)
    if entry is None:
        return None
    ts, data = entry
    if time.time() - ts > _TTL:
        del _mem_cache[key]
        return None
    return data


def mem_set(key: str, data: object) -> None:
    """Store value in memory cache."""
    _mem_cache[key] = (time.time(), data)


def clear_mem_cache() -> None:
    """Invalidate all in-memory cache (called on data refresh)."""
    _mem_cache.clear()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def save_cache(name: str, df: pd.DataFrame):
    path = os.path.join(DATA_DIR, f"df_{name}.pkl")
    df.to_pickle(path)


def load_cache(name: str) -> pd.DataFrame:
    path = os.path.join(DATA_DIR, f"df_{name}.pkl")
    try:
        return pd.read_pickle(path)
    except Exception:
        return pd.DataFrame()


def save_json_cache(name: str, data: dict):
    path = os.path.join(DATA_DIR, f"{name}.json")
    with open(path, "w") as f:
        json.dump(data, f)


def load_json_cache(name: str) -> dict:
    path = os.path.join(DATA_DIR, f"{name}.json")
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def save_last_update():
    path = os.path.join(DATA_DIR, "last_update.txt")
    ts = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    with open(path, "w") as f:
        f.write(ts)
    return ts


def load_last_update() -> str:
    path = os.path.join(DATA_DIR, "last_update.txt")
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return "—"
