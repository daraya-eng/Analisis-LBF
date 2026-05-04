"""
Incentivos — Cálculo de bonos trimestrales por vendedor.
Fuentes: Targets_Config (metas + bonos), BI_TOTAL_FACTURA (venta + contribucion real).

Reglas:
  Bono venta  = (cumpl_venta - 0.80) × bono_venta_100   [VENDEDOR normal]
              = cumpl_venta × bono_venta_100              [SUBGERENTE]
              = 0                                          [MERCADO_PUBLICO]
  Bono margen = cumpl_margen × bono_margen_100
              → SOLO si cumpl_venta >= 1.0 Y cumpl_margen > 1.0
  Anticipo    = bono_venta_100 × 0.80 (pagado mes 1 del trimestre)
  Liquidacion = bono_total_real - anticipo (puede ser negativo → descuento)
"""
from fastapi import APIRouter, Depends, Query
from auth import get_current_user
from db import get_conn, filtro_guias, hoy
from cache import mem_get, mem_set

router = APIRouter()

_VEND_EXCLUIR = (
    "'11-PLANILLA EMPRESA','44-RENASYS',"
    "'89-FACTURACION MUESTRA Y U OBSEQU','90-FACTURACION USO INTERNO',"
    "'91-EMPRESA','97-DONACIONES',"
    "'98-FACTURACION OTROS CONCEPTOS','99-FACTURACION MERMAS'"
)
_EXCL = f"VENDEDOR NOT IN ({_VEND_EXCLUIR}) AND CODIGO NOT IN ('FLETE','NINV','SIN','')"

MESES_COLS = ["META_VENTA_ENE","META_VENTA_FEB","META_VENTA_MAR",
              "META_VENTA_ABR","META_VENTA_MAY","META_VENTA_JUN",
              "META_VENTA_JUL","META_VENTA_AGO","META_VENTA_SEP",
              "META_VENTA_OCT","META_VENTA_NOV","META_VENTA_DIC"]

# Código real de VENDEDOR en BI_TOTAL_FACTURA para cada config
_VEND_MAP = {
    "16-TELEVENTAS-V": "16-TELEVENTAS",
    "16-TELEVENTAS-G": "16-TELEVENTAS",
}


def _q_meses(q: int) -> list[int]:
    return [(q - 1) * 3 + i + 1 for i in range(3)]


def _float(v) -> float:
    return float(v) if v is not None else 0.0


def _pct(v) -> float | None:
    return round(v * 100, 1) if v is not None else None


@router.get("/trimestre")
async def get_incentivos_trimestre(
    q: int = Query(None),
    ano: int = Query(2026),
    current_user: dict = Depends(get_current_user),
):
    h = hoy()
    mes_actual = h["mes"]
    ano_actual = h["ano"]
    q_actual = (mes_actual - 1) // 3 + 1

    if q is None:
        q = q_actual if ano == ano_actual else 1

    import time
    ck = f"incentivos:{ano}:q{q}"
    # Trimestres cerrados: cache 15 min (igual que el resto del sistema)
    # Trimestre activo: cache 5 min (datos cambian por día, no por minuto)
    cached = mem_get(ck)
    if cached:
        # Para el trimestre activo respetar TTL corto de 5 min
        if ano == ano_actual and q == q_actual:
            ts = cached.get("_ts", 0)
            if time.time() - ts < 300:  # 5 minutos
                return {k: v for k, v in cached.items() if k != "_ts"}
        else:
            return cached

    try:
        data = _calcular(q, ano, mes_actual, ano_actual, q_actual)
        # Guardar con timestamp interno para control de TTL corto
        mem_set(ck, {**data, "_ts": time.time()})
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}


def _calcular(q: int, ano: int, mes_actual: int, ano_actual: int, q_actual: int) -> dict:
    meses_q = _q_meses(q)
    mes_list = ",".join(str(m) for m in meses_q)
    _FG = filtro_guias()

    # Estado del trimestre
    if ano < ano_actual or (ano == ano_actual and q < q_actual):
        estado_q = "liquidado"
    elif ano == ano_actual and q == q_actual:
        estado_q = "en_curso"
    else:
        estado_q = "pendiente"

    # Mes de inicio del Q (para el anticipo)
    mes_inicio_q = meses_q[0]
    # Cuántos meses del Q han cerrado
    if estado_q == "liquidado":
        meses_cerrados = 3
    elif estado_q == "en_curso":
        meses_cerrados = mes_actual - mes_inicio_q  # 0,1,2
    else:
        meses_cerrados = 0

    conn = get_conn()
    cur = conn.cursor()

    # ── Config vendedores ───────────────────────────────────────────────────
    cur.execute("""
        SELECT VENDEDOR, NOMBRE, TIPO, BONO_VENTA_100, BONO_MARGEN_100,
               META_VENTA_ENE,META_VENTA_FEB,META_VENTA_MAR,
               META_VENTA_ABR,META_VENTA_MAY,META_VENTA_JUN,
               META_VENTA_JUL,META_VENTA_AGO,META_VENTA_SEP,
               META_VENTA_OCT,META_VENTA_NOV,META_VENTA_DIC,
               META_MARGEN_Q1,META_MARGEN_Q2,META_MARGEN_Q3,META_MARGEN_Q4
        FROM Targets_Config
        WHERE ANO = ?
        ORDER BY ID
    """, (ano,))
    cols = [d[0] for d in cur.description]
    config_rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    # ── Anticipos pagados ───────────────────────────────────────────────────
    cur.execute("""
        SELECT VENDEDOR, ANTICIPO_VENTA, PAGADO, FECHA_PAGO
        FROM Targets_Pagos
        WHERE ANO = ? AND TRIMESTRE = ?
    """, (ano, q))
    anticipos_db = {r[0]: {"anticipo_venta": _float(r[1]), "pagado": bool(r[2]), "fecha_pago": str(r[3]) if r[3] else None}
                    for r in cur.fetchall()}

    # ── Venta real y contribucion por VENDEDOR × MES ─────────────────────
    cur.execute(f"""
        SELECT VENDEDOR, MES,
               SUM(CAST(VENTA AS float))        AS venta,
               SUM(CAST(CONTRIBUCION AS float))  AS contrib
        FROM BI_TOTAL_FACTURA
        WHERE ANO = ? AND MES IN ({mes_list})
          AND {_EXCL} AND {_FG}
        GROUP BY VENDEDOR, MES
    """, (ano,))
    venta_map: dict[str, dict[int, float]] = {}
    contrib_map: dict[str, dict[int, float]] = {}
    for row in cur.fetchall():
        vend, mes, v, c = row[0] or "", int(row[1]), _float(row[2]), _float(row[3])
        venta_map.setdefault(vend, {})[mes] = v
        contrib_map.setdefault(vend, {})[mes] = c

    # Total empresa (para Subgerente)
    venta_total_q: dict[int, float] = {}
    contrib_total_q: dict[int, float] = {}
    for vend_data in venta_map.values():
        for mes, v in vend_data.items():
            venta_total_q[mes] = venta_total_q.get(mes, 0) + v
    for vend_data in contrib_map.values():
        for mes, c in vend_data.items():
            contrib_total_q[mes] = contrib_total_q.get(mes, 0) + c

    conn.close()

    # ── Procesar cada vendedor ──────────────────────────────────────────────
    vendedores_out = []
    totales = {"anticipo": 0.0, "bono_proyectado": 0.0, "liquidacion": 0.0,
               "venta_real": 0.0, "meta_venta": 0.0}

    for cfg in config_rows:
        code = cfg["VENDEDOR"]
        tipo = cfg["TIPO"] or "VENDEDOR"
        bv100 = _float(cfg["BONO_VENTA_100"])
        bm100 = _float(cfg["BONO_MARGEN_100"]) if cfg["BONO_MARGEN_100"] else None

        # Meta venta del trimestre (suma de 3 meses)
        meta_meses = [_float(cfg[c]) for c in MESES_COLS]
        meta_v_q = sum(meta_meses[m - 1] for m in meses_q)
        meta_m_q_key = f"META_MARGEN_Q{q}"
        meta_m_q = _float(cfg[meta_m_q_key]) if cfg.get(meta_m_q_key) else None

        # Venta real del Q
        vend_key = _VEND_MAP.get(code, code)
        if tipo == "SUBGERENTE":
            venta_mes = {m: venta_total_q.get(m, 0) for m in meses_q}
            contrib_mes = {m: contrib_total_q.get(m, 0) for m in meses_q}
        else:
            venta_mes = {m: venta_map.get(vend_key, {}).get(m, 0) for m in meses_q}
            contrib_mes = {m: contrib_map.get(vend_key, {}).get(m, 0) for m in meses_q}

        venta_real_q = sum(venta_mes.values())
        contrib_real_q = sum(contrib_mes.values())

        # Detalle mensual
        detalle = []
        for m in meses_q:
            meta_m = meta_meses[m - 1]
            vr = venta_mes.get(m, 0)
            cr = contrib_mes.get(m, 0)
            detalle.append({
                "mes": m,
                "meta_venta": round(meta_m) if meta_m else None,
                "venta_real": round(vr),
                "contrib_real": round(cr),
                "cumpl_venta": round(vr / meta_m * 100, 1) if meta_m and meta_m > 0 else None,
            })

        # Cumplimientos
        cumpl_v = venta_real_q / meta_v_q if meta_v_q and meta_v_q > 0 else None
        cumpl_m = contrib_real_q / meta_m_q if meta_m_q and meta_m_q > 0 else None

        # Bono venta = cumpl × bono_100 para todos (SUBGERENTE igual)
        # Anticipo = 80% × bono_100 fijo pagado mes 1 del Q
        # Saldo = bono_real − anticipo (puede ser negativo → descuento)
        if tipo == "MERCADO_PUBLICO":
            bono_v = 0.0
        else:
            bono_v = (cumpl_v * bv100) if cumpl_v is not None else 0.0

        # Bono margen (solo si cumpl_venta >= 100% Y cumpl_margen > 100%)
        bono_m = 0.0
        if (bm100 and cumpl_v is not None and cumpl_m is not None
                and cumpl_v >= 1.0 and cumpl_m > 1.0):
            bono_m = cumpl_m * bm100

        bono_total = bono_v + bono_m

        # Anticipo
        anticipo_calc = round(bv100 * 0.80)
        anticipo_db = anticipos_db.get(code, {})
        anticipo_pagado = anticipo_db.get("anticipo_venta", 0)
        anticipo_marcado = anticipo_db.get("pagado", False)

        # Liquidación = bono_real - anticipo_pagado
        liquidacion = bono_total - anticipo_pagado if anticipo_pagado > 0 else None

        # Si el Q está en curso y no se ha pagado anticipo, mostrar anticipo calculado
        anticipo_mostrar = anticipo_pagado if anticipo_marcado else anticipo_calc

        row = {
            "vendedor": code,
            "nombre": cfg["NOMBRE"] or code,
            "tipo": tipo,
            "meta_venta_q": round(meta_v_q) if meta_v_q else None,
            "meta_margen_q": round(meta_m_q) if meta_m_q else None,
            "venta_real_q": round(venta_real_q),
            "contrib_real_q": round(contrib_real_q),
            "cumpl_venta": _pct(cumpl_v),
            "cumpl_margen": _pct(cumpl_m),
            "bono_venta_100": round(bv100),
            "bono_margen_100": round(bm100) if bm100 else None,
            "bono_venta": round(bono_v),
            "bono_margen": round(bono_m),
            "bono_total": round(bono_total),
            "anticipo_calc": anticipo_calc,
            "anticipo_pagado": round(anticipo_pagado) if anticipo_marcado else None,
            "anticipo_marcado": anticipo_marcado,
            "liquidacion": round(liquidacion) if liquidacion is not None else None,
            "detalle": detalle,
        }
        vendedores_out.append(row)

        # Acumular totales (excluir Mercado Público y Subgerente del resumen)
        if tipo not in ("MERCADO_PUBLICO", "SUBGERENTE"):
            totales["anticipo"] += anticipo_mostrar
            totales["bono_proyectado"] += bono_total
            totales["venta_real"] += venta_real_q
            totales["meta_venta"] += meta_v_q if meta_v_q else 0
            if liquidacion is not None:
                totales["liquidacion"] += liquidacion

    totales["cumpl_global"] = round(totales["venta_real"] / totales["meta_venta"] * 100, 1) \
        if totales["meta_venta"] > 0 else None
    totales["diferencia_neta"] = totales["bono_proyectado"] - totales["anticipo"]
    en_riesgo = sum(1 for v in vendedores_out
                    if v["tipo"] not in ("MERCADO_PUBLICO", "SUBGERENTE")
                    and v["bono_total"] < v["anticipo_calc"])

    return {
        "q": q,
        "ano": ano,
        "estado": estado_q,
        "meses_q": meses_q,
        "meses_cerrados": meses_cerrados,
        "q_actual": q_actual,
        "vendedores": vendedores_out,
        "totales": {k: round(v) if isinstance(v, float) else v for k, v in totales.items()},
        "en_riesgo": en_riesgo,
    }
