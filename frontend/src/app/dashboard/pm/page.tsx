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
  contrib: number; margen: number;
}

interface PMProducto {
  codigo: string; descripcion: string; familia: string;
  venta_mes: number; vta_prom_6m: number; q_stock: number;
  ppto_mes: number; margen: number;
}

interface PMData { kpis: PMKpis; categorias: PMCategoria[]; productos: PMProducto[]; zona: string; }

/* ─── Constants ─────────────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

const MESES: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
  7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

function cumplColor(actual: number, target: number, pctDias = 0): string {
  if (target === 0) return "#64748B";
  const pct = (actual / target) * 100;
  const threshold = pctDias > 0 ? pctDias : 100;
  if (pct >= threshold) return "#10B981";
  if (pct >= threshold * 0.75) return "#F59E0B";
  return "#EF4444";
}

function varColor(v: number) { return v >= 0 ? "#10B981" : "#EF4444"; }

/* ─── StatCard (misma estructura que zona/televentas) ────────────────── */

function StatCard({
  label, actual, target, isPercent = false, pctDias = 0,
}: {
  label: string; actual: number; target: number; isPercent?: boolean; pctDias?: number;
}) {
  const color = cumplColor(actual, target, pctDias);
  const cump = target > 0 ? (actual / target) * 100 : 0;
  const cumpBar = Math.min(cump, 100);
  const displayActual = isPercent ? `${actual.toFixed(1)}%` : fmtAbs(actual);
  const displayTarget = isPercent ? `${target.toFixed(1)}%` : fmtAbs(target);

  return (
    <div style={{ flex: "1 1 180px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{displayActual}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Meta: {displayTarget}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color }}>{cump.toFixed(1)}%</div>
        </div>
        <div style={{ height: 4, background: "#F1F5F9", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${cumpBar}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Section title (estilo televentas) ─────────────────────────────── */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
        {title}
        {subtitle && <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{subtitle}</span>}
      </h3>
    </div>
  );
}

/* ─── Table header / cell helpers ────────────────────────────────────── */

const TH: React.CSSProperties = {
  background: "#EFF6FF", color: "#1E3A5F", padding: "8px 12px",
  fontSize: 11, fontWeight: 700, textAlign: "left",
  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
};
const THR: React.CSSProperties = { ...TH, textAlign: "right" };
const TD: React.CSSProperties = { padding: "7px 12px", fontSize: 12, color: "#1E293B", borderBottom: "1px solid #F1F5F9" };
const TDR: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Chart bar label ────────────────────────────────────────────────── */

function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#374151" fontWeight={600}>
      {(value / 1_000_000).toFixed(1)}M
    </text>
  );
}

/* ─── Chart tooltip ──────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === "number" && p.name === "Margen %" ? `${p.value.toFixed(1)}%` : fmtAbs(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function PlanDeMesPage() {
  const [filtros, setFiltros] = useState<PMFiltros | null>(null);
  const [selectedZona, setSelectedZona] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>(["SQ", "MAH", "EQM", "EVA"]);
  const [selectedSubclase, setSelectedSubclase] = useState("");
  const [selectedFecha, setSelectedFecha] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<PMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prodSearch, setProdSearch] = useState("");

  useEffect(() => {
    setLoadingFiltros(true);
    api.get<PMFiltros>("/api/pm/filtros")
      .then((f) => {
        setFiltros(f);
        if (f.categorias?.length) setSelectedCats(f.categorias);
      })
      .catch(() => setFiltros({ zonas: [], familias: [], categorias: ["SQ", "MAH", "EQM", "EVA"] }))
      .finally(() => setLoadingFiltros(false));
  }, []);

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

  useEffect(() => { if (!loadingFiltros) loadData(); }, [loadingFiltros, loadData]);

  const kpis = data?.kpis;
  const mesLabel = kpis ? `${MESES[kpis.mes]} ${kpis.ano}` : "";

  const filteredProducts = useMemo(() => {
    if (!data?.productos) return [];
    const q = prodSearch.toLowerCase();
    if (!q) return data.productos;
    return data.productos.filter(p => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q));
  }, [data?.productos, prodSearch]);

  const prodTotals = useMemo(() => {
    if (!filteredProducts.length) return null;
    return {
      venta_mes: filteredProducts.reduce((s, p) => s + p.venta_mes, 0),
      vta_prom_6m: filteredProducts.reduce((s, p) => s + p.vta_prom_6m, 0),
      q_stock: filteredProducts.reduce((s, p) => s + p.q_stock, 0),
      ppto_mes: filteredProducts.reduce((s, p) => s + p.ppto_mes, 0),
    };
  }, [filteredProducts]);

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

  const zonaLabel = (z: string) => { const p = z.split("-"); return p.length > 1 ? p.slice(1).join("-").trim() : z; };

  const cats = filtros?.categorias ?? ["SQ", "MAH", "EQM", "EVA"];

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Plan de Mes</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            PPTO vs Venta — {mesLabel || "cargando..."}
            {kpis && <span style={{ marginLeft: 12, color: "#94A3B8" }}>
              {kpis.dias_trans}d transcurridos · {kpis.dias_rest}d restantes · {kpis.pct_dias.toFixed(1)}% del mes
            </span>}
          </p>
        </div>
        <button
          onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); loadData(); }}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
            background: "white", fontSize: 13, fontWeight: 600, color: "#374151",
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 0.9s linear infinite" : "none" }} />
          Actualizar
        </button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        padding: "12px 20px", background: "white", borderRadius: 10,
        border: "1px solid #E2E8F0", marginBottom: 20,
      }}>
        {/* Zona */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Zona</span>
          <select value={selectedZona} onChange={(e) => setSelectedZona(e.target.value)}
            style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, color: "#0F172A", background: "white", cursor: "pointer" }}>
            <option value="">Todas</option>
            {(filtros?.zonas ?? []).map((z) => <option key={z} value={z}>{zonaLabel(z)}</option>)}
          </select>
        </div>

        <div style={{ height: 24, width: 1, background: "#E2E8F0" }} />

        {/* Categorias */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Categoría</span>
          <div style={{ display: "flex", gap: 4 }}>
            {cats.map((cat) => {
              const active = selectedCats.includes(cat);
              return (
                <button key={cat} onClick={() => setSelectedCats(active && selectedCats.length > 1 ? selectedCats.filter(c => c !== cat) : [...new Set([...selectedCats, cat])])}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    border: active ? `1px solid ${CAT_COLORS[cat]}` : "1px solid #E2E8F0",
                    background: active ? `${CAT_COLORS[cat]}18` : "white",
                    color: active ? CAT_COLORS[cat] : "#64748B",
                  }}
                >{cat}</button>
              );
            })}
          </div>
        </div>

        <div style={{ height: 24, width: 1, background: "#E2E8F0" }} />

        {/* Subclase */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Subclase</span>
          <select value={selectedSubclase} onChange={(e) => setSelectedSubclase(e.target.value)}
            style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, color: "#0F172A", background: "white", cursor: "pointer", maxWidth: 200 }}>
            <option value="">Todas</option>
            {(filtros?.familias ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div style={{ height: 24, width: 1, background: "#E2E8F0" }} />

        {/* Fecha */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Fecha</span>
          <input type="date" value={selectedFecha} onChange={(e) => setSelectedFecha(e.target.value)}
            style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, color: "#0F172A", background: "white", cursor: "pointer" }} />
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ margin: "0 0 16px", padding: 16, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Venta Mes"    actual={kpis?.venta_mes ?? 0}  target={kpis?.ppto_mes ?? 0}    pctDias={kpis?.pct_dias} />
        <StatCard label="Margen Mes"   actual={kpis?.mg_mes ?? 0}     target={kpis?.ppto_mg_mes ?? 0} pctDias={kpis?.pct_dias} isPercent />
        <StatCard label="Venta Trim"   actual={kpis?.venta_trim ?? 0} target={kpis?.ppto_trim ?? 0}   pctDias={kpis?.pct_dias} />
        <StatCard label="Margen Trim"  actual={kpis?.mg_trim ?? 0}    target={kpis?.ppto_mg_trim ?? 0} pctDias={kpis?.pct_dias} isPercent />
        <StatCard label="Venta Anual"  actual={kpis?.venta_ytd ?? 0}  target={kpis?.ppto_ytd ?? 0}   />
        <StatCard label="Margen Anual" actual={kpis?.mg_ytd ?? 0}     target={kpis?.ppto_mg_ytd ?? 0} isPercent />
      </div>

      {/* ── Main Grid: Chart + Category tables ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.8fr) minmax(0,1fr)", gap: 16, marginBottom: 16, alignItems: "start" }}>

        {/* Chart */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <SectionTitle title="Venta Mes por Categoría" subtitle={mesLabel} />
          <div style={{ padding: "16px 12px 12px" }}>
            {loading ? (
              <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Cargando...</div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={chartData} margin={{ top: 20, right: 48, left: 4, bottom: 4 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700, fill: "#0F172A" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={56} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40}
                    domain={[0, (dataMax: number) => Math.ceil((dataMax + 10) / 10) * 10]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} iconType="rect" iconSize={10} />
                  <Bar yAxisId="left" dataKey="Vta Año Ant" fill="#94A3B8" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                  <Bar yAxisId="left" dataKey="Vta PPTO"    fill="#3B82F6" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                  <Bar yAxisId="left" dataKey="Vta Real"    fill="#10B981" radius={[3,3,0,0]}><LabelList content={<BarLabel />} /></Bar>
                  <Line yAxisId="right" type="monotone" dataKey="margen" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 5, fill: "#F59E0B", stroke: "white", strokeWidth: 2 }} name="Margen %" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Sin datos</div>
            )}
          </div>

          {/* 3 KPI cards below chart */}
          {kpis && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "1px solid #F1F5F9" }}>
              {[
                { label: "vs Año Ant", value: fmt(kpis.venta_mes - kpis.venta_mes_25), pct: kpis.venta_mes_25 > 0 ? ((kpis.venta_mes / kpis.venta_mes_25 - 1) * 100) : 0, isGood: kpis.venta_mes >= kpis.venta_mes_25 },
                { label: "Avance días", value: `${kpis.pct_dias.toFixed(1)}%`, pct: kpis.pct_dias, isGood: true, isBlue: true },
                { label: "Gap PPTO", value: fmt(kpis.venta_mes - kpis.ppto_mes), pct: kpis.ppto_mes > 0 ? ((kpis.venta_mes / kpis.ppto_mes) * 100) : 0, isGood: kpis.venta_mes >= kpis.ppto_mes },
              ].map((item, i) => {
                const color = (item as { isBlue?: boolean }).isBlue ? "#3B82F6" : item.isGood ? "#10B981" : "#EF4444";
                return (
                  <div key={item.label} style={{ padding: "12px 16px", borderLeft: i > 0 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{item.pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Tables */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Cumplimiento por Categoría */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <SectionTitle title="Cumplimiento por Categoría" />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Cat</th>
                  <th style={THR}>Cump PPTO</th>
                  <th style={THR}>Var AñoAnt</th>
                  <th style={THR}>% Días</th>
                </tr>
              </thead>
              <tbody>
                {(data?.categorias ?? []).map((c, i) => (
                  <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                    <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? "#1E293B" }}>{c.categoria}</td>
                    <td style={{ ...TDR, color: cumplColor(c.cump_ppto, 100, c.pct_dias), fontWeight: 700 }}>{fmtPct(c.cump_ppto)}</td>
                    <td style={{ ...TDR, color: varColor(c.var_ant), fontWeight: 700 }}>{c.var_ant >= 0 ? "+" : ""}{fmtPct(c.var_ant)}</td>
                    <td style={{ ...TDR, color: "#64748B" }}>{fmtPct(c.pct_dias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Margen por Categoría */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <SectionTitle title="Margen por Categoría" />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Cat</th>
                  <th style={THR}>Contribución</th>
                  <th style={THR}>Margen %</th>
                  <th style={THR}>% PPTO Mes</th>
                </tr>
              </thead>
              <tbody>
                {(data?.categorias ?? []).filter((c) => c.contrib > 0).map((c, i) => {
                  const pptoPct = kpis?.ppto_mes ? (c.contrib / kpis.ppto_mes) * 100 : 0;
                  const mgColor = c.margen >= 40 ? "#10B981" : c.margen >= 30 ? "#F59E0B" : "#EF4444";
                  return (
                    <tr key={c.categoria} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                      <td style={{ ...TD, fontWeight: 700, color: CAT_COLORS[c.categoria] ?? "#1E293B" }}>{c.categoria}</td>
                      <td style={TDR}>{fmtAbs(c.contrib)}</td>
                      <td style={{ ...TDR, color: mgColor, fontWeight: 700 }}>{fmtPct(c.margen)}</td>
                      <td style={{ ...TDR, color: cumplColor(pptoPct, 100, kpis?.pct_dias), fontWeight: 700 }}>{pptoPct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Product Table (full width) ────────────────────────────────── */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <SectionTitle title="Detalle Productos" subtitle={filteredProducts.length ? `${filteredProducts.length} productos` : undefined} />

        {/* Search */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 12px", maxWidth: 340 }}>
            <Search size={13} color="#94A3B8" />
            <input type="text" placeholder="Buscar código o descripción..." value={prodSearch} onChange={(e) => setProdSearch(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, flex: 1, color: "#0F172A" }} />
            {prodSearch && <button onClick={() => setProdSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: 14, padding: 0 }}>×</button>}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 90 }}>Código</th>
                <th style={TH}>Descripción</th>
                <th style={{ ...TH, minWidth: 100 }}>Subclase</th>
                <th style={THR}>Vta Mes</th>
                <th style={THR}>Prom 6M</th>
                <th style={{ ...THR, width: 64 }}>Stock</th>
                <th style={THR}>PPTO Mes</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, i) => (
                <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                  <td style={{ ...TD, fontWeight: 700, color: "#1E3A5F", fontSize: 11 }}>{p.codigo}</td>
                  <td style={{ ...TD, fontSize: 11 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }} title={p.descripcion}>{p.descripcion}</div>
                  </td>
                  <td style={{ ...TD, fontSize: 10, color: "#94A3B8" }}>{p.familia}</td>
                  <td style={{ ...TDR, fontSize: 11, color: p.venta_mes > 0 ? "#1E293B" : "#CBD5E1" }}>
                    {p.venta_mes > 0 ? p.venta_mes.toLocaleString("es-CL") : "—"}
                  </td>
                  <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                    {p.vta_prom_6m > 0 ? p.vta_prom_6m.toLocaleString("es-CL") : "—"}
                  </td>
                  <td style={{ ...TDR, fontSize: 11, color: p.q_stock <= 0 ? "#EF4444" : p.q_stock < 5 ? "#F59E0B" : "#1E293B", fontWeight: p.q_stock <= 0 ? 700 : 500 }}>
                    {Math.round(p.q_stock)}
                  </td>
                  <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                    {p.ppto_mes > 0 ? p.ppto_mes.toLocaleString("es-CL") : "—"}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 28 }}>
                  {prodSearch ? "Sin resultados" : "Sin productos"}
                </td></tr>
              )}
            </tbody>
            {prodTotals && filteredProducts.length > 0 && (
              <tfoot>
                <tr style={{ background: "#1E3A5F" }}>
                  <td colSpan={3} style={{ ...TD, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                    TOTAL ({filteredProducts.length} productos)
                  </td>
                  <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>{prodTotals.venta_mes.toLocaleString("es-CL")}</td>
                  <td style={{ ...TDR, color: "#CBD5E1", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>{prodTotals.vta_prom_6m.toLocaleString("es-CL")}</td>
                  <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>{Math.round(prodTotals.q_stock)}</td>
                  <td style={{ ...TDR, color: "#CBD5E1", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>{prodTotals.ppto_mes.toLocaleString("es-CL")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
