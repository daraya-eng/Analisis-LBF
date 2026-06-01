"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, clearClientCache } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, LabelList,
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

interface TipoPeriodo {
  tipo: string;
  total_lics_25: number; lics_adj_25: number; items_adj_25: number; monto_adj_25: number;
  total_lics_26: number; lics_adj_26: number; items_adj_26: number; monto_adj_26: number;
}

interface PerdidoItem {
  codigo: string;
  codigo_item: number;
  producto: string;
  organismo: string;
  tipo: string;
  fecha_adj: string;
  lbf_precio: number;
  lbf_precio_unit: number;
  ganador_precio: number;
  ganador_precio_unit?: number;
  ganador_nombre: string;
  dif_pct?: number;
}

interface PerdidosResumen {
  lics_part: number;
  lics_adj: number;
  items_part: number;
  items_adj: number;
  items_inadmisibles: number;
  lics_inadmisibles: number;
  items_menor_precio: number;
}

interface PorTipoInadmisible {
  tipo: string;
  lics: number;
  items: number;
}

interface DrillProveedor {
  nombre: string;
  rut: string;
  es_lbf: boolean;
  estado_oferta: string;
  seleccionada: boolean;
  precio_unit: number;
  precio_total: number;
  cantidad_req: number;
}

interface DrillItemData {
  codigo_item: number;
  producto: string;
  proveedores: DrillProveedor[];
}

interface DrillResult {
  codigo: string;
  items: DrillItemData[];
}

interface MesData {
  mes: number;
  mes_nom: string;
  v2024_of: number; v2024_adj: number; l2024_part: number; l2024_adj: number; i2024_part: number; i2024_adj: number;
  v2025_of: number; v2025_adj: number; l2025_part: number; l2025_adj: number; i2025_part: number; i2025_adj: number;
  v2026_of: number; v2026_adj: number; l2026_part: number; l2026_adj: number; i2026_part: number; i2026_adj: number;
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
const fmtN   = (n: number | undefined | null): string => (n ?? 0).toLocaleString("es-CL");

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

const card: React.CSSProperties = {
  background: "white", borderRadius: 10, padding: "14px 18px",
  border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

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
  const [activeTab, setActiveTab] = useState<"lbf" | "serres" | "perdidos">("lbf");

  // tab lbf
  const [summary, setSummary]           = useState<LbfAno[]>([]);
  const [tiposPeriodo, setTiposPeriodo] = useState<TipoPeriodo[]>([]);
  const [evolucion, setEvolucion]       = useState<MesData[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // tab perdidos
  const [perdidosAno, setPerdidosAno]         = useState(2025);
  const [perdidosMes, setPerdidosMes]         = useState(0);
  const [perdidosTipo, setPerdidosTipo]       = useState<string | null>(null);
  const [perdidosData, setPerdidosData]       = useState<{ aceptadas: PerdidoItem[]; rechazadas: PerdidoItem[]; resumen: PerdidosResumen; inadmisibles_por_tipo: PorTipoInadmisible[] } | null>(null);
  const [perdidosLoading, setPerdidosLoading] = useState(false);
  const [expandedRowKey, setExpandedRowKey]   = useState<string | null>(null);
  const [drillData, setDrillData]             = useState<Record<string, DrillResult>>({});
  const [drillLoading, setDrillLoading]       = useState<Set<string>>(new Set());
  const drillInFlight                         = useRef<Set<string>>(new Set());
  const drillDataRef                          = useRef<Record<string, DrillResult>>({});
  const [drillError, setDrillError]           = useState<Record<string, string>>({});
  const [showAllA, setShowAllA]               = useState(false);
  const [showAllB, setShowAllB]               = useState(false);

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
      api.get<{ meses: MesData[]; error?: string }>("/api/mercados-relevantes/evolucion-mensual", { noCache: true }),
      api.get<{ filas: TipoPeriodo[]; error?: string }>("/api/mercados-relevantes/licitaciones-lbf-tipo-periodo", { noCache: true }),
    ]).then(([s, e, tp]) => {
      if (s.error) { setError(s.error); setLoading(false); return; }
      setSummary(s.anos ?? []);
      setEvolucion(e.meses ?? []);
      setTiposPeriodo(tp.filas ?? []);
      setLoading(false);
    }).catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  useEffect(() => { loadLbf(); }, [loadLbf]);

  const loadPerdidos = useCallback((ano: number, mes: number) => {
    setPerdidosLoading(true);
    setPerdidosData(null);
    setExpandedRowKey(null);
    drillDataRef.current = {};
    setDrillData({});
    setDrillError({});
    setShowAllA(false);
    setShowAllB(false);
    clearClientCache();
    const emptyResumen: PerdidosResumen = { lics_part: 0, lics_adj: 0, items_part: 0, items_adj: 0, items_inadmisibles: 0, lics_inadmisibles: 0, items_menor_precio: 0 };
    api.get<{ aceptadas: PerdidoItem[]; rechazadas: PerdidoItem[]; resumen: PerdidosResumen; inadmisibles_por_tipo: PorTipoInadmisible[]; error?: string }>(
      `/api/mercados-relevantes/perdidos-precio?ano=${ano}&mes=${mes}`,
      { noCache: true }
    ).then(r => {
      setPerdidosData({
        aceptadas: r.aceptadas ?? [],
        rechazadas: r.rechazadas ?? [],
        resumen: (r.resumen && typeof (r.resumen as PerdidosResumen).lics_part === "number") ? r.resumen as PerdidosResumen : emptyResumen,
        inadmisibles_por_tipo: r.inadmisibles_por_tipo ?? [],
      });
      setPerdidosLoading(false);
    }).catch(() => {
      setPerdidosData({ aceptadas: [], rechazadas: [], resumen: emptyResumen, inadmisibles_por_tipo: [] });
      setPerdidosLoading(false);
    });
  }, []);

  const loadDrill = useCallback((codigo: string) => {
    if (drillDataRef.current[codigo] || drillInFlight.current.has(codigo)) return;
    drillInFlight.current.add(codigo);
    setDrillError(prev => { const n = { ...prev }; delete n[codigo]; return n; });
    setDrillLoading(prev => new Set([...prev, codigo]));
    const timedOut = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("timeout")), 15000)
    );
    Promise.race([
      api.get<DrillResult>(`/api/mercados-relevantes/perdidos-licitacion?codigo=${codigo}`, { noCache: true }),
      timedOut,
    ]).then(r => {
      drillInFlight.current.delete(codigo);
      drillDataRef.current = { ...drillDataRef.current, [codigo]: r };
      setDrillData(drillDataRef.current);
      setDrillLoading(prev => { const s = new Set(prev); s.delete(codigo); return s; });
    }).catch((err: unknown) => {
      drillInFlight.current.delete(codigo);
      const isTimeout = (err as Error)?.message === "timeout";
      setDrillError(prev => ({
        ...prev,
        [codigo]: isTimeout ? "Consulta lenta — haz clic para reintentar" : "Error al cargar — haz clic para reintentar",
      }));
      setDrillLoading(prev => { const s = new Set(prev); s.delete(codigo); return s; });
    });
  }, []); // stable — reads drillDataRef/drillInFlight refs directly

  const toggleDrill = useCallback((codigo: string, rowKey: string) => {
    setExpandedRowKey(prev => prev === rowKey ? null : rowKey);
    loadDrill(codigo); // guard inside loadDrill prevents duplicate requests
  }, [loadDrill]); // loadDrill is stable so toggleDrill is also stable

  useEffect(() => {
    if (activeTab === "perdidos" && !perdidosData && !perdidosLoading) {
      loadPerdidos(perdidosAno, perdidosMes);
    }
  }, [activeTab, perdidosData, perdidosLoading, perdidosAno, perdidosMes, loadPerdidos]);

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
          { id: "lbf",      label: "Participación LBF",   first: true,  last: false },
          { id: "serres",   label: "Mercado Serres",       first: false, last: false },
          { id: "perdidos", label: "🔴 Perdidos ↓ Precio", first: false, last: true  },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${activeTab === t.id ? LBF_BLUE : "#E2E8F0"}`,
            background: activeTab === t.id ? LBF_BLUE : "white",
            color: activeTab === t.id ? "white" : "#64748B",
            borderRadius: t.first ? "8px 0 0 8px" : t.last ? "0 8px 8px 0" : "0",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: Participación LBF ────────────────────────────────────────────── */}
      {activeTab === "lbf" && (
        <>
          {/* KPI Cards — 3 columnas por año */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {([
              { data: ano2024, label: "2024",    headerBg: "#1E3A5F", accent: false },
              { data: ano2025, label: "2025",    headerBg: "#1A4A6B", accent: false },
              { data: ano2026, label: ytdLabel,  headerBg: LBF_BLUE,  accent: true  },
            ] as { data: LbfAno | undefined; label: string; headerBg: string; accent: boolean }[]).map(({ data, label, headerBg, accent }) => (
              <div key={label} style={{
                background: "white", borderRadius: 10, overflow: "hidden",
                border: "1px solid #E2E8F0",
                boxShadow: accent ? "0 2px 12px rgba(37,99,235,0.12)" : "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                {/* Header con color */}
                <div style={{
                  background: headerBg, padding: "10px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "white", letterSpacing: "0.02em" }}>
                    Licitaciones {label}
                  </div>
                  {accent && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.2)", color: "white", padding: "2px 8px", borderRadius: 20 }}>
                      En curso
                    </span>
                  )}
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {/* Ofertado */}
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Ofertado</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", lineHeight: 1.1 }}>{fmtM5(data?.monto_ofertado ?? 0)}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtN(data?.total_items ?? 0)} ítems participados</div>
                  </div>

                  {/* Adjudicado */}
                  <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Adjudicado</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: GREEN, lineHeight: 1.1 }}>{fmtM5(data?.monto_adjudicado ?? 0)}</div>
                    <div style={{ fontSize: 11, color: "#86EFAC", marginTop: 2 }}>{fmtPct(data?.pct_ganado_ofertado ?? 0)} del ofertado</div>
                  </div>

                  {/* Lics + Ítems */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Lics adj</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>
                        {fmtN(data?.lics_adj ?? 0)}<span style={{ fontWeight: 400, color: "#CBD5E1", fontSize: 13 }}> / {fmtN(data?.total_lics ?? 0)}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(data?.tasa_adj_lics ?? 0), marginTop: 2 }}>
                        {fmtPct(data?.tasa_adj_lics ?? 0)} tasa
                      </div>
                    </div>
                    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Ítems adj</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>
                        {fmtN(data?.items_adj ?? 0)}<span style={{ fontWeight: 400, color: "#CBD5E1", fontSize: 13 }}> / {fmtN(data?.total_items ?? 0)}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(data?.tasa_adj_items ?? 0), marginTop: 2 }}>
                        {fmtPct(data?.tasa_adj_items ?? 0)} tasa
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tendencia mensual ítems — últimos 15 meses */}
          {evolucion.length > 0 && (() => {
            // Construir timeline de últimos 15 meses
            const today = new Date();
            const timeline: { year: number; month: number; label: string }[] = [];
            for (let i = 15; i >= 1; i--) {
              const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
              const y = d.getFullYear();
              const m = d.getMonth() + 1;
              timeline.push({ year: y, month: m, label: `${MESES_LABEL[m]}'${String(y).slice(2)}` });
            }

            const chartData = timeline.map(({ year, month, label }) => {
              const row = evolucion.find(r => r.mes === month);
              if (!row) return { label, part: null, adj: null, tasa: null };
              let part: number | null = null;
              let adj:  number | null = null;
              if (year === 2024) { part = row.i2024_part; adj = row.i2024_adj; }
              else if (year === 2025) { part = row.i2025_part; adj = row.i2025_adj; }
              else if (year === 2026 && month <= ult26) { part = row.i2026_part; adj = row.i2026_adj; }
              const tasa = part && part > 0 ? Math.round(((adj ?? 0) / part) * 100) : null;
              return { label, part, adj, tasa };
            }).filter(r => r.part !== null);

            const ItemsTooltip = ({ active, payload, label }: {
              active?: boolean;
              payload?: { name: string; value: number; color: string }[];
              label?: string;
            }) => {
              if (!active || !payload?.length) return null;
              const part = payload.find(p => p.name === "Participados")?.value ?? 0;
              const adj  = payload.find(p => p.name === "Adjudicados")?.value ?? 0;
              const tasa = payload.find(p => p.name === "Tasa %")?.value;
              return (
                <div style={{
                  background: "white", border: "1px solid #E2E8F0", borderRadius: 8,
                  padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: "#0F172A" }}>{label}</div>
                  <div style={{ color: "#64748B", marginBottom: 2 }}>Participados: <strong style={{ color: "#0F172A" }}>{part}</strong></div>
                  <div style={{ color: GREEN, marginBottom: 4 }}>Adjudicados: <strong>{adj}</strong></div>
                  {tasa != null && (
                    <div style={{ color: "#D97706", fontWeight: 700, borderTop: "1px solid #F1F5F9", paddingTop: 4 }}>
                      Tasa adj: {tasa.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div style={{
                background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
                padding: "20px 24px", marginBottom: 20,
              }}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 2px" }}>
                    Tendencia Mensual — Ítems (últimos 15 meses)
                  </h2>
                  <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>
                    Ítems participados vs adjudicados · línea naranja = tasa de adjudicación %
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 36, right: 52, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151", fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="items" tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: "#B45309", fontWeight: 600 }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip content={<ItemsTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10, color: "#374151" }} />
                    <Bar yAxisId="items" dataKey="part" name="Participados" fill="#A5B4FC" radius={[4,4,0,0]}>
                      <LabelList dataKey="part" position="top" style={{ fontSize: 10, fill: "#3730A3", fontWeight: 600 }} />
                    </Bar>
                    <Bar yAxisId="items" dataKey="adj" name="Adjudicados" fill="#4ADE80" radius={[4,4,0,0]}>
                      <LabelList dataKey="adj" position="top" style={{ fontSize: 10, fill: "#14532D", fontWeight: 700 }} />
                    </Bar>
                    <Line yAxisId="pct" type="monotone" dataKey="tasa" name="Tasa %"
                      stroke="#D97706" strokeWidth={2.5} dot={{ r: 4, fill: "#D97706", stroke: "white", strokeWidth: 2 }}
                      activeDot={{ r: 6 }} connectNulls={false}>
                      <LabelList dataKey="tasa" position="top" offset={10} style={{ fontSize: 12, fill: "#B45309", fontWeight: 800, letterSpacing: "-0.02em" }}
                        formatter={(v: number) => `${v}%`} />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Comparación mismo período Ene–May */}
          {evolucion.length > 0 && (() => {
            const mesesData = [1,2,3,4,5]
              .map(m => evolucion.find(r => r.mes === m))
              .filter((r): r is MesData => !!r);

            const tot = (key: keyof MesData) =>
              mesesData.reduce((s, r) => s + (r[key] as number), 0);

            const varPct = (a: number, b: number): number | null =>
              b > 0 ? parseFloat(((a - b) / b * 100).toFixed(1)) : null;

            const VarBadge = ({ a, b }: { a: number; b: number }) => {
              const v = varPct(a, b);
              if (v === null) return <span style={{ color: "#94A3B8", fontSize: 10 }}>—</span>;
              const pos = v >= 0;
              return (
                <span style={{
                  display: "inline-block", marginLeft: 6, fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 10,
                  background: pos ? "#DCFCE7" : "#FEE2E2",
                  color: pos ? "#15803D" : "#B91C1C",
                }}>
                  {pos ? "▲" : "▼"} {Math.abs(v)}%
                </span>
              );
            };

            const thY: React.CSSProperties = { ...thG, minWidth: 110 };
            const thVar: React.CSSProperties = { ...thG, minWidth: 80, background: "#F8FAFC", color: "#475569", fontSize: 10 };

            const rows = [
              ...mesesData.map(r => ({
                label: r.mes_nom,
                bold: false,
                adj24: r.v2024_adj, adj25: r.v2025_adj, adj26: r.v2026_adj,
                items24: r.i2024_adj, items25: r.i2025_adj, items26: r.i2026_adj,
                lics24: r.l2024_adj, lics25: r.l2025_adj, lics26: r.l2026_adj,
              })),
              {
                label: "Total Ene–May",
                bold: true,
                adj24: tot("v2024_adj"), adj25: tot("v2025_adj"), adj26: tot("v2026_adj"),
                items24: tot("i2024_adj"), items25: tot("i2025_adj"), items26: tot("i2026_adj"),
                lics24: tot("l2024_adj"), lics25: tot("l2025_adj"), lics26: tot("l2026_adj"),
              },
            ];

            return (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                  Comparación Mismo Período — Ene a May (2025 vs 2026)
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 100 }}>Mes</th>
                        <th style={{ ...thG, minWidth: 280 }} colSpan={3}>Monto Adjudicado</th>
                        <th style={{ ...thG, background: "#FFF7ED", color: "#9A3412", minWidth: 210 }} colSpan={3}>Ítems Adjudicados</th>
                        <th style={{ ...thG, background: "#F0FDF4", color: "#166534", minWidth: 210 }} colSpan={3}>Licitaciones Adj</th>
                      </tr>
                      <tr>
                        <th style={thL}></th>
                        <th style={thS}>2025</th>
                        <th style={thS}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                        <th style={{ ...thS, background: "#FFF7ED" }}>2025</th>
                        <th style={{ ...thS, background: "#FFF7ED" }}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                        <th style={{ ...thS, background: "#F0FDF4" }}>2025</th>
                        <th style={{ ...thS, background: "#F0FDF4" }}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const isTot = r.bold;
                        const bg = isTot ? "#F0F9FF" : i % 2 === 1 ? "#FAFBFC" : undefined;
                        const fw = isTot ? 800 : undefined;
                        return (
                          <tr key={r.label} style={{ background: bg }}>
                            <td style={{ ...tdL, fontWeight: fw ?? 600, color: isTot ? LBF_BLUE : undefined, borderTop: isTot ? "2px solid #BFDBFE" : undefined }}>
                              {r.label}
                            </td>
                            <td style={{ ...tdS, fontWeight: fw }}>{fmtM5(r.adj25)}</td>
                            <td style={{ ...tdS, fontWeight: fw, color: GREEN }}>{fmtM5(r.adj26)}</td>
                            <td style={tdS}><VarBadge a={r.adj26} b={r.adj25} /></td>
                            <td style={{ ...tdS, fontWeight: fw }}>{fmtN(r.items25)}</td>
                            <td style={{ ...tdS, fontWeight: fw }}>{fmtN(r.items26)}</td>
                            <td style={tdS}><VarBadge a={r.items26} b={r.items25} /></td>
                            <td style={{ ...tdS, fontWeight: fw }}>{fmtN(r.lics25)}</td>
                            <td style={{ ...tdS, fontWeight: fw }}>{fmtN(r.lics26)}</td>
                            <td style={tdS}><VarBadge a={r.lics26} b={r.lics25} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Tipo Breakdown — mismo período Ene–May 2025 vs 2026 */}
          {tiposPeriodo.length > 0 && (() => {
            const varPctT = (a: number, b: number): number | null =>
              b > 0 ? parseFloat(((a - b) / b * 100).toFixed(1)) : null;

            const VarBadgeT = ({ a, b }: { a: number; b: number }) => {
              const v = varPctT(a, b);
              if (v === null) return <span style={{ color: "#94A3B8", fontSize: 10 }}>—</span>;
              const pos = v >= 0;
              return (
                <span style={{
                  display: "inline-block", marginLeft: 6, fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 10,
                  background: pos ? "#DCFCE7" : "#FEE2E2",
                  color: pos ? "#15803D" : "#B91C1C",
                }}>
                  {pos ? "▲" : "▼"} {Math.abs(v)}%
                </span>
              );
            };

            const totTP = (key: keyof TipoPeriodo) =>
              tiposPeriodo.reduce((s, r) => s + (r[key] as number), 0);

            return (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                  Desglose por Tipo de Licitación — Mismo Período Ene–May (2025 vs 2026)
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thL, minWidth: 200 }}>Tipo</th>
                        <th style={{ ...thG, minWidth: 270 }} colSpan={3}>Monto Adjudicado</th>
                        <th style={{ ...thG, background: "#FFF7ED", color: "#9A3412", minWidth: 200 }} colSpan={3}>Ítems Adjudicados</th>
                        <th style={{ ...thG, background: "#F0FDF4", color: "#166534", minWidth: 200 }} colSpan={3}>Licitaciones Adj</th>
                      </tr>
                      <tr>
                        <th style={thL}></th>
                        <th style={thS}>2025</th>
                        <th style={thS}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                        <th style={{ ...thS, background: "#FFF7ED" }}>2025</th>
                        <th style={{ ...thS, background: "#FFF7ED" }}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                        <th style={{ ...thS, background: "#F0FDF4" }}>2025</th>
                        <th style={{ ...thS, background: "#F0FDF4" }}>2026</th>
                        <th style={{ ...thS, background: "#F8FAFC" }}>Var</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiposPeriodo.map((r, i) => (
                        <tr key={r.tipo} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                          <td style={{ ...tdL, fontWeight: 600 }}>{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                          <td style={tdS}>{fmtM5(r.monto_adj_25)}</td>
                          <td style={{ ...tdS, color: GREEN, fontWeight: 600 }}>{fmtM5(r.monto_adj_26)}</td>
                          <td style={tdS}><VarBadgeT a={r.monto_adj_26} b={r.monto_adj_25} /></td>
                          <td style={tdS}>{fmtN(r.items_adj_25)}</td>
                          <td style={tdS}>{fmtN(r.items_adj_26)}</td>
                          <td style={tdS}><VarBadgeT a={r.items_adj_26} b={r.items_adj_25} /></td>
                          <td style={tdS}>{fmtN(r.lics_adj_25)}</td>
                          <td style={tdS}>{fmtN(r.lics_adj_26)}</td>
                          <td style={tdS}><VarBadgeT a={r.lics_adj_26} b={r.lics_adj_25} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#F0F9FF", borderTop: "2px solid #BFDBFE" }}>
                        <td style={{ ...tdL, fontWeight: 800, color: LBF_BLUE }}>Total Ene–May</td>
                        <td style={{ ...tdS, fontWeight: 800 }}>{fmtM5(totTP("monto_adj_25"))}</td>
                        <td style={{ ...tdS, fontWeight: 800, color: GREEN }}>{fmtM5(totTP("monto_adj_26"))}</td>
                        <td style={tdS}><VarBadgeT a={totTP("monto_adj_26")} b={totTP("monto_adj_25")} /></td>
                        <td style={{ ...tdS, fontWeight: 800 }}>{fmtN(totTP("items_adj_25"))}</td>
                        <td style={{ ...tdS, fontWeight: 800 }}>{fmtN(totTP("items_adj_26"))}</td>
                        <td style={tdS}><VarBadgeT a={totTP("items_adj_26")} b={totTP("items_adj_25")} /></td>
                        <td style={{ ...tdS, fontWeight: 800 }}>{fmtN(totTP("lics_adj_25"))}</td>
                        <td style={{ ...tdS, fontWeight: 800 }}>{fmtN(totTP("lics_adj_26"))}</td>
                        <td style={tdS}><VarBadgeT a={totTP("lics_adj_26")} b={totTP("lics_adj_25")} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
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
      )}

      {/* ── TAB: Perdidos ↓ Precio ───────────────────────────────────────────── */}
      {activeTab === "perdidos" && (
        <>
          {/* Filtros año / mes / tipo */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Año:</span>
            {[2024, 2025, 2026].map(a => (
              <button key={a} onClick={() => {
                setPerdidosAno(a); setPerdidosTipo(null);
                loadPerdidos(a, perdidosMes);
              }} style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${perdidosAno === a ? LBF_BLUE : "#E2E8F0"}`,
                background: perdidosAno === a ? LBF_BLUE : "white",
                color: perdidosAno === a ? "white" : "#64748B",
                borderRadius: 6,
              }}>{a}</button>
            ))}
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginLeft: 6 }}>Mes:</span>
            {[{ v: 0, l: "Todo" }, { v: 1, l: "Ene" }, { v: 2, l: "Feb" }, { v: 3, l: "Mar" },
              { v: 4, l: "Abr" }, { v: 5, l: "May" }, { v: 6, l: "Jun" },
              { v: 7, l: "Jul" }, { v: 8, l: "Ago" }, { v: 9, l: "Sep" },
              { v: 10, l: "Oct" }, { v: 11, l: "Nov" }, { v: 12, l: "Dic" }].map(m => (
              <button key={m.v} onClick={() => {
                setPerdidosMes(m.v); setPerdidosTipo(null);
                loadPerdidos(perdidosAno, m.v);
              }} style={{
                padding: "5px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${perdidosMes === m.v ? "#7C3AED" : "#E2E8F0"}`,
                background: perdidosMes === m.v ? "#7C3AED" : "white",
                color: perdidosMes === m.v ? "white" : "#64748B",
                borderRadius: 6,
              }}>{m.l}</button>
            ))}
            {perdidosData && (() => {
              const tipos = [...new Set([
                ...perdidosData.aceptadas.map(r => r.tipo),
                ...perdidosData.rechazadas.map(r => r.tipo),
              ])].filter(Boolean).sort();
              if (tipos.length < 2) return null;
              return (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginLeft: 6 }}>Tipo:</span>
                  <button onClick={() => setPerdidosTipo(null)} style={{
                    padding: "5px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${perdidosTipo === null ? "#0891B2" : "#E2E8F0"}`,
                    background: perdidosTipo === null ? "#0891B2" : "white",
                    color: perdidosTipo === null ? "white" : "#64748B", borderRadius: 6,
                  }}>Todos</button>
                  {tipos.map(t => (
                    <button key={t} onClick={() => setPerdidosTipo(t === perdidosTipo ? null : t)} style={{
                      padding: "5px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${perdidosTipo === t ? "#0891B2" : "#E2E8F0"}`,
                      background: perdidosTipo === t ? "#0891B2" : "white",
                      color: perdidosTipo === t ? "white" : "#64748B", borderRadius: 6,
                    }}>{TIPO_LABEL[t]?.split(" — ")[0] ?? t}</button>
                  ))}
                </>
              );
            })()}
          </div>

          {perdidosLoading && (
            <div style={{ textAlign: "center", color: "#94A3B8", padding: 60 }}>Cargando análisis...</div>
          )}

          {!perdidosLoading && perdidosData && (() => {
            const { aceptadas, rechazadas, resumen, inadmisibles_por_tipo } = perdidosData;
            const aceptadasF = perdidosTipo ? aceptadas.filter(r => r.tipo === perdidosTipo) : aceptadas;
            const rechazadasF = perdidosTipo ? rechazadas.filter(r => r.tipo === perdidosTipo) : rechazadas;
            const DRILL_PAGE = 50;
            const displayA = showAllA ? aceptadasF : aceptadasF.slice(0, DRILL_PAGE);
            const displayB = showAllB ? rechazadasF : rechazadasF.slice(0, DRILL_PAGE);
            const montoEnJuego = aceptadasF.reduce((s, r) => s + r.lbf_precio, 0);
            const avgDif = aceptadasF.length > 0
              ? aceptadasF.reduce((s, r) => s + (r.dif_pct ?? 0), 0) / aceptadasF.length : 0;

            const thP: React.CSSProperties = { ...thL, padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
            const thPS: React.CSSProperties = { ...thS, padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
            const tdP: React.CSSProperties = { ...tdL, padding: "6px 10px", fontSize: 12 };
            const tdPS: React.CSSProperties = { ...tdS, padding: "6px 10px", fontSize: 12 };

            return (
              <>
                {/* ── Resumen KPIs ─────────────────────────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
                  <div style={{ ...card, borderTop: "3px solid #2563EB" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>Lics participadas</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB" }}>{fmtN(resumen.lics_part)}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtN(resumen.lics_adj)} adjudicadas</div>
                  </div>
                  <div style={{ ...card, borderTop: "3px solid #16A34A" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>Ítems adjudicados</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#16A34A" }}>{fmtN(resumen.items_adj)}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      {resumen.items_part > 0 ? `${((resumen.items_adj / resumen.items_part) * 100).toFixed(1)}%` : "—"} de {fmtN(resumen.items_part)}
                    </div>
                  </div>
                  <div style={{ ...card, borderTop: "3px solid #EF4444" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>🟡 Perdidos menor precio</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>{fmtN(resumen.items_menor_precio)}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtM(montoEnJuego)} ofertado</div>
                  </div>
                  <div style={{ ...card, borderTop: "3px solid #D97706" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>Dif. prom. vs ganador</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#D97706" }}>+{avgDif.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>ganador cobró más que LBF</div>
                  </div>
                  <div style={{ ...card, borderTop: "3px solid #64748B" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>🔴 Inadmisibles</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#64748B" }}>{fmtN(resumen.items_inadmisibles)}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtN(resumen.lics_inadmisibles)} licitaciones</div>
                  </div>
                </div>

                {/* ── Inadmisibles por tipo ─────────────────────────────────── */}
                {inadmisibles_por_tipo.length > 0 && (
                  <div style={{ ...card, marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
                      🔴 Inadmisibles por Tipo de Licitación
                    </div>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thL, padding: "5px 10px", fontSize: 11 }}>Tipo</th>
                          <th style={{ ...thS, padding: "5px 10px", fontSize: 11 }}>Licitaciones</th>
                          <th style={{ ...thS, padding: "5px 10px", fontSize: 11 }}>Ítems rechazados</th>
                          <th style={{ ...thS, padding: "5px 10px", fontSize: 11 }}>% del total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inadmisibles_por_tipo.map((r, i) => {
                          const tot = inadmisibles_por_tipo.reduce((s, x) => s + x.items, 0);
                          return (
                            <tr key={r.tipo} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                              <td style={{ ...tdL, padding: "5px 10px", fontSize: 12 }}>{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                              <td style={{ ...tdS, padding: "5px 10px", fontSize: 12 }}>{fmtN(r.lics)}</td>
                              <td style={{ ...tdS, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>{fmtN(r.items)}</td>
                              <td style={{ ...tdS, padding: "5px 10px", fontSize: 12, color: "#D97706" }}>
                                {tot > 0 ? `${((r.items / tot) * 100).toFixed(1)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Grupo A — Admisibles con menor precio ────────────────── */}
                <div style={{ marginBottom: 32 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                    background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 16px",
                  }}>
                    <span style={{ fontSize: 16 }}>🟡</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>
                        Admisibles — Precio mínimo, no adjudicadas ({fmtN(aceptadasF.length)} ítems)
                      </div>
                      <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 2 }}>
                        LBF era el más barato pero no ganó · Clic en código para ver todos los oferentes
                      </div>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thP, minWidth: 120 }}>Código</th>
                          <th style={{ ...thP, minWidth: 190 }}>Producto</th>
                          <th style={{ ...thP, minWidth: 150 }}>Organismo</th>
                          <th style={{ ...thPS, minWidth: 46 }}>Tipo</th>
                          <th style={{ ...thPS, minWidth: 82 }}>Fecha Adj.</th>
                          <th style={{ ...thPS, minWidth: 88, background: "#EFF6FF", color: "#1E40AF" }}>LBF Unit</th>
                          <th style={{ ...thPS, minWidth: 96, background: "#EFF6FF", color: "#1E40AF" }}>LBF Total</th>
                          <th style={{ ...thPS, minWidth: 88, background: "#FEF2F2", color: "#991B1B" }}>Gan. Unit</th>
                          <th style={{ ...thPS, minWidth: 96, background: "#FEF2F2", color: "#991B1B" }}>Gan. Total</th>
                          <th style={{ ...thPS, minWidth: 58, background: "#F5F3FF", color: "#5B21B6" }}>Dif %</th>
                          <th style={{ ...thP, minWidth: 160 }}>Ganador</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayA.map((r, i) => {
                          const rowKey = `a-${r.codigo}-${i}`;
                          const isExp = expandedRowKey === rowKey;
                          return (
                            <React.Fragment key={`${r.codigo}-${r.codigo_item}-${i}`}>
                              <tr style={{ background: isExp ? "#EFF6FF" : i % 2 === 1 ? "#FAFBFC" : undefined }}>
                                <td style={{ ...tdP, fontFamily: "monospace", fontSize: 11 }}>
                                  <button onClick={() => toggleDrill(r.codigo, rowKey)} style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    color: LBF_BLUE, fontWeight: 700, fontSize: 11, fontFamily: "monospace",
                                    padding: 0, display: "flex", alignItems: "center", gap: 4,
                                  }} title="Ver todos los oferentes">
                                    <span style={{ fontSize: 9 }}>{isExp ? "▼" : "▶"}</span>
                                    {r.codigo}-{r.codigo_item}
                                  </button>
                                </td>
                                <td style={{ ...tdP, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.producto}>{r.producto}</td>
                                <td style={{ ...tdP, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.organismo}>{r.organismo}</td>
                                <td style={{ ...tdPS, color: GRAY_DARK }}>{r.tipo}</td>
                                <td style={{ ...tdPS, color: GRAY_DARK }}>{fmtFecha(r.fecha_adj)}</td>
                                <td style={{ ...tdPS, color: "#1E40AF", fontWeight: 700 }}>{r.lbf_precio_unit > 0 ? fmtFull(r.lbf_precio_unit) : "—"}</td>
                                <td style={{ ...tdPS, color: "#1E40AF" }}>{fmtFull(r.lbf_precio)}</td>
                                <td style={{ ...tdPS, color: "#DC2626" }}>{(r.ganador_precio_unit ?? 0) > 0 ? fmtFull(r.ganador_precio_unit!) : "—"}</td>
                                <td style={{ ...tdPS, color: "#DC2626", fontWeight: 700 }}>{fmtFull(r.ganador_precio)}</td>
                                <td style={{ ...tdPS, color: "#7C3AED", fontWeight: 800 }}>{r.dif_pct != null ? `+${r.dif_pct.toFixed(1)}%` : "—"}</td>
                                <td style={{ ...tdP, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.ganador_nombre}>{r.ganador_nombre}</td>
                              </tr>
                              {isExp && (
                                <tr>
                                  <td colSpan={11} style={{ padding: 0, background: "#F0F9FF", borderBottom: "2px solid #BFDBFE", borderTop: "1px solid #BFDBFE" }}>
                                    <div style={{ padding: "12px 16px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF" }}>
                                          Licitación {r.codigo} — {r.organismo}
                                        </span>
                                        <a href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${r.codigo}`}
                                          target="_blank" rel="noopener noreferrer"
                                          style={{ fontSize: 11, color: LBF_BLUE, fontWeight: 600, textDecoration: "none" }}>
                                          Ver en MP ↗
                                        </a>
                                      </div>
                                      {drillLoading.has(r.codigo) && <div style={{ color: "#94A3B8", fontSize: 12, padding: 8 }}>Cargando detalles...</div>}
                                      {drillError[r.codigo] && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#DC2626", fontSize: 12, padding: 8 }}>
                                          ⚠️ {drillError[r.codigo]}
                                          <button onClick={() => { drillInFlight.current.delete(r.codigo); loadDrill(r.codigo); }} style={{
                                            padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                                            border: "1px solid #FECACA", borderRadius: 4, background: "#FEF2F2", color: "#DC2626",
                                          }}>Reintentar</button>
                                        </div>
                                      )}
                                      {drillData[r.codigo] && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                          {(drillData[r.codigo].items ?? []).map(item => (
                                            <div key={item.codigo_item}>
                                              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4, padding: "3px 8px", background: "#E0F2FE", borderRadius: 3, borderLeft: "3px solid #0891B2" }}>
                                                Ítem {item.codigo_item}: {item.producto}
                                              </div>
                                              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                                <thead>
                                                  <tr>
                                                    <th style={{ ...thL, padding: "4px 8px", fontSize: 10 }}>Proveedor</th>
                                                    <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Estado</th>
                                                    <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Precio Unit</th>
                                                    <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Precio Total</th>
                                                    <th style={{ ...thS, padding: "4px 8px", fontSize: 10, minWidth: 46 }}>Adj</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {item.proveedores.map((p, pi) => (
                                                    <tr key={`${pi}-${p.rut}`} style={{ background: p.seleccionada ? "#DCFCE7" : p.es_lbf ? "#DBEAFE" : pi % 2 === 1 ? "#F8FAFC" : "white" }}>
                                                      <td style={{ ...tdL, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf ? 800 : 500, color: p.es_lbf ? LBF_BLUE : p.seleccionada ? GREEN : "#1F2937" }}>
                                                        {p.nombre}
                                                        {p.es_lbf && <span style={{ marginLeft: 4, fontSize: 9, background: LBF_BLUE, color: "white", borderRadius: 2, padding: "0 3px" }}>LBF</span>}
                                                        {p.seleccionada && <span style={{ marginLeft: 4, fontSize: 9, background: GREEN, color: "white", borderRadius: 2, padding: "0 3px" }}>ADJ</span>}
                                                      </td>
                                                      <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, color: p.estado_oferta === "Rechazada" ? "#DC2626" : "#374151" }}>{p.estado_oferta || "—"}</td>
                                                      <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf || p.seleccionada ? 700 : 400 }}>{p.precio_unit > 0 ? fmtFull(p.precio_unit) : "—"}</td>
                                                      <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf || p.seleccionada ? 700 : 400 }}>{p.precio_total > 0 ? fmtFull(p.precio_total) : "—"}</td>
                                                      <td style={{ ...tdS, padding: "4px 8px", fontSize: 12, fontWeight: 800, color: p.seleccionada ? GREEN : "#CBD5E1" }}>{p.seleccionada ? "✓" : "—"}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!showAllA && aceptadasF.length > DRILL_PAGE && (
                    <div style={{ textAlign: "center", marginTop: 10 }}>
                      <button onClick={() => setShowAllA(true)} style={{
                        padding: "6px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1px solid #E2E8F0", borderRadius: 6, background: "white", color: "#64748B",
                      }}>
                        Ver todos ({aceptadasF.length} ítems) ▼
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Grupo B — Inadmisibles ────────────────────────────────── */}
                {rechazadasF.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                      background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 16px",
                    }}>
                      <span style={{ fontSize: 16 }}>🔴</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                          Inadmisibles — Oferta rechazada por MP ({fmtN(rechazadasF.length)} ítems)
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                          Descartada antes de evaluar precio · Revisar requisitos técnicos/documentales
                        </div>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={{ ...thP, minWidth: 120 }}>Código</th>
                            <th style={{ ...thP, minWidth: 190 }}>Producto</th>
                            <th style={{ ...thP, minWidth: 150 }}>Organismo</th>
                            <th style={{ ...thPS, minWidth: 46 }}>Tipo</th>
                            <th style={{ ...thPS, minWidth: 82 }}>Fecha Adj.</th>
                            <th style={{ ...thPS, minWidth: 88 }}>LBF Unit</th>
                            <th style={{ ...thPS, minWidth: 96 }}>LBF Total</th>
                            <th style={{ ...thP, minWidth: 160 }}>Ganador</th>
                            <th style={{ ...thPS, minWidth: 96, color: "#DC2626" }}>Precio Gan.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayB.map((r, i) => {
                            const rowKey = `b-${r.codigo}-${i}`;
                            const isExp = expandedRowKey === rowKey;
                            return (
                              <React.Fragment key={`${r.codigo}-${r.codigo_item}-${i}`}>
                                <tr style={{ background: isExp ? "#F0F9FF" : i % 2 === 1 ? "#FAFBFC" : undefined }}>
                                  <td style={{ ...tdP, fontFamily: "monospace", fontSize: 11 }}>
                                    <button onClick={() => toggleDrill(r.codigo, rowKey)} style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: "#475569", fontWeight: 700, fontSize: 11, fontFamily: "monospace",
                                      padding: 0, display: "flex", alignItems: "center", gap: 4,
                                    }} title="Ver todos los oferentes">
                                      <span style={{ fontSize: 9 }}>{isExp ? "▼" : "▶"}</span>
                                      {r.codigo}-{r.codigo_item}
                                    </button>
                                  </td>
                                  <td style={{ ...tdP, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.producto}>{r.producto}</td>
                                  <td style={{ ...tdP, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.organismo}>{r.organismo}</td>
                                  <td style={{ ...tdPS, color: GRAY_DARK }}>{r.tipo}</td>
                                  <td style={{ ...tdPS, color: GRAY_DARK }}>{fmtFecha(r.fecha_adj)}</td>
                                  <td style={{ ...tdPS, color: GRAY_DARK }}>{r.lbf_precio_unit > 0 ? fmtFull(r.lbf_precio_unit) : "—"}</td>
                                  <td style={{ ...tdPS, color: GRAY_DARK }}>{r.lbf_precio > 0 ? fmtFull(r.lbf_precio) : "—"}</td>
                                  <td style={{ ...tdP, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.ganador_nombre}>{r.ganador_nombre || "—"}</td>
                                  <td style={{ ...tdPS, color: "#DC2626", fontWeight: 700 }}>{r.ganador_precio > 0 ? fmtFull(r.ganador_precio) : "—"}</td>
                                </tr>
                                {isExp && (
                                  <tr>
                                    <td colSpan={9} style={{ padding: 0, background: "#F8FAFC", borderBottom: "2px solid #CBD5E1", borderTop: "1px solid #CBD5E1" }}>
                                      <div style={{ padding: "12px 16px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                                            Licitación {r.codigo} — {r.organismo}
                                          </span>
                                          <a href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=${r.codigo}`}
                                            target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: 11, color: LBF_BLUE, fontWeight: 600, textDecoration: "none" }}>
                                            Ver en MP ↗
                                          </a>
                                        </div>
                                        {drillLoading.has(r.codigo) && <div style={{ color: "#94A3B8", fontSize: 12, padding: 8 }}>Cargando detalles...</div>}
                                        {drillError[r.codigo] && (
                                          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#DC2626", fontSize: 12, padding: 8 }}>
                                            ⚠️ {drillError[r.codigo]}
                                            <button onClick={() => { drillInFlight.current.delete(r.codigo); loadDrill(r.codigo); }} style={{
                                              padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                                              border: "1px solid #FECACA", borderRadius: 4, background: "#FEF2F2", color: "#DC2626",
                                            }}>Reintentar</button>
                                          </div>
                                        )}
                                        {drillData[r.codigo] && (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {(drillData[r.codigo].items ?? []).map(item => (
                                              <div key={item.codigo_item}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4, padding: "3px 8px", background: "#F1F5F9", borderRadius: 3, borderLeft: "3px solid #94A3B8" }}>
                                                  Ítem {item.codigo_item}: {item.producto}
                                                </div>
                                                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ ...thL, padding: "4px 8px", fontSize: 10 }}>Proveedor</th>
                                                      <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Estado</th>
                                                      <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Precio Unit</th>
                                                      <th style={{ ...thS, padding: "4px 8px", fontSize: 10 }}>Precio Total</th>
                                                      <th style={{ ...thS, padding: "4px 8px", fontSize: 10, minWidth: 46 }}>Adj</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {item.proveedores.map((p, pi) => (
                                                      <tr key={`${pi}-${p.rut}`} style={{ background: p.seleccionada ? "#DCFCE7" : p.es_lbf ? "#DBEAFE" : pi % 2 === 1 ? "#F8FAFC" : "white" }}>
                                                        <td style={{ ...tdL, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf ? 800 : 500, color: p.es_lbf ? LBF_BLUE : p.seleccionada ? GREEN : "#1F2937" }}>
                                                          {p.nombre}
                                                          {p.es_lbf && <span style={{ marginLeft: 4, fontSize: 9, background: LBF_BLUE, color: "white", borderRadius: 2, padding: "0 3px" }}>LBF</span>}
                                                          {p.seleccionada && <span style={{ marginLeft: 4, fontSize: 9, background: GREEN, color: "white", borderRadius: 2, padding: "0 3px" }}>ADJ</span>}
                                                        </td>
                                                        <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, color: p.estado_oferta === "Rechazada" ? "#DC2626" : "#374151" }}>{p.estado_oferta || "—"}</td>
                                                        <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf || p.seleccionada ? 700 : 400 }}>{p.precio_unit > 0 ? fmtFull(p.precio_unit) : "—"}</td>
                                                        <td style={{ ...tdS, padding: "4px 8px", fontSize: 11, fontWeight: p.es_lbf || p.seleccionada ? 700 : 400 }}>{p.precio_total > 0 ? fmtFull(p.precio_total) : "—"}</td>
                                                        <td style={{ ...tdS, padding: "4px 8px", fontSize: 12, fontWeight: 800, color: p.seleccionada ? GREEN : "#CBD5E1" }}>{p.seleccionada ? "✓" : "—"}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!showAllB && rechazadasF.length > DRILL_PAGE && (
                      <div style={{ textAlign: "center", marginTop: 10 }}>
                        <button onClick={() => setShowAllB(true)} style={{
                          padding: "6px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          border: "1px solid #E2E8F0", borderRadius: 6, background: "white", color: "#64748B",
                        }}>
                          Ver todos ({rechazadasF.length} ítems) ▼
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
















