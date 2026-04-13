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
]

MODULE_LABELS = {
    "dashboard": "Panel Principal",
    "televentas": "Televentas",
    "zona": "KAM",
    "clientes": "Clientes",
    "categoria": "MultiProducto",
    "mercado": "Análisis de Mercado",
    "facturacion": "Adj. vs Facturado",
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
            "modules": list(ALL_MODULES),
            "active": True,
        },
        "daraya@lbf.cl": {
            "password_hash": _hash_pw("Lbf2026#"),
            "role": "superadmin",
            "display_name": "Diego Araya",
            "modules": list(ALL_MODULES),
            "active": True,
        },
        "fgonzales": {
            "password_hash": _hash_pw("Lbf2026*"),
            "role": "gerente",
            "display_name": "Felipe Gonzales",
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
            "modules": data.get("modules", []),
            "active": data.get("active", True),
        })
    return result


def create_user(username: str, password: str, display_name: str,
                role: str, modules: list[str]) -> dict:
    users = _load_users()
    if username in users:
        raise HTTPException(status_code=400, detail=f"El usuario '{username}' ya existe")
    # Validate modules
    valid_modules = [m for m in modules if m in ALL_MODULES]
    users[username] = {
        "password_hash": _hash_pw(password),
        "role": role,
        "display_name": display_name,
        "modules": valid_modules,
        "active": True,
    }
    _save_users(users)
    return {"username": username, "display_name": display_name,
            "role": role, "modules": valid_modules, "active": True}


def update_user(username: str, display_name: str | None = None,
                role: str | None = None, modules: list[str] | None = None,
                password: str | None = None, active: bool | None = None) -> dict:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"Usuario '{username}' no encontrado")
    user = users[username]
    if display_name is not None:
        user["display_name"] = display_name
    if role is not None:
        user["role"] = role
    if modules is not None:
        user["modules"] = [m for m in modules if m in ALL_MODULES]
    if password:
        user["password_hash"] = _hash_pw(password)
    if active is not None:
        user["active"] = active
    _save_users(users)
    return {"username": username, "display_name": user["display_name"],
            "role": user["role"], "modules": user.get("modules", []),
            "active": user.get("active", True)}


def delete_user(username: str):
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"Usuario '{username}' no encontrado")
    del users[username]
    _save_users(users)
