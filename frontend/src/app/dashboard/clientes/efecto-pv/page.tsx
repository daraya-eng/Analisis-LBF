"use client";

import React, { useEffect, useState, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PVBlock {
  venta_25: number;
  venta_26: number;
  efecto_precio: number;
  efecto_volumen: number;
}

interface PVData {
  label: string;
  total: PVBlock;
  segmentos: Record<string, PVBlock>;
  categorias: Array<{ categoria: string } & PVBlock>;
  error?: string;
}

interface ProductoPV {
  codigo: string;
  descripcion: string;
  categoria: string;
  venta_25: number;
  venta_26: number;
  cant_25: number;
  cant_26: number;
  precio_25: number;
  precio_26: number;
  delta_precio_pct: number;
  efecto_precio: number;
  efecto_volumen: number;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_FULL = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CAT_COLOR: Record<string, string> = {
  MAH: "#10B981", EQM: "#F59E0B", SQ: "#3B82F6", EVA: "#8B5CF6",
};
const SEG_COLOR: Record<string, string> = { PUBLICO: "#3B82F6", PRIVADO: "#10B981" };

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}MM`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-CL");
}

/* ─── Waterfall Chart ────────────────────────────────────────────────────── */
interface WBar {
  label: string;
  value: number;
  base: number;    // where bar starts (for floating bars)
  color: string;
  absolute?: boolean; // true = bar from 0 (Venta 25, Venta 26)
}

function WaterfallChart({
  bars,
  height = 220,
  title,
  compact = false,
}: {
  bars: WBar[];
  height?: number;
  title?: string;
  compact?: boolean;
}) {
  const padL = compact ? 54 : 66;
  const padR = compact ? 8 : 12;
  const padT = compact ? 22 : 26;
  const padB = compact ? 36 : 42;
  const W    = compact ? 380 : 520;
  const H    = height;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const fAxis = compact ? 8  : 9;
  const fVal  = compact ? 9  : 10;
  const fX    = compact ? 9  : 10;

  const allVals = bars.flatMap(b => [b.base, b.base + b.value, 0]);
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.08;

  const scaleY = (v: number) => ((yMax + yPad - v) / (yRange + 2 * yPad)) * chartH;
  const scaleH = (v: number) => (Math.abs(v) / (yRange + 2 * yPad)) * chartH;

  const barW = Math.min(compact ? 52 : 68, (chartW / bars.length) * 0.55);
  const barGap = chartW / bars.length;

  const tickCount = 4;
  const tickStep = (yMax - yMin) / tickCount;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => yMin + i * tickStep);

  const zero_y = scaleY(0) + padT;

  return (
    <div>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>{title}</div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {ticks.map((t, i) => {
          const y = scaleY(t) + padT;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y}
                stroke={t === 0 ? "#94A3B8" : "#E2E8F0"}
                strokeWidth={t === 0 ? 1.5 : 1}
                strokeDasharray={t === 0 ? "none" : "4 3"} />
              <text x={padL - 6} y={y + 4} textAnchor="end"
                fontSize={fAxis} fill="#94A3B8">
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {bars.map((bar, i) => {
          const cx = padL + i * barGap + barGap / 2;
          const x = cx - barW / 2;
          const isPositive = bar.value >= 0;

          let barTop: number, barHeight: number;
          if (bar.absolute) {
            barTop = scaleY(Math.max(bar.value, 0)) + padT;
            barHeight = scaleH(bar.value);
          } else {
            barTop = scaleY(Math.max(bar.base, bar.base + bar.value)) + padT;
            barHeight = scaleH(bar.value);
          }
          barHeight = Math.max(barHeight, 2);

          return (
            <g key={i}>
              {i < bars.length - 1 && !bar.absolute && (
                <line
                  x1={x + barW} x2={padL + (i + 1) * barGap + barGap / 2 - barW / 2}
                  y1={isPositive ? barTop : barTop + barHeight}
                  y2={isPositive ? barTop : barTop + barHeight}
                  stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3 2"
                />
              )}
              <rect x={x} y={barTop} width={barW} height={barHeight}
                fill={bar.color} rx={3} fillOpacity={bar.absolute ? 0.85 : 1} />
              <text
                x={cx} y={isPositive ? barTop - 4 : barTop + barHeight + 11}
                textAnchor="middle" fontSize={fVal} fontWeight={600}
                fill={bar.color === "#E2E8F0" ? "#94A3B8" : bar.color}
              >
                {bar.value >= 0 ? "+" : ""}{fmt(bar.value)}
              </text>
              <text x={cx} y={H - padB + 14} textAnchor="middle"
                fontSize={fX} fill="#374151" fontWeight={500}>
                {bar.label}
              </text>
            </g>
          );
        })}

        <line x1={padL} x2={W - padR} y1={zero_y} y2={zero_y}
          stroke="#475569" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function buildBars(d: PVBlock, label25: string, label26: string, color: string): WBar[] {
  const epPos = d.efecto_precio >= 0;
  const evPos = d.efecto_volumen >= 0;
  return [
    { label: label25, value: d.venta_25, base: 0, color: "#64748B", absolute: true },
    { label: label26, value: d.venta_26, base: 0, color: color,      absolute: true },
    { label: "Ef. Precio",  value: d.efecto_precio,  base: d.venta_25, color: epPos ? "#10B981" : "#EF4444" },
    { label: "Ef. Volumen", value: d.efecto_volumen, base: d.venta_25 + d.efecto_precio, color: evPos ? "#10B981" : "#EF4444" },
  ];
}

/* ─── KPI Badge ──────────────────────────────────────────────────────────── */
function KpiBadge({ label, value, color }: { label: string; value: number; color?: string }) {
  const isPos = value >= 0;
  const clr = color || (isPos ? "#10B981" : "#EF4444");
  return (
    <div style={{
      flex: "1 1 140px", background: "white", border: "1px solid #E2E8F0",
      borderRadius: 10, padding: "12px 16px",
      borderLeft: `4px solid ${clr}`,
    }}>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: clr, fontVariantNumeric: "tabular-nums" }}>
        {value >= 0 ? "+" : ""}{fmt(value)}
      </div>
      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{fmtFull(value)}</div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function EfectoPVPage() {
  const curMonth = new Date().getMonth() + 1;
  const [mes, setMes] = useState(curMonth);
  const [data, setData] = useState<PVData | null>(null);
  const [productos, setProductos] = useState<ProductoPV[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProd, setLoadingProd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroPrecio, setFiltroPrecio] = useState<"todos" | "sube" | "baja">("todos");
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback((m: number) => {
    setLoading(true);
    setLoadingProd(true);
    setError(null);
    const token = localStorage.getItem("lbf_token") || "";

    // Load aggregates
    const ctrl1 = new AbortController();
    fetch(`${API}/api/clientes/efecto-pv?periodo=mes&mes=${m}`, {
      signal: ctrl1.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((d: PVData) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => { if (e.name !== "AbortError") setError(e.message || "Error cargando datos"); })
      .finally(() => setLoading(false));

    // Load product breakdown
    const ctrl2 = new AbortController();
    fetch(`${API}/api/clientes/efecto-pv/productos?periodo=mes&mes=${m}`, {
      signal: ctrl2.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: ProductoPV[] | { error: string }) => {
        if (!Array.isArray(d)) return;
        setProductos(d);
      })
      .catch(() => {})
      .finally(() => setLoadingProd(false));
  }, []);

  useEffect(() => { load(mes); }, [mes, load]);

  const card: React.CSSProperties = {
    background: "white", border: "1px solid #E2E8F0",
    borderRadius: 12, padding: 24,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href="/dashboard/clientes" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
              ← Clientes
            </a>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: "4px 0 2px" }}>
            Efecto Precio / Volumen
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            Descomposición del cambio de venta vs mismo mes año anterior
          </p>
        </div>

        {/* Month selector */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Array.from({ length: curMonth }, (_, i) => i + 1).map(m => (
            <button
              key={m}
              onClick={() => setMes(m)}
              style={{
                padding: "6px 11px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: mes === m ? 700 : 400,
                background: mes === m ? "#DBEAFE" : "#F1F5F9",
                color: mes === m ? "#1E40AF" : "#64748B",
                transition: "all 0.1s",
              }}
            >
              {MESES[m]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding: 60, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
          Calculando efectos…
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 24, color: "#EF4444", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA" }}>
          Error: {error}
        </div>
      )}

      {!loading && data && !error && (() => {
        const t = data.total;
        const label25 = `${MESES_FULL[mes].slice(0, 3)} '25`;
        const label26 = `${MESES_FULL[mes].slice(0, 3)} '26`;
        const diff = t.venta_26 - t.venta_25;
        const crec = t.venta_25 > 0 ? ((t.venta_26 / t.venta_25) - 1) * 100 : 0;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPI Row */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KpiBadge label={`Venta ${label25}`} value={t.venta_25} color="#64748B" />
              <KpiBadge label={`Venta ${label26}`} value={t.venta_26} color="#3B82F6" />
              <KpiBadge label="Δ Total" value={diff} />
              <KpiBadge label="Efecto Precio" value={t.efecto_precio} />
              <KpiBadge label="Efecto Volumen" value={t.efecto_volumen} />
              <div style={{
                flex: "1 1 140px", background: "white", border: "1px solid #E2E8F0",
                borderRadius: 10, padding: "12px 16px", borderLeft: `4px solid #8B5CF6`,
              }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Crecimiento
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: crec >= 0 ? "#10B981" : "#EF4444" }}>
                  {crec >= 0 ? "+" : ""}{crec.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Row 1: Waterfall Total + Segmentos */}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              {/* Gráfico 1 — Total (ancho fijo) */}
              <div style={{ ...card, flex: "0 0 400px" }}>
                <WaterfallChart
                  title={`Total — ${MESES_FULL[mes]} 2026 vs 2025`}
                  bars={buildBars(t, label25, label26, "#3B82F6")}
                  height={260}
                />
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#64748B" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: "#10B981", borderRadius: 2, display: "inline-block" }} />
                    Positivo
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: "#EF4444", borderRadius: 2, display: "inline-block" }} />
                    Negativo
                  </span>
                </div>
              </div>

              {/* Gráfico 2 — Segmentos (ocupa el resto, sub-charts apilados verticalmente) */}
              <div style={{ ...card, flex: "1 1 0", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
                  Por Segmento — {MESES_FULL[mes]} 2026 vs 2025
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  {(["PUBLICO", "PRIVADO"] as const).map(seg => {
                    const s = data.segmentos[seg];
                    if (!s) return null;
                    const color = SEG_COLOR[seg];
                    return (
                      <div key={seg}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color, marginBottom: 8,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
                          {seg}
                        </div>
                        <WaterfallChart
                          bars={buildBars(s, label25, label26, color)}
                          height={240}
                        />
                        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                          <span style={{ color: s.efecto_precio >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                            Precio: {s.efecto_precio >= 0 ? "+" : ""}{fmt(s.efecto_precio)}
                          </span>
                          <span style={{ color: s.efecto_volumen >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                            Volumen: {s.efecto_volumen >= 0 ? "+" : ""}{fmt(s.efecto_volumen)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Gráfico 3 — Por Categoría */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
                Por Categoría — {MESES_FULL[mes]} 2026 vs 2025
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28 }}>
                {/* Categorías individuales */}
                {data.categorias.map(cat => (
                  <div key={cat.categoria}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: CAT_COLOR[cat.categoria] || "#374151",
                      marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {cat.categoria}
                    </div>
                    <WaterfallChart
                      compact
                      bars={buildBars(cat, label25, label26, CAT_COLOR[cat.categoria] || "#374151")}
                      height={240}
                    />
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                      <span style={{ color: cat.efecto_precio >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                        Precio: {cat.efecto_precio >= 0 ? "+" : ""}{fmt(cat.efecto_precio)}
                      </span>
                      <span style={{ color: cat.efecto_volumen >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                        Volumen: {cat.efecto_volumen >= 0 ? "+" : ""}{fmt(cat.efecto_volumen)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    TOTAL
                  </div>
                  <WaterfallChart
                    compact
                    bars={buildBars(t, label25, label26, "#374151")}
                    height={240}
                  />
                  <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                    <span style={{ color: t.efecto_precio >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                      Precio: {t.efecto_precio >= 0 ? "+" : ""}{fmt(t.efecto_precio)}
                    </span>
                    <span style={{ color: t.efecto_volumen >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                      Volumen: {t.efecto_volumen >= 0 ? "+" : ""}{fmt(t.efecto_volumen)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla Desglose por Producto */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                  Desglose por Producto — Efecto Precio
                  {loadingProd && <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>cargando…</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Buscar producto…"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{
                      padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6,
                      fontSize: 12, color: "#0F172A", background: "white", outline: "none",
                      width: 180,
                    }}
                  />
                  {(["todos", "sube", "baja"] as const).map(f => (
                    <button key={f} onClick={() => setFiltroPrecio(f)} style={{
                      padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: filtroPrecio === f ? 700 : 400,
                      background: filtroPrecio === f
                        ? (f === "sube" ? "#DCFCE7" : f === "baja" ? "#FEE2E2" : "#DBEAFE")
                        : "#F1F5F9",
                      color: filtroPrecio === f
                        ? (f === "sube" ? "#166534" : f === "baja" ? "#991B1B" : "#1E40AF")
                        : "#64748B",
                    }}>
                      {f === "todos" ? "Todos" : f === "sube" ? "↑ Subida" : "↓ Bajada"}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const term = busqueda.toLowerCase();
                const rows = productos
                  .filter(p => {
                    if (filtroPrecio === "sube" && p.delta_precio_pct <= 0) return false;
                    if (filtroPrecio === "baja" && p.delta_precio_pct >= 0) return false;
                    if (term && !p.descripcion.toLowerCase().includes(term) && !p.codigo.toLowerCase().includes(term)) return false;
                    return true;
                  })
                  .slice(0, 200);

                const totalEfPrecio = rows.reduce((s, p) => s + p.efecto_precio, 0);

                const thStyle: React.CSSProperties = {
                  padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#64748B",
                  textAlign: "left", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0",
                  whiteSpace: "nowrap",
                };
                const tdStyle: React.CSSProperties = {
                  padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #F1F5F9",
                  color: "#0F172A",
                };
                const tdNum: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

                return (
                  <div>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                      {rows.length} productos · Efecto precio total filtrado:{" "}
                      <span style={{ fontWeight: 700, color: totalEfPrecio >= 0 ? "#10B981" : "#EF4444" }}>
                        {totalEfPrecio >= 0 ? "+" : ""}{fmtFull(totalEfPrecio)}
                      </span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Código</th>
                            <th style={thStyle}>Descripción</th>
                            <th style={thStyle}>Cat.</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>P. Prom '25</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>P. Prom '26</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Δ Precio</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Ef. Precio</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Ef. Volumen</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Venta '26</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p, i) => {
                            const priceUp = p.delta_precio_pct > 0;
                            const priceDown = p.delta_precio_pct < 0;
                            const rowBg = i % 2 === 0 ? "white" : "#FAFAFA";
                            return (
                              <tr key={p.codigo} style={{ background: rowBg }}>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: "#64748B" }}>{p.codigo}</td>
                                <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {p.descripcion || p.codigo}
                                </td>
                                <td style={{ ...tdStyle, fontSize: 11 }}>
                                  <span style={{
                                    background: CAT_COLOR[p.categoria] ? CAT_COLOR[p.categoria] + "22" : "#F1F5F9",
                                    color: CAT_COLOR[p.categoria] || "#374151",
                                    padding: "2px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10,
                                  }}>
                                    {p.categoria}
                                  </span>
                                </td>
                                <td style={tdNum}>{p.precio_25 > 0 ? "$" + p.precio_25.toLocaleString("es-CL") : "—"}</td>
                                <td style={tdNum}>{p.precio_26 > 0 ? "$" + p.precio_26.toLocaleString("es-CL") : "—"}</td>
                                <td style={{ ...tdNum, fontWeight: 700, color: priceUp ? "#10B981" : priceDown ? "#EF4444" : "#94A3B8" }}>
                                  {p.delta_precio_pct === 0 ? "—" : `${p.delta_precio_pct > 0 ? "+" : ""}${p.delta_precio_pct.toFixed(1)}%`}
                                </td>
                                <td style={{ ...tdNum, fontWeight: 700, color: p.efecto_precio >= 0 ? "#10B981" : "#EF4444" }}>
                                  {p.efecto_precio >= 0 ? "+" : ""}{fmt(p.efecto_precio)}
                                </td>
                                <td style={{ ...tdNum, color: p.efecto_volumen >= 0 ? "#10B981" : "#EF4444" }}>
                                  {p.efecto_volumen >= 0 ? "+" : ""}{fmt(p.efecto_volumen)}
                                </td>
                                <td style={tdNum}>{fmt(p.venta_26)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        );
      })()}
    </div>
  );
}
