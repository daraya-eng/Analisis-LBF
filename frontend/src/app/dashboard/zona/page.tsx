"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, semaforo, fmt } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import HelpButton from "@/components/help-button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
} from "recharts";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface CatDetail {
  venta: number;
  contrib: number;
  margen: number;
  pct_zona: number;
  ppto_pct: number;
}

interface ZonaRow {
  zona: string;
  kam: string;
  meta_anual: number;
  meta_periodo: number;
  venta: number;
  contrib: number;
  margen: number;
  gap: number;
  cumpl: number;
  venta_25: number;
  crec_vs_25: number;
  categorias: Record<string, CatDetail>;
}

interface ClienteRow {
  rut: string;
  nombre: string;
  venta_26: number;
  venta_25: number;
  crec: number;
}

interface ZonaData {
  zonas: ZonaRow[];
  total: ZonaRow;
  margen_meta_cat: Record<string, number>;
  periodo: string;
  label: string;
  error?: string;
}

/* ─── Period options ────────────────────────────────────────────────── */

const PERIOD_OPTIONS = [
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "mes-1", label: "Ene" },
  { value: "mes-2", label: "Feb" },
  { value: "mes-3", label: "Mar" },
  { value: "mes-4", label: "Abr" },
  { value: "mes-5", label: "May" },
  { value: "mes-6", label: "Jun" },
  { value: "mes-7", label: "Jul" },
  { value: "mes-8", label: "Ago" },
  { value: "mes-9", label: "Sep" },
  { value: "mes-10", label: "Oct" },
  { value: "mes-11", label: "Nov" },
  { value: "mes-12", label: "Dic" },
];

/* ─── Colors ────────────────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6",
  MAH: "#10B981",
  EQM: "#F59E0B",
  EVA: "#8B5CF6",
};

/* ─── Stat Card ─────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: "1 1 180px", background: "white", borderRadius: 10,
      border: "1px solid #E2E8F0", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Bar label for cumplimiento chart ──────────────────────────────── */

function CumplLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (value === undefined || value === null) return null;
  return (
    <text x={x + width + 4} y={y + 12} fill="#374151" fontSize={11} fontWeight={700}>
      {value.toFixed(1)}%
    </text>
  );
}

/* ─── Client detail sub-component ───────────────────────────────────── */

function ClientDetail({ zona, categoria, period }: { zona: string; categoria: string; period: string }) {
  const [clientes, setClientes] = useState<ClienteRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let queryParam = `zona=${encodeURIComponent(zona)}&categoria=${encodeURIComponent(categoria)}&periodo=${period}`;
    if (period.startsWith("mes-")) {
      queryParam = `zona=${encodeURIComponent(zona)}&categoria=${encodeURIComponent(categoria)}&periodo=mes&mes=${period.split("-")[1]}`;
    }
    api.get<{ clientes: ClienteRow[] }>(`/api/zona/clientes?${queryParam}`)
      .then(res => setClientes(res.clientes))
      .catch(() => setClientes([]))
      .finally(() => setLoading(false));
  }, [zona, categoria, period]);

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#64748B", fontSize: 12 }}>
        Cargando clientes...
      </div>
    );
  }

  if (!clientes || clientes.length === 0) {
    return <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>Sin clientes</div>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr style={{ background: "#EFF6FF" }}>
          <th style={{ ...thSm, textAlign: "left" }}>Cliente</th>
          <th style={thSmR}>Venta 2026</th>
          <th style={thSmR}>Venta 2025</th>
          <th style={thSmR}>Crec. %</th>
        </tr>
      </thead>
      <tbody>
        {clientes.map((c, i) => {
          const crecColor = c.crec >= 0 ? "#10B981" : "#EF4444";
          return (
            <tr key={i} style={{ borderBottom: "1px solid #E8EDFB" }}>
              <td style={{ padding: "4px 8px", color: "#1F2937", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.nombre || c.rut}
              </td>
              <td style={{ ...tdSmR, fontWeight: 600 }}>{fmtAbs(c.venta_26)}</td>
              <td style={tdSmR}>{fmtAbs(c.venta_25)}</td>
              <td style={{ ...tdSmR, color: crecColor, fontWeight: 600 }}>
                {c.venta_25 === 0 && c.venta_26 > 0 ? "Nuevo" : `${c.crec >= 0 ? "+" : ""}${c.crec.toFixed(1)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function ZonaPage() {
  const [data, setData] = useState<ZonaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null); // "ZONA|CAT"

  const fetchData = useCallback(async (periodo: string) => {
    setLoading(true);
    try {
      let queryParam = `?periodo=${periodo}`;
      if (periodo.startsWith("mes-")) {
        queryParam = `?periodo=mes&mes=${periodo.split("-")[1]}`;
      }
      const res = await api.get<ZonaData>(`/api/zona/${queryParam}`);
      setData(res);
    } catch (e) {
      console.error("Failed to load zona data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period); }, [fetchData, period]);

  const handlePeriod = useCallback((val: string) => {
    setPeriod(val);
    setExpanded(null);
    setExpandedCat(null);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  if (!data || !data.total) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar datos{data?.error ? `: ${data.error}` : ""}</div>;
  }

  const { zonas, total: t, label: periodLabel } = data;

  // Chart 1: Cumplimiento by zona
  const chartCumpl = zonas
    .map(z => ({ zona: z.zona, cumpl: z.cumpl }))
    .sort((a, b) => b.cumpl - a.cumpl);

  // Data for mix comparison table
  const CATS_MIX = ["SQ", "MAH", "EQM", "EVA"] as const;

  // Progress bar
  const cumplPct = t.cumpl;
  const pctBar = Math.min(cumplPct, 100);
  const barColor = cumplPct >= 100 ? "#10B981" : cumplPct >= 80 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Analisis por KAM</h1>
            <HelpButton module="zona" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Meta 2026 vs Venta por KAM y categoria
          </p>
        </div>
        <div style={{ flex: "0 0 320px", marginRight: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 4 }}>
            <span>Cumplimiento Meta {periodLabel}</span>
            <span style={{ fontWeight: 800, color: barColor, fontSize: 14 }}>
              {semaforo(cumplPct)} {fmtPct(cumplPct)}
            </span>
          </div>
          <div style={{ height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctBar}%`, background: barColor, borderRadius: 5, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
            <span>Venta: {fmtAbs(t.venta)}</span>
            <span>Meta: {fmtAbs(t.meta_periodo)}</span>
          </div>
        </div>
        <button onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); fetchData(period); }} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Period filter */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
        padding: "12px 20px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Periodo:</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => handlePeriod(opt.value)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: period === opt.value ? "2px solid #3B82F6" : "1px solid #E2E8F0",
              background: period === opt.value ? "#EFF6FF" : "white",
              color: period === opt.value ? "#2563EB" : "#64748B",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB", marginLeft: 8 }}>{periodLabel}</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Meta Anual 2026" value={fmtAbs(t.meta_anual)} color="#6366F1" />
        <StatCard label={`Meta ${periodLabel}`} value={fmtAbs(t.meta_periodo)} color="#8B5CF6" />
        <StatCard label={`Venta ${periodLabel}`} value={fmtAbs(t.venta)} sub={`2025: ${fmtAbs(t.venta_25)}`} color="#3B82F6" />
        <StatCard
          label="Cumpl. Meta"
          value={`${semaforo(t.cumpl)} ${fmtPct(t.cumpl)}`}
          sub={`Gap: ${fmtAbs(t.gap)}`}
          color={t.cumpl >= 100 ? "#10B981" : t.cumpl >= 80 ? "#F59E0B" : "#EF4444"}
        />
        <StatCard
          label="Crec. vs 2025"
          value={`${t.crec_vs_25 >= 0 ? "+" : ""}${fmtPct(t.crec_vs_25)}`}
          color={t.crec_vs_25 >= 0 ? "#10B981" : "#EF4444"}
        />
      </div>

      {/* ═══ TWO CHARTS SIDE BY SIDE ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Chart 1: Cumplimiento por zona */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
            Cumplimiento Meta por Zona
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{periodLabel}</span>
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(300, chartCumpl.length * 30)}>
            <BarChart data={chartCumpl} layout="vertical" margin={{ right: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="zona" width={120} tick={{ fontSize: 11, fill: "#374151" }} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="cumpl" radius={[0, 6, 6, 0]} barSize={16}>
                {chartCumpl.map((entry, i) => (
                  <Cell key={i} fill={entry.cumpl >= 100 ? "#10B981" : entry.cumpl >= 80 ? "#F59E0B" : "#EF4444"} />
                ))}
                <LabelList dataKey="cumpl" content={<CumplLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Mix de categoría — Venta vs PPTO (table with mini bars) */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24, overflow: "auto" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
            Mix de Categorias por Zona
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>Venta vs PPTO</span>
          </h3>
          <p style={{ fontSize: 11, color: "#94A3B8", margin: "0 0 12px" }}>Delta = peso real - presupuestado. Verde = sobre PPTO, rojo = bajo PPTO.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" }}>Zona</th>
                {CATS_MIX.map(cat => (
                  <th key={cat} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[cat], marginRight: 4, verticalAlign: "middle" }} />
                    {cat}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zonas.map((z, i) => (
                <tr key={z.zona} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFC" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1F2937", whiteSpace: "nowrap" }}>{z.zona}</td>
                  {CATS_MIX.map(cat => {
                    const vPct = z.categorias[cat]?.pct_zona || 0;
                    const pPct = z.categorias[cat]?.ppto_pct || 0;
                    const delta = Math.round((vPct - pPct) * 10) / 10;
                    const deltaColor = delta > 2 ? "#10B981" : delta < -2 ? "#EF4444" : "#94A3B8";
                    return (
                      <td key={cat} style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                            <div style={{ flex: 1, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                              <div style={{ position: "absolute", height: "100%", width: `${Math.min(vPct, 100)}%`, background: CAT_COLORS[cat], borderRadius: 3, opacity: 0.9 }} />
                              <div style={{ position: "absolute", height: "100%", width: `${Math.min(pPct, 100)}%`, borderRight: "2px solid #374151", boxSizing: "border-box" }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11 }}>
                            <span style={{ fontWeight: 700, color: "#374151" }}>{vPct.toFixed(0)}%</span>
                            <span style={{ color: "#94A3B8", fontSize: 10 }}>vs {pPct.toFixed(0)}%</span>
                            <span style={{ fontWeight: 700, fontSize: 10, color: deltaColor }}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ borderTop: "2px solid #CBD5E1", background: "#F8FAFC" }}>
                <td style={{ padding: "8px 10px", fontWeight: 800, color: "#0F172A" }}>Total</td>
                {CATS_MIX.map(cat => {
                  const vPct = t.categorias[cat]?.pct_zona || 0;
                  const pPct = t.categorias[cat]?.ppto_pct || 0;
                  const delta = Math.round((vPct - pPct) * 10) / 10;
                  const deltaColor = delta > 2 ? "#10B981" : delta < -2 ? "#EF4444" : "#94A3B8";
                  return (
                    <td key={cat} style={{ padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "baseline", fontSize: 12 }}>
                        <span style={{ fontWeight: 800, color: "#374151" }}>{vPct.toFixed(1)}%</span>
                        <span style={{ color: "#94A3B8", fontSize: 10 }}>vs {pPct.toFixed(1)}%</span>
                        <span style={{ fontWeight: 700, fontSize: 11, color: deltaColor }}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Main table: Zona/KAM with expandable category + client detail ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Detalle por Zona / KAM
            <span style={{ fontSize: 13, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{periodLabel} &mdash; Click en zona para ver categorias, click en categoria para ver clientes</span>
          </h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ ...thStyle, width: 28 }}></th>
              <th style={thStyle}>Zona</th>
              <th style={thStyle}>KAM</th>
              <th style={thR}>Meta</th>
              <th style={thR}>Venta</th>
              <th style={thR}>Gap</th>
              <th style={thR}>Cumpl.</th>
              <th style={thR}>Venta 25</th>
              <th style={thR}>Crec.</th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((row, i) => {
              const isExpanded = expanded === row.zona;
              const cumplColor = row.cumpl >= 100 ? "#10B981" : row.cumpl >= 80 ? "#F59E0B" : "#EF4444";
              const crecColor = row.crec_vs_25 >= 0 ? "#10B981" : "#EF4444";
              const rows = [];
              rows.push(
                <tr
                  key={row.zona}
                  onClick={() => { setExpanded(isExpanded ? null : row.zona); setExpandedCat(null); }}
                  style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isExpanded ? "#F0F9FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <td style={{ ...tdStyle, width: 28, paddingRight: 0, color: "#94A3B8" }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.zona}</td>
                  <td style={{ ...tdStyle, color: "#64748B", fontSize: 12 }}>{row.kam}</td>
                  <td style={tdR}>{fmtAbs(row.meta_periodo)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(row.venta)}</td>
                  <td style={{ ...tdR, color: row.gap >= 0 ? "#10B981" : "#EF4444" }}>{fmtAbs(row.gap)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: cumplColor }}>
                    {semaforo(row.cumpl)} {fmtPct(row.cumpl)}
                  </td>
                  <td style={tdR}>{fmtAbs(row.venta_25)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: crecColor }}>
                    {row.crec_vs_25 >= 0 ? "+" : ""}{fmtPct(row.crec_vs_25)}
                  </td>
                </tr>
              );
              if (isExpanded) {
                rows.push(
                  <tr key={`${row.zona}-detail`}>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div style={{ background: "#F8FAFC", padding: "8px 20px 8px 48px", borderBottom: "2px solid #E2E8F0" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px", width: 28 }}></th>
                              <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px" }}>Categoria</th>
                              <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Venta 2026</th>
                              <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Margen %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(["SQ", "MAH", "EQM", "EVA"] as const).map(cat => {
                              const cd = row.categorias[cat];
                              if (!cd || cd.venta === 0) return null;
                              const catKey = `${row.zona}|${cat}`;
                              const isCatExpanded = expandedCat === catKey;
                              const catRows = [];
                              catRows.push(
                                <tr
                                  key={cat}
                                  onClick={(e) => { e.stopPropagation(); setExpandedCat(isCatExpanded ? null : catKey); }}
                                  style={{ borderBottom: "1px solid #E2E8F0", cursor: "pointer", background: isCatExpanded ? "#EFF6FF" : "transparent" }}
                                >
                                  <td style={{ padding: "6px 4px", color: "#94A3B8", width: 28 }}>
                                    {isCatExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </td>
                                  <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1F2937" }}>
                                    <span style={{
                                      display: "inline-block", width: 8, height: 8, borderRadius: 2,
                                      background: CAT_COLORS[cat], marginRight: 6,
                                    }} />
                                    {cat}
                                    <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6, fontWeight: 400 }}>
                                      ({cd.pct_zona.toFixed(1)}%)
                                    </span>
                                  </td>
                                  <td style={{ ...tdR, padding: "6px 10px" }}>{fmtAbs(cd.venta)}</td>
                                  <td style={{ ...tdR, padding: "6px 10px", color: "#64748B" }}>{cd.margen.toFixed(1)}%</td>
                                </tr>
                              );
                              if (isCatExpanded) {
                                catRows.push(
                                  <tr key={`${cat}-clients`}>
                                    <td colSpan={4} style={{ padding: "4px 8px 8px 40px", background: "#EFF6FF" }}>
                                      <ClientDetail zona={row.zona} categoria={cat} period={period} />
                                    </td>
                                  </tr>
                                );
                              }
                              return catRows;
                            })}
                            {/* Category total */}
                            <tr style={{ background: "#F1F5F9", fontWeight: 700 }}>
                              <td style={{ padding: "6px 4px" }}></td>
                              <td style={{ padding: "6px 10px" }}>Total</td>
                              <td style={{ ...tdR, padding: "6px 10px" }}>{fmtAbs(row.venta)}</td>
                              <td style={{ ...tdR, padding: "6px 10px" }}>{row.margen.toFixed(1)}%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                );
              }
              return rows;
            })}
            {/* Total row */}
            <tr style={{ borderTop: "2px solid #D1D5DB", background: "#F1F5F9", fontWeight: 700 }}>
              <td style={tdStyle}></td>
              <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
              <td style={tdStyle}></td>
              <td style={tdR}>{fmtAbs(t.meta_periodo)}</td>
              <td style={{ ...tdR, fontWeight: 800 }}>{fmtAbs(t.venta)}</td>
              <td style={{ ...tdR, color: t.gap >= 0 ? "#10B981" : "#EF4444" }}>{fmtAbs(t.gap)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: t.cumpl >= 100 ? "#10B981" : t.cumpl >= 80 ? "#F59E0B" : "#EF4444" }}>
                {semaforo(t.cumpl)} {fmtPct(t.cumpl)}
              </td>
              <td style={tdR}>{fmtAbs(t.venta_25)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: t.crec_vs_25 >= 0 ? "#10B981" : "#EF4444" }}>
                {t.crec_vs_25 >= 0 ? "+" : ""}{fmtPct(t.crec_vs_25)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Table styles ───────────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "8px 14px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const thSm: React.CSSProperties = { padding: "5px 8px", fontWeight: 600, color: "#374151", fontSize: 11, borderBottom: "1px solid #D1D5DB" };
const thSmR: React.CSSProperties = { ...thSm, textAlign: "right" };
const tdSmR: React.CSSProperties = { padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#1F2937" };
