"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmt, fmtPct, fmtAbs } from "@/lib/format";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Legend, Line, ComposedChart,
} from "recharts";
import { RefreshCw, Search } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface PMFiltros { zonas: string[]; familias: string[]; categorias: string[]; }

interface PMKpis {
  venta_mes: number; ppto_mes: number; mg_mes: number; ppto_mg_mes: number;
  venta_trim: number; ppto_trim: number; mg_trim: number; ppto_mg_trim: number;
  venta_ytd: number; ppto_ytd: number; mg_ytd: number; ppto_mg_ytd: number;
  venta_mes_25: number; dias_trans: number; dias_rest: number; dias_total: number;
  pct_dias: number; mes: number; ano: number;
}

interface PMCategoria {
  categoria: string; venta_mes: number; venta_ant: number; ppto_mes: number;
  ppto_anual: number; cump_ppto: number; var_ant: number; pct_dias: number;
  contrib: number; margen: number; ppto_margen: number;
}

interface PMProducto {
  codigo: string; descripcion: string; familia: string;
  venta_mes: number; vta_prom_6m: number; q_stock: number;
  ppto_mes: number; ppto_anual: number; margen: number;
}

interface PMData { kpis: PMKpis; categorias: PMCategoria[]; productos: PMProducto[]; zona: string; }

/* ─── Brand colors ───────────────────────────────────────────────────── */
const LBF_RED  = "#E81C2E";
const LBF_BLUE = "#1A4A6B";

/* ─── Constants ─────────────────────────────────────────────────────── */
const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

const MESES: Record<number, string> = {
  1:"Enero",2:"Febrero",3:"Marzo",4:"Abril",5:"Mayo",6:"Junio",
  7:"Julio",8:"Agosto",9:"Septiembre",10:"Octubre",11:"Noviembre",12:"Diciembre",
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function cumplColor(pct: number, threshold = 100): string {
  if (pct >= threshold) return "#10B981";
  if (pct >= threshold * 0.75) return "#F59E0B";
  return "#EF4444";
}
function varColor(v: number) { return v >= 0 ? "#10B981" : "#EF4444"; }

/* ─── Gauge velocímetro con zonas de color ───────────────────────────── */
function CompactGauge({
  label, actual, target, maxVal, pctDias = 0, isPercent = false,
}: {
  label: string; actual: number; target: number;
  maxVal?: number; pctDias?: number; isPercent?: boolean;
}) {
  const W = 250, H = 162;
  const cx = W / 2, cy = H - 8;
  const R = 90, RIN = 52;

  // axisMax: 20% headroom above target for venta, or explicit for margin
  const axisMax = maxVal ?? (target > 0 ? target * 1.2 : Math.max(actual * 1.2, 1));

  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const toAng = (p: number) => Math.PI * (1 - clamp(p));
  const pt    = (ang: number, r: number) => ({ x: cx + r * Math.cos(ang), y: cy - r * Math.sin(ang) });

  const arcSeg = (p0: number, p1: number, ro: number, ri: number): string => {
    const _p1 = Math.min(p1, 0.9999);
    if (_p1 <= p0 + 0.002) return "";
    const a0 = toAng(p0), a1 = toAng(_p1);
    const O0 = pt(a0, ro), O1 = pt(a1, ro);
    const I0 = pt(a0, ri), I1 = pt(a1, ri);
    return `M${O0.x.toFixed(2)} ${O0.y.toFixed(2)} A${ro} ${ro} 0 0 1 ${O1.x.toFixed(2)} ${O1.y.toFixed(2)} ` +
           `L${I1.x.toFixed(2)} ${I1.y.toFixed(2)} A${ri} ${ri} 0 0 0 ${I0.x.toFixed(2)} ${I0.y.toFixed(2)}Z`;
  };

  // Colored zones based on % of target
  const tFrac = clamp(target / axisMax);
  const zones = [
    { from: 0,             to: clamp(tFrac * 0.60), color: "#EF4444" },
    { from: clamp(tFrac * 0.60), to: clamp(tFrac * 0.85), color: "#F97316" },
    { from: clamp(tFrac * 0.85), to: tFrac,          color: "#FBBF24" },
    { from: tFrac,         to: 1,                    color: "#10B981" },
  ];

  const pctFill = clamp(actual / axisMax);
  const cumpl   = target > 0 ? (actual / target) * 100 : 0;

  // Needle pointing to actual value
  const needleAng = toAng(pctFill);
  const needleTip = pt(needleAng, R - 8);
  const side1     = pt(needleAng + Math.PI / 2, 5);
  const side2     = pt(needleAng - Math.PI / 2, 5);
  const needleD   = `M${side1.x.toFixed(2)} ${side1.y.toFixed(2)} L${needleTip.x.toFixed(2)} ${needleTip.y.toFixed(2)} L${side2.x.toFixed(2)} ${side2.y.toFixed(2)}Z`;

  // Target marker line (white separator on arc)
  const tAng   = toAng(tFrac);
  const tMkOut = pt(tAng, R + 5);
  const tMkIn  = pt(tAng, RIN - 5);

  // Days marker (dashed white line — proportional to target, for venta gauges)
  const dFrac  = clamp((pctDias / 100) * tFrac);
  const dAng   = toAng(dFrac);
  const dMkOut = pt(dAng, R + 2);
  const dMkIn  = pt(dAng, RIN - 2);

  const fmtV    = (v: number) => isPercent ? `${v.toFixed(1)}%` : fmt(v);
  const cumplCol = cumplColor(cumpl, 100);

  // Scale tick marks at 0%, 50%, 100%, and maxVal positions
  const ticks = [0, 0.5 * tFrac, tFrac, 1];

  return (
    <div style={{
      background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      padding: "8px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: LBF_BLUE, textTransform: "uppercase",
        letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>

        {/* Gray base track */}
        <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} L${cx + RIN} ${cy} A${RIN} ${RIN} 0 0 0 ${cx - RIN} ${cy}Z`} fill="#E2E8F0" />

        {/* Colored zones */}
        {zones.map((z, i) => {
          const d = arcSeg(z.from, z.to, R, RIN);
          return d ? <path key={i} d={d} fill={z.color} /> : null;
        })}

        {/* Tick marks on arc */}
        {ticks.map((p, i) => {
          if (p < 0.005 || p > 0.995) return null;
          const a  = toAng(p);
          const o  = pt(a, R + 1);
          const ii = pt(a, RIN - 1);
          return <line key={i} x1={o.x} y1={o.y} x2={ii.x} y2={ii.y} stroke="white" strokeWidth={i === 2 ? 3 : 1.5} strokeLinecap="round" />;
        })}

        {/* Days marker (dashed, venta only) */}
        {pctDias > 0 && !isPercent && dFrac > 0.01 && dFrac < 0.98 && (
          <line x1={dMkIn.x} y1={dMkIn.y} x2={dMkOut.x} y2={dMkOut.y}
                stroke="white" strokeWidth={2} strokeDasharray="3,2" strokeLinecap="round" />
        )}

        {/* Needle */}
        <path d={needleD} fill="#1E293B" />
        <circle cx={cx} cy={cy} r={9}  fill="#1E293B" />
        <circle cx={cx} cy={cy} r={4}  fill="white" />

        {/* Actual value large */}
        <text x={cx} y={cy - 42} textAnchor="middle" fontSize={27} fontWeight={800} fill={LBF_BLUE}>
          {fmtV(actual)}
        </text>

        {/* Cumplimiento colored */}
        <text x={cx} y={cy - 22} textAnchor="middle" fontSize={12} fontWeight={700} fill={cumplCol}>
          {cumpl.toFixed(1)}%
        </text>

        {/* Meta label */}
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize={9} fill="#94A3B8">
          Meta: {fmtV(target)}
        </text>

        {/* Days % (venta only) */}
        {pctDias > 0 && !isPercent && (
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#94A3B8">
            {pctDias.toFixed(2)}% del mes
          </text>
        )}

        {/* Arc end labels */}
        <text x={cx - R - 4} y={cy + 13} textAnchor="end"   fontSize={8} fill="#94A3B8">0</text>
        <text x={cx + R + 4} y={cy + 13} textAnchor="start" fontSize={8} fill="#94A3B8">{fmtV(axisMax)}</text>
      </svg>
    </div>
  );
}

/* ─── Section title ──────────────────────────────────────────────────── */
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "10px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 3, height: 16, background: LBF_RED, borderRadius: 2, flexShrink: 0 }} />
      <h3 style={{ fontSize: 13, fontWeight: 700, color: LBF_BLUE, margin: 0 }}>
        {title}
        {subtitle && <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{subtitle}</span>}
      </h3>
    </div>
  );
}

/* ─── Table styles ───────────────────────────────────────────────────── */
const TH: React.CSSProperties  = { background: LBF_BLUE, color: "white", padding: "7px 10px", fontSize: 10, fontWeight: 700, textAlign: "left",  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const THR: React.CSSProperties = { ...TH, textAlign: "right" };
const TD: React.CSSProperties  = { padding: "6px 10px", fontSize: 11, color: "#1E293B", borderBottom: "1px solid #F1F5F9" };
const TDR: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Chart helpers ──────────────────────────────────────────────────── */
function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={600}>
      {(value / 1_000_000).toFixed(0)}M
    </text>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{p.name === "Margen %" ? `${p.value.toFixed(1)}%` : fmtAbs(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function PlanDeMesPage() {
  const [filtros,         setFiltros]        = useState<PMFiltros | null>(null);
  const [selectedZona,    setSelectedZona]   = useState("");
  const [selectedCat,     setSelectedCat]    = useState<string | null>(null);
  const [selectedSubclase,setSelectedSubclase] = useState("");
  const [selectedCodigo,  setSelectedCodigo] = useState("");
  const [data,            setData]           = useState<PMData | null>(null);
  const [loading,         setLoading]        = useState(false);
  const [loadingFiltros,  setLoadingFiltros] = useState(true);
  const [error,           setError]          = useState<string | null>(null);
  const [prodSearch,      setProdSearch]     = useState("");

  useEffect(() => {
    setLoadingFiltros(true);
    api.get<PMFiltros>("/api/pm/filtros")
      .then((f) => setFiltros(f))
      .catch(() => setFiltros({ zonas: [], familias: [], categorias: ["SQ","MAH","EQM","EVA"] }))
      .finally(() => setLoadingFiltros(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedZona)     params.set("zona",      selectedZona);
      if (selectedCat)      params.set("categorias", selectedCat);
      if (selectedSubclase) params.set("subclase",   selectedSubclase);
      if (selectedCodigo)   params.set("codigo",     selectedCodigo);
      const res = await api.get<PMData>(`/api/pm/resumen?${params.toString()}`, { noCache: true });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedZona, selectedCat, selectedSubclase, selectedCodigo]);

  useEffect(() => { if (!loadingFiltros) loadData(); }, [loadingFiltros, loadData]);

  const kpis     = data?.kpis;
  const mesLabel = kpis ? `${MESES[kpis.mes]} ${kpis.ano}` : "";
  const pctDias  = kpis?.pct_dias ?? 0;

  const filteredProducts = useMemo(() => {
    if (!data?.productos) return [];
    const q = prodSearch.toLowerCase();
    if (!q) return data.productos;
    return data.productos.filter(p =>
      p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)
    );
  }, [data?.productos, prodSearch]);

  const prodTotals = useMemo(() => {
    if (!filteredProducts.length) return null;
    return {
      venta_mes:   filteredProducts.reduce((s, p) => s + p.venta_mes,   0),
      vta_prom_6m: filteredProducts.reduce((s, p) => s + p.vta_prom_6m, 0),
      q_stock:     filteredProducts.reduce((s, p) => s + p.q_stock,     0),
      ppto_anual:  filteredProducts.reduce((s, p) => s + p.ppto_anual,  0),
    };
  }, [filteredProducts]);

  const chartData = useMemo(() => {
    if (!data?.categorias) return [];
    return data.categorias.map((c) => ({
      name:         c.categoria,
      "Vta Año Ant": c.venta_ant,
      "Vta PPTO":    c.ppto_mes,
      "Vta Real":    c.venta_mes,
      "Margen %":    c.margen,
    }));
  }, [data?.categorias]);

  const cats = filtros?.categorias ?? ["SQ","MAH","EQM","EVA"];
  const zonaLabel = (z: string) => { const p = z.split("-"); return p.length > 1 ? p.slice(1).join("-").trim() : z; };

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div style={{
        background: LBF_BLUE, borderRadius: 10, marginBottom: 16,
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        {/* Zona */}
        <FilterSelect label="Zona" value={selectedZona} onChange={setSelectedZona}>
          <option value="">Todas</option>
          {(filtros?.zonas ?? []).map(z => <option key={z} value={z}>{zonaLabel(z)}</option>)}
        </FilterSelect>

        <FilterDivider />

        {/* Categoría */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>Categoría</span>
          <div style={{ display: "flex", gap: 4 }}>
            <CatChip label="Todas" active={selectedCat === null} color="white" onClick={() => setSelectedCat(null)} />
            {cats.map(cat => (
              <CatChip key={cat} label={cat} active={selectedCat === cat}
                color={CAT_COLORS[cat] ?? "#3B82F6"}
                onClick={() => setSelectedCat(selectedCat === cat ? null : cat)} />
            ))}
          </div>
        </div>

        <FilterDivider />

        {/* Subclase */}
        <FilterSelect label="Subclase" value={selectedSubclase} onChange={setSelectedSubclase}>
          <option value="">Todas</option>
          {(filtros?.familias ?? []).map(f => <option key={f} value={f}>{f}</option>)}
        </FilterSelect>

        <FilterDivider />

        {/* Código */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>Código</span>
          <input
            value={selectedCodigo} onChange={e => setSelectedCodigo(e.target.value)}
            placeholder="Todas"
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 12, width: 110, outline: "none" }}
          />
        </div>

        <FilterDivider />

        {/* Fecha info */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fecha</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: 6 }}>
            {mesLabel || "—"}
            {kpis && <span style={{ marginLeft: 8, opacity: 0.8 }}>{kpis.pct_dias.toFixed(1)}% del mes</span>}
          </span>
        </div>

        {/* Spacer + Refresh */}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); loadData(); }}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.15)", fontSize: 12, fontWeight: 600, color: "white",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? "spin 0.9s linear infinite" : "none" }} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Main layout: columna izquierda | columna derecha ─────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── COLUMNA IZQUIERDA: 6 KPIs compactos + 2 tablas categoría ── */}
        <div style={{ width: 560, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* 6 KPIs en grilla 2×3 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <CompactGauge label="Venta Mes"       actual={kpis?.venta_mes  ?? 0} target={kpis?.ppto_mes       ?? 0} pctDias={pctDias} />
            <CompactGauge label="Margen Mes"      actual={kpis?.mg_mes     ?? 0} target={kpis?.ppto_mg_mes    ?? 0} maxVal={Math.max((kpis?.mg_mes ?? 0), (kpis?.ppto_mg_mes ?? 0)) * 1.5 || 50} isPercent />
            <CompactGauge label="Venta Trimestre" actual={kpis?.venta_trim ?? 0} target={kpis?.ppto_trim      ?? 0} pctDias={pctDias} />
            <CompactGauge label="Margen Trim"     actual={kpis?.mg_trim    ?? 0} target={kpis?.ppto_mg_trim   ?? 0} maxVal={Math.max((kpis?.mg_trim ?? 0), (kpis?.ppto_mg_trim ?? 0)) * 1.5 || 50} isPercent />
            <CompactGauge label="Venta Anual"     actual={kpis?.venta_ytd  ?? 0} target={kpis?.ppto_ytd      ?? 0} />
            <CompactGauge label="Margen Anual"    actual={kpis?.mg_ytd     ?? 0} target={kpis?.ppto_mg_ytd   ?? 0} maxVal={Math.max((kpis?.mg_ytd ?? 0), (kpis?.ppto_mg_ytd ?? 0)) * 1.5 || 50} isPercent />
          </div>

          {/* Tabla: Cumplimiento por Categoría */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <SectionTitle title="Cumplimiento por Categoría" />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Categoría</th>
                  <th style={THR}>Cump PPTO</th>
                  <th style={THR}>Var Año Ant</th>
                  <th style={THR}>% Días</th>
                </tr>
              </thead>
              <tbody>
                {(data?.categorias ?? []).map((c, i) => {
                  const cc = cumplColor(c.cump_ppto, pctDias);
                  return (
                    <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? LBF_BLUE }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[c.categoria] ?? LBF_BLUE, marginRight: 6 }} />
                        {c.categoria}
                      </td>
                      <td style={{ ...TDR, color: cc, fontWeight: 700 }}>{fmtPct(c.cump_ppto)}</td>
                      <td style={{ ...TDR, color: varColor(c.var_ant), fontWeight: 700 }}>
                        {c.var_ant >= 0 ? "+" : ""}{fmtPct(c.var_ant)}
                      </td>
                      <td style={{ ...TDR, color: "#64748B" }}>{fmtPct(c.pct_dias)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tabla: Contribución por Categoría */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <SectionTitle title="Contribución y Margen por Categoría" />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Cat</th>
                  <th style={THR}>Contribución</th>
                  <th style={THR}>Mg Real</th>
                  <th style={THR}>Mg PPTO</th>
                  <th style={THR}>Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {(data?.categorias ?? []).map((c, i) => {
                  const mgColor = c.margen >= 40 ? "#10B981" : c.margen >= 30 ? "#F59E0B" : "#EF4444";
                  const mgPptoColor = c.ppto_margen > 0
                    ? (c.margen >= c.ppto_margen ? "#10B981" : c.margen >= c.ppto_margen * 0.9 ? "#F59E0B" : "#EF4444")
                    : "#94A3B8";
                  const pptoCont = c.ppto_mes > 0 && c.ppto_margen > 0 ? c.ppto_mes * (c.ppto_margen / 100) : 0;
                  const cumplCont = pptoCont > 0 ? (c.contrib / pptoCont) * 100 : 0;
                  return (
                    <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? LBF_BLUE }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[c.categoria] ?? LBF_BLUE, marginRight: 6 }} />
                        {c.categoria}
                      </td>
                      <td style={TDR}>{fmtAbs(c.contrib)}</td>
                      <td style={{ ...TDR, color: mgColor, fontWeight: 700 }}>{fmtPct(c.margen)}</td>
                      <td style={{ ...TDR, color: "#64748B", fontStyle: c.ppto_margen > 0 ? "normal" : "italic" }}>
                        {c.ppto_margen > 0 ? fmtPct(c.ppto_margen) : "—"}
                      </td>
                      <td style={{ ...TDR, color: cumplColor(cumplCont, pctDias), fontWeight: 700 }}>
                        {cumplCont > 0 ? `${cumplCont.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumen días */}
          {kpis && (
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: LBF_BLUE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Avance del Mes — {mesLabel}
              </div>
              <div style={{ display: "flex", gap: 0 }}>
                {[
                  { label: "Transcurridos", val: kpis.dias_trans, color: LBF_RED },
                  { label: "Restantes",     val: kpis.dias_rest,  color: "#94A3B8" },
                  { label: "Total hábiles", val: kpis.dias_total, color: LBF_BLUE },
                ].map((item, i) => (
                  <div key={item.label} style={{ flex: 1, textAlign: "center", borderLeft: i > 0 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: 9, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
                  </div>
                ))}
              </div>
              {/* Barra de progreso */}
              <div style={{ height: 5, background: "#F1F5F9", borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pctDias, 100)}%`, background: LBF_RED, borderRadius: 4, transition: "width 0.4s ease" }} />
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, textAlign: "right" }}>{pctDias.toFixed(1)}% del mes</div>
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA: gráfico + tabla productos ────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Gráfico: Venta Mes por Categoría */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <SectionTitle title="Venta Mes por Categoría" subtitle={mesLabel} />
            <div style={{ padding: "16px 12px 12px" }}>
              {loading ? (
                <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Cargando...</div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData} margin={{ top: 20, right: 44, left: 4, bottom: 4 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700, fill: LBF_BLUE }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left"  tickFormatter={(v) => `${(v/1_000_000).toFixed(0)}M`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={52} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={36}
                      domain={[0, (d: number) => Math.ceil((d + 10) / 10) * 10]} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={9} />
                    <Bar yAxisId="left" dataKey="Vta Año Ant" fill="#94A3B8" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                    <Bar yAxisId="left" dataKey="Vta PPTO"    fill="#3B82F6" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                    <Bar yAxisId="left" dataKey="Vta Real"    fill={LBF_RED}  radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                    <Line yAxisId="right" type="monotone" dataKey="Margen %" stroke="#F59E0B" strokeWidth={2.5}
                      dot={{ r: 5, fill: "#F59E0B", stroke: "white", strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Sin datos</div>
              )}
            </div>

            {/* KPI footer del gráfico */}
            {kpis && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: "1px solid #F1F5F9" }}>
                {[
                  { label: "Venta Real",  val: fmtAbs(kpis.venta_mes),   color: LBF_RED  },
                  { label: "PPTO Mes",    val: fmtAbs(kpis.ppto_mes),     color: "#3B82F6" },
                  { label: "vs Año Ant",  val: `${kpis.venta_mes_25 > 0 ? ((kpis.venta_mes/kpis.venta_mes_25-1)*100).toFixed(1)+"%" : "—"}`, color: kpis.venta_mes >= kpis.venta_mes_25 ? "#10B981" : LBF_RED },
                  { label: "Gap PPTO",    val: fmt(kpis.venta_mes - kpis.ppto_mes), color: kpis.venta_mes >= kpis.ppto_mes ? "#10B981" : LBF_RED },
                ].map((item, i) => (
                  <div key={item.label} style={{ padding: "10px 14px", borderLeft: i > 0 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: item.color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabla: Detalle Productos */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #E2E8F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: LBF_RED, borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, color: LBF_BLUE, margin: 0 }}>
                  Detalle Productos
                  {filteredProducts.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{filteredProducts.length} productos</span>}
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "5px 10px" }}>
                <Search size={12} color="#94A3B8" />
                <input
                  type="text" placeholder="Buscar código o descripción..." value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, width: 200, color: "#0F172A" }}
                />
                {prodSearch && <button onClick={() => setProdSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: 14, padding: 0 }}>×</button>}
              </div>
            </div>

            <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...TH, width: 90 }}>Código</th>
                    <th style={TH}>Descripción</th>
                    <th style={{ ...TH, minWidth: 90 }}>Subclase</th>
                    <th style={THR}>Venta Mes</th>
                    <th style={THR}>Prom 6 Meses</th>
                    <th style={{ ...THR, width: 64 }}>Q Stock</th>
                    <th style={THR}>PPTO Subclase</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: LBF_BLUE, fontSize: 10 }}>{p.codigo}</td>
                      <td style={{ ...TD, fontSize: 10 }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340 }} title={p.descripcion}>
                          {p.descripcion}
                        </div>
                      </td>
                      <td style={{ ...TD, fontSize: 9, color: "#94A3B8" }}>{p.familia}</td>
                      <td style={{ ...TDR, fontSize: 11, color: p.venta_mes > 0 ? "#1E293B" : "#CBD5E1" }}>
                        {p.venta_mes > 0 ? p.venta_mes.toLocaleString("es-CL") : "—"}
                      </td>
                      <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                        {p.vta_prom_6m > 0 ? p.vta_prom_6m.toLocaleString("es-CL") : "—"}
                      </td>
                      <td style={{ ...TDR, fontSize: 11, fontWeight: p.q_stock <= 0 ? 700 : 500, color: p.q_stock <= 0 ? "#EF4444" : p.q_stock < 5 ? "#F59E0B" : "#1E293B" }}>
                        {Math.round(p.q_stock)}
                      </td>
                      <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                        {p.ppto_anual > 0 ? p.ppto_anual.toLocaleString("es-CL") : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 28 }}>
                        {prodSearch ? "Sin resultados" : "Sin productos"}
                      </td>
                    </tr>
                  )}
                </tbody>
                {prodTotals && filteredProducts.length > 0 && (
                  <tfoot>
                    <tr style={{ background: LBF_BLUE, position: "sticky", bottom: 0 }}>
                      <td colSpan={3} style={{ ...TD, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
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
                        {prodTotals.ppto_anual.toLocaleString("es-CL")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Filter helpers ─────────────────────────────────────────────────── */
function FilterDivider() {
  return <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.3)", flexShrink: 0 }} />;
}

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 12, cursor: "pointer", outline: "none" }}>
        {children}
      </select>
    </div>
  );
}

function CatChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
      border: active ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.3)",
      background: active ? "white" : "rgba(255,255,255,0.15)",
      color: active ? color : "white",
    }}>
      {label}
    </button>
  );
}
