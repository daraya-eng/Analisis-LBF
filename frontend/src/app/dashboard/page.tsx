"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, semaforo, fmt } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { ExportButton } from "@/components/table-tools";
import HelpButton from "@/components/help-button";
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

interface RitmoData {
  time_pct: number;
  actual_pct: number;
  diff_pct: number;
  status: "adelantado" | "atrasado" | "en_linea";
  venta_25_al_dia: number;
  diff_vs_25: number;
  dias_transcurridos: number;
  dias_totales: number;
  periodo_completo: boolean;
  ritmo_diario: number;
  necesario_diario: number;
  proyeccion: number;
  hab_transcurridos: number;
  hab_restantes: number;
}

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
  ritmo: RitmoData;
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
  cumpl: number;
  gap: number;
  ritmo_diario: number;
  necesario_diario: number;
  proyeccion: number;
}

interface SegRow {
  segmento: string;
  total: number;
  SQ: number;
  EVA: number;
  MAH: number;
  EQM: number;
  guias_total: number;
  guias_SQ: number;
  guias_EVA: number;
  guias_MAH: number;
  guias_EQM: number;
}

interface CatDetailZona {
  zona: string;
  kam: string;
  venta: number;
  contrib: number;
  margen: number;
}

interface ZonaCatData {
  venta: number;
  contrib: number;
  margen: number;
  pct_zona: number;
}

interface ZonaRow {
  zona: string;
  kam: string;
  venta: number;
  categorias: Record<string, ZonaCatData>;
}

interface VentaMensual {
  MES: number;
  mes_nombre: string;
  meta: number;
  venta: number;
  cumplimiento: number | null;
  contrib: number;
  margen: number | null;
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

interface DiaRow {
  dia: number;
  venta_26: number;
  venta_25: number;
  acum_26: number;
  acum_25: number;
}

interface DailyData {
  dias: DiaRow[];
  mes: number;
  ano: number;
}

/* ─── Stat Card ─────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, color, tooltip }: { label: string; value: string; sub?: string; color: string; tooltip?: string }) {
  return (
    <div
      title={tooltip}
      style={{
        flex: "1 1 180px", background: "white", borderRadius: 10,
        border: "1px solid #E2E8F0", overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
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
  const r = real ?? 0;
  const m = meta ?? 0;
  const maxVal = Math.max(r, m, 1) * 1.3;
  const realPct = (r / maxVal) * 100;
  const metaPct = (m / maxVal) * 100;
  const above = r >= m;
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
        {r.toFixed(1)}%
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

const SEG_COLORS = ["#3B82F6", "#10B981"];

/* ─── Period filter options ─────────────────────────────────────────── */

const QUICK_PERIODS = [
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
];

const MONTH_OPTIONS = [
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
  const [period, setPeriod] = useState(`mes-${new Date().getMonth() + 1}`);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [catDetailZonas, setCatDetailZonas] = useState<CatDetailZona[]>([]);
  const [catDetailLoading, setCatDetailLoading] = useState(false);
  const [dailyData, setDailyData] = useState<DailyData | null>(null);

  const fetchDashboard = useCallback(async (periodo: string) => {
    setLoading(true);
    try {
      let queryParam = `?periodo=${periodo}`;
      let mesNum = new Date().getMonth() + 1; // default: current month
      if (periodo.startsWith("mes-")) {
        mesNum = parseInt(periodo.split("-")[1]);
        queryParam = `?periodo=mes&mes=${mesNum}`;
      }
      const res = await api.get<DashData>(`/api/dashboard/all${queryParam}`);
      setData(res);
      // Daily chart — fetch independently so a failure doesn't break the page
      api.get<DailyData>(`/api/dashboard/diario?mes=${mesNum}`)
        .then(setDailyData)
        .catch(() => setDailyData(null));
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

  const handleCatClick = useCallback((cat: string) => {
    if (cat === "Total") return;
    if (expandedCat === cat) {
      setExpandedCat(null);
      setCatDetailZonas([]);
      return;
    }
    setExpandedCat(cat);
    setCatDetailLoading(true);
    setCatDetailZonas([]);
    let queryParam = `?periodo=${period}`;
    if (period.startsWith("mes-")) {
      const mesNum = period.split("-")[1];
      queryParam = `?periodo=mes&mes=${mesNum}`;
    }
    api.get<{ zonas: ZonaRow[] }>(`/api/zona/${queryParam}`)
      .then(r => {
        const zonas = (r.zonas ?? [])
          .map((z: ZonaRow) => {
            const catData = z.categorias?.[cat];
            if (!catData || catData.venta === 0) return null;
            return {
              zona: z.zona,
              kam: z.kam,
              venta: catData.venta,
              contrib: catData.contrib,
              margen: catData.margen,
            };
          })
          .filter((z): z is CatDetailZona => z !== null)
          .sort((a, b) => b.venta - a.venta);
        setCatDetailZonas(zonas);
        setCatDetailLoading(false);
      })
      .catch(() => setCatDetailLoading(false));
  }, [expandedCat, period]);

  // Reset expanded category when period changes
  useEffect(() => { setExpandedCat(null); setCatDetailZonas([]); }, [period]);

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
  const currentMonth = new Date().getMonth() + 1; // 1-based
  const allMonthly = data?.ventas_mensuales ?? [];
  const chartData = selectedMeses
    ? allMonthly.filter(m => selectedMeses.includes(m.MES) && m.MES <= currentMonth)
    : allMonthly.filter(m => m.MES <= currentMonth);

  const segPieData = segData.map(s => ({
    name: s.segmento === "PUBLICO" ? "Publico" : "Privado",
    value: s.total,
  }));

  // Cumplimiento for progress bar
  const cumplPct = k.cumpl;
  const pctBar = Math.min(cumplPct, 100);
  const barColor = cumplPct >= 100 ? "#10B981" : cumplPct >= 80 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Panel Principal</h1>
            <HelpButton module="dashboard" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Meta vs Venta &mdash; Todas las categorias (SQ, MAH, EQM, EVA)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Period filter */}
          <div style={{ display: "flex", gap: 2, background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
            {QUICK_PERIODS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriod(opt.value)}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: "none",
                  background: period === opt.value ? "white" : "transparent",
                  color: period === opt.value ? "#1E40AF" : "#64748B",
                  cursor: "pointer",
                  boxShadow: period === opt.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={period.startsWith("mes-") ? period : ""}
            onChange={(e) => { if (e.target.value) handlePeriod(e.target.value); }}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: period.startsWith("mes-") ? "2px solid #3B82F6" : "1px solid #E2E8F0",
              background: period.startsWith("mes-") ? "#EFF6FF" : "white",
              color: period.startsWith("mes-") ? "#1E40AF" : "#64748B",
              cursor: "pointer", outline: "none",
            }}
          >
            <option value="" disabled>Mes</option>
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={handleRefresh} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
            background: "white", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer",
          }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* ═══ CUMPLIMIENTO BAR — prominent, centered ═══ */}
      {(() => {
        const proyPct = k.meta_periodo > 0 ? (k.ritmo?.proyeccion ?? 0) / k.meta_periodo * 100 : 0;
        const proyBar = Math.min(proyPct, 120);
        const timePct = k.ritmo?.time_pct ?? 0;
        const showProy = k.ritmo && !k.ritmo.periodo_completo && timePct > 0;
        const proyColor = proyPct >= 100 ? "#10B981" : proyPct >= 80 ? "#F59E0B" : "#EF4444";
        return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid #E2E8F0",
        padding: "16px 24px", marginBottom: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Cumplimiento Meta {periodLabel}
            {showProy && (
              <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>
                ({k.ritmo.hab_restantes}d habiles restantes)
              </span>
            )}
          </span>
          <span style={{ fontWeight: 800, color: barColor, fontSize: 20 }}>
            {semaforo(cumplPct)} {fmtPct(cumplPct)}
          </span>
        </div>
        {/* Barra de cumplimiento actual */}
        <div style={{ position: "relative", height: 14, background: "#E2E8F0", borderRadius: 7, overflow: "hidden", marginBottom: showProy ? 6 : 0 }}>
          <div style={{
            height: "100%",
            width: `${pctBar}%`,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`,
            borderRadius: 7,
            transition: "width 0.5s ease",
          }} />
          {showProy && timePct < 100 && (
            <div style={{
              position: "absolute", top: 0, left: `${Math.min(timePct, 100)}%`, width: 2, height: "100%",
              background: "#1E293B", opacity: 0.5,
            }} title={`${fmtPct(timePct)} del tiempo transcurrido`} />
          )}
        </div>
        {/* Barra de proyeccion */}
        {showProy && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "#64748B", whiteSpace: "nowrap" }}>Proyeccion</span>
              <div style={{ flex: 1, position: "relative", height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(proyBar / 1.2, 100)}%`,
                  background: `linear-gradient(90deg, ${proyColor}88, ${proyColor})`,
                  borderRadius: 4,
                  transition: "width 0.5s ease",
                }} />
                {/* Marca 100% meta */}
                <div style={{
                  position: "absolute", top: 0, left: `${100 / 1.2}%`, width: 2, height: "100%",
                  background: "#374151", opacity: 0.6,
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: proyColor, whiteSpace: "nowrap" }}>
                {fmtPct(proyPct)}
              </span>
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginTop: 6 }}>
          <span>Venta: <strong style={{ color: "#0F172A" }}>{fmtAbs(k.venta)}</strong></span>
          {showProy && <span>Proyeccion: <strong style={{ color: proyColor }}>{fmtAbs(k.ritmo.proyeccion)}</strong></span>}
          <span>Meta: <strong style={{ color: "#0F172A" }}>{fmtAbs(k.meta_periodo)}</strong></span>
        </div>
      </div>
        );
      })()}

      {/* ═══ RITMO / PACE ═══ */}
      {k.ritmo && !k.ritmo.periodo_completo && k.ritmo.time_pct > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <StatCard
            label="Ritmo diario"
            value={fmt(k.ritmo.ritmo_diario)}
            sub={`Necesario: ${fmt(k.ritmo.necesario_diario)}`}
            color={k.ritmo.ritmo_diario >= k.ritmo.necesario_diario ? "#10B981" : "#EF4444"}
            tooltip="Venta promedio por dia habil en el periodo. Necesario = cuanto hay que vender diario para cumplir la meta"
          />
          <StatCard
            label="Proyeccion mes"
            value={fmt(k.ritmo.proyeccion)}
            sub={`${k.ritmo.hab_restantes}d habiles restantes`}
            color={k.ritmo.proyeccion >= k.meta_periodo ? "#10B981" : "#EF4444"}
            tooltip="Proyeccion lineal de venta al cierre del periodo basado en el ritmo diario actual"
          />
        </div>
      )}

      {/* ═══ KPIs ROW 1 ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <StatCard label="Meta Anual 2026" value={fmtAbs(k.meta_anual)} color="#6366F1"
          tooltip="Presupuesto de venta total anual 2026, sumando todas las zonas y categorias" />
        <StatCard label={`Meta ${periodLabel}`} value={fmtAbs(k.meta_periodo)} color="#8B5CF6"
          tooltip="Presupuesto de venta para el periodo seleccionado" />
        <StatCard
          label={`Venta ${periodLabel}`}
          value={fmtAbs(k.venta)}
          sub={`2025: ${fmtAbs(k.venta_25)}`}
          color="#3B82F6"
          tooltip="Venta neta acumulada (facturas + guias pendientes). Debajo se muestra la venta 2025 del mismo periodo"
        />
        <StatCard
          label="Cumpl. Venta"
          value={`${semaforo(k.cumpl)} ${fmtPct(k.cumpl)}`}
          sub={`Gap: ${fmtAbs(k.gap)}`}
          color={k.cumpl >= 100 ? "#10B981" : k.cumpl >= 80 ? "#F59E0B" : "#EF4444"}
          tooltip="Venta / Meta x 100. Verde >=100%, amarillo >=80%, rojo <80%"
        />
        {k.ritmo && !k.ritmo.periodo_completo && k.ritmo.time_pct > 0 ? (
          <StatCard
            label="Cumpl. vs Proyeccion"
            value={`${k.cumpl >= k.ritmo.time_pct ? "+" : ""}${fmtPct(k.cumpl - k.ritmo.time_pct)}`}
            sub={`Real: ${fmtPct(k.cumpl)} | Esperado: ${fmtPct(k.ritmo.time_pct)}`}
            color={k.cumpl >= k.ritmo.time_pct ? "#10B981" : "#EF4444"}
            tooltip="Diferencia entre cumplimiento real y % de tiempo transcurrido. Positivo = adelantado"
          />
        ) : (
          <StatCard
            label="Crec. vs 2025"
            value={`${k.crec_vs_25 >= 0 ? "+" : ""}${fmtPct(k.crec_vs_25)}`}
            color={k.crec_vs_25 >= 0 ? "#10B981" : "#EF4444"}
            tooltip="Crecimiento porcentual de venta 2026 vs mismo periodo 2025"
          />
        )}
      </div>

      {/* ═══ KPIs ROW 2 — Contribucion y Margen ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard
          label="Contribucion"
          value={fmtAbs(k.contrib_real)}
          sub={`Meta: ${fmtAbs(k.meta_contrib_periodo)} | Cumpl: ${fmtPct(k.cumpl_contrib)}`}
          color={k.cumpl_contrib >= 100 ? "#10B981" : k.cumpl_contrib >= 80 ? "#F59E0B" : "#EF4444"}
          tooltip="Margen bruto en pesos: Venta - Costo. Mide la ganancia bruta de producto"
        />
        <StatCard
          label="Margen Bruto"
          value={`${fmtPct(k.margen_real)}`}
          sub={`Meta: ${fmtPct(k.margen_meta)} | ${k.margen_real >= k.margen_meta ? "Por encima" : "Por debajo"}`}
          color={k.margen_real >= k.margen_meta ? "#10B981" : "#EF4444"}
          tooltip="(Venta - Costo) / Venta x 100. No incluye costos logisticos ni comisiones"
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

          {/* ── Tabla de valores absolutos ── */}
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "#64748B", fontWeight: 600 }}>Mes</th>
                  {chartData.map(m => (
                    <th key={m.MES} style={{ textAlign: "right", padding: "6px 8px", color: "#64748B", fontWeight: 600 }}>
                      {m.mes_nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#8B5CF6" }}>Meta</td>
                  {chartData.map(m => (
                    <td key={m.MES} style={{ textAlign: "right", padding: "5px 8px", color: "#334155" }}>{fmt(m.meta)}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#10B981" }}>Venta</td>
                  {chartData.map(m => (
                    <td key={m.MES} style={{ textAlign: "right", padding: "5px 8px", color: "#334155" }}>{fmt(m.venta)}</td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#64748B" }}>Gap</td>
                  {chartData.map(m => {
                    const gap = m.venta - m.meta;
                    return (
                      <td key={m.MES} style={{ textAlign: "right", padding: "5px 8px", color: gap >= 0 ? "#10B981" : "#EF4444", fontWeight: 500 }}>
                        {fmt(gap)}
                      </td>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#F59E0B" }}>Cumpl.</td>
                  {chartData.map(m => (
                    <td key={m.MES} style={{ textAlign: "right", padding: "5px 8px", color: "#334155" }}>
                      {m.cumplimiento != null ? `${m.cumplimiento.toFixed(1)}%` : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#0EA5E9" }}>Margen</td>
                  {chartData.map(m => (
                    <td key={m.MES} style={{ textAlign: "right", padding: "5px 8px", color: "#334155" }}>
                      {m.margen != null ? `${m.margen.toFixed(1)}%` : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
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

      {/* ═══ CHART: Facturación diaria ═══ */}
      {dailyData && dailyData.dias.length > 0 && (() => {
        const MESES_NOMBRE_SHORT: Record<number, string> = {
          1:"Ene",2:"Feb",3:"Mar",4:"Abr",5:"May",6:"Jun",
          7:"Jul",8:"Ago",9:"Sep",10:"Oct",11:"Nov",12:"Dic",
        };
        const mesLabel = MESES_NOMBRE_SHORT[dailyData.mes] ?? "";
        const maxVenta = Math.max(...dailyData.dias.map(d => Math.max(d.venta_26, d.venta_25)));
        return (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "16px 20px 12px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
              Facturación Diaria — {mesLabel} 2026
            </h3>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>vs {mesLabel} 2025</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={dailyData.dias} margin={{ top: 18, right: 50, left: 10, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="#F8FAFC" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="v" hide domain={[0, maxVenta * 1.4]} />
              <YAxis yAxisId="a" orientation="right" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v: number) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}MM` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : ""} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => [fmtAbs(Number(v)), name]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(l: any) => `Día ${l}`}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar yAxisId="v" dataKey="venta_26" name="Venta 2026" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={22}>
                <LabelList dataKey="venta_26" position="top" style={{ fontSize: 8, fill: "#3B82F6", fontWeight: 700 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => v >= 1e8 ? `$${(v/1e6).toFixed(0)}M` : ""} />
              </Bar>
              <Bar yAxisId="v" dataKey="venta_25" name="Venta 2025" fill="#E2E8F0" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Line yAxisId="a" type="monotone" dataKey="acum_26" name="Acum. 2026" stroke="#10B981" strokeWidth={2} dot={false} />
              <Line yAxisId="a" type="monotone" dataKey="acum_25" name="Acum. 2025" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        );
      })()}

      {/* ═══ TABLA: Meta vs Venta por Categoria ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
              Meta vs Venta por Categoria
              <span style={{ fontSize: 13, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{periodLabel}</span>
            </h3>
            <p style={{ fontSize: 11, color: "#94A3B8", margin: "2px 0 0" }}>Haz clic en una categoria para ver detalle por zona y clientes</p>
          </div>
          <ExportButton
            data={catData}
            columns={[
              { key: "categoria", label: "Categoria" }, { key: "meta_anual", label: "Meta Anual" },
              { key: "meta_periodo", label: "Meta Periodo" }, { key: "venta", label: "Venta" },
              { key: "gap", label: "Gap" }, { key: "cumpl", label: "Cumpl %" },
              { key: "ritmo_diario", label: "Ritmo $/dia" }, { key: "necesario_diario", label: "Necesario $/dia" },
              { key: "proyeccion", label: "Proyeccion" },
              { key: "margen_real", label: "Margen Real %" }, { key: "margen_meta", label: "Margen Meta %" },
            ]}
            filename="categoria_meta_venta"
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={thStyle}>Categoria</th>
              <th style={thR} title="Presupuesto anual 2026">Meta Anual</th>
              <th style={thR} title="Presupuesto del periodo seleccionado">Meta Periodo</th>
              <th style={thR} title="Venta neta acumulada (facturas + guias)">Venta</th>
              <th style={thR} title="Venta - Meta (positivo = supera meta)">Gap</th>
              <th style={thR} title="Venta / Meta x 100">Cumpl. Venta</th>
              {k?.ritmo && !k.ritmo.periodo_completo && (
                <>
                  <th style={thR} title="Venta / dias habiles transcurridos">Ritmo $/dia</th>
                  <th style={thR} title="(Meta - Venta) / dias habiles restantes">Necesario $/dia</th>
                  <th style={thR} title="Venta + Ritmo x dias restantes">Proyeccion</th>
                </>
              )}
              <th style={thR} title="Margen bruto: (Venta - Costo) / Venta x 100">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {catData.map((row, i) => {
              const isTotal = row.categoria === "Total";
              const isExpanded = expandedCat === row.categoria;
              const cumplColor = row.cumpl >= 100 ? "#10B981" : row.cumpl >= 80 ? "#F59E0B" : "#EF4444";
              return (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => handleCatClick(row.categoria)}
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid #F1F5F9",
                      fontWeight: isTotal ? 700 : 400,
                      background: isExpanded ? "#EFF6FF" : isTotal ? "#F1F5F9" : i % 2 === 0 ? "white" : "#FAFBFD",
                      cursor: isTotal ? "default" : "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (!isTotal && !isExpanded) e.currentTarget.style.background = "#F8FAFC"; }}
                    onMouseLeave={e => { if (!isTotal && !isExpanded) e.currentTarget.style.background = i % 2 === 0 ? "white" : "#FAFBFD"; }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {!isTotal && (
                          isExpanded
                            ? <ChevronDown size={14} color="#3B82F6" />
                            : <ChevronRight size={14} color="#94A3B8" />
                        )}
                        {!isTotal && <span style={{
                          display: "inline-block", width: 10, height: 10, borderRadius: 3,
                          background: CAT_COLORS[row.categoria] ?? "#94A3B8",
                        }} />}
                        {row.categoria}
                      </div>
                    </td>
                    <td style={tdR}>{fmtAbs(row.meta_anual)}</td>
                    <td style={tdR}>{fmtAbs(row.meta_periodo)}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(row.venta)}</td>
                    <td style={{ ...tdR, color: row.gap >= 0 ? "#10B981" : "#EF4444" }}>{fmtAbs(row.gap)}</td>
                    <td style={{ ...tdR, fontWeight: 600, color: cumplColor }}>
                      {semaforo(row.cumpl)} {fmtPct(row.cumpl)}
                    </td>
                    {k?.ritmo && !k.ritmo.periodo_completo && (
                      <>
                        <td style={{ ...tdR, fontSize: 12 }}>{fmt(row.ritmo_diario)}</td>
                        <td style={{ ...tdR, fontSize: 12, color: row.necesario_diario > row.ritmo_diario ? "#EF4444" : "#10B981" }}>
                          {fmt(row.necesario_diario)}
                        </td>
                        <td style={{ ...tdR, fontSize: 12, fontWeight: 600, color: row.proyeccion >= row.meta_periodo ? "#10B981" : "#EF4444" }}>
                          {fmt(row.proyeccion)}
                        </td>
                      </>
                    )}
                    <td style={tdR}>
                      <MarginGauge real={row.margen_real} meta={row.margen_meta} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={k?.ritmo && !k.ritmo.periodo_completo ? 10 : 7} style={{ padding: 0, background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        {catDetailLoading ? (
                          <div style={{ padding: 24, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                            <div className="spinner-ring animate-spin-ring" style={{ width: 18, height: 18, borderWidth: 2, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6", display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                            Cargando detalle por zona...
                          </div>
                        ) : catDetailZonas.length > 0 ? (
                          <div style={{ padding: "12px 20px 16px" }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>
                              Venta por Zona — {row.categoria}
                            </h4>
                            <div style={{ background: "white", borderRadius: 8, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "#F8FAFC" }}>
                                    <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px" }}>Zona</th>
                                    <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px" }}>KAM</th>
                                    <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Venta</th>
                                    <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Contrib.</th>
                                    <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Margen %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {catDetailZonas.map((z, zi) => (
                                    <tr key={zi} style={{ borderBottom: "1px solid #F1F5F9", background: zi % 2 === 0 ? "white" : "#FAFBFC" }}>
                                      <td style={{ padding: "5px 10px", fontSize: 12, color: "#1F2937", fontWeight: 500 }}>{z.zona}</td>
                                      <td style={{ padding: "5px 10px", fontSize: 12, color: "#64748B" }}>{z.kam}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtAbs(z.venta)}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(z.contrib)}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "right", fontSize: 12, fontWeight: 600, color: z.margen >= 40 ? "#10B981" : z.margen >= 30 ? "#F59E0B" : "#EF4444" }}>
                                        {fmtPct(z.margen)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                            Sin datos de zona para {row.categoria}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
            {segData.map((row, i) => {
              const GuiasSub = ({ v }: { v: number }) => v > 0 ? (
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>inc. Guías: {fmt(v)}</div>
              ) : null;
              return (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {row.segmento === "PUBLICO" ? "Publico" : "Privado"}
                  </td>
                  <td style={tdR}>{fmtAbs(row.SQ)}<GuiasSub v={row.guias_SQ ?? 0} /></td>
                  <td style={tdR}>{fmtAbs(row.MAH)}<GuiasSub v={row.guias_MAH ?? 0} /></td>
                  <td style={tdR}>{fmtAbs(row.EQM)}<GuiasSub v={row.guias_EQM ?? 0} /></td>
                  <td style={tdR}>{fmtAbs(row.EVA)}<GuiasSub v={row.guias_EVA ?? 0} /></td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{fmtAbs(row.total)}<GuiasSub v={row.guias_total ?? 0} /></td>
                </tr>
              );
            })}
            {/* Total row */}
            {segData.length === 2 && (() => {
              const s = segData;
              const GuiasSub = ({ v }: { v: number }) => v > 0 ? (
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>inc. Guías: {fmt(v)}</div>
              ) : null;
              return (
                <tr style={{ borderTop: "2px solid #D1D5DB", background: "#F1F5F9", fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdR}>{fmtAbs(s[0].SQ + s[1].SQ)}<GuiasSub v={(s[0].guias_SQ ?? 0) + (s[1].guias_SQ ?? 0)} /></td>
                  <td style={tdR}>{fmtAbs(s[0].MAH + s[1].MAH)}<GuiasSub v={(s[0].guias_MAH ?? 0) + (s[1].guias_MAH ?? 0)} /></td>
                  <td style={tdR}>{fmtAbs(s[0].EQM + s[1].EQM)}<GuiasSub v={(s[0].guias_EQM ?? 0) + (s[1].guias_EQM ?? 0)} /></td>
                  <td style={tdR}>{fmtAbs(s[0].EVA + s[1].EVA)}<GuiasSub v={(s[0].guias_EVA ?? 0) + (s[1].guias_EVA ?? 0)} /></td>
                  <td style={tdR}>{fmtAbs(s[0].total + s[1].total)}<GuiasSub v={(s[0].guias_total ?? 0) + (s[1].guias_total ?? 0)} /></td>
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
