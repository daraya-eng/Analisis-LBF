"""
LBF Advanced Analytics — FastAPI Backend
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
import threading
import time as _time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from jose import JWTError, jwt
from routes import auth_routes, dashboard_routes, zona_routes, categoria_routes, resumen_routes, televentas_routes, multiproducto_routes, clientes_routes, mercado_routes, facturacion_routes, stock_routes, mercado_publico_routes, ma_routes, oportunidades_routes, guantes_routes, e1_routes, incentivos_routes, maestro_mp_routes, pm_routes, renasys_routes, kam_maule_routes, mercados_relevantes_routes
from auth import get_current_user, track_request, SECRET_KEY, ALGORITHM
from cache import clear_mem_cache

logger = logging.getLogger("uvicorn.error")

def _warm_cache():
    """Pre-load heavy endpoints into memory cache. All warm-ups run in parallel."""
    warmups = {
        "resumen_all":          _warm_resumen,
        "dashboard":            _warm_dashboard,
        "zona":                 _warm_zona,
        "televentas":           _warm_televentas,
        "maestro_mp":           _warm_maestro_mp,
        "mercados_relevantes":  _warm_mercados_relevantes,
        "kam_maule":            _warm_kam_maule,
        "pm":                   _warm_pm,
    }

    def _run_one(name, fn):
        try:
            t0 = _time.time()
            fn()
            logger.info(f"[WARM-UP] {name} cargado en {_time.time() - t0:.1f}s")
        except Exception as e:
            logger.warning(f"[WARM-UP] {name} fallo: {e}")

    threads = [threading.Thread(target=_run_one, args=(name, fn), daemon=True)
               for name, fn in warmups.items()]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


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
    from db import hoy, MESES_NOMBRE
    h = hoy()
    _MES = h["mes"]
    raw = None

    # Warm up YTD
    ck_ytd = "dashboard:ytd:None:None:None"
    if not mem_get(ck_ytd):
        raw = dashboard_routes._load_dashboard_raw()
        result = dashboard_routes._build_for_period(raw, list(range(1, _MES + 1)))
        result["periodo"] = "ytd"
        result["label"] = "YTD"
        mem_set(ck_ytd, result)

    # Warm up current month (default view in frontend)
    ck_mes = f"dashboard:mes:{_MES}:None:None"
    if not mem_get(ck_mes):
        if raw is None:
            raw = dashboard_routes._load_dashboard_raw()
        result = dashboard_routes._build_for_period(raw, [_MES])
        result["periodo"] = "mes"
        result["label"] = MESES_NOMBRE[_MES]
        mem_set(ck_mes, result)


def _warm_zona():
    from cache import mem_get, mem_set
    from db import hoy, MESES_NOMBRE
    # Pre-build VENDEDOR map so drill-downs use exact equality (no LIKE scan)
    zona_routes._get_vendedor_map()
    h = hoy()
    _MES = h["mes"]

    # Warm up YTD
    ck_ytd = "zona:ytd:None"
    if not mem_get(ck_ytd):
        meses = list(range(1, _MES + 1))
        data = zona_routes._load_zona_data(meses)
        data["periodo"] = "ytd"
        data["label"] = "YTD"
        mem_set(ck_ytd, data)

    # Warm up current month (default view in frontend)
    ck_mes = f"zona:mes:{_MES}"
    if not mem_get(ck_mes):
        data = zona_routes._load_zona_data([_MES])
        data["periodo"] = "mes"
        data["label"] = MESES_NOMBRE[_MES]
        mem_set(ck_mes, data)


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


def _warm_mercados_relevantes():
    from cache import mem_get, mem_set
    from db import get_conn
    import traceback

    def _run(ck, sql):
        if mem_get(ck):
            return
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        conn.close()
        mem_set(ck, rows)

    _run(
        "mercados_relevantes:lic_lbf_dw_raw",
        "SELECT YEAR(FechaCierre) AS ano, ISNULL(Tipo,'(sin tipo)') AS tipo,"
        " COUNT(DISTINCT Codigo) AS total_lics,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' THEN Codigo END) AS lics_adj,"
        " COUNT(DISTINCT CASE WHEN ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS total_items,"
        " COUNT(DISTINCT CASE WHEN Ofertaseleccionada='Seleccionada' AND ISNULL(ValorTotalOfertado,0)>0"
        "   THEN CONCAT(CAST(Codigo AS VARCHAR),CAST(CodigoItem AS VARCHAR)) END) AS items_adj,"
        " SUM(CAST(ISNULL(ValorTotalOfertado,0) AS FLOAT)) AS monto_ofertado,"
        " SUM(CAST(ISNULL(MontoLineaAdjudica,0) AS FLOAT)) AS monto_adjudicado"
        " FROM DWLBF.dbo.dw_datos_abiertos_licitaciones"
        " WHERE RutProveedor='93.366.000-1' AND FechaCierre IS NOT NULL"
        "   AND YEAR(FechaCierre) IN (2025,2026)"
        " GROUP BY YEAR(FechaCierre), ISNULL(Tipo,'(sin tipo)')"
        " ORDER BY ano, monto_ofertado DESC"
    )


def _warm_maestro_mp():
    from cache import mem_get, mem_set
    ano = 2026
    ck_lid = f"maestro_mp:liderazgo:{ano}"
    ck_opp = f"maestro_mp:oportunidades:{ano}"
    if not mem_get(ck_lid):
        data = maestro_mp_routes._load_liderazgo(ano)
        mem_set(ck_lid, data)
    if not mem_get(ck_opp):
        data = maestro_mp_routes._load_oportunidades(ano)
        mem_set(ck_opp, data)


def _warm_kam_maule():
    from cache import mem_get, mem_set
    from db import hoy
    ck = "kam_maule:resumen"
    if mem_get(ck):
        return
    h = hoy()
    meses = list(range(1, h["mes"] + 1))
    data = kam_maule_routes._load_data(meses)
    mem_set(ck, data)


def _warm_pm():
    from cache import mem_get
    ck = "pm:resumen:::"
    if mem_get(ck):
        return
    pm_routes._load_pm()  # caches result internally


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
app.include_router(maestro_mp_routes.router, prefix="/api/maestro-mp", tags=["maestro_mp"])
app.include_router(pm_routes.router, prefix="/api/pm", tags=["pm"])
app.include_router(renasys_routes.router, prefix="/api/renasys", tags=["renasys"])
app.include_router(kam_maule_routes.router, prefix="/api/kam-maule", tags=["kam_maule"])
app.include_router(mercados_relevantes_routes.router, prefix="/api/mercados-relevantes", tags=["mercados_relevantes"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "LBF Advanced Analytics"}


@app.get("/api/info")
async def info(current_user: dict = Depends(get_current_user)):
    """Retorna fecha de última actualización de BD y fecha de corte de datos."""
    import datetime
    from db import get_conn, ref_date
    rd = ref_date()
    fecha_sp = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT TOP 1 FechaActualizacion FROM Fecha_Actualizacion_BI ORDER BY FechaActualizacion DESC")
        row = cur.fetchone()
        if row and row[0]:
            fecha_sp = row[0].strftime("%d/%m/%Y %H:%M")
        conn.close()
    except Exception:
        pass
    dias_es = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    return {
        "fecha_sp":    fecha_sp or "—",
        "fecha_datos": rd.strftime("%d/%m/%Y"),
        "dia_datos":   dias_es[rd.weekday()],
        "es_lunes":    datetime.date.today().weekday() == 0,
    }


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
