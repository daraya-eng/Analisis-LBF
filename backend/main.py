"""
LBF Advanced Analytics — FastAPI Backend
"""
import threading
import time as _time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from jose import JWTError, jwt
from routes import auth_routes, dashboard_routes, zona_routes, categoria_routes, resumen_routes, televentas_routes, multiproducto_routes, clientes_routes, mercado_routes, facturacion_routes, stock_routes, mercado_publico_routes, ma_routes, oportunidades_routes, guantes_routes, e1_routes, incentivos_routes
from auth import get_current_user, track_request, SECRET_KEY, ALGORITHM
from cache import clear_mem_cache

logger = logging.getLogger("uvicorn.error")

def _warm_cache():
    """Pre-load heavy endpoints into memory cache. Runs in background thread."""
    warmups = {
        "resumen_all": _warm_resumen,
        "dashboard": _warm_dashboard,
        "zona": _warm_zona,
        "televentas": _warm_televentas,
    }
    for name, fn in warmups.items():
        try:
            t0 = _time.time()
            fn()
            logger.info(f"[WARM-UP] {name} cargado en {_time.time() - t0:.1f}s")
        except Exception as e:
            logger.warning(f"[WARM-UP] {name} fallo: {e}")


def _warm_resumen():
    """Load resumen data into cache."""
    from cache import mem_get, mem_set
    ck = "resumen_all"
    if mem_get(ck):
        return
    kpis = resumen_routes._load_kpis_dashboard()
    df = resumen_routes._load_ppto_vs_venta_df()
    cat_data = resumen_routes._build_categoria_table(df) if not df.empty else []
    zona_data = resumen_routes._build_zona_table(df) if not df.empty else []
    result = {"kpis": kpis, "categoria": cat_data, "zona": zona_data}
    mem_set(ck, result)
    # Also cache individual endpoints
    mem_set("resumen_kpis", kpis)
    mem_set("resumen_categoria", {"data": cat_data})
    mem_set("resumen_zona", {"data": zona_data})


def _warm_dashboard():
    from cache import mem_get, mem_set
    from db import hoy
    _MES = hoy()["mes"]
    ck = "dashboard:ytd:None"
    if mem_get(ck):
        return
    meses = list(range(1, _MES + 1))
    raw = dashboard_routes._load_dashboard_raw()
    result = dashboard_routes._build_for_period(raw, meses)
    result["periodo"] = "ytd"
    result["label"] = f"YTD"
    mem_set(ck, result)


def _warm_zona():
    from cache import mem_get, mem_set
    from db import hoy
    _MES = hoy()["mes"]
    ck = "zona:ytd:None"
    if mem_get(ck):
        return
    meses = list(range(1, _MES + 1))
    data = zona_routes._load_zona_data(meses)
    data["periodo"] = "ytd"
    data["label"] = "YTD"
    mem_set(ck, data)


def _warm_televentas():
    from cache import mem_get, mem_set
    from db import hoy
    _MES = hoy()["mes"]
    ck = "televentas:ytd:None"
    if mem_get(ck):
        return
    meses = list(range(1, _MES + 1))
    data = televentas_routes._load_televentas_all(meses)
    data["periodo"] = "ytd"
    data["label"] = "YTD"
    mem_set(ck, data)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm cache in background thread
    t = threading.Thread(target=_warm_cache, daemon=True)
    t.start()
    logger.info("[STARTUP] Cache warm-up iniciado en background")
    yield
    # Shutdown
    logger.info("[SHUTDOWN] Servidor detenido")


app = FastAPI(title="LBF Advanced Analytics API", version="1.0.0", lifespan=lifespan)


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Track authenticated API requests for usage analytics."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Only track successful requests to data endpoints
        if response.status_code == 200 and request.url.path.startswith("/api/"):
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    token = auth_header[7:]
                    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                    username = payload.get("sub")
                    if username:
                        track_request(username, request.url.path)
                except JWTError:
                    pass
        return response


app.add_middleware(UsageTrackingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(dashboard_routes.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(zona_routes.router, prefix="/api/zona", tags=["zona"])
app.include_router(categoria_routes.router, prefix="/api/categoria", tags=["categoria"])
app.include_router(resumen_routes.router, prefix="/api/resumen", tags=["resumen"])
app.include_router(televentas_routes.router, prefix="/api/televentas", tags=["televentas"])
app.include_router(multiproducto_routes.router, prefix="/api/multiproducto", tags=["multiproducto"])
app.include_router(clientes_routes.router, prefix="/api/clientes", tags=["clientes"])
app.include_router(mercado_routes.router, prefix="/api/mercado", tags=["mercado"])
app.include_router(facturacion_routes.router, prefix="/api/facturacion", tags=["facturacion"])
app.include_router(stock_routes.router, prefix="/api/stock", tags=["stock"])
app.include_router(mercado_publico_routes.router, prefix="/api/mercado-publico", tags=["mercado_publico"])
app.include_router(ma_routes.router, prefix="/api/ma", tags=["ma"])
app.include_router(oportunidades_routes.router, prefix="/api/oportunidades", tags=["oportunidades"])
app.include_router(guantes_routes.router, prefix="/api/guantes", tags=["guantes"])
app.include_router(e1_routes.router, prefix="/api/e1", tags=["e1"])
app.include_router(incentivos_routes.router, prefix="/api/incentivos", tags=["incentivos"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "LBF Advanced Analytics"}


@app.post("/api/refresh")
async def refresh_cache(current_user: dict = Depends(get_current_user)):
    """Clear in-memory cache and re-warm heavy endpoints in background."""
    clear_mem_cache()
    t = threading.Thread(target=_warm_cache, daemon=True)
    t.start()
    return {"status": "ok", "message": "Cache cleared, re-warming in background"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
