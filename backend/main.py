"""
LBF Advanced Analytics — FastAPI Backend
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from routes import auth_routes, dashboard_routes, zona_routes, categoria_routes, resumen_routes, televentas_routes, multiproducto_routes, clientes_routes, mercado_routes, facturacion_routes
from auth import get_current_user
from cache import clear_mem_cache

app = FastAPI(title="LBF Advanced Analytics API", version="1.0.0")

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


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "LBF Advanced Analytics"}


@app.post("/api/refresh")
async def refresh_cache(current_user: dict = Depends(get_current_user)):
    """Clear in-memory cache so next requests hit the DB fresh."""
    clear_mem_cache()
    return {"status": "ok", "message": "Cache cleared"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
