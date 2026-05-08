# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Levantar la app

```bash
python ppto_analisis_app.py
# → http://localhost:8052
```

Acceso público vía devtunnel (ya configurado como `analisis-lbf`):
```bash
./devtunnel.exe host analisis-lbf
# → https://kn9snpg9-8052.brs.devtunnels.ms
```

O doble clic en `iniciar_app.bat` para levantar ambos a la vez.

Si el puerto está ocupado:
```bash
taskkill /F /IM python.exe
```

## Arquitectura de `ppto_analisis_app.py`

App Dash única (puerto 8052) — **"Análisis Presupuesto 2026"**. Sin login. Tres pestañas:
- **Por Categoría** (`tab-categoria`) — PPTO vs real por `CATEGORÍA 2026`, drill-down por zona/cliente/producto al hacer clic en fila
- **Por Zona** (`tab-zona`) — PPTO vs real por zona, filtrable por categoría; incluye Top 25 clientes con gap/precio por zona
- **Desalineación PPTO** (`tab-desalineacion`) — análisis por categoría × situación (`[SITUACIÓN ]`), drill-down al hacer clic

### Flujo de datos

```
BD SQL Server 192.0.0.48
    ↓ (requiere VPN)
_load_*()  →  globals _df_*  →  layouts y callbacks
    ↓ también
data/*.pkl  (caché offline)
```

Al iniciar: carga `data/*.pkl`. Si vacío y hay conexión, llama `_reload_all_data()`.
Botón 🔄 en navbar → `_reload_all_data()` → actualiza globals + guarda `.pkl`.

### Globals de módulo (datos)
| Global | Origen |
|---|---|
| `_df_categoria` | `_load_categoria()` |
| `_df_zona` | `_load_zona()` |
| `_df_zona_cat` | `_load_zona_cat()` — cruce zona × categoría para drill-down |
| `_df_cliente` | `_load_cliente()` |
| `_df_producto` | `_load_producto()` |
| `_df_desalineacion` | `_load_desalineacion()` — agrupa por categoría × situación |

`_load_cat_detalle(categoria)` se llama **on-demand** al hacer clic en la tabla de categoría (no cacheado).

### Constantes clave

```python
_CATS_VALIDAS = ["SQ", "EVA", "MAH", "EQM"]   # categorías con análisis de precio activo
_CAT_ALIAS    = {"Servicios": "EQM"}            # Servicios se fusiona en EQM

# Expresiones SQL reutilizables para normalizar categoría:
_SQL_CAT_PPTO    # para columna [CATEGORÍA 2026] de [PPTO 2026] (alias p)
_SQL_CAT_DW      # para columna CATEGORIA de DW_TOTAL_FACTURA
_SQL_CAT_DW_RAW  # igual pero sin fallback '(sin cat)', para CTEs intermedias

_cat_in(cat)     # genera IN ('EQM','Servicios') al filtrar por categoría que tiene alias
_DW_FILTRO       # fragmento WHERE para excluir vendedores y códigos internos
```

### Callbacks registrados
| Output | Trigger | Función |
|---|---|---|
| `refresh-store`, `last-update`, `btn-refresh.disabled` | `btn-refresh.n_clicks` | Llama `_reload_all_data()` |
| `tab-content.children` | `main-tabs.value` | Enruta a `layout_categoria/zona/desalineacion()` |
| `cat-detalle-container` | `cat-tabla.selected_rows` | `_build_cat_detalle(categoria)` |
| `cat-det-cli` options/value | `cat-det-zona.value` | Filtra clientes del drill-down |
| `cat-det-tabla` | `cat-det-zona/cli.value` | Tabla de productos del drill-down |
| `zona-kpi-row`, `zona-tabla-container` | `zona-cat-filtro.value` | Filtra zonas por categoría |
| `zona-top25-container` | `zona-selector.value` | `_build_top25_clientes(zona)` |
| `desa-main-tabla` | `desa-cat-filtro.value` | Filtra tabla desalineación |
| `desa-detalle-container` | `desa-main-tabla.selected_rows` | `_render_desa_zona(categoria)` |

## Base de datos

- **Servidor:** `192.0.0.48`, base `BI`, usuario `daraya` — **requiere VPN**
- Credenciales en `db_config.py` (gitignoreado). Plantilla en `db_config.example.py`.
- Siempre usar `get_conn()`.

### Tablas clave
| Tabla / Vista | Notas críticas |
|---|---|
| `[PPTO 2026]` | Fuente del presupuesto. Columnas: `CATEGORÍA 2026`, `VENDEDOR_ACTUAL`, `RUT`, `NOMBRE`, `CODIGO`, `PPTO 2026`, `CANT 2026`, `PRECIO 2026` |
| `DW_TOTAL_FACTURA` | Solo facturas. Usar para ventas reales. Columna `VENTA` (neta), no `TOTAL` |
| `BI_TOTAL_FACTURA` | Facturas + guías pendientes (`DOC_CODE='GF'`). Reconstruida por `SP_LICITACIONES` |
| `Metas_KAM` | Columna ` META ` tiene espacios — cargar con `cursor.execute()` + `cols = [d[0].strip() for d in cur.description]`. `pd.read_sql()` falla |
| `vw_guias_por_facturar` | Registra cada guía una vez por día — **siempre deduplicar** con `GROUP BY guia_num, part_code` |

### Regla de filtro canónica para guías de despacho

**Siempre** filtrar guías con esta condición (proviene del modelo Power BI de LBF):

```
TIPO_MOV IN (801, 804) AND TIPO = ''
```

- `TIPO_MOV = 801` y `TIPO_MOV = 804` — despachos de venta válidos (excluye devoluciones, traslados internos, etc.)
- `TIPO = ''` — excluye registros con tipo especial asignado

Aplica a `vw_guias_por_facturar` y `dw_guia_detalle`. Sin este filtro se pueden incluir movimientos que no son ventas reales.

> **Verificado:** `vw_guias_por_facturar` y su tabla subyacente `DWLBF.dbo.dw_guias_por_facturar` **no exponen** las columnas `TIPO_MOV` ni `TIPO` — ya vienen pre-filtradas desde el origen. El filtro `TIPO_MOV IN (801,804) AND TIPO=''` aplica únicamente al consultar **directamente** `DWLBF.dbo.dw_guia_detalle` (usada en `SP_LICITACIONES` para enriquecimiento, no en las apps directamente).

### Regla de filtro canónica para DW_TOTAL_FACTURA

**Siempre** aplicar `_DW_FILTRO` en cualquier query contra `DW_TOTAL_FACTURA`. Esta regla proviene del modelo Power BI de LBF y excluye:

```
VENDEDOR NOT IN (
    '89-FACTURACION MUESTRA Y U OBSEQU',
    '90-FACTURACION USO INTERNO',
    '96-FACTURACION FALTANTES',
    '97-DONACIONES',
    '98-FACTURACION OTROS CONCEPTOS',
    '99-FACTURACION MERMAS'
)
AND CODIGO NOT IN ('FLETE', 'NINV', 'SIN', '')
```

En Python usar siempre la constante `_DW_FILTRO` (definida al inicio del módulo) — nunca reescribir esta condición a mano.

### Patrones SQL obligatorios
- **Anti-join con NULLs:** `NOT EXISTS (SELECT 1 FROM ... WHERE x.RUT = f.RUT)` — nunca `NOT IN`
- **Columna `DIA`:** es tipo `DATE`. Usar `CAST(DIA AS date)` y `DAY(DIA)`, no asumir INT
- **DataFrames desde pyodbc:** `pd.DataFrame.from_records(rows, columns=cols)` — no `pd.DataFrame(rows, columns=cols)` (falla en Python 3.14)
- **Categoría en WHERE con alias:** usar `_cat_in(cat)` que genera `IN ('EQM','Servicios')` para evitar perder filas con alias

## Convenciones de formato numérico

```python
_fmt(n)      # MM para ≥1B, M para ≥1M  → "$3.2MM", "$450M"
_fmt_abs(n)  # Valor absoluto completo   → "$3,034,174,835"
_fmt_pct(n)  # Porcentaje con 1 decimal  → "88.2%"
_sem(v)      # Semáforo 🟢🟡🔴 por cumplimiento (umbrales: 80/50%)
```

Todos los valores monetarios son **pesos chilenos (CLP)**.

## Caché offline (`data/`)

Archivos `.pkl` por DataFrame + `last_update.txt`. Permiten usar la app sin VPN con datos del último refresh. El caché se regenera completo al hacer clic en 🔄 (requiere VPN activa). `_load_cat_detalle()` siempre va a la BD, nunca usa caché.

## Credenciales y seguridad

- `db_config.py` y `auth_config.py` están en `.gitignore` — nunca commitear
- `db_config.example.py` es la plantilla pública (sin valores reales)
- En producción (Render): usar variables de entorno `DB_CONN_STR`
