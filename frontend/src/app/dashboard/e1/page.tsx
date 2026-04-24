"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { fmtAbs, fmtPct } from "@/lib/format";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
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
  e1_total: number | null; ppto_total: number | null; cumpl_total: number | null;
  margen_proy: number | null; margen_ppto: number | null; contrib_total: number | null;
}
interface CatData {
  categoria: string;
  metricas: { e1: MetricaSerie; ppto: MetricaSerie; cumpl: MetricaSerie; margen_ppto: MetricaSerie; margen_proy: MetricaSerie; contrib: MetricaSerie; };
  kpis: CatKpis;
}
interface TotalesData {
  categorias: CatData[];
  meses_corto: string[];
  global: { e1_total: number; ppto_total: number; cumpl_total: number | null; };
}
interface SubclaseRow {
  subclase: string; meses: (number | null)[]; total: number; comentario: string | null;
}
interface DetalleData { subclases: SubclaseRow[]; categoria: string; meses_corto: string[]; }

/* ─── Helpers ────────────────────────────────────────────────── */
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
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

/* ─── Componentes de UI ──────────────────────────────────────── */
function KpiCard({ label, value, sub, color, badge }: {
  label: string; value: string; sub?: string; color?: string; badge?: { text: string; color: string };
}) {
  return (
    <div style={{ ...card, flex: "1 1 180px", minWidth: 160, padding: "14px 18px" }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</span>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: `${badge.color}15`, padding: "1px 6px", borderRadius: 4 }}>
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
        <div className="spinner" style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748B" }}>Cargando Plan de Ventas E1...</p>
      </div>
    </div>
  );

  if (!totales) return <p style={{ color: "#EF4444", padding: 40 }}>Error al cargar datos</p>;

  const g = totales.global;
  const meses = totales.meses_corto;

  // Gráfico mensual E1 vs PPTO por categoría (suma de todas)
  const chartData = meses.map((mes, i) => {
    const row: Record<string, number | string> = { mes };
    let e1sum = 0, pptosum = 0;
    totales.categorias.forEach(c => {
      const e1v = c.metricas.e1?.meses[i];
      const ppv = c.metricas.ppto?.meses[i];
      if (e1v) e1sum += e1v;
      if (ppv) pptosum += ppv;
    });
    row["E1"] = Math.round(e1sum);
    row["PPTO"] = Math.round(pptosum);
    row["Cumpl"] = pptosum > 0 ? Math.round(e1sum / pptosum * 100 * 10) / 10 : 0;
    return row;
  });

  const catData = totales.categorias;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Plan de Ventas E1 — 2026
          </h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>
            E1 vs Presupuesto · Margen proyectado · Contribución Macro — SQ / MAH / EQM / EVA
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

      {/* ─── KPIs globales ─── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard
          label="E1 Total Anual"
          value={fmt(g.e1_total)}
          sub="Plan proyectado 2026"
          color="#0F172A"
        />
        <KpiCard
          label="Presupuesto 2026"
          value={fmt(g.ppto_total)}
          sub="Meta original"
          color="#64748B"
        />
        <KpiCard
          label="Cumplimiento E1 vs PPTO"
          value={pct(g.cumpl_total)}
          color={cumplColor(g.cumpl_total)}
          badge={g.cumpl_total != null && g.cumpl_total >= 100 ? { text: "En meta", color: "#10B981" } : g.cumpl_total != null && g.cumpl_total >= 90 ? { text: "Cerca", color: "#F59E0B" } : { text: "Bajo meta", color: "#EF4444" }}
        />
        {catData.map(c => (
          <KpiCard
            key={c.categoria}
            label={`${c.categoria} — Cumpl.`}
            value={pct(c.kpis.cumpl_total)}
            color={cumplColor(c.kpis.cumpl_total)}
            sub={fmt(c.kpis.e1_total)}
          />
        ))}
      </div>

      {tab === "resumen" && (
        <>
          {/* ─── Gráfico E1 vs PPTO mensual ─── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
              E1 vs Presupuesto — Evolución mensual (todas las categorías)
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="v" tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(0)}MM` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : ""} width={65} />
                <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 10, fill: "#94A3B8" }}
                  tickFormatter={(v: number) => `${v}%`} width={42} domain={[70, 120]} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, name: any) => name === "Cumpl" ? [`${Number(v).toFixed(1)}%`, "Cumpl. %"] : [fmtAbs(Number(v)), name]}
                  labelFormatter={(l: any) => `Mes: ${l}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="c" y={100} stroke="#94A3B8" strokeDasharray="4 3" />
                <Bar yAxisId="v" dataKey="PPTO" name="PPTO" fill="#E2E8F0" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="v" dataKey="E1" name="E1" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                <Line yAxisId="c" type="monotone" dataKey="Cumpl" name="Cumpl" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ─── Tabla resumen por categoría ─── */}
          <div style={{ ...card, marginBottom: 20, overflow: "hidden", padding: 0 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                Resumen por Categoría — Anual 2026
              </h3>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>Categoría</th>
                    <th style={thR}>E1 Anual</th>
                    <th style={thR}>PPTO Anual</th>
                    <th style={thR}>Diferencia</th>
                    <th style={thR}>Cumpl. %</th>
                    <th style={thR}>Margen PPTO</th>
                    <th style={thR}>Margen E1</th>
                    <th style={thR}>Contrib. Macro</th>
                  </tr>
                </thead>
                <tbody>
                  {catData.map((c, i) => {
                    const diff = (c.kpis.e1_total || 0) - (c.kpis.ppto_total || 0);
                    return (
                      <tr key={c.categoria} style={{ background: rowBg(i), cursor: "default" }}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[c.categoria], marginRight: 6 }} />
                          {c.categoria}
                        </td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(c.kpis.e1_total)}</td>
                        <td style={tdR}>{fmt(c.kpis.ppto_total)}</td>
                        <td style={{ ...tdR, color: diff >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                          {diff >= 0 ? "+" : ""}{fmt(diff)}
                        </td>
                        <td style={tdR}><CumplBadge v={c.kpis.cumpl_total} /></td>
                        <td style={{ ...tdR, color: "#64748B" }}>{pct(c.kpis.margen_ppto)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: margenColor(c.kpis.margen_proy, c.kpis.margen_ppto) }}>
                          {pct(c.kpis.margen_proy)}
                        </td>
                        <td style={tdR}>{fmt(c.kpis.contrib_total)}</td>
                      </tr>
                    );
                  })}
                  {/* Fila total */}
                  <tr style={{ background: "#F1F5F9", fontWeight: 700, borderTop: "2px solid #E2E8F0" }}>
                    <td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{fmt(g.e1_total)}</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{fmt(g.ppto_total)}</td>
                    <td style={{ ...tdR, fontWeight: 800, color: g.e1_total >= g.ppto_total ? "#10B981" : "#EF4444" }}>
                      {g.e1_total >= g.ppto_total ? "+" : ""}{fmt(g.e1_total - g.ppto_total)}
                    </td>
                    <td style={tdR}><CumplBadge v={g.cumpl_total} /></td>
                    <td style={tdR}>—</td>
                    <td style={tdR}>—</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{fmt(catData.reduce((s, c) => s + (c.kpis.contrib_total || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Tabla mensual por categoría ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {catData.map(c => (
              <CatMensualCard key={c.categoria} cat={c} meses={meses} />
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
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Card mensual por categoría ─────────────────────────────── */
function CatMensualCard({ cat, meses }: { cat: CatData; meses: string[] }) {
  const color = CAT_COLORS[cat.categoria] || "#64748B";
  const e1 = cat.metricas.e1?.meses ?? [];
  const ppto = cat.metricas.ppto?.meses ?? [];
  const cumpl = cat.metricas.cumpl?.meses ?? [];
  const margenPpto = cat.metricas.margen_ppto?.meses ?? [];
  const margenProy = cat.metricas.margen_proy?.meses ?? [];

  // Mini gráfico E1 vs PPTO
  const chartData = meses.map((mes, i) => ({
    mes,
    E1: e1[i] != null ? Math.round(e1[i]!) : null,
    PPTO: ppto[i] != null ? Math.round(ppto[i]!) : null,
    Cumpl: cumpl[i] != null ? Math.round((cumpl[i]!) * 100 * 10) / 10 : null,
  }));

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", margin: 0 }}>{cat.categoria}</h4>
          <CumplBadge v={cat.kpis.cumpl_total} />
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 35, left: -10, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F8FAFC" />
            <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
            <YAxis yAxisId="v" tick={{ fontSize: 9 }}
              tickFormatter={(v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(0)}MM` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : ""} width={40} />
            <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 9, fill: "#94A3B8" }}
              tickFormatter={(v: number) => `${v}%`} width={32} domain={[70, 120]} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => name === "Cumpl" ? [`${Number(v).toFixed(1)}%`, "Cumpl."] : [fmtAbs(Number(v)), name]}
              contentStyle={{ borderRadius: 6, fontSize: 11 }}
            />
            <ReferenceLine yAxisId="c" y={100} stroke="#94A3B8" strokeDasharray="3 2" />
            <Bar yAxisId="v" dataKey="PPTO" name="PPTO" fill="#E2E8F0" radius={[2, 2, 0, 0]} />
            <Bar yAxisId="v" dataKey="E1" name="E1" fill={color} radius={[2, 2, 0, 0]} opacity={0.85} />
            <Line yAxisId="c" type="monotone" dataKey="Cumpl" name="Cumpl" stroke="#F59E0B" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        {/* Mini tabla margen */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {meses.slice(0, 6).map((mes, i) => {
            const mp = margenPpto[i] != null ? margenPpto[i]! * 100 : null;
            const mr = margenProy[i] != null ? margenProy[i]! * 100 : null;
            if (mp == null && mr == null) return null;
            const col = margenColor(mr, mp);
            return (
              <div key={mes} style={{ fontSize: 10, textAlign: "center" }}>
                <div style={{ color: "#94A3B8", marginBottom: 1 }}>{mes}</div>
                <div style={{ fontWeight: 700, color: col }}>{mr != null ? `${mr.toFixed(1)}%` : "—"}</div>
                <div style={{ color: "#CBD5E1", fontSize: 9 }}>{mp != null ? `${mp.toFixed(1)}%` : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab Detalle por subclase ────────────────────────────────── */
function DetalleTab({ catSel, onCatChange, detalle, loading, meses }: {
  catSel: string; onCatChange: (c: string) => void;
  detalle: DetalleData | null; loading: boolean; meses: string[];
}) {
  const [search, setSearch] = useState("");
  const [showComentarios, setShowComentarios] = useState(false);

  const rows = detalle?.subclases ?? [];
  const filtered = search
    ? rows.filter(r => r.subclase.toLowerCase().includes(search.toLowerCase()))
    : rows;

  // Solo meses hasta el actual (abril = índice 3)
  const mesActual = new Date().getMonth(); // 0-based
  const totalAnual = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Selector categoría + filtros */}
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
          <div className="spinner" style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTopColor: CAT_COLORS[catSel], borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
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
              Real: Ene–{meses[mesActual]} · Proyectado: {meses[mesActual + 1]}–Dic
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
                      color: i <= mesActual ? "#374151" : "#94A3B8",
                      borderBottom: i === mesActual ? "2px solid #3B82F6" : "2px solid #E2E8F0",
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
                        color: v == null ? "#CBD5E1" : mi <= mesActual ? "#0F172A" : "#64748B",
                        fontStyle: mi > mesActual ? "italic" : "normal",
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
              {/* Fila totales */}
              <tfoot>
                <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0", position: "sticky", bottom: 0 }}>
                  <td style={{ ...td, fontWeight: 800 }}>TOTAL {catSel}</td>
                  {Array.from({ length: 12 }, (_, mi) => {
                    const sum = filtered.reduce((s, r) => s + (r.meses[mi] || 0), 0);
                    return (
                      <td key={mi} style={{ ...tdR, fontWeight: 800, color: mi <= mesActual ? "#0F172A" : "#64748B" }}>
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
