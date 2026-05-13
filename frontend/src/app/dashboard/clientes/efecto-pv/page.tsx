"use client";

import React, { useEffect, useState, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PVBlock {
  venta_25: number;
  venta_26: number;
  efecto_precio: number;
  efecto_volumen: number;
}

interface CatBlock extends PVBlock {
  categoria: string;
}

interface PVData {
  label: string;
  total: PVBlock;
  segmentos: Record<string, PVBlock>;
  categorias: CatBlock[];
  error?: string;
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


function sign(n: number): string { return n >= 0 ? "+" : ""; }
function posColor(n: number): string { return n >= 0 ? "#10B981" : "#EF4444"; }

/* ─── WaterfallChart ─────────────────────────────────────────────────────── */
interface WBar {
  label: string;
  value: number;
  base: number;
  color: string;
  absolute?: boolean;
}

function WaterfallChart({ bars, height = 220, compact = false }: {
  bars: WBar[]; height?: number; compact?: boolean;
}) {
  const padL = compact ? 54 : 66;
  const padR = compact ? 8 : 12;
  const padT = compact ? 22 : 26;
  const padB = compact ? 36 : 42;
  const W    = compact ? 380 : 520;
  const H    = height;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const fAxis = compact ? 8 : 9;
  const fVal  = compact ? 9 : 10;
  const fX    = compact ? 9 : 10;

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
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {ticks.map((t, i) => {
        const y = scaleY(t) + padT;
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y}
              stroke={t === 0 ? "#94A3B8" : "#E2E8F0"}
              strokeWidth={t === 0 ? 1.5 : 1}
              strokeDasharray={t === 0 ? "none" : "4 3"} />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={fAxis} fill="#94A3B8">
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
                x1={x + barW}
                x2={padL + (i + 1) * barGap + barGap / 2 - barW / 2}
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
  );
}

/* ─── KpiBadge ───────────────────────────────────────────────────────────── */
function KpiBadge({ label, value, color, isPercent }: {
  label: string; value: number; color?: string; isPercent?: boolean;
}) {
  const isPos = value >= 0;
  const clr = color ?? (isPos ? "#10B981" : "#EF4444");
  return (
    <div style={{
      flex: "1 1 140px", background: "white", border: "1px solid #E2E8F0",
      borderRadius: 10, padding: "12px 16px", borderLeft: `4px solid ${clr}`,
    }}>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: clr, fontVariantNumeric: "tabular-nums" }}>
        {isPercent
          ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
          : `${value >= 0 ? "+" : ""}${fmt(value)}`}
      </div>
      {!isPercent && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{(value < 0 ? "-$" : "$") + Math.abs(value).toLocaleString("es-CL")}</div>}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function EfectoPVPage() {
  const curMonth = new Date().getMonth() + 1;
  const [mes, setMes] = useState(curMonth);
  const [data, setData] = useState<PVData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((m: number) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("lbf_token") || "";

    fetch(`${API}/api/clientes/efecto-pv?periodo=mes&mes=${m}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: PVData) => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(e.message || "Error cargando datos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(mes); }, [mes, load]);

  const label25 = `${MESES[mes]} '25`;
  const label26 = `${MESES[mes]} '26`;

  function buildBars(d: PVBlock, color: string): WBar[] {
    return [
      { label: label25,       value: d.venta_25,       base: 0,                              color: "#64748B", absolute: true },
      { label: "Ef. Precio",  value: d.efecto_precio,  base: d.venta_25,                     color: posColor(d.efecto_precio) },
      { label: "Ef. Volumen", value: d.efecto_volumen, base: d.venta_25 + d.efecto_precio,   color: posColor(d.efecto_volumen) },
      { label: label26,       value: d.venta_26,       base: 0,                              color, absolute: true },
    ];
  }

  const cardStyle: React.CSSProperties = {
    background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
    padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <a href="/dashboard/clientes" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
            ← Clientes
          </a>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: "4px 0 2px" }}>
            Efecto Precio / Volumen
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            {MESES_FULL[mes]} 2026 vs 2025 · Descomposición a nivel SKU × cliente
          </p>
        </div>

        {/* Month selector */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Array.from({ length: curMonth }, (_, i) => i + 1).map(m => (
            <button key={m} onClick={() => setMes(m)} style={{
              padding: "6px 11px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: mes === m ? 700 : 400,
              background: mes === m ? "#DBEAFE" : "#F1F5F9",
              color: mes === m ? "#1E40AF" : "#64748B",
            }}>
              {MESES[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / Error */}
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
        const diff = t.venta_26 - t.venta_25;
        const crec = t.venta_25 > 0 ? ((t.venta_26 / t.venta_25) - 1) * 100 : 0;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
            {/* KPI row */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KpiBadge label={`Venta ${label25}`} value={t.venta_25} color="#64748B" />
              <KpiBadge label={`Venta ${label26}`} value={t.venta_26} color="#3B82F6" />
              <KpiBadge label="Δ Total"        value={diff} />
              <KpiBadge label="Efecto Precio"  value={t.efecto_precio} />
              <KpiBadge label="Efecto Volumen" value={t.efecto_volumen} />
              <KpiBadge label="Crecimiento"    value={crec} color="#8B5CF6" isPercent />
            </div>

            {/* Por Segmento */}
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
                Por Segmento — {label25} vs {label26}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                {(["PUBLICO", "PRIVADO"] as const).map(seg => {
                  const s = data.segmentos[seg];
                  if (!s) return null;
                  const color = SEG_COLOR[seg];
                  return (
                    <div key={seg}>
                      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {seg}
                      </div>
                      <WaterfallChart bars={buildBars(s, color)} height={280} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, fontSize: 12 }}>
                        <span style={{ color: posColor(s.efecto_precio), fontWeight: 700 }}>
                          Precio: {sign(s.efecto_precio)}{fmt(s.efecto_precio)}
                        </span>
                        <span style={{ color: posColor(s.efecto_volumen), fontWeight: 700 }}>
                          Volumen: {sign(s.efecto_volumen)}{fmt(s.efecto_volumen)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Por Categoría */}
            {data.categorias && data.categorias.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>
                  Por Categoría — {label25} vs {label26}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
                  {data.categorias.map(cat => {
                    const color = CAT_COLOR[cat.categoria] ?? "#64748B";
                    return (
                      <div key={cat.categoria}>
                        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {cat.categoria}
                        </div>
                        <WaterfallChart bars={buildBars(cat, color)} height={320} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, fontSize: 12 }}>
                          <span style={{ color: posColor(cat.efecto_precio), fontWeight: 700 }}>
                            Precio: {sign(cat.efecto_precio)}{fmt(cat.efecto_precio)}
                          </span>
                          <span style={{ color: posColor(cat.efecto_volumen), fontWeight: 700 }}>
                            Volumen: {sign(cat.efecto_volumen)}{fmt(cat.efecto_volumen)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {/* TOTAL */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      TOTAL
                    </div>
                    <WaterfallChart bars={buildBars(t, "#0F172A")} height={320} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, fontSize: 12 }}>
                      <span style={{ color: posColor(t.efecto_precio), fontWeight: 700 }}>
                        Precio: {sign(t.efecto_precio)}{fmt(t.efecto_precio)}
                      </span>
                      <span style={{ color: posColor(t.efecto_volumen), fontWeight: 700 }}>
                        Volumen: {sign(t.efecto_volumen)}{fmt(t.efecto_volumen)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
