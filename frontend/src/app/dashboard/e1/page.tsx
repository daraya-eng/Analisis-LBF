"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { fmtAbs } from "@/lib/format";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList, ReferenceLine,
} from "recharts";

/* ─── Estilos ────────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20,
};
const thS: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#374151",
  fontSize: 11, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", background: "#F8FAFC",
};
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const td: React.CSSProperties = { padding: "7px 10px", color: "#1F2937", fontSize: 12, whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};
const CATS = ["SQ", "MAH", "EQM", "EVA"];

/* ─── Tipos ──────────────────────────────────────────────────── */
interface MetricaSerie { meses: (number | null)[]; total: number | null; }
interface CatKpis {
  e1_total: number | null; ppto_total: number | null; meta_ppto_total: number | null;
  cumpl_total: number | null;
  margen_proy: number | null; margen_ppto: number | null; contrib_total: number | null;
  venta_real_ytd: number | null;
  cumpl_venta_e1: number | null;
  cumpl_venta_ppto: number | null;
  e1_ytd: number | null; meta_ytd: number | null;
  e1_ytg: number | null; meta_ytg: number | null;
}
interface CatData {
  categoria: string;
  metricas: {
    e1: MetricaSerie; ppto: MetricaSerie; cumpl: MetricaSerie;
    margen_ppto: MetricaSerie; margen_proy: MetricaSerie; contrib: MetricaSerie;
    venta_real: MetricaSerie; meta_ppto: MetricaSerie;
  };
  kpis: CatKpis;
}
interface TotalesData {
  categorias: CatData[];
  meses_corto: string[];
  mes_actual: number;
  meta_mensual: number[];   // Meta_Categoria mensual global (misma fuente que Panel Principal)
  global: {
    e1_total: number; ppto_total: number; meta_ppto_total: number | null;
    cumpl_total: number | null;
    venta_real_ytd: number | null;
    cumpl_venta_e1: number | null;
    cumpl_venta_ppto: number | null;
    e1_ytd: number; meta_ytd: number;
    e1_ytg: number; meta_ytg: number;
  };
}
interface SubclaseRow {
  subclase: string; meses: (number | null)[]; total: number; comentario: string | null;
}
interface DetalleData { subclases: SubclaseRow[]; categoria: string; meses_corto: string[]; }

/* ─── Helpers ────────────────────────────────────────────────── */
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return fmtAbs(n);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtLabel(v: any): string {
  const n = Number(v);
  if (!n || isNaN(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString("es-CL")}`;
}
function pct(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return `${n.toFixed(decimals)}%`;
}
function cumplColor(v: number | null) {
  if (v == null) return "#64748B";
  return v >= 100 ? "#10B981" : v >= 90 ? "#F59E0B" : "#EF4444";
}
function margenColor(proy: number | null, meta: number | null) {
  if (proy == null || meta == null) return "#64748B";
  return proy >= meta ? "#10B981" : "#EF4444";
}
function riesgoNivel(cumplVentaE1: number | null, cumplVentaPpto: number | null): { label: string; color: string; bg: string } {
  const ve1 = cumplVentaE1 ?? 100;
  const vp = cumplVentaPpto ?? 100;
  if (vp < 90 || ve1 < 90) return { label: "Riesgo Alto", color: "#EF4444", bg: "#FEF2F2" };
  if (vp < 100 || ve1 < 100) return { label: "Alerta", color: "#F59E0B", bg: "#FFFBEB" };
  return { label: "En Meta", color: "#10B981", bg: "#F0FDF4" };
}

/* ─── Tooltip personalizado para gráfico principal ──────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MainChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#374151" }}>{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => {
        const isPct = p.dataKey === "CumplPPTO" || p.dataKey === "CumplE1";
        const lbl = p.dataKey === "PPTO" ? "Budget 2026" : p.dataKey === "E1" ? "LBE 2026" : p.dataKey === "Venta" ? "Venta Real" : p.dataKey === "CumplPPTO" ? "Cumpl % Budget" : p.dataKey === "CumplE1" ? "Cumpl % LBE" : p.name;
        const clr = p.fill && p.fill !== "none" ? p.fill : p.stroke;
        return p.value != null && (
          <div key={p.dataKey} style={{ color: clr, marginBottom: 2 }}>
            {lbl}: <strong>{isPct ? `${Number(p.value).toFixed(1)}%` : fmtAbs(Number(p.value))}</strong>
          </div>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CatCardTooltip({ active, payload, label, color }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "9px 13px", fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: "#374151" }}>{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.dataKey} style={{ color: p.fill || p.stroke || color, marginBottom: 2 }}>
            {p.name}: <strong>{fmtAbs(Number(p.value))}</strong>
          </div>
        )
      ))}
      {(row?.CumplVPPTO != null || row?.CumplVE1 != null) && (
        <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid #F1F5F9" }}>
          {row?.CumplVPPTO != null && (
            <div style={{ color: cumplColor(row.CumplVPPTO), fontWeight: 700 }}>
              Cumpl % Budget: {row.CumplVPPTO.toFixed(1)}%
            </div>
          )}
          {row?.CumplVE1 != null && (
            <div style={{ color: cumplColor(row.CumplVE1), fontWeight: 600 }}>
              Cumpl % LBE: {row.CumplVE1.toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Componentes de UI ──────────────────────────────────────── */
function KpiCard({ label, value, sub, color, badge }: {
  label: string; value: string; sub?: string; color?: string; badge?: { text: string; color: string };
}) {
  return (
    <div style={{ ...card, flex: "1 1 160px", minWidth: 150, padding: "14px 18px" }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: color || "#0F172A" }}>{value}</span>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: `${badge.color}15`, padding: "1px 6px", borderRadius: 4 }}>
            {badge.text}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function CumplBadge({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: "#94A3B8" }}>—</span>;
  const color = cumplColor(v);
  return (
    <span style={{ fontWeight: 700, color, background: `${color}15`, padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
      {v.toFixed(1)}%
    </span>
  );
}

/* ─── Página principal ───────────────────────────────────────── */
export default function E1Page() {
  const [totales, setTotales] = useState<TotalesData | null>(null);
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [catSel, setCatSel] = useState<string>("SQ");
  const [loading, setLoading] = useState(true);
  const [loadingDet, setLoadingDet] = useState(false);
  const [tab, setTab] = useState<"resumen" | "detalle">("resumen");

  useEffect(() => {
    api.get<TotalesData>("/api/e1/totales")
      .then(setTotales)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadDetalle = useCallback((cat: string) => {
    setLoadingDet(true);
    api.get<DetalleData>(`/api/e1/detalle?categoria=${cat}`)
      .then(setDetalle)
      .catch(console.error)
      .finally(() => setLoadingDet(false));
  }, []);

  useEffect(() => {
    if (tab === "detalle") loadDetalle(catSel);
  }, [tab, catSel, loadDetalle]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748B" }}>Cargando Plan de Ventas LBE...</p>
      </div>
    </div>
  );

  if (!totales) return <p style={{ color: "#EF4444", padding: 40 }}>Error al cargar datos</p>;

  const g = totales.global;
  const meses = totales.meses_corto;
  const mesActualIdx = totales.mes_actual - 1; // 0-based
  const mesNombre = meses[mesActualIdx] ?? "";

  // ── Datos para gráfico global ─────────────────────────────────
  const chartData = meses.map((mes, i) => {
    let e1sum = 0, pptosum = 0, vrsum = 0, hasVr = false;
    totales.categorias.forEach(c => {
      e1sum += c.metricas.e1?.meses[i] || 0;
      pptosum += c.metricas.ppto?.meses[i] || 0;
      const vr = c.metricas.venta_real?.meses[i];
      if (vr != null) { vrsum += vr; hasVr = true; }
    });
    // Meta_Categoria = misma fuente que Panel Principal para CumplPPTO
    const metaSum = totales.meta_mensual?.[i] || 0;
    // Cumplimiento solo para meses completados (no el mes en curso, que es parcial)
    const mesCompleto = i <= mesActualIdx;
    return {
      mes,
      PPTO: Math.round(pptosum),
      E1: Math.round(e1sum),
      Venta: hasVr ? Math.round(vrsum) : null,
      // Cumplimiento = Venta vs meta (nunca plan vs plan, nunca mes incompleto)
      CumplPPTO: mesCompleto && hasVr && metaSum > 0 ? Math.round(vrsum / metaSum * 1000) / 10 : null,
      CumplE1: mesCompleto && hasVr && e1sum > 0 ? Math.round(vrsum / e1sum * 1000) / 10 : null,
    };
  });

  const catData = totales.categorias;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Plan de Ventas LBE {mesNombre} — 2026
          </h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>
            Budget vs LBE vs Venta Real · Margen proyectado · Contribución Macro — SQ / MAH / EQM / EVA
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
          {(["resumen", "detalle"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "none", background: tab === t ? "white" : "transparent",
              color: tab === t ? "#1E40AF" : "#64748B",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}>
              {t === "resumen" ? "Vista General" : "Por Subclase"}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs globales ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard
          label="Budget 2026"
          value={fmt(g.meta_ppto_total)}
          sub="Meta_Categoria (= Panel Principal)"
          color="#64748B"
        />
        <KpiCard
          label={`LBE ${mesNombre} 2026`}
          value={fmt(g.e1_total)}
          sub={`Dif. vs Budget: ${g.meta_ppto_total != null ? ((g.e1_total - g.meta_ppto_total) >= 0 ? "+" : "") + fmt(g.e1_total - (g.meta_ppto_total ?? 0)) : "—"}`}
          color="#3B82F6"
        />
        <KpiCard
          label={`Venta Real YTD (Ene–${mesNombre})`}
          value={fmt(g.venta_real_ytd)}
          sub={`YTD Budget 2026: ${fmt(g.meta_ytd)} · YTD LBE: ${fmt(g.e1_ytd)}`}
          color="#10B981"
        />
        <KpiCard
          label="Cumpl. Venta / YTD Budget 2026"
          value={pct(g.cumpl_venta_ppto)}
          color={cumplColor(g.cumpl_venta_ppto)}
          badge={g.cumpl_venta_ppto != null ? {
            text: g.cumpl_venta_ppto >= 100 ? "En Meta" : g.cumpl_venta_ppto >= 90 ? "Alerta" : "Riesgo",
            color: cumplColor(g.cumpl_venta_ppto),
          } : undefined}
        />
        <KpiCard
          label={`Cumpl. Venta / YTD LBE ${mesNombre}`}
          value={pct(g.cumpl_venta_e1)}
          color={cumplColor(g.cumpl_venta_e1)}
        />
        <KpiCard
          label={`YTG LBE (${meses[mesActualIdx + 1] ?? ""}–Dic)`}
          value={fmt(g.e1_ytg)}
          sub={`Budget YTG: ${fmt(g.meta_ytg)}`}
          color="#6366F1"
        />
      </div>

      {tab === "resumen" && (
        <>
          {/* ── Tabla resumen por categoría (arriba del gráfico) ─── */}
          <div style={{ ...card, marginBottom: 20, overflow: "hidden", padding: 0 }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                Resumen por Categoría — 2026
              </h3>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>YTD = Ene–{mesNombre}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>Categoría</th>
                    <th style={thR}>Budget 2026</th>
                    <th style={thR}>LBE 2026</th>
                    <th style={{ ...thR, color: "#6366F1" }}>Dif. Budget vs LBE</th>
                    <th style={thR}>Venta Real YTD</th>
                    <th style={thR}>Brecha vs Budget</th>
                    <th style={thR}>Brecha vs LBE</th>
                    <th style={thR}>Cumpl % Budget</th>
                    <th style={thR}>Cumpl % LBE</th>
                    <th style={{ ...thR, color: "#6366F1" }}>LBE YTG</th>
                    <th style={{ ...thR, color: "#64748B" }}>Budget YTG</th>
                    <th style={thR}>Margen Budget</th>
                    <th style={thR}>Margen LBE</th>
                    <th style={thR}>Contrib. Budget</th>
                    <th style={thR}>Contrib. LBE</th>
                    <th style={{ ...thR, color: "#6366F1" }}>Dif. Contrib B vs LBE</th>
                  </tr>
                </thead>
                <tbody>
                  {catData.map((c, i) => {
                    const budget = c.kpis.meta_ppto_total;
                    const difBudgetE1 = budget != null && c.kpis.e1_total != null ? c.kpis.e1_total - budget : null;
                    const brechaBudget = (c.kpis.venta_real_ytd || 0) - (c.kpis.meta_ytd || 0);
                    const brechaE1 = (c.kpis.venta_real_ytd || 0) - (c.kpis.e1_ytd || 0);
                    const contribBudget = c.kpis.margen_ppto != null && budget != null ? Math.round(c.kpis.margen_ppto / 100 * budget) : null;
                    const contribE1 = c.kpis.contrib_total;
                    const difContrib = contribE1 != null && contribBudget != null ? contribE1 - contribBudget : null;
                    return (
                      <tr key={c.categoria} style={{ background: rowBg(i) }}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[c.categoria], marginRight: 6 }} />
                          {c.categoria}
                        </td>
                        <td style={tdR}>{fmt(budget)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(c.kpis.e1_total)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: difBudgetE1 == null ? "#94A3B8" : difBudgetE1 >= 0 ? "#10B981" : "#EF4444" }}>
                          {difBudgetE1 != null ? (difBudgetE1 >= 0 ? "+" : "") + fmt(difBudgetE1) : "—"}
                        </td>
                        <td style={{ ...tdR, color: "#10B981", fontWeight: 600 }}>{fmt(c.kpis.venta_real_ytd)}</td>
                        <td style={{ ...tdR, color: brechaBudget >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                          {brechaBudget >= 0 ? "+" : ""}{fmt(brechaBudget)}
                        </td>
                        <td style={{ ...tdR, color: brechaE1 >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                          {brechaE1 >= 0 ? "+" : ""}{fmt(brechaE1)}
                        </td>
                        <td style={tdR}><CumplBadge v={c.kpis.cumpl_venta_ppto} /></td>
                        <td style={tdR}><CumplBadge v={c.kpis.cumpl_venta_e1} /></td>
                        <td style={{ ...tdR, fontWeight: 700, color: "#6366F1" }}>{fmt(c.kpis.e1_ytg)}</td>
                        <td style={{ ...tdR, color: "#64748B" }}>{fmt(c.kpis.meta_ytg)}</td>
                        <td style={{ ...tdR, color: "#64748B" }}>{pct(c.kpis.margen_ppto)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: margenColor(c.kpis.margen_proy, c.kpis.margen_ppto) }}>{pct(c.kpis.margen_proy)}</td>
                        <td style={{ ...tdR, color: "#64748B" }}>{fmt(contribBudget)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(contribE1)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: difContrib == null ? "#94A3B8" : difContrib >= 0 ? "#10B981" : "#EF4444" }}>
                          {difContrib != null ? (difContrib >= 0 ? "+" : "") + fmt(difContrib) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0" }}>
                    <td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{fmt(g.meta_ppto_total)}</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{fmt(g.e1_total)}</td>
                    {(() => {
                      const d = g.meta_ppto_total != null ? g.e1_total - g.meta_ppto_total : null;
                      return (
                        <td style={{ ...tdR, fontWeight: 800, color: d == null ? "#94A3B8" : d >= 0 ? "#10B981" : "#EF4444" }}>
                          {d != null ? (d >= 0 ? "+" : "") + fmt(d) : "—"}
                        </td>
                      );
                    })()}
                    <td style={{ ...tdR, fontWeight: 800, color: "#10B981" }}>{fmt(g.venta_real_ytd)}</td>
                    <td style={{ ...tdR, fontWeight: 800, color: ((g.venta_real_ytd || 0) - (g.meta_ytd || 0)) >= 0 ? "#10B981" : "#EF4444" }}>
                      {((g.venta_real_ytd || 0) - (g.meta_ytd || 0)) >= 0 ? "+" : ""}{fmt((g.venta_real_ytd || 0) - (g.meta_ytd || 0))}
                    </td>
                    <td style={{ ...tdR, fontWeight: 800, color: ((g.venta_real_ytd || 0) - (g.e1_ytd || 0)) >= 0 ? "#10B981" : "#EF4444" }}>
                      {((g.venta_real_ytd || 0) - (g.e1_ytd || 0)) >= 0 ? "+" : ""}{fmt((g.venta_real_ytd || 0) - (g.e1_ytd || 0))}
                    </td>
                    <td style={tdR}><CumplBadge v={g.cumpl_venta_ppto} /></td>
                    <td style={tdR}><CumplBadge v={g.cumpl_venta_e1} /></td>
                    <td style={{ ...tdR, fontWeight: 800, color: "#6366F1" }}>{fmt(g.e1_ytg)}</td>
                    <td style={{ ...tdR, fontWeight: 800, color: "#64748B" }}>{fmt(g.meta_ytg)}</td>
                    {(() => {
                      // Margen ponderado Budget = sum(contrib_budget_est) / sum(meta_ppto_total)
                      const totalBudget = g.meta_ppto_total || 0;
                      const totalContribBudget = catData.reduce((s, c) => s + (c.kpis.margen_ppto != null && c.kpis.meta_ppto_total != null ? c.kpis.margen_ppto / 100 * c.kpis.meta_ppto_total : 0), 0);
                      const margenBudgetTotal = totalBudget > 0 ? totalContribBudget / totalBudget * 100 : null;
                      // Margen ponderado E1 = sum(contrib_e1) / sum(e1_total)
                      const totalE1 = g.e1_total || 0;
                      const totalContribE1 = catData.reduce((s, c) => s + (c.kpis.contrib_total || 0), 0);
                      const margenE1Total = totalE1 > 0 ? totalContribE1 / totalE1 * 100 : null;
                      const difContribTotal = totalContribE1 - totalContribBudget;
                      return (
                        <>
                          <td style={{ ...tdR, fontWeight: 800 }}>{margenBudgetTotal != null ? `${margenBudgetTotal.toFixed(1)}%` : "—"}</td>
                          <td style={{ ...tdR, fontWeight: 800, color: margenColor(margenE1Total, margenBudgetTotal) }}>{margenE1Total != null ? `${margenE1Total.toFixed(1)}%` : "—"}</td>
                          <td style={{ ...tdR, fontWeight: 800, color: "#64748B" }}>{fmt(Math.round(totalContribBudget))}</td>
                          <td style={{ ...tdR, fontWeight: 800 }}>{fmt(Math.round(totalContribE1))}</td>
                          <td style={{ ...tdR, fontWeight: 800, color: difContribTotal >= 0 ? "#10B981" : "#EF4444" }}>
                            {(difContribTotal >= 0 ? "+" : "") + fmt(Math.round(difContribTotal))}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Gráfico PPTO vs E1 vs Venta Real ───────────────── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>
              Evolución mensual — Budget 2026 vs LBE 2026 vs Venta Real
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 22, right: 20, left: 4, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                {/* Eje izquierdo — escala de barras, oculto */}
                <YAxis yAxisId="v" hide />
                {/* Eje derecho — escala %, oculto */}
                <YAxis yAxisId="c" orientation="right" domain={[0, 110]} hide />
                <Tooltip content={<MainChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) =>
                    value === "PPTO" ? "Budget 2026" :
                    value === "E1" ? "LBE 2026" :
                    value === "Venta" ? "Venta Real" :
                    value === "CumplPPTO" ? "Cumpl % Budget" :
                    value === "CumplE1" ? "Cumpl % LBE" : value
                  }
                />
                {/* Línea de referencia 100% — ancla visual */}
                <ReferenceLine yAxisId="c" y={100} stroke="#CBD5E1" strokeDasharray="4 3"
                  label={{ value: "100%", position: "insideTopRight", fontSize: 10, fill: "#94A3B8" }} />
                {/* Barras absolutas — sin eje visible, labels encima dan el valor */}
                <Bar yAxisId="v" dataKey="PPTO" name="PPTO" fill="#94A3B8" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: "#64748B", fontWeight: 600 }} />
                </Bar>
                <Bar yAxisId="v" dataKey="E1" name="E1" fill="#3B82F6" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: "#1D4ED8", fontWeight: 700 }} />
                </Bar>
                <Bar yAxisId="v" dataKey="Venta" name="Venta" fill="#10B981" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: "#047857", fontWeight: 700 }} />
                </Bar>
                {/* Líneas de cumplimiento % — eje derecho 0-110 */}
                <Line yAxisId="c" type="monotone" dataKey="CumplPPTO" name="CumplPPTO"
                  stroke="#F59E0B" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#F59E0B", stroke: "#F59E0B" }} activeDot={{ r: 5 }}
                  connectNulls={false} isAnimationActive={false} />
                <Line yAxisId="c" type="monotone" dataKey="CumplE1" name="CumplE1"
                  stroke="#6366F1" strokeWidth={2} strokeDasharray="5 3"
                  dot={{ r: 3, fill: "#6366F1", stroke: "#6366F1" }} activeDot={{ r: 5 }}
                  connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>

            {/* ── Fila de cumplimientos YTD ── */}
            <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 4, padding: "12px 4px 4px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, marginRight: 4 }}>
                Cumpl YTD Ene–{mesNombre}:
              </span>
              {catData.map(c => (
                <div key={c.categoria} style={{ display: "flex", alignItems: "center", gap: 4, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 10px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[c.categoria], display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{c.categoria}</span>
                  <span style={{ fontSize: 10, color: "#94A3B8", margin: "0 2px" }}>·</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: cumplColor(c.kpis.cumpl_venta_ppto) }}>
                    {pct(c.kpis.cumpl_venta_ppto)} Budget
                  </span>
                  <span style={{ fontSize: 10, color: "#CBD5E1" }}>/</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: cumplColor(c.kpis.cumpl_venta_e1) }}>
                    {pct(c.kpis.cumpl_venta_e1)} E1
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 10px" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#374151" }}>TOTAL</span>
                <span style={{ fontSize: 10, color: "#94A3B8", margin: "0 2px" }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: cumplColor(g.cumpl_venta_ppto) }}>
                  {pct(g.cumpl_venta_ppto)} Budget
                </span>
                <span style={{ fontSize: 10, color: "#CBD5E1" }}>/</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: cumplColor(g.cumpl_venta_e1) }}>
                  {pct(g.cumpl_venta_e1)} E1
                </span>
              </div>
            </div>
          </div>

          {/* ── Mes Actual ──────────────────────────────────────── */}
          <MesActualSection totales={totales} meses={meses} mesIdx={mesActualIdx} mesNombre={mesNombre} />

          {/* ── Cuadro E1 detallado por categoría ───────────────── */}
          <CuadroE1Detalle catData={catData} meses={meses} mesActualIdx={mesActualIdx} />

          {/* ── Mini cards por categoría ─────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {catData.map(c => (
              <CatMensualCard key={c.categoria} cat={c} meses={meses} mesActualIdx={mesActualIdx} />
            ))}
          </div>
        </>
      )}

      {tab === "detalle" && (
        <DetalleTab
          catSel={catSel}
          onCatChange={setCatSel}
          detalle={detalle}
          loading={loadingDet}
          meses={meses}
          mesActualIdx={mesActualIdx}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Sección Mes Actual ─────────────────────────────────────── */
function MesActualSection({ totales, meses, mesIdx, mesNombre }: {
  totales: TotalesData; meses: string[]; mesIdx: number; mesNombre: string;
}) {
  return (
    <div style={{ ...card, marginBottom: 20, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          Avance {mesNombre} 2026 — Mes en Curso
        </h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        {totales.categorias.map((c, i) => {
          const vrMes = c.metricas.venta_real?.meses[mesIdx];
          const e1Mes = c.metricas.e1?.meses[mesIdx];
          const pptoMes = c.metricas.ppto?.meses[mesIdx];
          const cumplE1 = vrMes != null && e1Mes ? (vrMes / e1Mes * 100) : null;
          const cumplPpto = vrMes != null && pptoMes ? (vrMes / pptoMes * 100) : null;
          const color = CAT_COLORS[c.categoria];
          return (
            <div key={c.categoria} style={{
              padding: "16px 20px",
              borderRight: i < 3 ? "1px solid #E2E8F0" : "none",
              borderTop: "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.categoria}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color, marginBottom: 2 }}>
                {vrMes != null ? fmt(vrMes) : <span style={{ color: "#CBD5E1" }}>Sin datos</span>}
              </div>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 8 }}>Venta real {mesNombre}</div>
              {/* PPTO primero — es el que manda */}
              {pptoMes != null && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748B", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: "#374151" }}>vs Budget 2026: {fmt(pptoMes)}</span>
                    <span style={{ fontWeight: 700, color: cumplPpto ? cumplColor(cumplPpto) : "#94A3B8" }}>{pct(cumplPpto, 0)}</span>
                  </div>
                  <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(cumplPpto || 0, 100)}%`, background: cumplPpto ? cumplColor(cumplPpto) : "#CBD5E1", borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              )}
              {/* E1 segundo */}
              {e1Mes != null && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748B", marginBottom: 2 }}>
                    <span>vs LBE: {fmt(e1Mes)}</span>
                    <span style={{ fontWeight: 700, color: cumplE1 ? cumplColor(cumplE1) : "#94A3B8" }}>{pct(cumplE1, 0)}</span>
                  </div>
                  <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(cumplE1 || 0, 100)}%`, background: cumplE1 ? cumplColor(cumplE1) : "#CBD5E1", borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}


/* ─── Cuadro E1 detallado por categoría ──────────────────────── */
const FILAS_E1 = [
  { key: "e1",         label: "LBE 2026",             tipo: "money" },
  { key: "ppto",       label: "Budget 2026",          tipo: "money" },
  { key: "cumpl",      label: "Cumplimiento %",       tipo: "pct"   },
  { key: "margen_ppto",label: "PPTO Margen 2026",     tipo: "pct"   },
  { key: "margen_proy",label: "Margen proyectado",    tipo: "pct"   },
  { key: "contrib",    label: "Contribución Macro",   tipo: "money" },
] as const;

function fmtCelda(v: number | null, tipo: string): string {
  if (v == null) return "—";
  if (tipo === "money") return fmtAbs(v);
  // pct: si valor > 5 ya es porcentaje (ej. 97.7), si ≤ 1 es decimal (ej. 0.297)
  const pctVal = Math.abs(v) <= 1 ? v * 100 : v;
  return `${pctVal.toFixed(1)}%`;
}

function CuadroE1Detalle({ catData, meses, mesActualIdx }: {
  catData: CatData[]; meses: string[]; mesActualIdx: number;
}) {
  const [catSel, setCatSel] = useState<string>("SQ");

  // Vista TOTAL: agrega todas las categorías sumando filas de dinero
  const MONEY_KEYS = new Set(["e1", "ppto", "contrib"]);
  const sumSerie = (key: keyof CatData["metricas"]): MetricaSerie => {
    const mesesSum = Array.from({ length: 12 }, (_, i) =>
      catData.reduce((s, c) => {
        const v = (c.metricas[key] as MetricaSerie)?.meses[i];
        return v != null ? s + v : s;
      }, 0) || null
    );
    return { meses: mesesSum, total: mesesSum.reduce<number>((s, v) => s + (v ?? 0), 0) };
  };
  const nullSerie = (): MetricaSerie => ({ meses: Array(12).fill(null), total: null });
  const totalCat: CatData = {
    categoria: "TOTAL",
    metricas: {
      e1: sumSerie("e1"),
      ppto: sumSerie("ppto"),
      cumpl: nullSerie(),
      margen_ppto: nullSerie(),
      margen_proy: nullSerie(),
      contrib: sumSerie("contrib"),
      venta_real: sumSerie("venta_real"),
      meta_ppto: sumSerie("meta_ppto"),
    },
    kpis: {} as CatKpis,
  };

  const cat = catSel === "TOTAL" ? totalCat : catData.find(c => c.categoria === catSel);
  const catColor = catSel === "TOTAL" ? "#374151" : CAT_COLORS[catSel];

  return (
    <div style={{ ...card, marginBottom: 20, padding: 0, overflow: "hidden" }}>
      {/* Header con selector */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          Cuadro LBE — Detalle por Categoría
        </h3>
        <div style={{ display: "flex", gap: 4 }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCatSel(c)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: catSel === c ? `2px solid ${CAT_COLORS[c]}` : "1px solid #E2E8F0",
              background: catSel === c ? `${CAT_COLORS[c]}15` : "white",
              color: catSel === c ? CAT_COLORS[c] : "#64748B",
            }}>
              {c}
            </button>
          ))}
          <button onClick={() => setCatSel("TOTAL")} style={{
            padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: catSel === "TOTAL" ? "2px solid #374151" : "1px solid #E2E8F0",
            background: catSel === "TOTAL" ? "#F1F5F9" : "white",
            color: catSel === "TOTAL" ? "#0F172A" : "#64748B",
          }}>
            Ver todo
          </button>
        </div>
      </div>

      {cat && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...thS, minWidth: 160 }}>Detalle</th>
                {meses.map((mes, i) => (
                  <th key={mes} style={{
                    ...thR,
                    color: i <= mesActualIdx ? "#374151" : "#94A3B8",
                    borderBottom: i === mesActualIdx ? "2px solid #3B82F6" : "2px solid #E2E8F0",
                    fontSize: 10,
                  }}>
                    {mes}
                  </th>
                ))}
                <th style={{ ...thR, fontWeight: 800, borderBottom: "2px solid #E2E8F0" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {FILAS_E1.map(({ key, label, tipo }, fi) => {
                const serie = cat.metricas[key as keyof typeof cat.metricas] as MetricaSerie | undefined;
                if (!serie) return null;
                const isMoney = tipo === "money";
                const isE1 = key === "e1";
                const isPpto = key === "ppto";
                return (
                  <tr key={key} style={{ background: rowBg(fi) }}>
                    <td style={{ ...td, fontWeight: isE1 ? 800 : 500, color: isE1 ? catColor : "#374151" }}>
                      {label}
                    </td>
                    {serie.meses.map((v, i) => (
                      <td key={i} style={{
                        ...tdR,
                        fontSize: 11,
                        color: v == null ? "#94A3B8" :
                          i > mesActualIdx ? "#94A3B8" :
                          isE1 ? catColor :
                          isPpto ? "#374151" : "#1F2937",
                        fontStyle: i > mesActualIdx ? "italic" : "normal",
                        fontWeight: isE1 ? 700 : 400,
                      }}>
                        {fmtCelda(v, tipo)}
                      </td>
                    ))}
                    <td style={{ ...tdR, fontWeight: 700, fontSize: 11, color: isE1 ? catColor : "#374151" }}>
                      {fmtCelda(serie.total, tipo)}
                    </td>
                  </tr>
                );
              })}
              {/* Fila Venta Real */}
              {cat.metricas.venta_real && (
                <tr style={{ background: "#F0FDF4" }}>
                  <td style={{ ...td, fontWeight: 700, color: "#10B981" }}>Venta Real</td>
                  {cat.metricas.venta_real.meses.map((v, i) => (
                    <td key={i} style={{ ...tdR, fontSize: 11, color: v != null ? "#10B981" : "#94A3B8", fontWeight: 600 }}>
                      {v != null ? fmtAbs(v) : "—"}
                    </td>
                  ))}
                  <td style={{ ...tdR, fontWeight: 700, fontSize: 11, color: "#10B981" }}>
                    {cat.metricas.venta_real.total != null ? fmtAbs(cat.metricas.venta_real.total) : (cat.kpis.venta_real_ytd != null ? fmtAbs(cat.kpis.venta_real_ytd) : "—")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Card mensual por categoría ─────────────────────────────── */
function CatMensualCard({ cat, meses, mesActualIdx }: { cat: CatData; meses: string[]; mesActualIdx: number }) {
  const color = CAT_COLORS[cat.categoria] || "#64748B";
  // Si el color de categoría coincide con el verde de Venta Real, usar teal para E1
  const e1Color = color === "#10B981" ? "#0891B2" : color;
  const e1 = cat.metricas.e1?.meses ?? [];
  const ppto = cat.metricas.ppto?.meses ?? [];
  const vr = cat.metricas.venta_real?.meses ?? [];
  const metaPpto = cat.metricas.meta_ppto?.meses ?? [];

  // Solo los meses con datos reales (Ene → mes actual inclusive)
  const visibleCount = mesActualIdx + 1;
  const chartData = meses.slice(0, visibleCount).map((mes, i) => {
    const vrVal = vr[i] != null ? Math.round(vr[i]!) : null;
    const e1Val = e1[i] != null ? Math.round(e1[i]!) : null;
    const pptoVal = ppto[i] != null ? Math.round(ppto[i]!) : null;
    const metaVal = metaPpto[i] != null ? Math.round(metaPpto[i]!) : null;
    const mesCompleto = i <= mesActualIdx;
    return {
      mes,
      PPTO: pptoVal,
      E1: e1Val,
      Venta: vrVal,
      CumplVE1: mesCompleto && vrVal != null && e1Val != null && e1Val > 0
        ? Math.round(vrVal / e1Val * 1000) / 10 : null,
      CumplVPPTO: mesCompleto && vrVal != null && metaVal != null && metaVal > 0
        ? Math.round(vrVal / metaVal * 1000) / 10 : null,
    };
  });

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "14px 18px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>{cat.categoria}</h4>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              Venta YTD: <strong style={{ color: "#10B981" }}>{fmt(cat.kpis.venta_real_ytd)}</strong>
              <span style={{ color: "#CBD5E1", margin: "0 5px" }}>·</span>
              E1: {fmt(cat.kpis.e1_ytd)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginBottom: 4 }}>
              {cat.kpis.cumpl_venta_ppto != null && (
                <span style={{ fontSize: 11, color: cumplColor(cat.kpis.cumpl_venta_ppto), fontWeight: 700 }}>
                  V/Budget: {pct(cat.kpis.cumpl_venta_ppto)}
                </span>
              )}
              <span style={{ fontSize: 11, color: cumplColor(cat.kpis.cumpl_venta_e1), fontWeight: 700 }}>
                V/LBE: <CumplBadge v={cat.kpis.cumpl_venta_e1} />
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>
              Margen LBE:{" "}
              <strong style={{ color: margenColor(cat.kpis.margen_proy, cat.kpis.margen_ppto) }}>
                {pct(cat.kpis.margen_proy)}
              </strong>
              {cat.kpis.margen_ppto != null && (
                <span style={{ color: "#94A3B8" }}> / meta {pct(cat.kpis.margen_ppto)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Leyenda de colores */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 10, color: "#64748B" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: "#94A3B8", borderRadius: 2, display: "inline-block" }} />
            Budget 2026
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: e1Color, borderRadius: 2, display: "inline-block" }} />
            LBE 2026
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, background: "#10B981", borderRadius: 2, display: "inline-block" }} />
            Venta Real
          </span>
        </div>

        {/* Gráfico — solo meses con datos reales */}
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={chartData} margin={{ top: 28, right: 6, left: -8, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis hide />
            <Tooltip content={(props) => <CatCardTooltip {...props} color={color} />} />
            <Bar dataKey="PPTO" name="Budget 2026" fill="#94A3B8" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: "#64748B", fontWeight: 600 }} />
            </Bar>
            <Bar dataKey="E1" name="LBE 2026" fill={e1Color} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: e1Color, fontWeight: 700 }} />
            </Bar>
            <Bar dataKey="Venta" name="Venta Real" fill="#10B981" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {/* Valor $ encima */}
              <LabelList formatter={fmtLabel} position="top" style={{ fontSize: 8, fill: "#047857", fontWeight: 700 }} />
              {/* Cumpl % dentro de la barra */}
              <LabelList
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  const { x, y, width, height, index } = props;
                  const cumpl = chartData[index]?.CumplVPPTO;
                  if (cumpl == null || height < 18) return null;
                  return (
                    <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle"
                      fontSize={9} fontWeight={800} fill="white">
                      {cumpl.toFixed(1)}%
                    </text>
                  );
                }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>

        {/* Pie: contribución */}
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            Contribución Macro: <strong style={{ color: "#374151" }}>{fmt(cat.kpis.contrib_total)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab Detalle por subclase ────────────────────────────────── */
function DetalleTab({ catSel, onCatChange, detalle, loading, meses, mesActualIdx }: {
  catSel: string; onCatChange: (c: string) => void;
  detalle: DetalleData | null; loading: boolean; meses: string[]; mesActualIdx: number;
}) {
  const [search, setSearch] = useState("");
  const [showComentarios, setShowComentarios] = useState(false);

  const rows = detalle?.subclases ?? [];
  const filtered = search
    ? rows.filter(r => r.subclase.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const totalAnual = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>CATEGORÍA:</span>
        {CATS.map(cat => (
          <button key={cat} onClick={() => onCatChange(cat)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: catSel === cat ? `2px solid ${CAT_COLORS[cat]}` : "1px solid #E2E8F0",
            background: catSel === cat ? `${CAT_COLORS[cat]}15` : "white",
            color: catSel === cat ? CAT_COLORS[cat] : "#64748B",
          }}>
            {cat}
          </button>
        ))}
        <input
          type="text" placeholder="Buscar subclase..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, fontSize: 11, border: "1px solid #E2E8F0", width: 180, outline: "none" }}
        />
        <button onClick={() => setShowComentarios(!showComentarios)} style={{
          padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
          border: showComentarios ? "2px solid #3B82F6" : "1px solid #E2E8F0",
          background: showComentarios ? "#EFF6FF" : "white", color: showComentarios ? "#1E40AF" : "#64748B",
        }}>
          {showComentarios ? "Ocultar comentarios" : "Ver comentarios"}
        </button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ width: 28, height: 28, border: `3px solid #E2E8F0`, borderTopColor: CAT_COLORS[catSel], borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
          <p style={{ color: "#64748B", fontSize: 13 }}>Cargando subclases {catSel}...</p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", margin: 0 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[catSel], marginRight: 6 }} />
              {catSel} — {filtered.length} subclases · Total anual: <span style={{ color: CAT_COLORS[catSel] }}>{fmtAbs(totalAnual)}</span>
            </h3>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>
              Real: Ene–{meses[mesActualIdx]} · Proyectado: {meses[mesActualIdx + 1] ?? ""}–Dic
            </span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 600 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ ...thS, minWidth: 220 }}>Subclase</th>
                  {meses.map((mes, i) => (
                    <th key={mes} style={{
                      ...thR,
                      color: i <= mesActualIdx ? "#374151" : "#94A3B8",
                      borderBottom: i === mesActualIdx ? "2px solid #3B82F6" : "2px solid #E2E8F0",
                    }}>
                      {mes}
                    </th>
                  ))}
                  <th style={{ ...thR, fontWeight: 800 }}>Total</th>
                  {showComentarios && <th style={{ ...thS, minWidth: 280 }}>Comentario</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.subclase} style={{ background: rowBg(i) }}>
                    <td style={{ ...td, fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={r.subclase}>
                      {r.subclase}
                    </td>
                    {r.meses.map((v, mi) => (
                      <td key={mi} style={{
                        ...tdR,
                        color: v == null ? "#CBD5E1" : mi <= mesActualIdx ? "#0F172A" : "#64748B",
                        fontStyle: mi > mesActualIdx ? "italic" : "normal",
                      }}>
                        {v != null ? fmt(v) : "—"}
                      </td>
                    ))}
                    <td style={{ ...tdR, fontWeight: 700, color: CAT_COLORS[catSel] }}>{fmt(r.total)}</td>
                    {showComentarios && (
                      <td style={{ ...td, fontSize: 11, color: "#64748B", maxWidth: 280, whiteSpace: "normal", lineHeight: 1.4 }}>
                        {r.comentario || <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0", position: "sticky", bottom: 0 }}>
                  <td style={{ ...td, fontWeight: 800 }}>TOTAL {catSel}</td>
                  {Array.from({ length: 12 }, (_, mi) => {
                    const sum = filtered.reduce((s, r) => s + (r.meses[mi] || 0), 0);
                    return (
                      <td key={mi} style={{ ...tdR, fontWeight: 800, color: mi <= mesActualIdx ? "#0F172A" : "#64748B" }}>
                        {fmt(sum)}
                      </td>
                    );
                  })}
                  <td style={{ ...tdR, fontWeight: 800, color: CAT_COLORS[catSel] }}>{fmt(totalAnual)}</td>
                  {showComentarios && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
