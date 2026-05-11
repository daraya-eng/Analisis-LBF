"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { fmt, fmtPct } from "@/lib/format";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { RefreshCw, Search } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface PMFiltros {
  zonas: string[];
  familias: string[];
  categorias: string[];
}

interface PMKpis {
  venta_mes: number;
  ppto_mes: number;
  mg_mes: number;
  ppto_mg_mes: number;
  venta_trim: number;
  ppto_trim: number;
  mg_trim: number;
  ppto_mg_trim: number;
  venta_ytd: number;
  ppto_ytd: number;
  mg_ytd: number;
  ppto_mg_ytd: number;
  venta_mes_25: number;
  dias_trans: number;
  dias_rest: number;
  dias_total: number;
  pct_dias: number;
  mes: number;
  ano: number;
}

interface PMCategoria {
  categoria: string;
  venta_mes: number;
  venta_ant: number;
  ppto_mes: number;
  ppto_anual: number;
  cump_ppto: number;
  var_ant: number;
  pct_dias: number;
  contrib: number;
  margen: number;
}

interface PMProducto {
  codigo: string;
  descripcion: string;
  familia: string;
  venta_mes: number;
  vta_prom_6m: number;
  q_stock: number;
  ppto_mes: number;
  margen: number;
}

interface PMData {
  kpis: PMKpis;
  categorias: PMCategoria[];
  productos: PMProducto[];
  zona: string;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6",
  MAH: "#10B981",
  EQM: "#F59E0B",
  EVA: "#8B5CF6",
};

const MESES_NOMBRE: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
  5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
  9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};

const HEADER_BG = "#1E3A5F";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function toMM(n: number): string {
  return (n / 1_000_000).toFixed(1);
}

function gaugeFill(actual: number, target: number): string {
  if (target === 0) return "#64748B";
  const pct = actual / target;
  if (pct >= 1) return "#10B981";
  if (pct >= 0.7) return "#F59E0B";
  return "#EF4444";
}

function cumpColor(cump: number, pctDias: number): string {
  const threshold = pctDias;
  if (cump >= threshold + 5) return "#10B981";
  if (cump >= threshold - 5) return "#F59E0B";
  return "#EF4444";
}

function varColor(v: number): string {
  return v >= 0 ? "#10B981" : "#EF4444";
}

/* ─── SVG Semi-circle Gauge ──────────────────────────────────────────── */

function SemiGauge({
  title,
  actual,
  target,
  isPercent = false,
}: {
  title: string;
  actual: number;
  target: number;
  isPercent?: boolean;
}) {
  const W = 200;
  const H = 120;
  const cx = W / 2;
  const cy = H - 14;
  const r = 80;
  const strokeW = 14;

  // Arc path helper (semi-circle from left to right, top-open)
  function polarToXY(deg: number) {
    const rad = ((deg - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const pct = target > 0 ? Math.min(actual / target, 1) : 0;
  // Semi-circle spans 180 degrees (from 0° to 180° at bottom)
  const sweepDeg = pct * 180;

  const start = polarToXY(0);   // left end of arc
  const end = polarToXY(sweepDeg);  // filled endpoint
  const arcFull = polarToXY(180); // right end

  const largeArcFill = sweepDeg > 90 ? 1 : 0;
  const largeArcBg = 1; // full bg arc is always large

  const fillColor = gaugeFill(actual, target);

  const displayActual = isPercent
    ? `${actual.toFixed(1)}%`
    : `$${toMM(actual)}M`;

  const displayTarget = isPercent
    ? `${target.toFixed(1)}%`
    : `$${toMM(target)}M`;

  const pctDisplay = target > 0 ? `${((actual / target) * 100).toFixed(1)}%` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "4px 0" }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: HEADER_BG,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 2, textAlign: "center",
      }}>
        {title}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* Background arc */}
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcBg} 1 ${arcFull.x} ${arcFull.y}`}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {pct > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFill} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {/* Center: actual value */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize={18}
          fontWeight={800}
          fill={fillColor}
        >
          {displayActual}
        </text>
        {/* % cumplimiento below */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="#64748B"
        >
          {pctDisplay}
        </text>
        {/* Target label at right end */}
        <text
          x={arcFull.x + 4}
          y={arcFull.y + 4}
          textAnchor="start"
          fontSize={9}
          fill="#94A3B8"
        >
          {displayTarget}
        </text>
      </svg>
    </div>
  );
}

/* ─── Multi-select dropdown ──────────────────────────────────────────── */

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const allSelected = selected.length === options.length;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", background: "white",
          border: "1px solid #CBD5E1", borderRadius: 6,
          fontSize: 13, color: HEADER_BG, cursor: "pointer",
          fontWeight: 500, whiteSpace: "nowrap",
        }}
      >
        {label}: {allSelected ? "Todas" : selected.join(", ") || "Ninguna"}
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="#64748B" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: "white", border: "1px solid #E2E8F0",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          zIndex: 100, minWidth: 160, padding: "6px 0",
        }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 14px", cursor: "pointer", fontSize: 12,
            borderBottom: "1px solid #F1F5F9", color: "#64748B",
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : [...options])}
            />
            Todas
          </label>
          {options.map((opt) => (
            <label key={opt} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px", cursor: "pointer", fontSize: 13,
              fontWeight: 500, color: HEADER_BG,
            }}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span style={{
                display: "inline-block", width: 10, height: 10,
                borderRadius: 2, background: CAT_COLORS[opt] ?? "#94A3B8",
                flexShrink: 0,
              }} />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Table styles (inline, no Tailwind deps) ────────────────────────── */

const TH: React.CSSProperties = {
  background: HEADER_BG, color: "white",
  padding: "7px 10px", fontSize: 11,
  fontWeight: 600, textAlign: "left",
  textTransform: "uppercase", letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};
const THR: React.CSSProperties = { ...TH, textAlign: "right" };
const TD: React.CSSProperties = { padding: "6px 10px", fontSize: 12, color: "#1E293B", borderBottom: "1px solid #F1F5F9" };
const TDR: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const CARD: React.CSSProperties = {
  background: "white", borderRadius: 10,
  border: "1px solid #E2E8F0",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

/* ─── Colored cell ───────────────────────────────────────────────────── */
function ColorCell({ value, color, style }: { value: string; color: string; style?: React.CSSProperties }) {
  return (
    <td style={{
      ...TDR, color,
      fontWeight: 700,
      ...style,
    }}>
      {value}
    </td>
  );
}

/* ─── Custom Tooltip for Bar Chart ──────────────────────────────────── */
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "white", border: "1px solid #E2E8F0",
      borderRadius: 8, padding: "10px 14px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: HEADER_BG, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}>
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Spinner ────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", minHeight: 300, gap: 10, color: "#64748B",
    }}>
      <svg width={28} height={28} viewBox="0 0 28 28" style={{ animation: "spin 0.9s linear infinite" }}>
        <circle cx={14} cy={14} r={11} fill="none" stroke="#E2E8F0" strokeWidth={3} />
        <path d="M14 3 A11 11 0 0 1 25 14" fill="none" stroke={HEADER_BG} strokeWidth={3} strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500 }}>Cargando datos...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Bar Chart Label ────────────────────────────────────────────────── */
function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={600}>
      {(value / 1_000_000).toFixed(1)}M
    </text>
  );
}

/* ─── Section Title ──────────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "white",
      background: HEADER_BG, padding: "6px 12px",
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {children}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function PlanDeMesPage() {
  // Filtros state
  const [filtros, setFiltros] = useState<PMFiltros | null>(null);
  const [selectedZona, setSelectedZona] = useState<string>("");
  const [selectedCats, setSelectedCats] = useState<string[]>(["SQ", "MAH", "EQM", "EVA"]);
  const [selectedSubclase, setSelectedSubclase] = useState<string>("");
  const [selectedFecha, setSelectedFecha] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Data state
  const [data, setData] = useState<PMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Product search
  const [prodSearch, setProdSearch] = useState("");

  // Load filtros on mount
  useEffect(() => {
    setLoadingFiltros(true);
    api.get<PMFiltros>("/api/pm/filtros")
      .then((f) => {
        setFiltros(f);
        if (f.categorias?.length) setSelectedCats(f.categorias);
        if (f.zonas?.length) setSelectedZona(f.zonas[0]);
      })
      .catch(() => {
        // fallback defaults
        setFiltros({ zonas: [], familias: [], categorias: ["SQ", "MAH", "EQM", "EVA"] });
      })
      .finally(() => setLoadingFiltros(false));
  }, []);

  // Load resumen data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedZona) params.set("zona", selectedZona);
      if (selectedCats.length) params.set("categorias", selectedCats.join(","));
      if (selectedSubclase) params.set("subclase", selectedSubclase);
      if (selectedFecha) params.set("fecha", selectedFecha);

      const res = await api.get<PMData>(`/api/pm/resumen?${params.toString()}`, { noCache: true });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedZona, selectedCats, selectedSubclase, selectedFecha]);

  // Auto-load when filtros are ready and zona is set
  useEffect(() => {
    if (!loadingFiltros) {
      loadData();
    }
  }, [loadingFiltros, loadData]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!data?.productos) return [];
    const q = prodSearch.toLowerCase();
    if (!q) return data.productos;
    return data.productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q)
    );
  }, [data?.productos, prodSearch]);

  // Product totals
  const prodTotals = useMemo(() => {
    if (!filteredProducts.length) return null;
    return {
      venta_mes: filteredProducts.reduce((s, p) => s + p.venta_mes, 0),
      vta_prom_6m: filteredProducts.reduce((s, p) => s + p.vta_prom_6m, 0),
      q_stock: filteredProducts.reduce((s, p) => s + p.q_stock, 0),
      ppto_mes: filteredProducts.reduce((s, p) => s + p.ppto_mes, 0),
    };
  }, [filteredProducts]);

  // Chart data
  const chartData = useMemo(() => {
    if (!data?.categorias) return [];
    return data.categorias.map((c) => ({
      name: c.categoria,
      "Vta Año Ant": c.venta_ant,
      "Vta PPTO": c.ppto_mes,
      "Vta Real": c.venta_mes,
      margen: c.margen,
    }));
  }, [data?.categorias]);

  // Zona display label
  const zonaLabel = (z: string) => {
    const parts = z.split("-");
    return parts.length > 1 ? parts.slice(1).join("-").trim() : z;
  };

  /* ─── Render ─────────────────────────────────────────────────────── */

  const kpis = data?.kpis;
  const mesLabel = kpis ? `${MESES_NOMBRE[kpis.mes]} ${kpis.ano}` : "";

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: "#F8FAFC",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{
        background: "white",
        borderBottom: "1px solid #E2E8F0",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 8 }}>
          <div style={{
            background: HEADER_BG, color: "white",
            borderRadius: 8, padding: "4px 12px",
            fontSize: 14, fontWeight: 800, letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}>
            Plan de Mes
          </div>
          {mesLabel && (
            <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              {mesLabel}
            </span>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
          {/* Zona */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Zona</span>
            <select
              value={selectedZona}
              onChange={(e) => setSelectedZona(e.target.value)}
              style={{
                padding: "5px 10px", border: "1px solid #CBD5E1",
                borderRadius: 6, fontSize: 13, color: HEADER_BG,
                fontWeight: 500, background: "white", cursor: "pointer",
              }}
            >
              <option value="">Todas</option>
              {(filtros?.zonas ?? []).map((z) => (
                <option key={z} value={z}>{zonaLabel(z)}</option>
              ))}
            </select>
          </div>

          {/* Categorias */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Categorias</span>
            <MultiSelectDropdown
              label="Cat"
              options={filtros?.categorias ?? ["SQ", "MAH", "EQM", "EVA"]}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
          </div>

          {/* Subclase */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Subclase</span>
            <select
              value={selectedSubclase}
              onChange={(e) => setSelectedSubclase(e.target.value)}
              style={{
                padding: "5px 10px", border: "1px solid #CBD5E1",
                borderRadius: 6, fontSize: 13, color: HEADER_BG,
                fontWeight: 500, background: "white", cursor: "pointer",
                maxWidth: 180,
              }}
            >
              <option value="">Todas</option>
              {(filtros?.familias ?? []).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Fecha</span>
            <input
              type="date"
              value={selectedFecha}
              onChange={(e) => setSelectedFecha(e.target.value)}
              style={{
                padding: "5px 10px", border: "1px solid #CBD5E1",
                borderRadius: 6, fontSize: 13, color: HEADER_BG,
                fontWeight: 500, background: "white",
              }}
            />
          </div>

          {/* Dias badges */}
          {kpis && (
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{
                background: "#EFF6FF", color: HEADER_BG,
                borderRadius: 20, padding: "3px 10px",
                fontSize: 11, fontWeight: 700,
              }}>
                {kpis.dias_trans}d transcurridos
              </span>
              <span style={{
                background: "#FEF3C7", color: "#92400E",
                borderRadius: 20, padding: "3px 10px",
                fontSize: 11, fontWeight: 700,
              }}>
                {kpis.dias_rest}d restantes
              </span>
              <span style={{
                background: "#F0FDF4", color: "#166534",
                borderRadius: 20, padding: "3px 10px",
                fontSize: 11, fontWeight: 700,
              }}>
                {kpis.dias_total}d hábiles mes
              </span>
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", background: HEADER_BG,
            color: "white", border: "none", borderRadius: 7,
            fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 0.9s linear infinite" : "none" }} />
          Actualizar
        </button>
      </div>

      {/* ── Main content ────────────────────────────────────────────── */}
      {loading && !data ? (
        <div style={{ flex: 1 }}>
          <Spinner />
        </div>
      ) : error ? (
        <div style={{
          margin: 32, padding: 24, background: "#FEF2F2",
          border: "1px solid #FECACA", borderRadius: 10,
          color: "#991B1B", fontSize: 13,
        }}>
          <strong>Error al cargar datos:</strong> {error}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "25% 40% 35%",
          gap: 16,
          padding: "16px 20px",
          flex: 1,
          alignItems: "start",
        }}>

          {/* ══ LEFT PANEL ══════════════════════════════════════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* 6 Gauges */}
            <div style={{ ...CARD }}>
              <SectionTitle>Indicadores</SectionTitle>
              <div style={{ padding: "8px 4px 4px" }}>
                {/* Row 1: Venta Mes + Margen Mes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <SemiGauge
                    title="Venta Mes"
                    actual={kpis?.venta_mes ?? 0}
                    target={kpis?.ppto_mes ?? 0}
                  />
                  <SemiGauge
                    title="Margen Mes"
                    actual={kpis?.mg_mes ?? 0}
                    target={kpis?.ppto_mg_mes ?? 0}
                    isPercent
                  />
                </div>
                <div style={{ height: 1, background: "#F1F5F9", margin: "0 12px" }} />
                {/* Row 2: Venta Trim + Margen Trim */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <SemiGauge
                    title="Venta Trim"
                    actual={kpis?.venta_trim ?? 0}
                    target={kpis?.ppto_trim ?? 0}
                  />
                  <SemiGauge
                    title="Margen Trim"
                    actual={kpis?.mg_trim ?? 0}
                    target={kpis?.ppto_mg_trim ?? 0}
                    isPercent
                  />
                </div>
                <div style={{ height: 1, background: "#F1F5F9", margin: "0 12px" }} />
                {/* Row 3: Venta Anual + Margen Anual */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <SemiGauge
                    title="Venta Anual"
                    actual={kpis?.venta_ytd ?? 0}
                    target={kpis?.ppto_ytd ?? 0}
                  />
                  <SemiGauge
                    title="Margen Anual"
                    actual={kpis?.mg_ytd ?? 0}
                    target={kpis?.ppto_mg_ytd ?? 0}
                    isPercent
                  />
                </div>
              </div>
            </div>

            {/* Table 1: Cumplimiento por Categoría */}
            <div style={CARD}>
              <SectionTitle>Cumplimiento por Categoría</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Cat</th>
                    <th style={THR}>Cump PPTO</th>
                    <th style={THR}>Var vs AñoAnt</th>
                    <th style={THR}>% Días</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.categorias ?? []).map((c, i) => (
                    <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? HEADER_BG }}>
                        {c.categoria}
                      </td>
                      <ColorCell
                        value={fmtPct(c.cump_ppto)}
                        color={cumpColor(c.cump_ppto, c.pct_dias)}
                      />
                      <ColorCell
                        value={`${c.var_ant >= 0 ? "+" : ""}${fmtPct(c.var_ant)}`}
                        color={varColor(c.var_ant)}
                      />
                      <td style={{ ...TDR, color: "#64748B" }}>{fmtPct(c.pct_dias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table 2: Margen por Categoría */}
            <div style={CARD}>
              <SectionTitle>Margen por Categoría</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Cat</th>
                    <th style={THR}>Contr. Real</th>
                    <th style={THR}>Margen %</th>
                    <th style={THR}>PPTO Mes</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.categorias ?? [])
                    .filter((c) => c.contrib > 0)
                    .map((c, i) => {
                      const cumplPct = kpis?.ppto_mes ? (c.contrib / kpis.ppto_mes) * 100 : 0;
                      return (
                        <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                          <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? HEADER_BG }}>
                            {c.categoria}
                          </td>
                          <td style={TDR}>{fmt(c.contrib)}</td>
                          <ColorCell
                            value={fmtPct(c.margen)}
                            color={c.margen >= 40 ? "#10B981" : c.margen >= 30 ? "#F59E0B" : "#EF4444"}
                          />
                          <ColorCell
                            value={`${cumplPct.toFixed(1)}%`}
                            color={cumpColor(cumplPct, kpis?.pct_dias ?? 50)}
                          />
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══ CENTER — Bar Chart ══════════════════════════════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...CARD, padding: 0 }}>
              <SectionTitle>Venta Mes por Categoría</SectionTitle>
              <div style={{ padding: "16px 8px 8px" }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 20, right: 24, left: 8, bottom: 8 }}
                      barCategoryGap="28%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fontWeight: 700, fill: HEADER_BG }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        tick={{ fontSize: 10, fill: "#94A3B8" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        domain={[0, 100]}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        iconType="rect"
                        iconSize={10}
                      />
                      <Bar yAxisId="left" dataKey="Vta Año Ant" fill="#94A3B8" radius={[3, 3, 0, 0]}>
                        <LabelList content={<BarLabel />} />
                      </Bar>
                      <Bar yAxisId="left" dataKey="Vta PPTO" fill="#3B82F6" radius={[3, 3, 0, 0]}>
                        <LabelList content={<BarLabel />} />
                      </Bar>
                      <Bar yAxisId="left" dataKey="Vta Real" fill="#10B981" radius={[3, 3, 0, 0]}>
                        <LabelList content={<BarLabel />} />
                      </Bar>
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="margen"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#F59E0B", stroke: "white", strokeWidth: 2 }}
                        name="Margen %"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{
                    height: 340, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#94A3B8", fontSize: 13,
                  }}>
                    Sin datos para el período seleccionado
                  </div>
                )}
              </div>
            </div>

            {/* Quick KPI summary below chart */}
            {kpis && (
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}>
                {[
                  {
                    label: "Venta vs Año Ant",
                    value: fmt(kpis.venta_mes - kpis.venta_mes_25),
                    pct: kpis.venta_mes_25 > 0
                      ? ((kpis.venta_mes / kpis.venta_mes_25 - 1) * 100)
                      : 0,
                    color: kpis.venta_mes >= kpis.venta_mes_25 ? "#10B981" : "#EF4444",
                  },
                  {
                    label: "Avance Días",
                    value: `${kpis.pct_dias.toFixed(1)}%`,
                    pct: kpis.pct_dias,
                    color: "#3B82F6",
                  },
                  {
                    label: "Gap PPTO Mes",
                    value: fmt(kpis.venta_mes - kpis.ppto_mes),
                    pct: kpis.ppto_mes > 0
                      ? ((kpis.venta_mes / kpis.ppto_mes) * 100)
                      : 0,
                    color: kpis.venta_mes >= kpis.ppto_mes ? "#10B981" : "#EF4444",
                  },
                ].map((item) => (
                  <div key={item.label} style={{
                    ...CARD, padding: "12px 14px",
                    borderLeft: `4px solid ${item.color}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: item.color, fontVariantNumeric: "tabular-nums" }}>
                      {item.value}
                    </div>
                    {typeof item.pct === "number" && (
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        {item.pct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══ RIGHT — Product Table ════════════════════════════════ */}
          <div style={CARD}>
            <SectionTitle>Detalle Productos</SectionTitle>

            {/* Search */}
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 6, padding: "6px 10px",
              }}>
                <Search size={13} color="#94A3B8" />
                <input
                  type="text"
                  placeholder="Buscar código o descripción..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  style={{
                    border: "none", background: "transparent",
                    outline: "none", fontSize: 12, flex: 1,
                    color: HEADER_BG,
                  }}
                />
                {prodSearch && (
                  <button
                    onClick={() => setProdSearch("")}
                    style={{
                      border: "none", background: "none", cursor: "pointer",
                      color: "#94A3B8", fontSize: 14, lineHeight: 1, padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 240px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...TH, width: 70 }}>Código</th>
                    <th style={TH}>Descripción</th>
                    <th style={THR}>Vta Mes</th>
                    <th style={THR}>Prom 6M</th>
                    <th style={{ ...THR, width: 50 }}>Stock</th>
                    <th style={THR}>PPTO Mes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: HEADER_BG, fontSize: 11 }}>
                        {p.codigo}
                      </td>
                      <td style={{ ...TD, fontSize: 11, maxWidth: 180 }}>
                        <div style={{
                          overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", maxWidth: 180,
                        }} title={p.descripcion}>
                          {p.descripcion}
                        </div>
                        {p.familia && (
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>{p.familia}</div>
                        )}
                      </td>
                      <td style={{
                        ...TDR, fontSize: 11,
                        color: p.venta_mes > 0 ? "#1E293B" : "#CBD5E1",
                      }}>
                        {p.venta_mes > 0 ? p.venta_mes.toLocaleString("es-CL") : "—"}
                      </td>
                      <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                        {p.vta_prom_6m > 0 ? p.vta_prom_6m.toLocaleString("es-CL") : "—"}
                      </td>
                      <td style={{
                        ...TDR, fontSize: 11,
                        color: p.q_stock <= 0 ? "#EF4444" : p.q_stock < 5 ? "#F59E0B" : "#1E293B",
                        fontWeight: p.q_stock <= 0 ? 700 : 500,
                      }}>
                        {Math.round(p.q_stock)}
                      </td>
                      <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                        {p.ppto_mes > 0 ? p.ppto_mes.toLocaleString("es-CL") : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 24 }}>
                        {prodSearch ? "Sin resultados para la búsqueda" : "Sin productos"}
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Totals row */}
                {prodTotals && filteredProducts.length > 0 && (
                  <tfoot>
                    <tr style={{ background: HEADER_BG }}>
                      <td colSpan={2} style={{
                        ...TD, color: "white", fontWeight: 700,
                        fontSize: 11, borderBottom: "none",
                      }}>
                        TOTAL ({filteredProducts.length} productos)
                      </td>
                      <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                        {prodTotals.venta_mes.toLocaleString("es-CL")}
                      </td>
                      <td style={{ ...TDR, color: "#CBD5E1", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                        {prodTotals.vta_prom_6m.toLocaleString("es-CL")}
                      </td>
                      <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                        {Math.round(prodTotals.q_stock)}
                      </td>
                      <td style={{ ...TDR, color: "#CBD5E1", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                        {prodTotals.ppto_mes.toLocaleString("es-CL")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Global animation keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
