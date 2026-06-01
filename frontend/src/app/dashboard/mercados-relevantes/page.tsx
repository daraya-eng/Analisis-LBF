"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

// ── interfaces ───────────────────────────────────────────────────────────────

interface LbfAno {
  ano: number;
  total_lics: number;
  lics_adj: number;
  tasa_adj_lics: number;
  total_items: number;
  items_adj: number;
  tasa_adj_items: number;
  monto_ofertado: number;
  monto_adjudicado: number;
  pct_ganado_ofertado: number;
  ultimo_mes: number;
}

interface TipoFila {
  ano: number;
  tipo: string;
  total_lics: number;
  lics_adj: number;
  tasa_adj_lics: number;
  monto_ofertado: number;
  monto_adjudicado: number;
  pct_ganado: number;
}

interface MesData {
  mes: number;
  mes_nom: string;
  v2024_of: number;
  v2024_adj: number;
  l2024_part: number;
  l2024_adj: number;
  v2025_of: number;
  v2025_adj: number;
  l2025_part: number;
  l2025_adj: number;
  v2026_of: number;
  v2026_adj: number;
  l2026_part: number;
  l2026_adj: number;
}

interface SerresAno {
  ano: number;
  adj_mercado: number;
  lbf_adj: number;
  cuota_lbf: number;
  lics_total: number;
  lbf_lics_part: number;
  lbf_lics_adj: number;
  lbf_items_of: number;
  lbf_items_adj: number;
  lbf_ef_items: number;
}

interface SerresComp {
  rank: number;
  nombre: string;
  rut: string;
  lics_adj: number;
  items_adj: number;
  adj: number;
  unidades: number;
  cuota: number;
  cuota_unid: number;
  es_lbf: boolean;
}

interface SerresOport {
  codigo: string;
  tipo: string;
  ganador: string;
  organismo: string;
  fecha: string;
  adj: number;
}

interface SerresPeriodo {
  mercado_adj: number;
  mercado_unidades: number;
  lbf_adj: number;
  lbf_unidades: number;
  cuota_adj: number;
  cuota_unidades: number;
}

interface SerresCuadro {
  periodos: {
    "2024": SerresPeriodo;
    "2025": SerresPeriodo;
    ytd_2026: SerresPeriodo;
    mat: SerresPeriodo;
  };
}
interface SerresTendOrg {
  nombre: string;
  shortname: string;
  es_lbf: boolean;
  data: Record<string, { adj: number; unidades: number }>;
}

interface SerresTendencia {
  trimestres: string[];
  organismos: SerresTendOrg[];
}

// ── constants ─────────────────────────────────────────────────────────────────

const LBF_BLUE  = "#2563EB";
const GRAY_DARK = "#475569";
const GRAY_BAR  = "#94A3B8";
const GREEN     = "#16A34A";

const MESES_LABEL = [
  "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const TIPO_LABEL: Record<string, string> = {
  LR: "LR — > 2.000 UTM",
  LP: "LP — 1.000–2.000 UTM",
  LQ: "LQ — 500–1.000 UTM",
  LE: "LE — 100–500 UTM",
  L1: "L1 — < 100 UTM",
  CO: "CO — Convenio Suministro",
  "CM": "CM — Convenio Marco",
};

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtM = (n: number): string => {
  if (!n) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}MM`;
  if (abs >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString("es-CL")}`;
};

const fmtM5 = (n: number): string => {
  if (!n) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${Math.round(n / 1_000_000).toLocaleString("es-CL")}M`;
  if (abs >= 1_000_000)     return `$${Math.round(n / 1_000).toLocaleString("es-CL")}K`;
  return `$${Math.round(n).toLocaleString("es-CL")}`;
};

const fmtFull = (n: number): string =>
  `$${Math.round(n).toLocaleString("es-CL")}`;

const fmtPct = (n: number): string => `${n.toFixed(1)}%`;
const fmtN   = (n: number): string => n.toLocaleString("es-CL");

const pctColor = (p: number): string =>
  p >= 15 ? GREEN : p >= 8 ? "#D97706" : "#DC2626";

const fmtFecha = (iso: string): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? "#0F172A" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#94A3B8" }}>{sub}</div>
      )}
    </div>
  );
}

const thS: React.CSSProperties = {
  padding: "8px 12px", background: "#F8FAFC", fontWeight: 700,
  fontSize: 11, color: "#374151", border: "1px solid #E2E8F0",
  whiteSpace: "nowrap", textAlign: "right",
};
const thL: React.CSSProperties = { ...thS, textAlign: "left" };
const thG: React.CSSProperties = {
  ...thS, textAlign: "center", background: "#EFF6FF",
  color: LBF_BLUE, textTransform: "uppercase", letterSpacing: "0.05em",
};
const tdS: React.CSSProperties = {
  padding: "8px 12px", fontSize: 12, color: "#1F2937",
  border: "1px solid #F1F5F9", whiteSpace: "nowrap",
  textAlign: "right", fontVariantNumeric: "tabular-nums",
};
const tdL: React.CSSProperties = { ...tdS, textAlign: "left", fontWeight: 600, fontSize: 12 };
const tdYear: React.CSSProperties = { ...tdS, fontWeight: 800, textAlign: "center", background: "#F8FAFC", fontSize: 13 };

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "white", border: "1px solid #E2E8F0", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#0F172A" }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{fmtFull(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

const SerresChartTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; payload: SerresAno }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div style={{
      background: "white", border: "1px solid #E2E8F0", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#0F172A" }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{fmtFull(p.value)}</strong>
        </div>
      ))}
      {row && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #F1F5F9", color: "#64748B" }}>
          Cuota LBF: <strong style={{ color: LBF_BLUE }}>{row.cuota_lbf}%</strong>
        </div>
      )}
    </div>
  );
};

// ── main page ─────────────────────────────────────────────────────────────────

export default function MercadosRelevantesPage() {
  const [activeTab, setActiveTab] = useState<"lbf" | "serres">("lbf");

  // tab lbf
  const [summary, setSummary]     = useState<LbfAno[]>([]);
  const [tipos, setTipos]         = useState<TipoFila[]>([]);
  const [evolucion, setEvolucion] = useState<MesData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // tab serres
  const [serresLoaded, setSerresLoaded]   = useState(false);
  const [serresAnos, setSerresAnos]       = useState<SerresAno[]>([]);
  const [serresComps, setSerresComps]     = useState<SerresComp[]>([]);
  const [serresOport, setSerresOport]     = useState<SerresOport[]>([]);
  const [serresCuadro, setSerresCuadro]     = useState<SerresCuadro | null>(null);
  const [serresTendencia, setSerresTendencia] = useState<SerresTendencia | null>(null);
  const [qPeriodo, setQPeriodo]             = useState<string>("Todo");
  const [qMetrica, setQMetrica]             = useState<"adj" | "unidades">("adj");
  const [serresLoading, setSerresLoading]   = useState(false);

  const loadLbf = useCallback(() => {
    setLoading(true);
    setError(null);
    clearClientCache();
    Promise.all([
      api.get<{ anos: LbfAno[]; error?: string }>("/api/mercados-relevantes/licitaciones-lbf", { noCache: true }),
      api.get<{ filas: TipoFila[]; error?: string }>("/api/mercados-relevantes/licitaciones-lbf-tipo", { noCache: true }),
      api.get<{ meses: MesData[]; error?: string }>("/api/mercados-relevantes/evolucion-mensual", { noCache: true }),
    ]).then(([s, t, e]) => {
      if (s.error) { setError(s.error); setLoading(false); return; }
      setSummary(s.anos ?? []);
      setTipos(t.filas ?? []);
      setEvolucion(e.meses ?? []);
      setLoading(false);
    }).catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  useEffect(() => { loadLbf(); }, [loadLbf]);

  useEffect(() => {
    if (activeTab !== "serres" || serresLoaded) return;
    setSerresLoading(true);
    Promise.all([
      api.get("/api/mercados-relevantes/mercado-serres/resumen", { noCache: true }),
      api.get("/api/mercados-relevantes/mercado-serres/competidores", { noCache: true }),
      api.get("/api/mercados-relevantes/mercado-serres/oportunidades", { noCache: true }),
      api.get("/api/mercados-relevantes/mercado-serres/cuadro-comparativo", { noCache: true }),
      api.get("/api/mercados-relevantes/mercado-serres/tendencia-clientes", { noCache: true }),
    ]).then(([r, c, o, q, td]) => {
      setSerresAnos((r as any).anos ?? []);
      setSerresComps((c as any).competidores ?? []);
      setSerresOport((o as any).oportunidades ?? []);
      setSerresCuadro(q as SerresCuadro);
      setSerresTendencia(td as SerresTendencia);
      setSerresLoaded(true);
      setSerresLoading(false);
    }).catch(() => setSerresLoading(false));
  }, [activeTab, serresLoaded]);

  if (loading) {
    return <div style={{ color: "#94A3B8", padding: 40, textAlign: "center" }}>Cargando datos...</div>;
  }
  if (error) {
    return <pre style={{ color: "#EF4444", fontSize: 11, background: "#FEF2F2", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap" }}>{error}</pre>;
  }

  const ano2024 = summary.find(a => a.ano === 2024);
  const ano2025 = summary.find(a => a.ano === 2025);
  const ano2026 = summary.find(a => a.ano === 2026);
  const ult26   = ano2026?.ultimo_mes ?? 0;
  const ytdLabel = ult26 > 0 ? `Ene–${MESES_LABEL[ult26]} 2026` : "2026 YTD";

  const ANOS = [2024, 2025, 2026];
  const tiposUnicos = [...new Set(tipos.map(f => f.tipo))].sort();
  const byAnoTipo: Record<string, TipoFila> = Object.fromEntries(
    tipos.map(f => [`${f.ano}-${f.tipo}`, f])
  );

  const serres2025 = serresAnos.find(a => a.ano === 2025);
  const serres2026 = serresAnos.find(a => a.ano === 2026);

  const RANK_COLORS = [
    "#2563EB","#DC2626","#16A34A","#D97706","#7C3AED",
    "#0891B2","#C026D3","#EA580C","#65A30D","#BE123C",
    "#0D9488","#B45309","#7C3AED","#374151","#4F46E5",
    "#94A3B8",
  ];
  const top15Comps = serresComps.slice(0, 15);
  const maxTop15Adj = Math.max(...top15Comps.map(c => c.adj), 1);

  const CUADRO_PERIODOS: { key: keyof SerresCuadro["periodos"]; label: string }[] = [
    { key: "2024",     label: "2024" },
    { key: "2025",     label: "2025" },
    { key: "ytd_2026", label: "YTD 2026" },
    { key: "mat",      label: "MAT" },
  ];

  const LINE_COLORS = [
    "#2563EB","#DC2626","#16A34A","#D97706","#7C3AED",
    "#0891B2","#C026D3","#EA580C","#65A30D","#BE123C",
  ];

  const filteredTrim = (serresTendencia?.trimestres ?? []).filter(t => {
    if (qPeriodo === "Todo") return true;
    return t.startsWith(qPeriodo.replace(" YTD",""));
  });

  const qChartData = filteredTrim.map(t => {
    const [yr, mm] = t.split("-"); const mABR = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const row: Record<string,any> = { t: `${mABR[parseInt(mm)]}'${yr.slice(2)}` };
    (serresTendencia?.organismos ?? []).forEach(o => {
      row[o.shortname] = qMetrica === "adj" ? (o.data[t]?.adj ?? null) : (o.data[t]?.unidades ?? null);
    });
    return row;
  });

  const orgList  = (serresTendencia?.organismos ?? []);
  const orgNames = orgList.map(o => o.shortname);
  const Q_PERIODOS = ["Todo","2024","2025","2026 YTD"];

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Mercados Relevantes
          </h1>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
            Fuente: DWLBF.dbo.dw_datos_abiertos_licitaciones &nbsp;·&nbsp;
            Rubros: Equipamiento y Suministros Médicos + Equipamiento para Laboratorios &nbsp;·&nbsp;
            RUT LBF: 93.366.000-1
          </p>
        </div>
        <button
          onClick={() => { loadLbf(); setSerresLoaded(false); }}
          disabled={loading || serresLoading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8, border: "1px solid #E2E8F0",
            background: (loading || serresLoading) ? "#F1F5F9" : "white",
            fontSize: 12, fontWeight: 600,
            color: (loading || serresLoading) ? "#94A3B8" : "#475569",
            cursor: (loading || serresLoading) ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: (loading || serresLoading) ? "spin 0.9s linear infinite" : "none" }} />
          Actualizar
        </button>
      </div>

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
        {([
          { id: "lbf",    label: "Participación LBF" },
          { id: "serres", label: "Mercado Serres" },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${activeTab === t.id ? LBF_BLUE : "#E2E8F0"}`,
            background: activeTab === t.id ? LBF_BLUE : "white",
            color: activeTab === t.id ? "white" : "#64748B",
            borderRadius: t.id === "lbf" ? "8px 0 0 8px" : "0 8px 8px 0",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: Participación LBF ────────────────────────────────────────────── */}
      {activeTab === "lbf" && (
        <>
          {/* KPI Cards — 3 columnas por año */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {([
              { data: ano2024, label: "2024", accent: false },
              { data: ano2025, label: "2025", accent: false },
              { data: ano2026, label: ytdLabel, accent: true },
            ] as { data: LbfAno | undefined; label: string; accent: boolean }[]).map(({ data, label, accent }) => (
              <div key={label} style={{
                background: "white", borderRadius: 10,
                border: `1px solid ${accent ? "#BFDBFE" : "#E2E8F0"}`,
                padding: "14px 18px",
              }}>
                {/* Año header */}
                <div style={{
                  fontSize: 13, fontWeight: 800, color: accent ? LBF_BLUE : GRAY_DARK,
                  marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${accent ? "#BFDBFE" : "#F1F5F9"}`,
                }}>{label}</div>

                {/* Ofertado */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ofertado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", lineHeight: 1.2 }}>{fmtM5(data?.monto_ofertado ?? 0)}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtN(data?.total_items ?? 0)} ítems</div>
                </div>

                {/* Adjudicado */}
                <div style={{ marginBottom: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Adjudicado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: GREEN, lineHeight: 1.2 }}>{fmtM5(data?.monto_adjudicado ?? 0)}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtPct(data?.pct_ganado_ofertado ?? 0)} del ofertado</div>
                </div>

                {/* Lics + Ítems */}
                <div style={{ paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Lics adj</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{fmtN(data?.lics_adj ?? 0)}<span style={{ fontWeight: 400, color: "#94A3B8" }}> / {fmtN(data?.total_lics ?? 0)}</span></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(data?.tasa_adj_lics ?? 0) }}>{fmtPct(data?.tasa_adj_lics ?? 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Ítems adj</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{fmtN(data?.items_adj ?? 0)}<span style={{ fontWeight: 400, color: "#94A3B8" }}> / {fmtN(data?.total_items ?? 0)}</span></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(data?.tasa_adj_items ?? 0) }}>{fmtPct(data?.tasa_adj_items ?? 0)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly Charts — N° licitaciones participadas | adjudicadas, Ene–May */}
          {evolucion.length > 0 && (() => {
            const mesesFiltro = evolucion.filter(m => m.mes <= 5);
            let cumPart24 = 0, cumPart25 = 0, cumPart26 = 0;
            let cumAdj24  = 0, cumAdj25  = 0, cumAdj26  = 0;
            const partData: Record<string,any>[] = [];
            const adjData:  Record<string,any>[] = [];
            mesesFiltro.forEach(m => {
              const has26 = m.mes <= ult26;
              cumPart24 += m.l2024_part; cumPart25 += m.l2025_part;
              if (has26) cumPart26 += m.l2026_part;
              partData.push({ mes: m.mes_nom, "2024": cumPart24, "2025": cumPart25, "2026": has26 ? cumPart26 : null });

              cumAdj24 += m.l2024_adj; cumAdj25 += m.l2025_adj;
              if (has26) cumAdj26 += m.l2026_adj;
              adjData.push({ mes: m.mes_nom, "2024": cumAdj24, "2025": cumAdj25, "2026": has26 ? cumAdj26 : null });
            });

            const CountTooltip = ({ active, payload, label }: {
              active?: boolean;
              payload?: { name: string; value: number; color: string }[];
              label?: string;
            }) => {
              if (!active || !payload?.length) return null;
              return (
                <div style={{
                  background: "white", border: "1px solid #E2E8F0", borderRadius: 8,
                  padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: "#0F172A" }}>{label}</div>
                  {payload.map(p => p.value != null && (
                    <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
                      {p.name}: <strong>{p.value} lics</strong>
                    </div>
                  ))}
                </div>
              );
            };

            const miniChart = (data: Record<string,any>[], title: string) => (
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {title}
                </h3>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={v => String(v)}
                      tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={30}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CountTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Line type="monotone" dataKey="2024" name="2024" stroke="#CBD5E1" strokeWidth={2}
                      dot={{ r: 3, fill: "#CBD5E1" }} activeDot={{ r: 5 }} connectNulls={false} />
                    <Line type="monotone" dataKey="2025" name="2025" stroke={GRAY_BAR} strokeWidth={2}
                      dot={{ r: 3, fill: GRAY_BAR }} activeDot={{ r: 5 }} connectNulls={false} />
                    <Line type="monotone" dataKey="2026" name={`2026 (hasta ${MESES_LABEL[ult26] || "—"})`}
                      stroke={LBF_BLUE} strokeWidth={3}
                      dot={{ r: 4, fill: LBF_BLUE, strokeWidth: 2, stroke: "white" }}
                      activeDot={{ r: 6 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );

            return (
              <div style={{
                background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
                padding: "20px 24px", marginBottom: 20,
              }}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 2px" }}>
                    Evolución Acumulada — Ene a May (N° Licitaciones)
                  </h2>
                  <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
                    Cantidad acumulada de licitaciones participadas vs adjudicadas · 2024 / 2025 / 2026
                  </p>
                </div>
                <div style={{ display: "flex", gap: 32 }}>
                  {miniChart(partData, "Participadas (Ofertadas)")}
                  <div style={{ width: 1, background: "#F1F5F9", flexShrink: 0 }} />
                  {miniChart(adjData, "Adjudicadas")}
                </div>
              </div>
            );
          })()}

          {/* Year Comparison Table */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
              Resumen por Año
            </h2>
            <table style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thL, minWidth: 80 }}>Año</th>
                  <th style={{ ...thG, minWidth: 140 }} colSpan={2}>Montos</th>
                  <th style={{ ...thG, background: "#F0FDF4", color: "#166534", minWidth: 80 }}>% Adj</th>
                  <th style={{ ...thG, background: "#FFF7ED", color: "#9A3412", minWidth: 120 }} colSpan={2}>Licitaciones</th>
                  <th style={{ ...thG, background: "#FAF5FF", color: "#7C3AED", minWidth: 120 }} colSpan={2}>Ítems</th>
                </tr>
                <tr>
                  <th style={thL}></th>
                  <th style={thS}>Ofertado</th>
                  <th style={thS}>Adjudicado</th>
                  <th style={thS}>Adj/Of</th>
                  <th style={thS}>Participadas</th>
                  <th style={thS}>Adjudicadas</th>
                  <th style={thS}>Participados</th>
                  <th style={thS}>Adjudicados</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((d, i) => {
                  const isYTD = d.ano === 2026 && ult26 > 0;
                  return (
                    <tr key={d.ano} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                      <td style={tdYear}>
                        {d.ano}
                        {isYTD && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, fontWeight: 600,
                            background: "#DBEAFE", color: LBF_BLUE,
                            borderRadius: 4, padding: "1px 5px",
                          }}>
                            YTD {MESES_LABEL[ult26]}
                          </span>
                        )}
                      </td>
                      <td style={tdS}>{fmtFull(d.monto_ofertado)}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: GREEN }}>{fmtFull(d.monto_adjudicado)}</td>
                      <td style={{ ...tdS, color: pctColor(d.pct_ganado_ofertado) }}>{fmtPct(d.pct_ganado_ofertado)}</td>
                      <td style={tdS}>{fmtN(d.total_lics)}</td>
                      <td style={tdS}>{fmtN(d.lics_adj)} ({fmtPct(d.tasa_adj_lics)})</td>
                      <td style={tdS}>{fmtN(d.total_items)}</td>
                      <td style={tdS}>{fmtN(d.items_adj)} ({fmtPct(d.tasa_adj_items)})</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tipo Breakdown */}
          {tipos.length > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                Desglose por Tipo de Licitación
              </h2>
              <table style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 220 }}>Tipo</th>
                    {ANOS.map(a => (
                      <React.Fragment key={a}>
                        <th style={{ ...thG, minWidth: 130 }} colSpan={2}>
                          {a === 2026 && ult26 > 0 ? `${ytdLabel}` : a}
                        </th>
                        <th style={{ ...thG, background: "#F0FDF4", color: "#166534", minWidth: 70 }}>% Adj</th>
                        <th style={{ ...thG, background: "#FFF7ED", color: "#9A3412", minWidth: 100 }}>Lics Adj</th>
                      </React.Fragment>
                    ))}
                  </tr>
                  <tr>
                    <th style={thL}></th>
                    {ANOS.map(a => (
                      <React.Fragment key={a}>
                        <th style={thS}>Ofertado</th>
                        <th style={thS}>Adjudicado</th>
                        <th style={thS}>%</th>
                        <th style={thS}>Adj / Total</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiposUnicos.map((tipo, i) => (
                    <tr key={tipo} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                      <td style={tdL}>{TIPO_LABEL[tipo] ?? tipo}</td>
                      {ANOS.map(a => {
                        const f = byAnoTipo[`${a}-${tipo}`];
                        return (
                          <React.Fragment key={a}>
                            <td style={tdS}>{f ? fmtFull(f.monto_ofertado) : "—"}</td>
                            <td style={{ ...tdS, color: f ? GREEN : undefined, fontWeight: f ? 600 : undefined }}>
                              {f ? fmtFull(f.monto_adjudicado) : "—"}
                            </td>
                            <td style={{ ...tdS, color: f ? pctColor(f.pct_ganado) : undefined }}>
                              {f ? fmtPct(f.pct_ganado) : "—"}
                            </td>
                            <td style={tdS}>{f ? `${fmtN(f.lics_adj)} / ${fmtN(f.total_lics)}` : "—"}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── TAB: Mercado Serres ───────────────────────────────────────────────── */}
      {activeTab === "serres" && (
        <>
          {serresLoading ? (
            <div style={{ color: "#94A3B8", padding: 40, textAlign: "center" }}>Cargando datos Serres...</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", margin: 0 }}>
                  Mercado Bolsas de Aspiración — Categoría EQM
                </h2>
                <p style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                  Fuente: DWLBF.dbo.dw_datos_abiertos_licitaciones · Filtro: bolsas de aspiración quirúrgica · 2024–2026 · c/IVA incluido
                </p>
              </div>

              {/* KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                <KpiCard label="Mercado Total 2025"    value={fmtM(serres2025?.adj_mercado ?? 0)} sub={`${fmtN(serres2025?.lics_total ?? 0)} licitaciones`} />
                <KpiCard label="Mercado Total YTD 2026" value={fmtM(serres2026?.adj_mercado ?? 0)} sub={`${fmtN(serres2026?.lics_total ?? 0)} licitaciones`} accent={LBF_BLUE} />
                <KpiCard label="LBF Adjudicado 2025"  value={fmtM(serres2025?.lbf_adj ?? 0)} sub={`MS ${serres2025?.cuota_lbf ?? 0}%`} accent={GREEN} />
                <KpiCard label="LBF Adjudicado YTD 2026" value={fmtM(serres2026?.lbf_adj ?? 0)} sub={`MS ${serres2026?.cuota_lbf ?? 0}% · ef. ${serres2026?.lbf_ef_items ?? 0}%`} accent={GREEN} />
              </div>

              {/* Top 15 ranking */}
              {serresComps.length > 0 && (
                <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "20px 24px", marginBottom: 24 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                    Market Share — Top 15
                  </h2>
                  <p style={{ fontSize: 11, color: "#94A3B8", margin: "0 0 20px" }}>2024–2026 acumulado · monto adjudicado c/IVA</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {top15Comps.map((c, i) => (
                      <div key={c.rut}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                              background: RANK_COLORS[i], color: "white", fontSize: 10, fontWeight: 800, flexShrink: 0,
                            }}>{i + 1}</span>
                            <span style={{
                              fontSize: 13, fontWeight: c.es_lbf ? 800 : 500,
                              color: c.es_lbf ? LBF_BLUE : "#1F2937",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {c.nombre}
                              {c.es_lbf && <span style={{ marginLeft: 6, fontSize: 10, background: LBF_BLUE, color: "white", borderRadius: 3, padding: "0 5px" }}>LBF</span>}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0, marginLeft: 12 }}>
                            <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>{fmtM(c.adj)}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: c.es_lbf ? LBF_BLUE : GRAY_DARK, minWidth: 42, textAlign: "right" }}>
                              {c.cuota}%
                            </span>
                          </div>
                        </div>
                        <div style={{ background: "#F1F5F9", borderRadius: 4, height: 6, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 4,
                            width: `${Math.min((c.adj / maxTop15Adj) * 100, 100)}%`,
                            background: RANK_COLORS[i],
                            opacity: c.es_lbf ? 1 : 0.75,
                          }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 2 }}>
                          {fmtN(c.lics_adj)} lics adj{c.unidades > 0 ? ` · ${fmtN(c.unidades)} unid` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cuadro comparativo */}
              {serresCuadro && (
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                    Cuadro Comparativo por Período
                  </h2>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 120 }}>Período</th>
                        {CUADRO_PERIODOS.map(p => (
                          <th key={p.key} style={{ ...thG, minWidth: 80 }} colSpan={3}>
                            {p.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th style={thL}></th>
                        {CUADRO_PERIODOS.map(p => (
                          <React.Fragment key={p.key}>
                            <th style={{ ...thS, background: "#F8FAFC", color: "#374151" }}>Mercado</th>
                            <th style={{ ...thS, background: "#EFF6FF", color: LBF_BLUE }}>LBF</th>
                            <th style={{ ...thS, background: "#F0FDF4", color: "#166534" }}>MS%</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...tdL, fontWeight: 700 }}>Monto c/IVA</td>
                        {CUADRO_PERIODOS.map(p => {
                          const pd = serresCuadro.periodos[p.key];
                          return pd ? (
                            <React.Fragment key={p.key}>
                              <td style={tdS}>{fmtM(pd.mercado_adj)}</td>
                              <td style={{ ...tdS, color: GREEN, fontWeight: 700 }}>{fmtM(pd.lbf_adj)}</td>
                              <td style={{ ...tdS, fontWeight: 700, color: pctColor(pd.cuota_adj) }}>{fmtPct(pd.cuota_adj)}</td>
                            </React.Fragment>
                          ) : <React.Fragment key={p.key}><td style={tdS}>—</td><td style={tdS}>—</td><td style={tdS}>—</td></React.Fragment>;
                        })}
                      </tr>
                      <tr style={{ background: "#FAFBFC" }}>
                        <td style={{ ...tdL, fontWeight: 700 }}>Unidades</td>
                        {CUADRO_PERIODOS.map(p => {
                          const pd = serresCuadro.periodos[p.key];
                          return pd ? (
                            <React.Fragment key={p.key}>
                              <td style={tdS}>{pd.mercado_unidades > 0 ? fmtN(pd.mercado_unidades) : "—"}</td>
                              <td style={{ ...tdS, color: GREEN, fontWeight: 700 }}>{pd.lbf_unidades > 0 ? fmtN(pd.lbf_unidades) : "—"}</td>
                              <td style={{ ...tdS, fontWeight: 700, color: pd.cuota_unidades > 0 ? pctColor(pd.cuota_unidades) : "#94A3B8" }}>
                                {pd.cuota_unidades > 0 ? fmtPct(pd.cuota_unidades) : "—"}
                              </td>
                            </React.Fragment>
                          ) : <React.Fragment key={p.key}><td style={tdS}>—</td><td style={tdS}>—</td><td style={tdS}>—</td></React.Fragment>;
                        })}
                      </tr>
                    </tbody>
                  </table>
                  <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
                    MAT = Últimos 12 meses · YTD = Enero 2026 a la fecha · MS% = Market Share según adjudicación neta × 1.19
                  </p>
                </div>
              )}

              {/* Evolución tendencia */}
              {serresAnos.length > 0 && (
                <div style={{ background:"white", borderRadius:10, border:"1px solid #E2E8F0", padding:"20px 24px", marginBottom:20 }}>
                  <h2 style={{ fontSize:14, fontWeight:700, color:"#0F172A", margin:"0 0 2px" }}>Tendencia del Mercado (2022–2026)</h2>
                  <p style={{ fontSize:11, color:"#94A3B8", margin:"0 0 14px" }}>Adjudicado c/IVA por año</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={serresAnos} margin={{ top:4, right:8, left:0, bottom:0 }}>
                      <defs>
                        <linearGradient id="gradMercado" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GRAY_BAR}  stopOpacity={0.15} />
                          <stop offset="95%" stopColor={GRAY_BAR}  stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradLBF" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={LBF_BLUE} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={LBF_BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="ano" tick={{ fontSize:11, fill:"#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => v>=1e9?`$${(v/1e9).toFixed(1)}MM`:v>=1e6?`$${(v/1e6).toFixed(0)}M`:`$${v}`} tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip content={<SerresChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                      <Area type="monotone" dataKey="adj_mercado" name="Mercado Total" stroke={GRAY_BAR}  fill="url(#gradMercado)" strokeWidth={2}   dot={{ r:4, fill:GRAY_BAR  }} activeDot={{ r:6 }} />
                      <Area type="monotone" dataKey="lbf_adj"     name="LBF"           stroke={LBF_BLUE} fill="url(#gradLBF)"     strokeWidth={2.5} dot={{ r:4, fill:LBF_BLUE }} activeDot={{ r:6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tendencia trimestral por cliente */}
              {serresTendencia && serresTendencia.organismos.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  {/* Header + filtros */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                    <div>
                      <h2 style={{ fontSize:14, fontWeight:700, color:"#0F172A", margin:"0 0 2px" }}>Tendencia por Trimestre — LBF vs Competidores</h2>
                      <p style={{ fontSize:11, color:"#94A3B8", margin:0 }}>Adjudicado c/IVA por trimestre · LBF destacado + top 7 competidores</p>
                    </div>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      {/* Métrica toggle */}
                      <div style={{ display:"flex", gap:0 }}>
                        {(["adj","unidades"] as const).map((m,i) => (
                          <button key={m} onClick={()=>setQMetrica(m)} style={{
                            padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer",
                            border:`1px solid ${qMetrica===m?"#7C3AED":"#E2E8F0"}`,
                            background:qMetrica===m?"#7C3AED":"white",
                            color:qMetrica===m?"white":"#64748B",
                            borderRadius:i===0?"6px 0 0 6px":"0 6px 6px 0",
                          }}>{m==="adj"?"Monto":"Unidades"}</button>
                        ))}
                      </div>
                      {/* Período filter */}
                      <div style={{ display:"flex", gap:4 }}>
                        {Q_PERIODOS.map(p => (
                          <button key={p} onClick={()=>setQPeriodo(p)} style={{
                            padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer",
                            border:`1px solid ${qPeriodo===p?LBF_BLUE:"#E2E8F0"}`,
                            background:qPeriodo===p?LBF_BLUE:"white",
                            color:qPeriodo===p?"white":"#64748B",
                            borderRadius:6,
                          }}>{p}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ background:"white", borderRadius:10, border:"1px solid #E2E8F0", padding:"20px 24px" }}>
                    {qChartData.length === 0 ? (
                      <div style={{ color:"#94A3B8", textAlign:"center", padding:32 }}>Sin datos para el período seleccionado</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={qChartData} margin={{ top:4, right:16, left:0, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="t" tick={{ fontSize:10, fill:"#64748B" }} axisLine={false} tickLine={false} />
                          <YAxis
                            tickFormatter={v=>v>=1e9?`$${(v/1e9).toFixed(1)}MM`:v>=1e6?`$${(v/1e6).toFixed(0)}M`:qMetrica==="unidades"?fmtN(v):`$${v}`}
                            tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false} width={68}
                          />
                          <Tooltip
                            formatter={(value:any, name:any) => [
                              qMetrica==="adj" ? fmtFull(Number(value)) : fmtN(Number(value)),
                              name,
                            ]}
                            contentStyle={{ fontSize:12, borderRadius:8, border:"1px solid #E2E8F0" }}
                            labelStyle={{ fontWeight:700, marginBottom:4 }}
                          />
                          <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                          {orgList.map((org, i) => {
                            const isLBF = org.es_lbf;
                            const color = isLBF ? LBF_BLUE : LINE_COLORS[1 + (i - (orgList.findIndex(o=>o.es_lbf) < i ? 1 : 0)) % (LINE_COLORS.length - 1)];
                            return (
                              <Line
                                key={org.shortname}
                                type="monotone"
                                dataKey={org.shortname}
                                name={org.shortname}
                                stroke={color}
                                strokeWidth={isLBF ? 3 : 1.5}
                                strokeDasharray={isLBF ? undefined : undefined}
                                dot={{ r: isLBF ? 5 : 2.5, fill: color, strokeWidth: isLBF ? 2 : 0, stroke: "white" }}
                                activeDot={{ r: isLBF ? 7 : 5 }}
                                connectNulls={false}
                                zIndex={isLBF ? 10 : 1}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              )}

              {/* Oportunidades table */}
              {serresOport.length > 0 && (
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                    Oportunidades No Capturadas (2024–2026)
                  </h2>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 110 }}>Código</th>
                        <th style={{ ...thS, textAlign: "center", minWidth: 60 }}>Tipo</th>
                        <th style={{ ...thL, minWidth: 200 }}>Organismo</th>
                        <th style={{ ...thL, minWidth: 180 }}>Ganador</th>
                        <th style={{ ...thS, minWidth: 90 }}>Fecha</th>
                        <th style={{ ...thS, minWidth: 130 }}>Adj c/IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serresOport.map((o, i) => (
                        <tr key={`${o.codigo}-${i}`} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                          <td style={{ ...tdL, fontFamily: "monospace", fontSize: 11, color: "#475569" }}>{o.codigo}</td>
                          <td style={{ ...tdS, textAlign: "center", color: GRAY_DARK }}>{o.tipo ?? "—"}</td>
                          <td style={tdL}>{o.organismo}</td>
                          <td style={{ ...tdL, color: "#DC2626" }}>{o.ganador}</td>
                          <td style={{ ...tdS, color: GRAY_DARK }}>{fmtFecha(o.fecha)}</td>
                          <td style={{ ...tdS, fontWeight: 700, color: "#DC2626" }}>{fmtFull(o.adj)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}    </div>
  );
}
















