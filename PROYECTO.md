# LBF Advanced Analytics — Documentación del Proyecto

## Resumen

Plataforma de inteligencia de negocios para **Comercial LBF Limitada** (insumos médicos, Chile). Reemplaza Power BI con una app web moderna, con login, perfiles por módulo y deploy en servidor Windows.

- **Backend:** FastAPI (Python) → puerto 8000
- **Frontend:** Next.js 16 + TypeScript + Tailwind → puerto 3000
- **Base de datos:** SQL Server en `192.0.0.48` (base `BI`)
- **Servidor producción:** `192.0.0.137:3000`
- **Repo:** `https://github.com/daraya-eng/Analisis-LBF.git`

---

## Estructura de archivos

```
lbf-analytics/
├── backend/
│   ├── main.py                    # App FastAPI + CORS + routers
│   ├── auth.py                    # JWT auth + roles + CRUD usuarios (JSON)
│   ├── db.py                      # Conexión SQL Server + filtros canónicos
│   ├── cache.py                   # Caché en memoria (TTL 5min) + pickle
│   ├── requirements.txt           # Dependencias Python
│   ├── data/
│   │   ├── users.json             # Usuarios (auto-generado, gitignoreado)
│   │   └── notas_licitaciones.json
│   └── routes/
│       ├── auth_routes.py         # Login, /me, CRUD usuarios
│       ├── dashboard_routes.py    # KPIs globales, PPTO vs Venta
│       ├── zona_routes.py         # Análisis por zona/KAM
│       ├── categoria_routes.py    # PPTO vs Venta por categoría
│       ├── clientes_routes.py     # Clientes ganadores/perdedores, precio/volumen
│       ├── televentas_routes.py   # Canal 16-TELEVENTAS, top 10, semanal
│       ├── precios_routes.py      # Variación de precios por categoría/cliente
│       ├── mercado_routes.py      # Licitaciones, win rate, competidores
│       ├── facturacion_routes.py  # Adjudicado vs Facturado, notas
│       ├── multiproducto_routes.py # Cliente MULTIPRODUCTO
│       └── resumen_routes.py      # Resumen presupuestario
│
├── frontend/
│   ├── package.json
│   ├── .env.production            # NEXT_PUBLIC_API_URL (gitignoreado)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx         # Root layout + AuthProvider
│       │   ├── page.tsx           # Redirect → /dashboard
│       │   ├── login/page.tsx     # Login (Artemis II design)
│       │   └── dashboard/
│       │       ├── layout.tsx     # Sidebar + protección de rutas por módulo
│       │       ├── page.tsx       # Panel Principal (KPIs + categoría + segmento)
│       │       ├── televentas/    # Televentas
│       │       ├── zona/          # KAM / Zonas
│       │       ├── clientes/      # Clientes
│       │       ├── categoria/     # MultiProducto
│       │       ├── precios/       # Precios
│       │       ├── mercado/       # Análisis de Mercado
│       │       ├── facturacion/   # Adj. vs Facturado
│       │       ├── presupuesto/   # Presupuesto 2026
│       │       ├── metas/         # Metas
│       │       ├── multiproducto/ # MultiProducto
│       │       └── admin/         # Gestión de Usuarios (superadmin)
│       ├── components/
│       │   ├── sidebar.tsx        # Navegación lateral colapsable
│       │   ├── data-table.tsx     # Tabla reutilizable con sort/drill-down
│       │   ├── kpi-card.tsx       # Tarjeta KPI
│       │   └── section-header.tsx # Encabezado + filtro de período
│       └── lib/
│           ├── api.ts             # Fetch wrapper + caché cliente (5min)
│           ├── auth-context.tsx   # Contexto auth + hook useAuth()
│           ├── format.ts          # Formateo: fmtCLP, fmtPct, fmtAbs
│           └── utils.ts           # Utilidades generales
│
├── deploy/
│   ├── 01_instalar_requisitos.bat # Instala Python, Node, Git, ODBC
│   ├── 02_deploy_app.bat          # Clona repo + instala + compila
│   ├── 03_crear_servicios.bat     # Crea servicios + firewall
│   ├── actualizar.bat             # git pull + rebuild + reiniciar
│   ├── iniciar_lbf.bat            # Inicia backend + frontend
│   └── GUIA_PASO_A_PASO.txt       # Guía de instalación
│
├── subir_cambios.bat              # Push desde PC de desarrollo
├── .gitignore
└── PROYECTO.md                    # ← Este archivo
```

---

## Base de datos

### Conexión

```
Servidor: 192.0.0.48
Base: BI
Usuario: daraya
Driver: ODBC Driver 18 for SQL Server
```

### Tablas principales

| Tabla / Vista | Uso |
|---|---|
| `BI_TOTAL_FACTURA` | Facturas + guías pendientes (DOC_CODE='GF'). Columna `VENTA` (neta). |
| `DW_TOTAL_FACTURA` | Solo facturas (vista al servidor externo DWLBF) |
| `[PPTO 2026]` | Presupuesto por producto/cliente/categoría |
| `Meta_Categoria` | Metas mensuales por categoría |
| `Metas_KAM` | Metas por zona/KAM/mes. Columna ` META ` tiene espacios. |
| `PPTO_VS_VENTA` | PPTO vs venta pre-calculado |
| `VW_RESUMEN_KPIS_DASHBOARD` | KPIs agregados para dashboard |
| `vw_LICITACIONES_CATEGORIZADAS` | Licitaciones categorizadas con flag EsLBF |
| `vw_guias_por_facturar` | Guías pendientes. **Siempre deduplicar.** |

### Filtros canónicos

```sql
-- Excluir vendedores internos (en db.py como DW_FILTRO)
VENDEDOR NOT IN ('89-FACTURACION MUESTRA Y U OBSEQU', '90-FACTURACION USO INTERNO',
'96-FACTURACION FALTANTES', '97-DONACIONES', '98-FACTURACION OTROS CONCEPTOS',
'99-FACTURACION MERMAS')
AND CODIGO NOT IN ('FLETE', 'NINV', 'SIN', '')
```

### Categorías

| Código | Nombre |
|---|---|
| SQ | Sales / Quirúrgico |
| EVA | Evaluación |
| MAH | Mantenimiento & Handling |
| EQM | Equipos y Mantención (incluye "Servicios") |

**Alias:** `Servicios` → `EQM` (se fusionan en todos los queries)

---

## Sistema de autenticación

### Roles

| Rol | Acceso |
|---|---|
| `superadmin` | Todos los módulos + gestionar usuarios |
| `admin` | Todos los módulos asignados |
| `gerente` | Módulos asignados, solo lectura |
| `viewer` | Módulos asignados, solo lectura |

### Módulos disponibles

```
dashboard, televentas, zona, clientes, categoria,
mercado, facturacion, presupuesto, precios
```

### Usuarios por defecto

| Usuario | Contraseña | Rol |
|---|---|---|
| `daraya` | `Lbf2026#` | superadmin |
| `daraya@lbf.cl` | `Lbf2026#` | superadmin |
| `fgonzales` | `Lbf2026*` | gerente |

### Flujo de auth

1. Login → `POST /api/auth/login/json` → JWT (8 horas)
2. Token en `localStorage.lbf_token`
3. Cada request lleva `Authorization: Bearer <token>`
4. Backend valida token + verifica usuario activo
5. 401 → redirige a `/login`

---

## API — Endpoints

### Auth (`/api/auth/`)
| Método | Ruta | Descripción | Protección |
|---|---|---|---|
| POST | `/login/json` | Login (JSON body) | Pública |
| GET | `/me` | Usuario actual | Token |
| GET | `/modules` | Módulos disponibles | Token |
| GET | `/users` | Listar usuarios | Superadmin |
| POST | `/users` | Crear usuario | Superadmin |
| PUT | `/users/{username}` | Editar usuario | Superadmin |
| DELETE | `/users/{username}` | Eliminar usuario | Superadmin |

### Dashboard (`/api/dashboard/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/all` | `periodo`, `mes` | KPIs + categorías + segmento + gráfico mensual |

### Zona (`/api/zona/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/` | `periodo`, `mes` | Todas las zonas con métricas |
| GET | `/clientes` | `zona`, `categoria`, `periodo`, `mes` | Clientes de una zona |

### Clientes (`/api/clientes/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/` | `periodo`, `mes` | Ganadores/perdedores + segmento |
| GET | `/detalle` | `rut`, `periodo`, `mes` | Productos con efecto precio/volumen |

### Televentas (`/api/televentas/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/all` | `periodo`, `mes` | KPIs + top 10 + nuevos + semanal |
| GET | `/cliente-productos` | `rut`, `periodo`, `mes` | Drill-down productos por cliente |

### Precios (`/api/precios/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/` | `periodo`, `mes`, `categoria` | Variación por categoría/cliente |
| GET | `/productos` | `rut`, `periodo`, `mes`, `categoria` | Impacto precio/volumen por producto |

### Mercado (`/api/mercado/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/` | `periodo`, `mes` | Win rate, market share, zonas |
| GET | `/competidores` | `periodo`, `mes` | Top 30 competidores |
| GET | `/competidores/detalle` | `empresa`, `periodo`, `mes` | Detalle competidor vs LBF |

### Facturación (`/api/facturacion/`)
| Método | Ruta | Params | Descripción |
|---|---|---|---|
| GET | `/` | — | Licitaciones vigentes + facturación |
| GET | `/detalle` | `licitacion` | Detalle de una licitación |
| POST | `/nota` | body: `licitacion, nota, autor` | Agregar nota |
| DELETE | `/nota` | `licitacion` | Eliminar nota |

### Resumen (`/api/resumen/`)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/kpis` | KPIs presupuestarios |
| GET | `/all` | Resumen completo |
| GET | `/categoria` | Por categoría |
| GET | `/zona` | Por zona |

### MultiProducto (`/api/multiproducto/`)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/all` | Dashboard MULTIPRODUCTO completo |

### Sistema
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/refresh` | Limpiar caché (autenticado) |

---

## Períodos soportados

Todos los endpoints que aceptan `periodo` soportan:

| Valor | Meses | Descripción |
|---|---|---|
| `ytd` | 1 → mes actual | Year to date (default) |
| `q1` | 1, 2, 3 | Primer trimestre |
| `q2` | 4, 5, 6 | Segundo trimestre |
| `q3` | 7, 8, 9 | Tercer trimestre |
| `q4` | 10, 11, 12 | Cuarto trimestre |
| `mes` | `mes=N` | Mes específico |
| `anual` | 1 → 12 | Todo el año |

---

## Sidebar / Navegación

| # | Label | Módulo | Ruta | Icono |
|---|---|---|---|---|
| 1 | Panel Principal | dashboard | `/dashboard` | LayoutDashboard |
| 2 | Televentas | televentas | `/dashboard/televentas` | Phone |
| 3 | KAM | zona | `/dashboard/zona` | Building2 |
| 4 | Clientes | clientes | `/dashboard/clientes` | Users |
| 5 | MultiProducto | categoria | `/dashboard/categoria` | Package |
| 6 | Precios | precios | `/dashboard/precios` | DollarSign |
| 7 | Análisis de Mercado | mercado | `/dashboard/mercado` | BarChart3 |
| 8 | Adj. vs Facturado | facturacion | `/dashboard/facturacion` | Receipt |
| 9 | Presupuesto 2026 | presupuesto | `/dashboard/presupuesto` | FileBarChart |
| — | Gestionar Usuarios | admin | `/dashboard/admin` | Shield (solo superadmin) |

---

## Caché

### Servidor (in-memory)
- **TTL:** 5 minutos
- **Limpiar:** `POST /api/refresh` (requiere token)
- **Claves:** `"{modulo}:{periodo}:{mes}"` (ej: `dashboard:ytd:None`)

### Cliente (browser)
- **TTL:** 5 minutos (Map en memoria)
- **Limpiar:** `clearClientCache()` después de login/refresh

### Persistencia (pickle)
- DataFrames en `backend/data/df_*.pkl`
- Última actualización en `backend/data/last_update.txt`
- Notas en `backend/data/notas_licitaciones.json`

---

## Convenciones de código

### SQL
- **Anti-join:** Siempre `NOT EXISTS`, nunca `NOT IN` (por NULLs)
- **Columna DIA:** Es DATE, usar `CAST(DIA AS date)` y `DAY(DIA)`
- **Categoría con alias:** Usar `_cat_in(cat)` → genera `IN ('EQM','Servicios')`
- **Filtro canónico:** Siempre usar `DW_FILTRO` de `db.py`
- **Fechas dinámicas:** Siempre `hoy()["ano"]` dentro de funciones, nunca constantes de módulo

### Python
- **DataFrames:** `pd.DataFrame.from_records(rows, columns=cols)`, no `pd.DataFrame()`
- **Metas_KAM:** Cargar con `cursor.execute()` + `cols = [d[0].strip() for d in cur.description]`
- **Formato monetario:** Pesos chilenos (CLP). MM = miles de millones, M = millones

### Frontend
- **API:** Usar `api.get()` / `api.post()` de `lib/api.ts`
- **Auth:** Usar hook `useAuth()` de `lib/auth-context.tsx`
- **Formato:** Usar helpers de `lib/format.ts`

---

## Deploy y actualización

### Requisitos del servidor
- Windows Server con acceso a `192.0.0.48`
- Python 3.12+, Node.js 20+, Git
- ODBC Driver 18 for SQL Server

### Actualizar producción

**Desde tu PC:**
```
doble click en subir_cambios.bat
```

**En el servidor (RDP):**
```
C:\lbf-analytics\deploy\actualizar.bat
```

### Scripts del servidor

| Script | Ubicación | Uso |
|---|---|---|
| `iniciar_lbf.bat` | `C:\lbf-analytics\deploy\` | Iniciar app |
| `detener_lbf.bat` | `C:\lbf-analytics\` | Detener app |
| `actualizar.bat` | `C:\lbf-analytics\deploy\` | Actualizar + reiniciar |

### URLs

| Entorno | URL |
|---|---|
| Desarrollo (tu PC) | `http://localhost:3000` (frontend) + `http://localhost:8000` (backend) |
| Producción | `http://192.0.0.137:3000` |

---

## Marcas representadas

Smith+Nephew, Vernacare, Serres, CathSafe, MATSUI, smartmed, ABENA, R5, HALYARD
