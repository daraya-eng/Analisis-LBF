"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, semaforo, fmt } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface DashKpis {
  meta_anual: number;
  meta_periodo: number;
  meta_contrib_periodo: number;
  contrib_real: number;
  margen_meta: number;
  margen_real: number;
  cumpl_contrib: number;
  cumpl_margen: number;
  venta: number;
  venta_25: number;
  cumpl: number;
  cumpl_meta_global: number;
  crec_vs_25: number;
  gap: number;
  gap_meta_global: number;
  mes_nombre: string;
  n_meses: number;
}

interface CatRow {
  categoria: string;
  meta_anual: number;
  meta_periodo: number;
  meta_contrib: number;
  margen_meta: number;
  contrib_real: number;
  margen_real: number;
  cumpl_contrib: number;
  cumpl_margen: number;
  venta: number;
  venta_25: number;
  cumpl: number;
  crec_vs_25: number;
  gap: number;
}

interface SegRow {
  segmento: string;
  total: number;
  SQ: number;
  EVA: number;
  MAH: number;
  EQM: number;
}

interface VentaMensual {
  MES: number;
  mes_nombre: string;
  meta: number;
  venta: number;
  cumplimiento: number | null;
  SQ: number;
  EVA: number;
  MAH: number;
  EQM: number;
}

interface DashData {
  kpis: DashKpis;
  categoria: CatRow[];
  segmento: SegRow[];
  ventas_mensuales: VentaMensual[];
  periodo: string;
  label: string;
  error?: string;
}

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

/* ─── Section title ─────────────────────────────────────────────────── */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
        {title}
        {subtitle && <span style={{ fontSize: 13, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{subtitle}</span>}
      </h3>
    </div>
  );
}

/* ─── Mini margin gauge ────────────────────────────────────────────── */

function MarginGauge({ real, meta }: { real: number; meta: number }) {
  const maxVal = Math.max(real, meta, 1) * 1.3;
  const realPct = (real / maxVal) * 100;
  const metaPct = (meta / maxVal) * 100;
  const above = real >= meta;
  const color = above ? "#10B981" : "#EF4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 60, height: 8, background: "#F1F5F9", borderRadius: 4, position: "relative" }}>
        <div style={{
          height: "100%", width: `${Math.min(realPct, 100)}%`,
          background: color, borderRadius: 4,
        }} />
        <div style={{
          position: "absolute", top: -2, left: `${Math.min(metaPct, 100)}%`,
          width: 2, height: 12, background: "#374151", borderRadius: 1,
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 42, textAlign: "right" }}>
        {real.toFixed(1)}%
      </span>
    </div>
  );
}

/* ─── Bar label ────────────────────────────────────────────────────── */

function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="#475569" textAnchor="middle" fontSize={10} fontWeight={600}>
      {fmt(value)}
    </text>
  );
}

/* ─── Colors ────────────────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6",
  MAH: "#10B981",
  EQM: "#F59E0B",
  EVA: "#8B5CF6",
};

/* ─── Period filter options ─────────────────────────────────────────── */

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

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");

  const fetchDashboard = useCallback(async (periodo: string) => {
    setLoading(true);
    try {
      let queryParam = `?periodo=${periodo}`;
      if (periodo.startsWith("mes-")) {
        const mesNum = periodo.split("-")[1];
        queryParam = `?periodo=mes&mes=${mesNum}`;
      }
      const res = await api.get<DashData>(`/api/dashboard/all${queryParam}`);
      setData(res);
    } catch (e) {
      console.error("Failed to load dashboard", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(period); }, [fetchDashboard, period]);

  const handlePeriod = useCallback((val: string) => {
    setPeriod(val);
  }, []);

  const handleRefresh = useCallback(() => {
    clearClientCache();
    api.post("/api/refresh").catch(() => {});
    fetchDashboard(period);
  }, [fetchDashboard, period]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  const k = data?.kpis;
  if (!k) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar Dashboard{data?.error ? `: ${data.error}` : ""}</div>;
  }

  const catData = data?.categoria ?? [];
  const segData = data?.segmento ?? [];
  const periodLabel = data?.label ?? "YTD";

  // Filter chart data by selected period
  const getSelectedMeses = (p: string): number[] | null => {
    if (p === "ytd") return null;
    if (p === "q1") return [1, 2, 3];
    if (p === "q2") return [4, 5, 6];
    if (p === "q3") return [7, 8, 9];
    if (p === "q4") return [10, 11, 12];
    if (p.startsWith("mes-")) return [parseInt(p.split("-")[1])];
    return null;
  };
  const selectedMeses = getSelectedMeses(period);
  const chartData = selectedMeses
    ? (data?.ventas_mensuales ?? []).filter(m => selectedMeses.includes(m.MES))
    : (data?.ventas_mensuales ?? []);

  const segPieData = segData.map(s => ({
    name: s.segmento === "PUBLICO" ? "Publico" : "Privado",
    value: s.total,
  }));
  const SEG_COLORS = ["#3B82F6", "#10B981"];

  // Cumplimiento for progress bar
  const cumplPct = k.cumpl;
  const pctBar = Math.min(cumplPct, 100);
  const barColor = cumplPct >= 100 ? "#10B981" : cumplPct >= 80 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      {/* Header with progress bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Panel Principal</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Meta vs Venta &mdash; Todas las categorias (SQ, MAH, EQM, EVA)
          </p>
        </div>
        {/* Cumplimiento progress bar */}
        <div style={{ flex: "0 0 320px", marginRight: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 4 }}>
            <span>Cumplimiento Meta {periodLabel}</span>
            <span style={{ fontWeight: 800, color: barColor, fontSize: 14 }}>
              {semaforo(cumplPct)} {fmtPct(cumplPct)}
            </span>
          </div>
          <div style={{ height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pctBar}%`,
              background: barColor,
              borderRadius: 5,
              transition: "width 0.5s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
            <span>Venta: {fmtAbs(k.venta)}</span>
            <span>Meta: {fmtAbs(k.meta_periodo)}</span>
          </div>
        </div>
        <button onClick={handleRefresh} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* ═══ GLOBAL PERIOD FILTER ═══ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
        padding: "12px 20px", background: "white", borderRadius: 10,
        border: "1px solid #E2E8F0",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
          Periodo:
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriod(opt.value)}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: period === opt.value ? "2px solid #3B82F6" : "1px solid #E2E8F0",
                background: period === opt.value ? "#EFF6FF" : "white",
                color: period === opt.value ? "#2563EB" : "#64748B",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB", marginLeft: 8 }}>
          {periodLabel}
        </span>
      </div>

      {/* ═══ KPIs ROW 1 ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <StatCard label="Meta Anual 2026" value={fmtAbs(k.meta_anual)} color="#6366F1" />
        <StatCard label={`Meta ${periodLabel}`} value={fmtAbs(k.meta_periodo)} color="#8B5CF6" />
        <StatCard
          label={`Venta ${periodLabel}`}
          value={fmtAbs(k.venta)}
          sub={`2025: ${fmtAbs(k.venta_25)}`}
          color="#3B82F6"
        />
        <StatCard
          label="Cumpl. Venta"
          value={`${semaforo(k.cumpl)} ${fmtPct(k.cumpl)}`}
          sub={`Gap: ${fmtAbs(k.gap)}`}
          color={k.cumpl >= 100 ? "#10B981" : k.cumpl >= 80 ? "#F59E0B" : "#EF4444"}
        />
        <StatCard
          label="Crec. vs 2025"
          value={`${k.crec_vs_25 >= 0 ? "+" : ""}${fmtPct(k.crec_vs_25)}`}
          color={k.crec_vs_25 >= 0 ? "#10B981" : "#EF4444"}
        />
      </div>

      {/* ═══ KPIs ROW 2 — Contribucion y Margen ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard
          label="Contribucion"
          value={fmtAbs(k.contrib_real)}
          sub={`Meta: ${fmtAbs(k.meta_contrib_periodo)} | Cumpl: ${fmtPct(k.cumpl_contrib)}`}
          color={k.cumpl_contrib >= 100 ? "#10B981" : k.cumpl_contrib >= 80 ? "#F59E0B" : "#EF4444"}
        />
        <StatCard
          label="Margen Bruto"
          value={`${fmtPct(k.margen_real)}`}
          sub={`Meta: ${fmtPct(k.margen_meta)} | ${k.margen_real >= k.margen_meta ? "Por encima" : "Por debajo"}`}
          color={k.margen_real >= k.margen_meta ? "#10B981" : "#EF4444"}
        />
      </div>

      {/* ═══ CHART + PIE: Meta vs Venta mensual + Segmento ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* ComposedChart: Meta vs Venta + Cumplimiento line */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
            Meta vs Venta Mensual 2026
          </h3>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => {
                  const abs = Math.abs(Number(v));
                  if (abs >= 1e9) return `${(Number(v)/1e9).toFixed(0)}MM`;
                  if (abs >= 1e6) return `${(Number(v)/1e6).toFixed(0)}M`;
                  return String(v);
                }}
                tick={{ fontSize: 11 }}
                width={60}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={50}
                domain={[0, 140]}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => {
                  if (name === "Cumpl. %") return [`${Number(v).toFixed(1)}%`, name];
                  return [fmtAbs(Number(v)), name];
                }}
                labelFormatter={(l) => `Mes: ${l}`}
                contentStyle={{ borderRadius: 8, fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar yAxisId="left" dataKey="meta" name="Meta" fill="#8B5CF6" radius={[4, 4, 0, 0]} opacity={0.7}>
                <LabelList dataKey="meta" content={<BarLabel />} />
              </Bar>
              <Bar yAxisId="left" dataKey="venta" name="Venta" fill="#10B981" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="venta" content={<BarLabel />} />
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumplimiento"
                name="Cumpl. %"
                stroke="#F59E0B"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#F59E0B" }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart: Segmento */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "16px 24px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 4px", lineHeight: 1.2 }}>
            Venta por Segmento
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>
              {periodLabel}
            </span>
          </h3>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={segPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(props: any) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(1)}%`}
                >
                  {segPieData.map((_, i) => (
                    <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtAbs(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Segment totals */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4 }}>
            {segData.map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>
                  {s.segmento === "PUBLICO" ? "Publico" : "Privado"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: SEG_COLORS[i] }}>
                  {fmtAbs(s.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ TABLA: Meta vs Venta por Categoria ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", marginBottom: 24, overflow: "hidden" }}>
        <SectionTitle
          title="Meta vs Venta por Categoria"
          subtitle={periodLabel}
        />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={thStyle}>Categoria</th>
              <th style={thR}>Meta Anual</th>
              <th style={thR}>Meta Periodo</th>
              <th style={thR}>Venta</th>
              <th style={thR}>Gap</th>
              <th style={thR}>Cumpl. Venta</th>
              <th style={thR}>Margen %</th>
              <th style={thR}>Venta 2025</th>
              <th style={thR}>Crec. vs 25</th>
            </tr>
          </thead>
          <tbody>
            {catData.map((row, i) => {
              const isTotal = row.categoria === "Total";
              const cumplColor = row.cumpl >= 100 ? "#10B981" : row.cumpl >= 80 ? "#F59E0B" : "#EF4444";
              const crecColor = row.crec_vs_25 >= 0 ? "#10B981" : "#EF4444";
              return (
                <tr key={i} style={{
                  borderBottom: "1px solid #F1F5F9",
                  fontWeight: isTotal ? 700 : 400,
                  background: isTotal ? "#F1F5F9" : i % 2 === 0 ? "white" : "#FAFBFD",
                }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {!isTotal && <span style={{
                      display: "inline-block", width: 10, height: 10, borderRadius: 3,
                      background: CAT_COLORS[row.categoria] ?? "#94A3B8", marginRight: 8,
                    }} />}
                    {row.categoria}
                  </td>
                  <td style={tdR}>{fmtAbs(row.meta_anual)}</td>
                  <td style={tdR}>{fmtAbs(row.meta_periodo)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(row.venta)}</td>
                  <td style={{ ...tdR, color: row.gap >= 0 ? "#10B981" : "#EF4444" }}>{fmtAbs(row.gap)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: cumplColor }}>
                    {semaforo(row.cumpl)} {fmtPct(row.cumpl)}
                  </td>
                  <td style={tdR}>
                    <MarginGauge real={row.margen_real} meta={row.margen_meta} />
                  </td>
                  <td style={tdR}>{fmtAbs(row.venta_25)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: crecColor }}>
                    {row.crec_vs_25 >= 0 ? "+" : ""}{fmtPct(row.crec_vs_25)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ TABLA: Segmento x Categoria ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <SectionTitle
          title="Venta por Segmento y Categoria"
          subtitle={periodLabel}
        />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={thStyle}>Segmento</th>
              <th style={thR}>SQ</th>
              <th style={thR}>MAH</th>
              <th style={thR}>EQM</th>
              <th style={thR}>EVA</th>
              <th style={{ ...thR, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {segData.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  {row.segmento === "PUBLICO" ? "Publico" : "Privado"}
                </td>
                <td style={tdR}>{fmtAbs(row.SQ)}</td>
                <td style={tdR}>{fmtAbs(row.MAH)}</td>
                <td style={tdR}>{fmtAbs(row.EQM)}</td>
                <td style={tdR}>{fmtAbs(row.EVA)}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmtAbs(row.total)}</td>
              </tr>
            ))}
            {/* Total row */}
            {segData.length === 2 && (() => {
              const s = segData;
              return (
                <tr style={{ borderTop: "2px solid #D1D5DB", background: "#F1F5F9", fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdR}>{fmtAbs(s[0].SQ + s[1].SQ)}</td>
                  <td style={tdR}>{fmtAbs(s[0].MAH + s[1].MAH)}</td>
                  <td style={tdR}>{fmtAbs(s[0].EQM + s[1].EQM)}</td>
                  <td style={tdR}>{fmtAbs(s[0].EVA + s[1].EVA)}</td>
                  <td style={tdR}>{fmtAbs(s[0].total + s[1].total)}</td>
                </tr>
              );
            })()}
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
