"""
etl_mercado_publico.py
ETL: PostgreSQL (mercado_publico) → SQL Server BI

Extrae licitaciones de insumos médicos (categoria_nivel1 LIKE 'EQUIPAMIENTO%'),
las transforma y las carga en STG_MP_LICITACIONES / STG_MP_ITEMS en SQL Server.
Luego ejecuta SP_MERCADO_PUBLICO para construir las tablas BI finales.

Uso:
    python etl_mercado_publico.py                  # todos los años
    python etl_mercado_publico.py --anos 2025,2026 # años específicos

Requiere VPN activa (192.0.0.48 SQL Server + 89.117.72.251 PostgreSQL).
"""
import sys
import time
import logging
import argparse

import pyodbc
import psycopg2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

LBF_RUT  = "93.366.000-1"
CAT_LIKE = "EQUIPAMIENTO%"
BATCH    = 500   # filas por batch de insert en SQL Server

PG_PARAMS = {
    "host":     "89.117.72.251",
    "port":     54329,
    "database": "mercado_publico",
    "user":     "daraya",
    "password": "Daraya1003.,",
    "connect_timeout": 30,
}

SS_CONN = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=192.0.0.48;DATABASE=BI;UID=daraya;PWD=Dar4y4$+;"
    "TrustServerCertificate=yes;Encrypt=yes;"
)

# ── DDL staging ────────────────────────────────────────────────────────────────

DDL_STG_LIC = """
IF OBJECT_ID('dbo.STG_MP_LICITACIONES','U') IS NOT NULL DROP TABLE dbo.STG_MP_LICITACIONES;
CREATE TABLE dbo.STG_MP_LICITACIONES (
    Id                  int             NOT NULL,
    Codigo              nvarchar(50),
    Nombre              nvarchar(500),
    Tipo                nvarchar(10),
    Estado              nvarchar(100),
    FechaPublicacion    date,
    FechaAdjudicacion   date,
    Ano                 int,
    AnioMes             nvarchar(7),
    CompradorNombre     nvarchar(300),
    CompradorRutUnidad  nvarchar(20),
    CompradorRegion     nvarchar(100),
    CompradorComuna     nvarchar(100),
    MontoEstimado       decimal(18,2),
    CONSTRAINT PK_STG_MP_LIC PRIMARY KEY (Id)
);
"""

DDL_STG_ITEMS = """
IF OBJECT_ID('dbo.STG_MP_ITEMS','U') IS NOT NULL DROP TABLE dbo.STG_MP_ITEMS;
CREATE TABLE dbo.STG_MP_ITEMS (
    Id                  int             NOT NULL,
    LicitacionId        int             NOT NULL,
    CodigoMP            bigint,
    Nombre              nvarchar(500),
    CategoriaNivel1     nvarchar(200),
    CategoriaMP         nvarchar(500),
    Cantidad            decimal(14,2),
    CantidadAdjudicada  decimal(14,2),
    MontoAdjudicado     decimal(18,4),
    MontoTotalAdj       decimal(18,2),
    RutAdj              nvarchar(30),
    NombreAdj           nvarchar(300),
    LBF_Participo       bit             NOT NULL DEFAULT 0,
    LBF_Adjudico        bit             NOT NULL DEFAULT 0,
    LBF_MontoOfertado   decimal(18,2),
    LBF_MontoAdj        decimal(18,2),
    CONSTRAINT PK_STG_MP_ITEMS PRIMARY KEY (Id)
);
"""

INSERT_LIC = """
INSERT INTO STG_MP_LICITACIONES
    (Id, Codigo, Nombre, Tipo, Estado,
     FechaPublicacion, FechaAdjudicacion, Ano, AnioMes,
     CompradorNombre, CompradorRutUnidad, CompradorRegion, CompradorComuna,
     MontoEstimado)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

INSERT_ITEMS = """
INSERT INTO STG_MP_ITEMS
    (Id, LicitacionId, CodigoMP, Nombre, CategoriaNivel1, CategoriaMP,
     Cantidad, CantidadAdjudicada, MontoAdjudicado, MontoTotalAdj,
     RutAdj, NombreAdj,
     LBF_Participo, LBF_Adjudico, LBF_MontoOfertado, LBF_MontoAdj)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


# ── Queries PostgreSQL ─────────────────────────────────────────────────────────

def _q_licitaciones(ano_filter: str) -> str:
    return f"""
        SELECT DISTINCT ON (l.id)
            l.id,
            l.codigo,
            l.nombre,
            l.tipo,
            l.estado,
            l.fecha_publicacion::date,
            l.fecha_adjudicacion::date,
            EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion))::int,
            TO_CHAR(COALESCE(l.fecha_adjudicacion, l.fecha_publicacion), 'YYYY-MM'),
            l.comprador_nombre_organismo,
            l.comprador_rut_unidad,
            l.comprador_region_unidad,
            l.comprador_comuna_unidad,
            l.monto_estimado
        FROM licitaciones l
        JOIN licitaciones_items li ON li.licitacion_id = l.id
        WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
          {ano_filter}
        ORDER BY l.id
    """


def _q_items(ano_filter: str) -> str:
    return f"""
        SELECT
            li.id,
            li.licitacion_id,
            li.codigo_producto,
            li.nombre_producto,
            li.categoria_nivel1,
            li.categoria,
            li.cantidad,
            li.cantidad_adjudicada,
            li.monto_adjudicado,
            -- MontoTotalAdj: combinado igual que en la app
            CASE WHEN li.rut_proveedor_adj IS NOT NULL
                 THEN li.monto_adjudicado
                      * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
                 WHEN EXISTS (
                     SELECT 1 FROM jsonb_array_elements(li.oferentes) ox
                     WHERE (ox->>'seleccionada')::boolean = true
                 )
                 THEN COALESCE(
                     (SELECT NULLIF((o->>'monto_adjudicado')::numeric,0)
                      FROM jsonb_array_elements(li.oferentes) o
                      WHERE (o->>'seleccionada')::boolean = true LIMIT 1),
                     (SELECT (o->>'total')::numeric
                      FROM jsonb_array_elements(li.oferentes) o
                      WHERE (o->>'seleccionada')::boolean = true LIMIT 1),
                     li.monto_adjudicado
                     * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
                 )
                 ELSE li.monto_adjudicado
                      * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
            END,
            li.rut_proveedor_adj,
            li.nombre_proveedor_adj,
            -- LBF_Participo
            CASE WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(li.oferentes) o
                WHERE o->>'rut' = '{LBF_RUT}'
            ) THEN true ELSE false END,
            -- LBF_Adjudico
            CASE WHEN li.rut_proveedor_adj = '{LBF_RUT}'
                  OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(li.oferentes) o
                      WHERE o->>'rut' = '{LBF_RUT}'
                        AND (o->>'seleccionada')::boolean = true
                  )
                  OR (li.monto_adjudicado > 0 AND li.rut_proveedor_adj IS NULL
                      AND li.oferta_seleccionada IS NOT NULL)
            THEN true ELSE false END,
            -- LBF_MontoOfertado (desde JSONB o columnas directas)
            COALESCE(
                (SELECT NULLIF((o->>'valor_total_ofertado')::numeric,0)
                 FROM jsonb_array_elements(li.oferentes) o
                 WHERE o->>'rut' = '{LBF_RUT}' LIMIT 1),
                (SELECT (o->>'total')::numeric
                 FROM jsonb_array_elements(li.oferentes) o
                 WHERE o->>'rut' = '{LBF_RUT}' LIMIT 1)
            ),
            -- LBF_MontoAdj
            CASE WHEN li.rut_proveedor_adj = '{LBF_RUT}'
                 THEN li.monto_adjudicado
                      * COALESCE(li.cantidad_adjudicada, li.cantidad, 1)
                 ELSE (
                     SELECT COALESCE(
                         NULLIF((o->>'monto_adjudicado')::numeric,0),
                         (o->>'total')::numeric
                     )
                     FROM jsonb_array_elements(li.oferentes) o
                     WHERE o->>'rut' = '{LBF_RUT}'
                       AND (o->>'seleccionada')::boolean = true
                     LIMIT 1
                 )
            END
        FROM licitaciones_items li
        JOIN licitaciones l ON l.id = li.licitacion_id
        WHERE upper(li.categoria_nivel1) LIKE '{CAT_LIKE}'
          {ano_filter}
        ORDER BY li.licitacion_id, li.id
    """


# ── ETL ────────────────────────────────────────────────────────────────────────

def create_staging(ss_cur):
    log.info("Creando tablas staging en SQL Server…")
    ss_cur.execute(DDL_STG_LIC)
    ss_cur.execute(DDL_STG_ITEMS)
    ss_cur.connection.commit()
    log.info("  Staging creado.")


def load_licitaciones(pg_conn, ss_conn, ano_filter: str):
    log.info("Extrayendo licitaciones desde PostgreSQL…")
    pg_cur = pg_conn.cursor("cur_lic")
    pg_cur.itersize = 1000
    pg_cur.execute(_q_licitaciones(ano_filter))

    ss_cur = ss_conn.cursor()
    ss_cur.fast_executemany = True

    n, batch = 0, []
    for row in pg_cur:
        batch.append(row)
        if len(batch) >= BATCH:
            ss_cur.executemany(INSERT_LIC, batch)
            ss_conn.commit()
            n += len(batch)
            batch = []
            log.info(f"  Licitaciones: {n:,}")
    if batch:
        ss_cur.executemany(INSERT_LIC, batch)
        ss_conn.commit()
        n += len(batch)

    pg_cur.close()
    log.info(f"  Total licitaciones cargadas: {n:,}")


def load_items(pg_conn, ss_conn, ano_filter: str):
    log.info("Extrayendo ítems desde PostgreSQL (puede tardar varios minutos)…")
    pg_cur = pg_conn.cursor("cur_items")
    pg_cur.itersize = 1000
    pg_cur.execute(_q_items(ano_filter))

    ss_cur = ss_conn.cursor()
    ss_cur.fast_executemany = True

    def _coerce(row):
        # Castear decimales de PostgreSQL a float para evitar precision loss en pyodbc
        # Índices (con CategoriaMP en pos 5): 6=Cantidad, 7=CantAdj, 8=MontoAdj, 9=MontoTotal, 14=LBF_MontoOf, 15=LBF_MontoAdj
        r = list(row)
        for i in (6, 7, 8, 9, 14, 15):
            r[i] = float(r[i]) if r[i] is not None else None
        return r

    n, batch = 0, []
    for row in pg_cur:
        batch.append(_coerce(row))
        if len(batch) >= BATCH:
            ss_cur.executemany(INSERT_ITEMS, batch)
            ss_conn.commit()
            n += len(batch)
            batch = []
            if n % 10_000 == 0:
                log.info(f"  Ítems: {n:,}")
    if batch:
        ss_cur.executemany(INSERT_ITEMS, batch)
        ss_conn.commit()
        n += len(batch)

    pg_cur.close()
    log.info(f"  Total ítems cargados: {n:,}")


def run_sp(ss_conn):
    log.info("Ejecutando SP_MERCADO_PUBLICO…")
    cur = ss_conn.cursor()
    cur.execute("EXEC SP_MERCADO_PUBLICO")
    ss_conn.commit()
    log.info("  SP completado.")


def main():
    parser = argparse.ArgumentParser(description="ETL Mercado Público → SQL Server BI")
    parser.add_argument(
        "--anos",
        help="Años a cargar separados por coma (ej: 2024,2025,2026). Sin valor = todos.",
        default=None,
    )
    args = parser.parse_args()

    if args.anos:
        anos = [int(a.strip()) for a in args.anos.split(",")]
        ano_filter = f"AND EXTRACT(YEAR FROM COALESCE(l.fecha_adjudicacion, l.fecha_publicacion)) IN ({','.join(str(a) for a in anos)})"
        log.info(f"Años seleccionados: {anos}")
    else:
        ano_filter = ""
        log.info("Cargando todos los años disponibles.")

    t0 = time.time()
    log.info("=" * 55)
    log.info("  ETL Mercado Público → SQL Server BI")
    log.info("=" * 55)

    try:
        pg_conn = psycopg2.connect(**PG_PARAMS)
        log.info("PostgreSQL conectado.")
    except Exception as e:
        log.error(f"No se pudo conectar a PostgreSQL: {e}")
        sys.exit(1)

    try:
        ss_conn = pyodbc.connect(SS_CONN, timeout=30)
        ss_conn.autocommit = False
        log.info("SQL Server conectado.")
    except Exception as e:
        log.error(f"No se pudo conectar a SQL Server: {e}")
        pg_conn.close()
        sys.exit(1)

    try:
        ss_cur = ss_conn.cursor()
        create_staging(ss_cur)
        load_licitaciones(pg_conn, ss_conn, ano_filter)
        load_items(pg_conn, ss_conn, ano_filter)
        run_sp(ss_conn)
    except Exception as e:
        log.error(f"Error durante ETL: {e}", exc_info=True)
        ss_conn.rollback()
        sys.exit(1)
    finally:
        pg_conn.close()
        ss_conn.close()

    elapsed = time.time() - t0
    log.info(f"{'=' * 55}")
    log.info(f"  Completado en {elapsed/60:.1f} min ({elapsed:.0f}s)")
    log.info(f"{'=' * 55}")


if __name__ == "__main__":
    main()
