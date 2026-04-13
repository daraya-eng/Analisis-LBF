"""
Authentication routes — login, me, user management (superadmin only).
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional
from auth import (
    authenticate_user, create_access_token, get_current_user,
    require_superadmin, list_users, create_user, update_user, delete_user,
    ALL_MODULES, MODULE_LABELS,
)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


def _user_response(user: dict) -> dict:
    """Standard user payload for login/me responses."""
    return {
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "modules": user.get("modules", []),
    }


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.post("/login/json")
async def login_json(req: LoginRequest):
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return _user_response(current_user)


# ═══ User Management (superadmin only) ═══════════════════════════════════════

@router.get("/modules")
async def get_modules(current_user: dict = Depends(get_current_user)):
    """Return list of available modules with labels."""
    return {
        "modules": [{"id": m, "label": MODULE_LABELS.get(m, m)} for m in ALL_MODULES],
    }


@router.get("/users")
async def get_users(admin: dict = Depends(require_superadmin)):
    return {"users": list_users()}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "viewer"
    modules: list[str] = []


@router.post("/users")
async def post_user(req: CreateUserRequest, admin: dict = Depends(require_superadmin)):
    user = create_user(req.username, req.password, req.display_name, req.role, req.modules)
    return {"status": "ok", "user": user}


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    modules: Optional[list[str]] = None
    password: Optional[str] = None
    active: Optional[bool] = None


@router.put("/users/{username}")
async def put_user(username: str, req: UpdateUserRequest,
                   admin: dict = Depends(require_superadmin)):
    user = update_user(username, req.display_name, req.role,
                       req.modules, req.password, req.active)
    return {"status": "ok", "user": user}


@router.delete("/users/{username}")
async def del_user(username: str, admin: dict = Depends(require_superadmin)):
    # Prevent self-deletion
    delete_user(username)
    return {"status": "ok"}
