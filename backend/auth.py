"""
Authentication system — JWT tokens + JSON-based user storage with per-module access control.
Roles: superadmin (full access + user management), admin, gerente, viewer.
"""
import os
import json
import hashlib
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv("SECRET_KEY", "LBF_ANALYTICS_2026_SECRET_KEY_CHANGE_IN_PROD")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Module registry ──────────────────────────────────────────────────────────
ALL_MODULES = [
    "dashboard",
    "televentas",
    "zona",
    "clientes",
    "categoria",
    "mercado",
    "facturacion",
    "stock",
    "mercado_publico",
    "ma",
]

MODULE_LABELS = {
    "dashboard": "Panel Principal",
    "televentas": "Televentas",
    "zona": "KAM",
    "clientes": "Clientes",
    "categoria": "MultiProducto",
    "mercado": "Análisis de Mercado",
    "facturacion": "Adj. vs Facturado",
    "stock": "Inventario",
    "mercado_publico": "Mercado Publico",
    "ma": "M&A Targets",
}

# ── User storage (JSON file) ─────────────────────────────────────────────────
_USERS_PATH = os.path.join(os.path.dirname(__file__), "data", "users.json")


def _hash_pw(password: str) -> str:
    return hashlib.sha256((password + SECRET_KEY).encode()).hexdigest()


def _default_users() -> dict:
    """Seed users — created on first run."""
    return {
        "daraya": {
            "password_hash": _hash_pw("Lbf2026#"),
            "role": "superadmin",
            "display_name": "Diego Araya",
            "cargo": "Administrador BI",
            "modules": list(ALL_MODULES),
            "active": True,
        },
        "daraya@lbf.cl": {
            "password_hash": _hash_pw("Lbf2026#"),
            "role": "superadmin",
            "display_name": "Diego Araya",
            "cargo": "Administrador BI",
            "modules": list(ALL_MODULES),
            "active": True,
        },
        "fgonzales": {
            "password_hash": _hash_pw("Lbf2026*"),
            "role": "gerente",
            "display_name": "Felipe Gonzales",
            "cargo": "Gerente Comercial",
            "modules": list(ALL_MODULES),
            "active": True,
        },
    }


def _load_users() -> dict:
    """Load users from JSON file. Creates default file if missing."""
    if os.path.exists(_USERS_PATH):
        with open(_USERS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    # First run — seed default users
    users = _default_users()
    _save_users(users)
    return users


def _save_users(users: dict):
    os.makedirs(os.path.dirname(_USERS_PATH), exist_ok=True)
    with open(_USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


# ── Auth functions ────────────────────────────────────────────────────────────

def verify_password(plain: str, stored_hash: str) -> bool:
    return _hash_pw(plain) == stored_hash


def authenticate_user(username: str, password: str) -> dict | None:
    users = _load_users()
    user = users.get(username)
    if not user or not verify_password(password, user["password_hash"]):
        return None
    if not user.get("active", True):
        return None
    return {"username": username, **user}


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    users = _load_users()
    user = users.get(username)
    if user is None or not user.get("active", True):
        raise credentials_exception
    return {"username": username, **user}


def require_superadmin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that ensures the current user is a superadmin."""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Acceso denegado — se requiere rol superadmin")
    return current_user


# ── User CRUD (called from routes) ───────────────────────────────────────────

def list_users() -> list[dict]:
    """Return all users (without password hashes)."""
    users = _load_users()
    result = []
    for username, data in users.items():
        result.append({
            "username": username,
            "display_name": data.get("display_name", ""),
            "role": data.get("role", "viewer"),
            "cargo": data.get("cargo", ""),
            "modules": data.get("modules", []),
            "active": data.get("active", True),
        })
    return result


def create_user(username: str, password: str, display_name: str,
                role: str, modules: list[str], cargo: str = "") -> dict:
    users = _load_users()
    if username in users:
        raise HTTPException(status_code=400, detail=f"El usuario '{username}' ya existe")
    # Validate modules
    valid_modules = [m for m in modules if m in ALL_MODULES]
    users[username] = {
        "password_hash": _hash_pw(password),
        "role": role,
        "display_name": display_name,
        "cargo": cargo,
        "modules": valid_modules,
        "active": True,
    }
    _save_users(users)
    return {"username": username, "display_name": display_name,
            "role": role, "cargo": cargo, "modules": valid_modules, "active": True}


def update_user(username: str, display_name: str | None = None,
                role: str | None = None, modules: list[str] | None = None,
                password: str | None = None, active: bool | None = None,
                cargo: str | None = None) -> dict:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"Usuario '{username}' no encontrado")
    user = users[username]
    if display_name is not None:
        user["display_name"] = display_name
    if role is not None:
        user["role"] = role
    if cargo is not None:
        user["cargo"] = cargo
    if modules is not None:
        user["modules"] = [m for m in modules if m in ALL_MODULES]
    if password:
        user["password_hash"] = _hash_pw(password)
    if active is not None:
        user["active"] = active
    _save_users(users)
    return {"username": username, "display_name": user["display_name"],
            "role": user["role"], "cargo": user.get("cargo", ""),
            "modules": user.get("modules", []),
            "active": user.get("active", True)}


def delete_user(username: str):
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"Usuario '{username}' no encontrado")
    del users[username]
    _save_users(users)


# ── Usage tracking ──────────────────────────────────────────────────────────

_USAGE_PATH = os.path.join(os.path.dirname(__file__), "data", "usage.json")

# Module mapping from URL path to module name
_PATH_TO_MODULE = {
    "/api/dashboard": "dashboard",
    "/api/resumen": "dashboard",
    "/api/zona": "zona",
    "/api/oportunidades": "zona",
    "/api/categoria": "categoria",
    "/api/multiproducto": "categoria",
    "/api/televentas": "televentas",
    "/api/clientes": "clientes",
    "/api/mercado-publico": "mercado_publico",
    "/api/mercado": "mercado",
    "/api/facturacion": "facturacion",
    "/api/stock": "stock",
    "/api/ma": "ma",
}


def _load_usage() -> dict:
    if os.path.exists(_USAGE_PATH):
        try:
            with open(_USAGE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_usage(usage: dict):
    os.makedirs(os.path.dirname(_USAGE_PATH), exist_ok=True)
    with open(_USAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(usage, f, ensure_ascii=False, indent=2)


def track_request(username: str, path: str):
    """Record a user request. Aggregates by user → date → module."""
    today = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Determine module from path
    module = None
    for prefix, mod in _PATH_TO_MODULE.items():
        if path.startswith(prefix):
            module = mod
            break
    if not module:
        return  # Don't track auth/health/refresh

    usage = _load_usage()
    if username not in usage:
        usage[username] = {"requests": {}, "last_active": now, "total": 0}

    user_usage = usage[username]
    user_usage["last_active"] = now
    user_usage["total"] = user_usage.get("total", 0) + 1

    # Daily breakdown
    if today not in user_usage["requests"]:
        user_usage["requests"][today] = {}
    day = user_usage["requests"][today]
    day[module] = day.get(module, 0) + 1

    # Keep only last 30 days
    dates = sorted(user_usage["requests"].keys())
    if len(dates) > 30:
        for old_date in dates[:-30]:
            del user_usage["requests"][old_date]

    _save_usage(usage)


def get_usage_stats() -> list[dict]:
    """Return usage stats per user for the admin dashboard."""
    usage = _load_usage()
    users = _load_users()
    today = datetime.now().strftime("%Y-%m-%d")

    stats = []
    for username, data in users.items():
        u = usage.get(username, {})
        requests = u.get("requests", {})

        # Total requests
        total = u.get("total", 0)

        # Requests today
        today_reqs = sum(requests.get(today, {}).values()) if today in requests else 0

        # Requests last 7 days
        week_total = 0
        for i in range(7):
            d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            week_total += sum(requests.get(d, {}).values())

        # Most used modules
        module_totals: dict[str, int] = {}
        for day_data in requests.values():
            for mod, count in day_data.items():
                module_totals[mod] = module_totals.get(mod, 0) + count
        top_modules = sorted(module_totals.items(), key=lambda x: -x[1])[:5]

        # Days active (unique days with requests)
        days_active = len(requests)

        # Daily trend (last 14 days)
        trend = []
        for i in range(13, -1, -1):
            d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            trend.append({
                "date": d,
                "requests": sum(requests.get(d, {}).values()),
            })

        stats.append({
            "username": username,
            "display_name": data.get("display_name", ""),
            "cargo": data.get("cargo", ""),
            "role": data.get("role", ""),
            "active": data.get("active", True),
            "last_active": u.get("last_active"),
            "total_requests": total,
            "requests_today": today_reqs,
            "requests_week": week_total,
            "days_active": days_active,
            "top_modules": [{"module": m, "label": MODULE_LABELS.get(m, m), "count": c} for m, c in top_modules],
            "trend": trend,
        })

    # Sort by most active
    stats.sort(key=lambda s: -s["total_requests"])
    return stats
