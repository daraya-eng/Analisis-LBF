"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmt, fmtAbs } from "@/lib/format";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Legend, Line, ComposedChart,
} from "recharts";
import { RefreshCw, Search, TrendingUp, TrendingDown } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */
interface PMFiltros { zonas: string[]; familias: string[]; categorias: string[]; }

interface PMKpis {
  venta_mes: number; ppto_mes: number; mg_mes: number; ppto_mg_mes: number;
  venta_trim: number; ppto_trim: number; mg_trim: number; ppto_mg_trim: number;
  venta_ytd: number; ppto_ytd: number; mg_ytd: number; ppto_mg_ytd: number;
  venta_mes_25: number; venta_trim_25: number; venta_ytd_25: number;
  dias_trans: number; dias_rest: number; dias_total: number;
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

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

const MESES: Record<number, string> = {
  1:"Enero",2:"Febrero",3:"Marzo",4:"Abril",5:"Mayo",6:"Junio",
  7:"Julio",8:"Agosto",9:"Septiembre",10:"Octubre",11:"Noviembre",12:"Diciembre",
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function pctColor(pct: number, ref = 100): string {
  if (pct >= ref) return "#10B981";
  if (pct >= ref * 0.8) return "#F59E0B";
  return "#EF4444";
}
function varColor(v: number) { return v >= 0 ? "#10B981" : "#EF4444"; }
function mgColor(v: number)  { return v >= 40 ? "#10B981" : v >= 30 ? "#F59E0B" : "#EF4444"; }

/* ─── KPI Period Card ────────────────────────────────────────────────── */
function PeriodCard({
  label, venta, ppto, margen, pptoMg, venta25, pctDias, isMes,
}: {
  label: string; venta: number; ppto: number; margen: number; pptoMg: number;
  venta25: number; pctDias: number; isMes?: boolean;
}) {
  const cumpl   = ppto > 0 ? (venta / ppto) * 100 : 0;
  const vs25    = venta25 > 0 ? ((venta / venta25) - 1) * 100 : null;
  const barPct  = Math.min(cumpl, 140);
  const cc      = pctColor(cumpl, isMes ? pctDias : 100);
  const timeMrk = isMes ? pctDias : null;

  return (
    <div style={{
      background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      padding: "14px 18px", flex: 1, minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <span style={{
          fontSize: 12, fontWeight: 800, color: cc,
          background: cc + "18", padding: "2px 8px", borderRadius: 20,
        }}>{cumpl.toFixed(1)}%</span>
      </div>

      {/* Venta grande */}
      <div style={{ fontSize: 26, fontWeight: 900, color: LBF_BLUE, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: 4 }}>
        {fmt(venta)}
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>
        Meta: <span style={{ fontWeight: 600, color: "#64748B" }}>{fmt(ppto)}</span>
        &nbsp;·&nbsp;Gap: <span style={{ fontWeight: 700, color: venta >= ppto ? "#10B981" : "#EF4444" }}>
          {venta >= ppto ? "+" : ""}{fmt(venta - ppto)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", height: 7, background: "#F1F5F9", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(barPct / 140 * 100, 100)}%`, background: cc, borderRadius: 4, transition: "width 0.5s ease" }} />
        {timeMrk != null && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(timeMrk / 140, 1) * 100}%`, width: 2, background: "#94A3B8", borderRadius: 2 }} />
        )}
      </div>
      {timeMrk != null && (
        <div style={{ fontSize: 10, color: "#94A3B8", textAlign: "right", marginBottom: 6 }}>
          {timeMrk.toFixed(1)}% del mes transcurrido
        </div>
      )}

      {/* Margen + vs25 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "#F8FAFC", borderRadius: 6, padding: "4px 10px",
        }}>
          <span style={{ fontSize: 10, color: "#64748B" }}>Margen</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: mgColor(margen) }}>{margen.toFixed(1)}%</span>
          {pptoMg > 0 && <span style={{ fontSize: 10, color: "#94A3B8" }}>/ {pptoMg.toFixed(1)}%</span>}
        </div>
        {vs25 !== null && (
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            background: "#F8FAFC", borderRadius: 6, padding: "4px 10px",
          }}>
            {vs25 >= 0
              ? <TrendingUp size={11} color="#10B981" />
              : <TrendingDown size={11} color="#EF4444" />}
            <span style={{ fontSize: 13, fontWeight: 700, color: varColor(vs25) }}>
              {vs25 >= 0 ? "+" : ""}{vs25.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>vs 2025</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Category Card ──────────────────────────────────────────────────── */
function CatCard({ c, pctDias }: { c: PMCategoria; pctDias: number }) {
  const color   = CAT_COLORS[c.categoria] ?? LBF_BLUE;
  const cumpl   = c.cump_ppto;
  const cc      = pctColor(cumpl, pctDias);
  const barPct  = Math.min(cumpl / 140 * 100, 100);

  return (
    <div style={{
      background: "white", borderRadius: 10, border: `1px solid #E2E8F0`,
      borderTop: `3px solid ${color}`, padding: "14px 16px", flex: 1, minWidth: 0,
    }}>
      {/* Cat + cumpl */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{c.categoria}</span>
        <span style={{
          fontSize: 12, fontWeight: 800, color: cc,
          background: cc + "18", padding: "2px 8px", borderRadius: 20,
        }}>{cumpl.toFixed(1)}%</span>
      </div>

      {/* Venta */}
      <div style={{ fontSize: 22, fontWeight: 900, color: LBF_BLUE, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: 2 }}>
        {fmt(c.venta_mes)}
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>
        PPTO: <span style={{ fontWeight: 600, color: "#64748B" }}>{fmt(c.ppto_mes)}</span>
      </div>

      {/* Progress */}
      <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 3, opacity: 0.8 }} />
      </div>

      {/* Pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill label="Margen" val={`${c.margen.toFixed(1)}%`} color={mgColor(c.margen)} />
        {c.ppto_margen > 0 && <Pill label="Mg meta" val={`${c.ppto_margen.toFixed(1)}%`} color="#64748B" />}
        <Pill
          label="vs 2025"
          val={c.venta_ant > 0 ? `${c.var_ant >= 0 ? "+" : ""}${c.var_ant.toFixed(1)}%` : "Nuevo"}
          color={varColor(c.var_ant)}
        />
      </div>
    </div>
  );
}

function Pill({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      background: color + "14", borderRadius: 5, padding: "3px 8px",
    }}>
      <span style={{ fontSize: 9, color: "#94A3B8" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{val}</span>
    </div>
  );
}

/* ─── Table styles ───────────────────────────────────────────────────── */
const TH: React.CSSProperties  = { background: LBF_BLUE, color: "white", padding: "7px 10px", fontSize: 10, fontWeight: 700, textAlign: "left",  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const THR: React.CSSProperties = { ...TH, textAlign: "right" };
const TD: React.CSSProperties  = { padding: "6px 10px", fontSize: 11, color: "#1E293B", borderBottom: "1px solid #F1F5F9" };
const TDR: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Chart ──────────────────────────────────────────────────────────── */
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

function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={600}>
      {fmt(value)}
    </text>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function PlanDeMesPage() {
  const [filtros,          setFiltros]         = useState<PMFiltros | null>(null);
  const [selectedZona,     setSelectedZona]    = useState("");
  const [selectedCat,      setSelectedCat]     = useState<string | null>(null);
  const [selectedSubclase, setSelectedSubclase]= useState("");
  const [selectedCodigo,   setSelectedCodigo]  = useState("");
  const [data,             setData]            = useState<PMData | null>(null);
  const [loading,          setLoading]         = useState(false);
  const [loadingFiltros,   setLoadingFiltros]  = useState(true);
  const [error,            setError]           = useState<string | null>(null);
  const [prodSearch,       setProdSearch]      = useState("");

  useEffect(() => {
    api.get<PMFiltros>("/api/pm/filtros")
      .then((f) => setFiltros(f))
      .catch(() => setFiltros({ zonas: [], familias: [], categorias: ["SQ","MAH","EQM","EVA"] }))
      .finally(() => setLoadingFiltros(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedZona)     params.set("zona",       selectedZona);
      if (selectedCat)      params.set("categorias",  selectedCat);
      if (selectedSubclase) params.set("subclase",    selectedSubclase);
      if (selectedCodigo)   params.set("codigo",      selectedCodigo);
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

  const chartData = useMemo(() => {
    if (!data?.categorias) return [];
    return data.categorias
      .filter(c => c.venta_mes > 0 || c.ppto_mes > 0 || c.venta_ant > 0)
      .map((c) => ({
        name:         c.categoria,
        "Año Ant":    c.venta_ant,
        "PPTO":       c.ppto_mes,
        "Real":       c.venta_mes,
        "Margen %":   c.margen,
      }));
  }, [data?.categorias]);

  const cats       = filtros?.categorias ?? ["SQ","MAH","EQM","EVA"];
  const zonaLabel  = (z: string) => { const p = z.split("-"); return p.length > 1 ? p.slice(1).join("-").trim() : z; };
  const activeCats = data?.categorias?.filter(c => c.venta_mes > 0 || c.ppto_mes > 0) ?? [];

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: LBF_BLUE, margin: 0 }}>Plan de Mes</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>
            {mesLabel || "—"}
            {kpis && <span style={{ marginLeft: 8, color: "#94A3B8" }}>{kpis.dias_trans} de {kpis.dias_total} días hábiles · {pctDias.toFixed(1)}% del mes</span>}
          </p>
        </div>
        <button
          onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); loadData(); }}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8, border: `1px solid ${LBF_BLUE}`,
            background: loading ? "#F1F5F9" : LBF_BLUE, fontSize: 12, fontWeight: 700,
            color: loading ? "#94A3B8" : "white", cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 0.9s linear infinite" : "none" }} />
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────── */}
      <div style={{
        background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 20,
        flexWrap: "wrap", marginBottom: 16,
      }}>
        <FilterSelect label="Zona" value={selectedZona} onChange={setSelectedZona}>
          <option value="">Todas las zonas</option>
          {(filtros?.zonas ?? []).map(z => <option key={z} value={z}>{zonaLabel(z)}</option>)}
        </FilterSelect>

        <div style={{ width: 1, height: 24, background: "#E2E8F0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Categoría</span>
          <div style={{ display: "flex", gap: 4 }}>
            <CatChip label="Todas" active={selectedCat === null} color={LBF_BLUE} onClick={() => setSelectedCat(null)} />
            {cats.map(cat => (
              <CatChip key={cat} label={cat} active={selectedCat === cat}
                color={CAT_COLORS[cat] ?? "#3B82F6"}
                onClick={() => setSelectedCat(selectedCat === cat ? null : cat)} />
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: "#E2E8F0" }} />

        <FilterSelect label="Subclase" value={selectedSubclase} onChange={setSelectedSubclase}>
          <option value="">Todas</option>
          {(filtros?.familias ?? []).map(f => <option key={f} value={f}>{f}</option>)}
        </FilterSelect>

        <div style={{ width: 1, height: 24, background: "#E2E8F0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Código</span>
          <input
            value={selectedCodigo} onChange={e => setSelectedCodigo(e.target.value)}
            placeholder="Filtrar código"
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, width: 120, outline: "none", color: "#1E293B" }}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Days progress bar ─────────────────────────────────────── */}
      {kpis && (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "10px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Avance del mes — {mesLabel}
            </span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>
              {kpis.dias_trans} días hábiles transcurridos · {kpis.dias_rest} restantes · {kpis.dias_total} total
            </span>
          </div>
          <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(pctDias, 100)}%`, background: LBF_RED, borderRadius: 4, transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}

      {/* ── KPI Period Cards (3 columnas) ─────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8", fontSize: 14 }}>Cargando datos...</div>
      ) : kpis ? (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <PeriodCard
              label="Mes actual"
              venta={kpis.venta_mes} ppto={kpis.ppto_mes}
              margen={kpis.mg_mes}   pptoMg={kpis.ppto_mg_mes}
              venta25={kpis.venta_mes_25} pctDias={pctDias} isMes
            />
            <PeriodCard
              label="Trimestre"
              venta={kpis.venta_trim} ppto={kpis.ppto_trim}
              margen={kpis.mg_trim}   pptoMg={kpis.ppto_mg_trim}
              venta25={kpis.venta_trim_25} pctDias={pctDias}
            />
            <PeriodCard
              label="YTD (acumulado)"
              venta={kpis.venta_ytd} ppto={kpis.ppto_ytd}
              margen={kpis.mg_ytd}   pptoMg={kpis.ppto_mg_ytd}
              venta25={kpis.venta_ytd_25} pctDias={pctDias}
            />
          </div>

          {/* ── Category Cards (4 columnas) ──────────────────────── */}
          {activeCats.length > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {activeCats.map(c => <CatCard key={c.categoria} c={c} pctDias={pctDias} />)}
            </div>
          )}

          {/* ── Bottom: Chart + Products ─────────────────────────── */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

            {/* Gráfico */}
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", width: 400, flexShrink: 0 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 3, height: 16, background: LBF_RED, borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, color: LBF_BLUE, margin: 0 }}>
                  Venta por Categoría
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{mesLabel}</span>
                </h3>
              </div>
              <div style={{ padding: "12px 8px 8px" }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData} margin={{ top: 24, right: 40, left: 4, bottom: 4 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700, fill: LBF_BLUE }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left"  tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={54} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={30}
                        domain={[0, (d: number) => Math.ceil((d + 10) / 10) * 10]} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={9} />
                      <Bar yAxisId="left" dataKey="Año Ant" fill="#94A3B8" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                      <Bar yAxisId="left" dataKey="PPTO"    fill="#3B82F6" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                      <Bar yAxisId="left" dataKey="Real"    fill={LBF_RED}  radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                      <Line yAxisId="right" type="monotone" dataKey="Margen %" stroke="#F59E0B" strokeWidth={2.5}
                        dot={{ r: 5, fill: "#F59E0B", stroke: "white", strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}>Sin datos</div>
                )}
              </div>
            </div>

            {/* Tabla Productos */}
            <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 16, background: LBF_RED, borderRadius: 2 }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: LBF_BLUE, margin: 0 }}>
                    Detalle Productos
                    {filteredProducts.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{filteredProducts.length} productos</span>}
                  </h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "5px 10px" }}>
                  <Search size={12} color="#94A3B8" />
                  <input
                    type="text" placeholder="Buscar código o descripción..." value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                    style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, width: 200, color: "#0F172A" }}
                  />
                  {prodSearch && <button onClick={() => setProdSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: 14, padding: 0 }}>×</button>}
                </div>
              </div>

              <div style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ ...TH, width: 90 }}>Código</th>
                      <th style={TH}>Descripción</th>
                      <th style={{ ...TH, minWidth: 80 }}>Subclase</th>
                      <th style={THR}>Venta Mes</th>
                      <th style={THR}>Prom 6M</th>
                      <th style={{ ...THR, width: 60 }}>Stock</th>
                      <th style={THR}>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p, i) => (
                      <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                        <td style={{ ...TD, fontWeight: 700, color: LBF_BLUE, fontSize: 10 }}>{p.codigo}</td>
                        <td style={{ ...TD, fontSize: 10 }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }} title={p.descripcion}>
                            {p.descripcion}
                          </div>
                        </td>
                        <td style={{ ...TD, fontSize: 9, color: "#94A3B8" }}>{p.familia}</td>
                        <td style={{ ...TDR, fontSize: 11, color: p.venta_mes > 0 ? "#1E293B" : "#CBD5E1", fontWeight: p.venta_mes > 0 ? 600 : 400 }}>
                          {p.venta_mes > 0 ? fmtAbs(p.venta_mes) : "—"}
                        </td>
                        <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                          {p.vta_prom_6m > 0 ? fmtAbs(p.vta_prom_6m) : "—"}
                        </td>
                        <td style={{ ...TDR, fontSize: 11, fontWeight: p.q_stock <= 0 ? 700 : 400,
                          color: p.q_stock <= 0 ? "#EF4444" : p.q_stock < 5 ? "#F59E0B" : "#1E293B" }}>
                          {Math.round(p.q_stock)}
                        </td>
                        <td style={{ ...TDR, fontSize: 11, fontWeight: 700, color: mgColor(p.margen) }}>
                          {p.margen > 0 ? `${p.margen.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 28 }}>
                          {prodSearch ? "Sin resultados para la búsqueda" : "Sin productos para el filtro seleccionado"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredProducts.length > 0 && (
                    <tfoot>
                      <tr style={{ background: LBF_BLUE, position: "sticky", bottom: 0 }}>
                        <td colSpan={3} style={{ ...TD, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                          TOTAL — {filteredProducts.length} productos
                        </td>
                        <td style={{ ...TDR, color: "white", fontWeight: 800, fontSize: 11, borderBottom: "none" }}>
                          {fmtAbs(filteredProducts.reduce((s, p) => s + p.venta_mes, 0))}
                        </td>
                        <td style={{ ...TDR, color: "#CBD5E1", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                          {fmtAbs(filteredProducts.reduce((s, p) => s + p.vta_prom_6m, 0))}
                        </td>
                        <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                          {Math.round(filteredProducts.reduce((s, p) => s + p.q_stock, 0))}
                        </td>
                        <td style={{ ...TDR, color: "#CBD5E1", fontSize: 11, borderBottom: "none" }}>—</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Filter helpers ─────────────────────────────────────────────────── */
function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: "white", color: "#1E293B", fontSize: 12, cursor: "pointer", outline: "none" }}>
        {children}
      </select>
    </div>
  );
}

function CatChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
      border: active ? `1px solid ${color}` : "1px solid #E2E8F0",
      background: active ? color : "white",
      color: active ? "white" : "#64748B",
    }}>
      {label}
    </button>
  );
}
