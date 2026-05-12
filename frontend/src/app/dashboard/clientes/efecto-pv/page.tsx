"use client";

import React, { useEffect, useState, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PVBlock {
  venta_25: number;
  venta_26: number;
  efecto_precio: number;
  efecto_volumen: number;
  ef_v_mismo?: number;
  v_nuevos_prod?: number;
  v_perdidos_prod?: number;
}

interface CliBlock {
  existentes_v26: number;
  existentes_v25: number;
  nuevos_v26: number;
  perdidos_v25: number;
  n_existentes: number;
  n_nuevos: number;
  n_perdidos: number;
}

interface PVData {
  label: string;
  total: PVBlock;
  segmentos: Record<string, PVBlock>;
  categorias: Array<{ categoria: string } & PVBlock>;
  clientes?: {
    total: CliBlock;
    segmentos: Record<string, CliBlock>;
  };
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

type TabId = "pv" | "volumen" | "clientes" | "categoria";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_FULL = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CAT_COLOR: Record<string, string> = {
  MAH: "#10B981", EQM: "#F59E0B", SQ: "#3B82F6", EVA: "#8B5CF6",
};
const SEG_COLOR: Record<string, string> = { PUBLICO: "#3B82F6", PRIVADO: "#10B981" };

const TABS: { id: TabId; label: string }[] = [
  { id: "pv",       label: "P/V por Producto" },
  { id: "volumen",  label: "Desglose Volumen" },
  { id: "clientes", label: "Por Tipo de Cliente" },
  { id: "categoria",label: "Por Categoría" },
];

const TAB_INFO: Record<TabId, string> = {
  pv: "Descomposición precio/volumen calculada a nivel SKU × cliente. Cada barra (Ef. Precio + Ef. Volumen) suma exactamente la diferencia total de venta. Los productos vendidos solo en un año van completamente a Efecto Volumen.",
  volumen: "El Efecto Volumen se desglosa en tres componentes: cambio de volumen en productos comprados en ambos años, productos nuevos incorporados en 2026, y productos dejados de comprar.",
  clientes: "El cambio total se descompone según el tipo de cliente: Existentes (compró en 2025 y 2026), Nuevos (solo en 2026) y Perdidos (solo en 2025). Los cuatro componentes siempre suman exactamente la diferencia total.",
  categoria: "El cambio de venta se muestra de forma independiente por categoría de producto (MAH, EQM, SQ, EVA). Permite identificar qué categoría explica el crecimiento o caída.",
};

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

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function InfoCard({ text }: { text: string }) {
  return (
    <div style={{
      background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8,
      padding: "10px 16px", fontSize: 12, color: "#0369A1",
      lineHeight: 1.6, marginBottom: 20,
    }}>
      ℹ️ {text}
    </div>
  );
}

function KpiBadge({ label, value, color }: { label: string; value: number; color?: string }) {
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
        {value >= 0 ? "+" : ""}{fmt(value)}
      </div>
      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{fmtFull(value)}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  const card: React.CSSProperties = {
    background: "white", border: "1px solid #E2E8F0",
    borderRadius: 12, overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  };
  return (
    <div style={card}>
      {title && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{title}</span>
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

/* ─── Tab 1: P/V por Producto ────────────────────────────────────────────── */
function TabPV({ data, label25, label26 }: { data: PVData; label25: string; label26: string }) {
  const t = data.total;
  const diff = t.venta_26 - t.venta_25;
  const crec = t.venta_25 > 0 ? ((t.venta_26 / t.venta_25) - 1) * 100 : 0;

  function buildBars(d: PVBlock, color: string): WBar[] {
    return [
      { label: label25,      value: d.venta_25,      base: 0,           color: "#64748B", absolute: true },
      { label: "Ef. Precio", value: d.efecto_precio,  base: d.venta_25,  color: posColor(d.efecto_precio) },
      { label: "Ef. Volumen",value: d.efecto_volumen, base: d.venta_25 + d.efecto_precio, color: posColor(d.efecto_volumen) },
      { label: label26,      value: d.venta_26,       base: 0,           color, absolute: true },
    ];
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBadge label={`Venta ${label25}`} value={t.venta_25} color="#64748B" />
        <KpiBadge label={`Venta ${label26}`} value={t.venta_26} color="#3B82F6" />
        <KpiBadge label="Δ Total" value={diff} />
        <KpiBadge label="Efecto Precio" value={t.efecto_precio} />
        <KpiBadge label="Efecto Volumen" value={t.efecto_volumen} />
        <div style={{
          flex: "1 1 140px", background: "white", border: "1px solid #E2E8F0",
          borderRadius: 10, padding: "12px 16px", borderLeft: "4px solid #8B5CF6",
        }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Crecimiento</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: crec >= 0 ? "#10B981" : "#EF4444" }}>
            {crec >= 0 ? "+" : ""}{crec.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Waterfalls */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <SectionCard title={`Total — ${label25} vs ${label26}`}>
          <WaterfallChart bars={buildBars(t, "#3B82F6")} height={260} />
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
        </SectionCard>

        <div style={{
          flex: "1 1 400px", background: "white", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
            Por Segmento
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {(["PUBLICO", "PRIVADO"] as const).map(seg => {
              const s = data.segmentos[seg];
              if (!s) return null;
              const color = SEG_COLOR[seg];
              return (
                <div key={seg}>
                  <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {seg}
                  </div>
                  <WaterfallChart bars={buildBars(s, color)} height={240} />
                  <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                    <span style={{ color: posColor(s.efecto_precio), fontWeight: 600 }}>
                      Precio: {sign(s.efecto_precio)}{fmt(s.efecto_precio)}
                    </span>
                    <span style={{ color: posColor(s.efecto_volumen), fontWeight: 600 }}>
                      Volumen: {sign(s.efecto_volumen)}{fmt(s.efecto_volumen)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab 2: Desglose Volumen ────────────────────────────────────────────── */
function TabVolumen({ data, label25, label26 }: { data: PVData; label25: string; label26: string }) {
  function buildBars(d: PVBlock, color: string): WBar[] {
    const efPrecio  = d.efecto_precio;
    const efVMismo  = d.ef_v_mismo   ?? 0;
    const vNuevos   = d.v_nuevos_prod ?? 0;
    const vPerdidos = -(d.v_perdidos_prod ?? 0);

    const b1 = d.venta_25;
    const b2 = b1 + efPrecio;
    const b3 = b2 + efVMismo;
    const b4 = b3 + vNuevos;

    return [
      { label: label25,       value: d.venta_25, base: 0,  color: "#64748B", absolute: true },
      { label: "Ef. Precio",  value: efPrecio,   base: b1, color: posColor(efPrecio) },
      { label: "Vol. Mismo",  value: efVMismo,   base: b2, color: posColor(efVMismo) },
      { label: "+ Nuevos",    value: vNuevos,    base: b3, color: "#10B981" },
      { label: "− Perdidos",  value: vPerdidos,  base: b4, color: "#EF4444" },
      { label: label26,       value: d.venta_26, base: 0,  color, absolute: true },
    ];
  }

  const t = data.total;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBadge label="Ef. Precio"       value={t.efecto_precio} />
        <KpiBadge label="Vol. Mismo Prod."  value={t.ef_v_mismo   ?? 0} />
        <KpiBadge label="Prod. Nuevos"      value={t.v_nuevos_prod ?? 0} color="#10B981" />
        <KpiBadge label="Prod. Perdidos"    value={-(t.v_perdidos_prod ?? 0)} color="#EF4444" />
        <KpiBadge label="Δ Total"           value={t.venta_26 - t.venta_25} />
      </div>

      {/* Table legend */}
      <div style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
        padding: "12px 16px", fontSize: 12, color: "#374151",
        display: "flex", gap: 24, flexWrap: "wrap",
      }}>
        <span><span style={{ fontWeight: 700, color: "#64748B" }}>Ef. Precio:</span> cambio de precio unitario en productos vendidos en ambos años</span>
        <span><span style={{ fontWeight: 700, color: "#64748B" }}>Vol. Mismo:</span> cambio de cantidad en productos vendidos en ambos años</span>
        <span><span style={{ fontWeight: 700, color: "#10B981" }}>+ Nuevos:</span> productos vendidos en 2026 que no existían en 2025</span>
        <span><span style={{ fontWeight: 700, color: "#EF4444" }}>− Perdidos:</span> productos vendidos en 2025 que no se compraron en 2026</span>
      </div>

      {/* Waterfalls */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <SectionCard title="Total">
          <WaterfallChart bars={buildBars(t, "#3B82F6")} height={280} />
        </SectionCard>

        <div style={{
          flex: "1 1 400px", background: "white", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Por Segmento</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {(["PUBLICO", "PRIVADO"] as const).map(seg => {
              const s = data.segmentos[seg];
              if (!s) return null;
              const color = SEG_COLOR[seg];
              return (
                <div key={seg}>
                  <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {seg}
                  </div>
                  <WaterfallChart bars={buildBars(s, color)} height={260} />
                  <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, flexWrap: "wrap" }}>
                    <span style={{ color: posColor(s.ef_v_mismo ?? 0) }}>
                      Vol: {sign(s.ef_v_mismo ?? 0)}{fmt(s.ef_v_mismo ?? 0)}
                    </span>
                    <span style={{ color: "#10B981" }}>
                      Nuevos: +{fmt(s.v_nuevos_prod ?? 0)}
                    </span>
                    <span style={{ color: "#EF4444" }}>
                      Perd: -{fmt(s.v_perdidos_prod ?? 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab 3: Por Tipo de Cliente ─────────────────────────────────────────── */
function TabClientes({ data, label25, label26 }: { data: PVData; label25: string; label26: string }) {
  const cli = data.clientes;
  if (!cli) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
        Datos de tipo de cliente no disponibles — reinicia el backend para cargar esta vista.
      </div>
    );
  }

  function buildBars(c: CliBlock, color: string): WBar[] {
    const delta_existentes = c.existentes_v26 - c.existentes_v25;
    const b0 = c.existentes_v25 + c.perdidos_v25;  // = V25
    const b1 = b0 + delta_existentes;
    const b2 = b1 + c.nuevos_v26;

    return [
      { label: label25,       value: b0,                 base: 0,  color: "#64748B", absolute: true },
      { label: "Δ Existentes",value: delta_existentes,   base: b0, color: posColor(delta_existentes) },
      { label: "+ Nuevos",    value: c.nuevos_v26,       base: b1, color: "#10B981" },
      { label: "− Perdidos",  value: -c.perdidos_v25,    base: b2, color: "#EF4444" },
      { label: label26,       value: c.existentes_v26 + c.nuevos_v26, base: 0, color, absolute: true },
    ];
  }

  function CliStats({ c, color, label }: { c: CliBlock; color: string; label: string }) {
    const deltaEx = c.existentes_v26 - c.existentes_v25;
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { label: "Existentes", n: c.n_existentes, v: deltaEx, sub: `${fmt(c.existentes_v25)} → ${fmt(c.existentes_v26)}` },
            { label: "Nuevos",     n: c.n_nuevos,     v: c.nuevos_v26,  sub: "solo en 2026", forceColor: "#10B981" },
            { label: "Perdidos",   n: c.n_perdidos,   v: -c.perdidos_v25, sub: "solo en 2025", forceColor: "#EF4444" },
          ].map(item => (
            <div key={item.label} style={{
              flex: "1 1 120px", background: "#F8FAFC", borderRadius: 8,
              padding: "10px 12px", border: "1px solid #E2E8F0",
            }}>
              <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.forceColor ?? posColor(item.v) }}>
                {sign(item.v)}{fmt(item.v)}
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                {item.n} cliente{item.n !== 1 ? "s" : ""} · {item.sub}
              </div>
            </div>
          ))}
        </div>
        <WaterfallChart bars={buildBars(c, color)} height={240} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Total */}
      <SectionCard title="Total — Todos los Segmentos">
        <CliStats c={cli.total} color="#475569" label="TOTAL" />
      </SectionCard>

      {/* Por Segmento */}
      <div style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
        padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>
          Por Segmento
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          {(["PUBLICO", "PRIVADO"] as const).map(seg => {
            const c = cli.segmentos[seg];
            if (!c) return null;
            return (
              <CliStats key={seg} c={c} color={SEG_COLOR[seg]} label={seg} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab 4: Por Categoría ───────────────────────────────────────────────── */
function TabCategoria({ data, label25, label26 }: { data: PVData; label25: string; label26: string }) {
  function buildBars(d: PVBlock, color: string): WBar[] {
    return [
      { label: label25,       value: d.venta_25,      base: 0,          color: "#64748B", absolute: true },
      { label: "Ef. Precio",  value: d.efecto_precio,  base: d.venta_25, color: posColor(d.efecto_precio) },
      { label: "Ef. Volumen", value: d.efecto_volumen, base: d.venta_25 + d.efecto_precio, color: posColor(d.efecto_volumen) },
      { label: label26,       value: d.venta_26,       base: 0,          color, absolute: true },
    ];
  }

  // Summary table
  const thS: React.CSSProperties = {
    padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#1E3A5F",
    background: "#EFF6FF", textAlign: "left", whiteSpace: "nowrap",
  };
  const tdS: React.CSSProperties = {
    padding: "8px 12px", fontSize: 12, borderBottom: "1px solid #F1F5F9", color: "#0F172A",
  };
  const tdN: React.CSSProperties = { ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Grid of waterfalls */}
      <div style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
        padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>
          Waterfall por Categoría
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32 }}>
          {data.categorias.map(cat => {
            const color = CAT_COLOR[cat.categoria] || "#374151";
            return (
              <div key={cat.categoria}>
                <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {cat.categoria}
                </div>
                <WaterfallChart compact bars={buildBars(cat, color)} height={240} />
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
                  <span style={{ color: posColor(cat.efecto_precio), fontWeight: 600 }}>
                    Precio: {sign(cat.efecto_precio)}{fmt(cat.efecto_precio)}
                  </span>
                  <span style={{ color: posColor(cat.efecto_volumen), fontWeight: 600 }}>
                    Volumen: {sign(cat.efecto_volumen)}{fmt(cat.efecto_volumen)}
                  </span>
                </div>
              </div>
            );
          })}
          {/* Total */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              TOTAL
            </div>
            <WaterfallChart compact bars={buildBars(data.total, "#374151")} height={240} />
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
              <span style={{ color: posColor(data.total.efecto_precio), fontWeight: 600 }}>
                Precio: {sign(data.total.efecto_precio)}{fmt(data.total.efecto_precio)}
              </span>
              <span style={{ color: posColor(data.total.efecto_volumen), fontWeight: 600 }}>
                Volumen: {sign(data.total.efecto_volumen)}{fmt(data.total.efecto_volumen)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary table */}
      <SectionCard title="Resumen por Categoría">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Categoría</th>
                <th style={{ ...thS, textAlign: "right" }}>Venta {label25}</th>
                <th style={{ ...thS, textAlign: "right" }}>Venta {label26}</th>
                <th style={{ ...thS, textAlign: "right" }}>Δ Total</th>
                <th style={{ ...thS, textAlign: "right" }}>Ef. Precio</th>
                <th style={{ ...thS, textAlign: "right" }}>Ef. Volumen</th>
                <th style={{ ...thS, textAlign: "right" }}>Crec.</th>
              </tr>
            </thead>
            <tbody>
              {[...data.categorias, { categoria: "TOTAL", ...data.total }].map((cat, i) => {
                const isTotal = cat.categoria === "TOTAL";
                const color = CAT_COLOR[cat.categoria] || "#374151";
                const diff = cat.venta_26 - cat.venta_25;
                const crec = cat.venta_25 > 0 ? ((cat.venta_26 / cat.venta_25) - 1) * 100 : 0;
                return (
                  <tr key={cat.categoria} style={{
                    background: isTotal ? "#F8FAFC" : i % 2 === 0 ? "white" : "#FAFAFA",
                    fontWeight: isTotal ? 700 : 400,
                  }}>
                    <td style={tdS}>
                      {!isTotal && (
                        <span style={{
                          display: "inline-block", width: 10, height: 10,
                          background: color, borderRadius: 2, marginRight: 8,
                        }} />
                      )}
                      {cat.categoria}
                    </td>
                    <td style={tdN}>{fmt(cat.venta_25)}</td>
                    <td style={tdN}>{fmt(cat.venta_26)}</td>
                    <td style={{ ...tdN, color: posColor(diff), fontWeight: 700 }}>
                      {sign(diff)}{fmt(diff)}
                    </td>
                    <td style={{ ...tdN, color: posColor(cat.efecto_precio) }}>
                      {sign(cat.efecto_precio)}{fmt(cat.efecto_precio)}
                    </td>
                    <td style={{ ...tdN, color: posColor(cat.efecto_volumen) }}>
                      {sign(cat.efecto_volumen)}{fmt(cat.efecto_volumen)}
                    </td>
                    <td style={{ ...tdN, color: posColor(crec), fontWeight: 700 }}>
                      {sign(crec)}{crec.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function EfectoPVPage() {
  const curMonth = new Date().getMonth() + 1;
  const [mes, setMes] = useState(curMonth);
  const [activeTab, setActiveTab] = useState<TabId>("pv");
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

    fetch(`${API}/api/clientes/efecto-pv?periodo=mes&mes=${m}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: PVData) => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(e.message || "Error cargando datos"))
      .finally(() => setLoading(false));

    fetch(`${API}/api/clientes/efecto-pv/productos?periodo=mes&mes=${m}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: ProductoPV[] | { error: string }) => { if (Array.isArray(d)) setProductos(d); })
      .catch(() => {})
      .finally(() => setLoadingProd(false));
  }, []);

  useEffect(() => { load(mes); }, [mes, load]);

  const label25 = `${MESES_FULL[mes].slice(0, 3)} '25`;
  const label26 = `${MESES_FULL[mes].slice(0, 3)} '26`;

  const thStyle: React.CSSProperties = {
    padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#64748B",
    textAlign: "left", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #F1F5F9", color: "#0F172A",
  };
  const tdNum: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

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
            {MESES_FULL[mes]} 2026 vs 2025 · 4 perspectivas de análisis
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

      {/* 4 Tabs */}
      <div style={{ display: "flex", borderBottom: "2px solid #E2E8F0", marginBottom: 20, gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 20px", border: "none", cursor: "pointer", background: "transparent",
            fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
            color: activeTab === t.id ? "#1E40AF" : "#64748B",
            borderBottom: activeTab === t.id ? "2px solid #3B82F6" : "2px solid transparent",
            marginBottom: -2, transition: "all 0.1s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Info card for active tab */}
      <InfoCard text={TAB_INFO[activeTab]} />

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

      {/* Tab content */}
      {!loading && data && !error && (
        <div style={{ marginBottom: 24 }}>
          {activeTab === "pv"        && <TabPV       data={data} label25={label25} label26={label26} />}
          {activeTab === "volumen"   && <TabVolumen  data={data} label25={label25} label26={label26} />}
          {activeTab === "clientes"  && <TabClientes data={data} label25={label25} label26={label26} />}
          {activeTab === "categoria" && <TabCategoria data={data} label25={label25} label26={label26} />}
        </div>
      )}

      {/* Tabla Desglose por Producto — siempre visible */}
      <div style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Desglose por Producto</span>
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
                fontSize: 12, color: "#0F172A", background: "white", outline: "none", width: 180,
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

        <div style={{ padding: 20 }}>
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

            return (
              <div>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                  {rows.length} productos · Efecto precio filtrado:{" "}
                  <span style={{ fontWeight: 700, color: posColor(totalEfPrecio) }}>
                    {sign(totalEfPrecio)}{fmtFull(totalEfPrecio)}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Código</th>
                        <th style={thStyle}>Descripción</th>
                        <th style={thStyle}>Cat.</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>P. Prom {label25}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>P. Prom {label26}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Δ Precio</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Ef. Precio</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Ef. Volumen</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Venta {label26}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p, i) => {
                        const priceUp   = p.delta_precio_pct > 0;
                        const priceDown = p.delta_precio_pct < 0;
                        return (
                          <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                            <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: "#64748B" }}>{p.codigo}</td>
                            <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.descripcion || p.codigo}
                            </td>
                            <td style={tdStyle}>
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
                            <td style={{ ...tdNum, fontWeight: 700, color: posColor(p.efecto_precio) }}>
                              {sign(p.efecto_precio)}{fmt(p.efecto_precio)}
                            </td>
                            <td style={{ ...tdNum, color: posColor(p.efecto_volumen) }}>
                              {sign(p.efecto_volumen)}{fmt(p.efecto_volumen)}
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
    </div>
  );
}
