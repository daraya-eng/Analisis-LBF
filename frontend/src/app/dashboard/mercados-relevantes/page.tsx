"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import {
  Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from "recharts";

// ── interfaces ───────────────────────────────────────────────────────────────

// ── interfaces (Gestión Comercial — SQL Server BI: falcon_gestion) ────────────

interface GestionKpis {
  total_lics: number; lics_lbf: number; items_lbf: number; items_adj: number;
  tasa_adj: number; monto_adj: number;
  n_perdidas_precio: number; monto_gap: number; venta_potencial: number;
}
interface GestionCanal {
  canal: string; lics: number; items_lbf: number; items_adj: number;
  tasa_adj: number; monto_adj: number;
}
interface GestionResumen {
  kpis: GestionKpis;
  por_canal: GestionCanal[];
}
interface GestionUsuario {
  usuario: string; lics_total: number; items_ofertados: number; items_adj: number;
  tasa_adj: number; monto_adj: number; cotizadas: number; en_proceso: number; sin_gestionar: number;
}
interface GestionMes {
  ano: number; mes: number; label: string;
  items_lbf: number; items_adj: number; tasa_adj: number; monto_adj: number;
}
interface GestionEstado {
  estado_sgl: string; lics: number; items: number;
}
interface LicRow {
  licitacion_id: string; organismo: string; unidad_compra: string; region: string;
  estado_mp: string; fecha_inicio: string; fecha_adj: string;
  items_ofertados: number; items_adj: number; tasa_adj: number;
  monto_ofertado: number; monto_adj: number;
  duracion_contrato: string; etiquetas: string;
}
interface LicPagina {
  total: number; page: number; page_size: number; pages: number;
  total_items_ofertados: number; total_items_adj: number;
  total_monto_adj: number; total_monto_ofertado: number;
  licitaciones: LicRow[];
}

interface CompMes {
  mes: number; label: string;
  lics_lbf_25: number; lics_lbf_26: number;
  lics_adj_25: number; lics_adj_26: number;
  tasa_lics_25: number; tasa_lics_26: number; var_lics_pct: number | null;
  items_lbf_25: number; items_lbf_26: number;
  items_adj_25: number; items_adj_26: number;
  tasa_adj_25: number; tasa_adj_26: number; var_items_pct: number | null;
  monto_adj_25: number; monto_adj_26: number; var_monto_pct: number | null;
}
interface CompData { meses: CompMes[]; totales: CompMes; }

interface AdjItem {
  licitacion_id: string; organismo: string; fecha_inicio: string; fecha_adj: string;
  descripcion: string; usuario: string;
  monto_cotizado: number; monto_adj: number; efectividad: number;
}
interface AdjUsuario {
  usuario: string;
  lics: number; items_ofertados: number; monto_ofertado: number;
  items_adj: number; monto_adj: number; efectividad: number;
}
interface AdjDetalle {
  ano: number; mes: number; total_items: number;
  total_cotizado: number; total_adj: number;
  total_items_ofertados: number; total_monto_ofertado: number;
  efectividad_global: number;
  items: AdjItem[]; por_usuario: AdjUsuario[];
}
interface PostRow {
  usuario: string; mes: number; lics: number; items: number; monto: number;
  lics_res: number; lics_adj: number; items_res: number; items_adj: number; monto_adj: number;
}
interface PostDetalle { licitacion_id: string; organismo: string; unidad_compra: string; region: string; items: number; monto: number; fecha_inicio: string; fecha_termino: string; estado_mp: string; }
interface PerdidosConteoKpis {
  mejor_lics: number; mejor_items: number;
  mayor_lics: number; mayor_items: number;
}
interface PerdidosConteoMes {
  ano: number; mes: number; label: string;
  mejor_lics: number; mejor_items: number;
  mayor_lics: number; mayor_items: number;
}
interface PerdidosConteoData {
  kpis: PerdidosConteoKpis;
  por_mes: PerdidosConteoMes[];
}
interface PerdidosDrillRow {
  licitacion_id: string; organismo: string;
  items_perdidos: number; competidor: string;
  precio_lbf_avg: number; precio_adj_avg: number; dif_pct: number;
  estado_sgl: string; url_acta?: string | null;
  motivo_lbf?: string | null;
}
interface PerdidosDrillData {
  ano: number; mes: number; grupo: string; label: string;
  rows: PerdidosDrillRow[];
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


// ── main page ─────────────────────────────────────────────────────────────────

export default function MercadosRelevantesPage() {
  const [activeTab, setActiveTab] = useState<"sgl" | "perdidos">("sgl");

  // tab sgl (Gestión Comercial — from falcon_gestion SQL Server BI)
  const [sglResumen, setSglResumen]     = useState<GestionResumen | null>(null);
  const [sglUsuarios, setSglUsuarios]   = useState<GestionUsuario[]>([]);
  const [sglMeses, setSglMeses]         = useState<GestionMes[]>([]);
  const [sglEstados, setSglEstados]     = useState<GestionEstado[]>([]);
  const [sglLoading, setSglLoading]     = useState(false);
  const [sglLoaded, setSglLoaded]       = useState(false);
  const [sglCanal, setSglCanal]         = useState("");
  const [sglEquipoActual, setSglEquipoActual] = useState(false);

  // tabla de licitaciones
  const [licData, setLicData]       = useState<LicPagina | null>(null);
  const [licLoading, setLicLoading] = useState(false);
  const [licPage, setLicPage]       = useState(1);
  const [licSearch, setLicSearch]   = useState("");
  const [licEstado, setLicEstado]   = useState("");

  // comparación mismo período 2025 vs 2026 (falcon)
  const [compData, setCompData]       = useState<CompData | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compLoaded, setCompLoaded]   = useState(false);

  // detalle adjudicaciones por mes
  const [adjDetalle, setAdjDetalle]   = useState<AdjDetalle | null>(null);
  const [adjLoading, setAdjLoading]   = useState(false);
  const [adjAno, setAdjAno]           = useState(2026);
  const [adjMes, setAdjMes]           = useState(5);

  // postulaciones 2026 por usuario/mes
  const [postRows, setPostRows]         = useState<PostRow[]>([]);
  const [postLoading, setPostLoading]   = useState(false);
  const [postLoaded, setPostLoaded]     = useState(false);
  const [postMesFiltro, setPostMesFiltro] = useState<number | null>(null);

  const [postDrillUsuario, setPostDrillUsuario] = useState<string | null>(null);
  const [postDrillData, setPostDrillData]       = useState<PostDetalle[]>([]);
  const [postDrillLoading, setPostDrillLoading] = useState(false);

  // perdidos por precio (conteo)
  const [perdidosData, setPerdidosData]       = useState<PerdidosConteoData | null>(null);
  const [perdidosLoading, setPerdidosLoading] = useState(false);
  const [perdidosLoaded, setPerdidosLoaded]   = useState(false);
  const [perdidosAno, setPerdidosAno]         = useState(2026);
  const [perdidosDrillKey, setPerdidosDrillKey]     = useState<string | null>(null);
  const [perdidosDrillData, setPerdidosDrillData]   = useState<PerdidosDrillData | null>(null);
  const [perdidosDrillLoading, setPerdidosDrillLoading] = useState(false);

  const MES_NOMBRE = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  const loadAdjDetalle = useCallback((ano: number, mes: number) => {
    setAdjLoading(true);
    api.get<AdjDetalle>(`/api/mercados-relevantes/falcon-adj-detalle?ano=${ano}&mes=${mes}`, { noCache: true })
      .then(d => { setAdjDetalle(d ?? null); setAdjLoading(false); })
      .catch(() => setAdjLoading(false));
  }, []);

  const loadPostDrill = useCallback((usuario: string, mes: number) => {
    if (postDrillUsuario === usuario) { setPostDrillUsuario(null); return; }
    setPostDrillUsuario(usuario);
    setPostDrillLoading(true);
    setPostDrillData([]);
    api.get<{ licitaciones: PostDetalle[] }>(`/api/mercados-relevantes/falcon-postulaciones-detalle?usuario=${encodeURIComponent(usuario)}&mes=${mes}&ano=2026`, { noCache: true })
      .then(d => { setPostDrillData(d?.licitaciones ?? []); setPostDrillLoading(false); })
      .catch(() => setPostDrillLoading(false));
  }, [postDrillUsuario]);

  const loadPerdidos = useCallback((ano: number) => {
    setPerdidosLoading(true);
    setPerdidosLoaded(false);
    setPerdidosDrillKey(null);
    setPerdidosDrillData(null);
    api.get<PerdidosConteoData>(
      `/api/mercados-relevantes/falcon-perdidos-conteo?ano=${ano}`, { noCache: true }
    ).then(d => { setPerdidosData(d ?? null); setPerdidosLoaded(true); setPerdidosLoading(false); })
     .catch(() => setPerdidosLoading(false));
  }, []);

  const loadPerdidosDrillMes = useCallback((ano: number, mes: number, grupo: "mejor" | "mayor") => {
    const key = `${grupo}-${ano}-${mes}`;
    if (perdidosDrillKey === key) { setPerdidosDrillKey(null); setPerdidosDrillData(null); return; }
    setPerdidosDrillKey(key);
    setPerdidosDrillLoading(true);
    setPerdidosDrillData(null);
    api.get<PerdidosDrillData>(
      `/api/mercados-relevantes/falcon-perdidos-detalle-mes?ano=${ano}&mes=${mes}&grupo=${grupo}`, { noCache: true }
    ).then(d => { setPerdidosDrillData(d ?? null); setPerdidosDrillLoading(false); })
     .catch(() => setPerdidosDrillLoading(false));
  }, [perdidosDrillKey]);

  const loadPostulaciones = useCallback(() => {
    if (postLoaded) return;
    setPostLoading(true);
    api.get<{ rows: PostRow[] }>("/api/mercados-relevantes/falcon-postulaciones-usuario", { noCache: true })
      .then(d => {
        const rows = d?.rows ?? [];
        setPostRows(rows);
        if (rows.length > 0) {
          const maxMes = Math.max(...rows.map(r => r.mes));
          setPostMesFiltro(maxMes);
        }
        setPostLoaded(true);
        setPostLoading(false);
      })
      .catch(() => setPostLoading(false));
  }, [postLoaded]);

  const EQUIPO_ACTUAL = ["Lorena", "Laura", "Melean"];

  const loadLic = useCallback((page: number, search: string, estado: string) => {
    setLicLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: "50" });
    if (search) params.set("search", search);
    if (estado) params.set("estado", estado);
    api.get<LicPagina>(`/api/mercados-relevantes/falcon-licitaciones?${params}`, { noCache: true })
      .then(d => { setLicData(d ?? null); setLicLoading(false); })
      .catch(() => setLicLoading(false));
  }, []);

  const loadSgl = useCallback((canal: string = "") => {
    setSglLoading(true);
    clearClientCache();
    const q = canal ? `?canal=${encodeURIComponent(canal)}` : "";
    Promise.all([
      api.get<GestionResumen>("/api/mercados-relevantes/falcon-resumen", { noCache: true }),
      api.get<{ usuarios: GestionUsuario[] }>(`/api/mercados-relevantes/falcon-por-usuario${q}`, { noCache: true }),
      api.get<{ meses: GestionMes[] }>("/api/mercados-relevantes/falcon-por-mes", { noCache: true }),
      api.get<{ estados: GestionEstado[] }>("/api/mercados-relevantes/falcon-por-estado-sgl", { noCache: true }),
    ]).then(([res, usr, mes, est]) => {
      setSglResumen(res ?? null);
      setSglUsuarios(usr.usuarios ?? []);
      setSglMeses(mes.meses ?? []);
      setSglEstados(est.estados ?? []);
      setSglLoading(false);
      setSglLoaded(true);
    }).catch(() => { setSglLoading(false); setSglLoaded(true); });
  }, []);

  useEffect(() => {
    if (activeTab === "sgl" && !sglLoaded && !sglLoading) loadSgl(sglCanal);
    if (activeTab === "sgl" && !compLoaded && !compLoading) {
      setCompLoading(true);
      api.get<CompData>("/api/mercados-relevantes/falcon-comparacion", { noCache: true })
        .then(d => { setCompData(d ?? null); setCompLoading(false); setCompLoaded(true); })
        .catch(() => { setCompLoading(false); setCompLoaded(true); });
    }
    if (activeTab === "sgl" && !postLoaded && !postLoading) loadPostulaciones();
    if (activeTab === "perdidos" && !perdidosLoaded && !perdidosLoading) loadPerdidos(perdidosAno);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sglLoaded, sglLoading]);

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          Gestión de Licitaciones
        </h1>
        <p style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
          Fuente: SQL Server BI (falcon_gestion) · Gestión comercial del departamento de Licitaciones LBF
        </p>
      </div>

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
        {([
          { id: "sgl",      label: "Gestión Comercial",   first: true,  last: false },
          { id: "perdidos", label: "Perdidos por Precio",  first: false, last: true  },
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

      {/* ── TAB: Gestión Comercial ────────────────────────────────────────────── */}
      {activeTab === "sgl" && (
        <div>
          {sglLoading && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8", fontSize: 14 }}>
              Cargando datos…
            </div>
          )}

          {!sglLoading && (() => {
            return (
              <>
                {/* Adjudicaciones por mes (fecha_adj) */}
                {sglMeses.length > 0 && (() => {
                  const today = new Date();
                  const cutoff = new Date(today.getFullYear(), today.getMonth() - 17, 1);
                  const chartData = sglMeses.filter(r => {
                    const d = new Date(r.ano, r.mes - 1, 1);
                    const isCurrent = r.ano === today.getFullYear() && r.mes === today.getMonth() + 1;
                    return d >= cutoff && !isCurrent;
                  });
                  if (chartData.length === 0) return null;
                  return (
                    <div style={{ ...card, marginBottom: 20 }}>
                      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                        Tasa de Adjudicación Mensual — LBF Licitaciones
                      </h2>
                      <p style={{ fontSize: 11, color: "#475569", margin: "0 0 16px" }}>
                        Por mes de resolución (fecha_adj) · solo canal Licitación · barras = ítems resueltos (adj + no adj) · excluye mes actual y lics aún en proceso
                      </p>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData} margin={{ top: 20, right: 52, left: 0, bottom: 0 }} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="items" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
                          <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: "#B45309", fontWeight: 600 }}
                            axisLine={false} tickLine={false} width={44} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                            formatter={(v, name) =>
                              String(name) === "% Adj." ? [`${(v as number).toFixed(1)}%`, String(name)] : [(v as number).toLocaleString("es-CL"), String(name)]
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                          <Bar yAxisId="items" dataKey="items_lbf" name="Resueltos" fill="#A5B4FC" radius={[3,3,0,0]}>
                            <LabelList dataKey="items_lbf" position="top" style={{ fontSize: 9, fill: "#3730A3", fontWeight: 600 }} />
                          </Bar>
                          <Bar yAxisId="items" dataKey="items_adj" name="Adjudicados" fill={LBF_BLUE} radius={[3,3,0,0]}>
                            <LabelList dataKey="items_adj" position="top" style={{ fontSize: 9, fill: "#1E3A8A", fontWeight: 700 }} />
                          </Bar>
                          <Line yAxisId="pct" type="monotone" dataKey="tasa_adj" name="% Adj."
                            stroke="#D97706" strokeWidth={2.5} dot={{ r: 3, fill: "#D97706", stroke: "white", strokeWidth: 2 }}
                            connectNulls={false}>
                            <LabelList dataKey="tasa_adj" position="top" style={{ fontSize: 9, fill: "#92400E", fontWeight: 700 }}
                              formatter={(v: unknown) => typeof v === "number" ? `${v.toFixed(1)}%` : ""} />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}

              </>
            );
          })()}

          {/* ── Tabla comparación mismo período ──────────────────────────── */}
          {activeTab === "sgl" && (
            <div style={{ ...card, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                Comparación Mismo Período — Ene a May (2025 vs 2026)
              </h2>
              <p style={{ fontSize: 11, color: "#475569", margin: "0 0 14px" }}>
                Canal Licitación · todo por fecha_adj · resueltos = adj + no adj (excluye canceladas/desiertas)
              </p>

              {compLoading && <div style={{ textAlign: "center", padding: "24px 0", color: "#94A3B8", fontSize: 13 }}>Cargando…</div>}

              {compData && !compLoading && (() => {
                const GRN = "#059669"; const RED = "#DC2626";
                const fmtVar = (v: number | null) => {
                  if (v === null || v === undefined) return <span style={{ color: "#9CA3AF" }}>—</span>;
                  const up = v >= 0;
                  return <span style={{ color: up ? GRN : RED, fontWeight: 700, fontSize: 11 }}>
                    {up ? "▲" : "▼"}{Math.abs(v).toFixed(1)}%
                  </span>;
                };
                const fmtTasa = (base: number, curr: number) => {
                  const color = curr > base ? GRN : curr < base ? RED : "#374151";
                  return <span style={{ color, fontWeight: 700 }}>{curr.toFixed(1)}%</span>;
                };

                const thBase: React.CSSProperties = { padding: "7px 10px", fontSize: 10, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", borderBottom: "2px solid #E2E8F0" };
                const thL: React.CSSProperties = { ...thBase, textAlign: "left" };
                const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid #F1F5F9", textAlign: "right", whiteSpace: "nowrap" };
                const tdL: React.CSSProperties = { ...td, textAlign: "left", fontWeight: 600 };
                const tdTotal: React.CSSProperties = { ...td, fontWeight: 800, background: "#F0F9FF", borderTop: "2px solid #BFDBFE" };
                const tdTotalL: React.CSSProperties = { ...tdTotal, textAlign: "left", color: LBF_BLUE };

                const rows = [...compData.meses, { ...compData.totales, label: "Total Ene-May", mes: 0 }];

                return (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ ...thL, verticalAlign: "bottom" }}>Mes</th>
                          {/* Licitaciones */}
                          <th colSpan={5} style={{ ...thBase, textAlign: "center", background: "#F0FDF4", color: "#166534", borderBottom: "1px solid #BBF7D0" }}>LICITACIONES</th>
                          {/* Ítems */}
                          <th colSpan={5} style={{ ...thBase, textAlign: "center", background: "#FFF7ED", color: "#C2410C", borderBottom: "1px solid #FED7AA" }}>ÍTEMS</th>
                          {/* Monto */}
                          <th colSpan={3} style={{ ...thBase, textAlign: "center", background: "#EFF6FF", color: LBF_BLUE, borderBottom: "1px solid #BFDBFE" }}>MONTO ADJ.</th>
                        </tr>
                        <tr>
                          <th style={{ ...thBase, color: GRN }}>Res. 26</th>
                          <th style={{ ...thBase, color: GRN }}>Adj. 26</th>
                          <th style={{ ...thBase, color: GRN }}>Tasa 26</th>
                          <th style={{ ...thBase, color: "#64748B" }}>Tasa 25</th>
                          <th style={{ ...thBase, color: "#7C3AED", textAlign: "center" }}>IE</th>
                          <th style={{ ...thBase, color: GRN }}>Res. 26</th>
                          <th style={{ ...thBase, color: GRN }}>Adj. 26</th>
                          <th style={{ ...thBase, color: GRN }}>Tasa 26</th>
                          <th style={{ ...thBase, color: "#64748B" }}>Tasa 25</th>
                          <th style={{ ...thBase, color: "#7C3AED", textAlign: "center" }}>IE</th>
                          <th style={{ ...thBase, color: "#64748B" }}>2025</th>
                          <th style={{ ...thBase, color: GRN }}>2026</th>
                          <th style={{ ...thBase, color: "#64748B" }}>Var</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const isTotal = r.mes === 0;
                          const s = isTotal ? tdTotal : td;
                          const sL = isTotal ? tdTotalL : tdL;
                          return (
                            <tr key={r.mes} style={!isTotal && i % 2 === 1 ? { background: "#FAFBFC" } : {}}>
                              {(() => {
                                const ieLics  = +(r.tasa_lics_26 - r.tasa_lics_25).toFixed(1);
                                const ieItems = +(r.tasa_adj_26  - r.tasa_adj_25).toFixed(1);
                                const fmtIE = (v: number) => (
                                  <span style={{ color: v > 0 ? GRN : v < 0 ? RED : "#94A3B8" }}>
                                    {v > 0 ? "+" : ""}{v.toFixed(1)}pp
                                  </span>
                                );
                                return (
                                  <>
                                    <td style={sL}>{r.label}</td>
                                    {/* Licitaciones */}
                                    <td style={{ ...s, color: GRN }}>{r.lics_lbf_26.toLocaleString("es-CL")}</td>
                                    <td style={{ ...s, color: GRN }}>{r.lics_adj_26.toLocaleString("es-CL")}</td>
                                    <td style={s}>{fmtTasa(r.tasa_lics_25, r.tasa_lics_26)}</td>
                                    <td style={s}>{r.tasa_lics_25.toFixed(1)}%</td>
                                    <td style={{ ...s, textAlign: "center" }}>{fmtIE(ieLics)}</td>
                                    {/* Ítems */}
                                    <td style={{ ...s, color: GRN }}>{r.items_lbf_26.toLocaleString("es-CL")}</td>
                                    <td style={{ ...s, color: GRN }}>{r.items_adj_26.toLocaleString("es-CL")}</td>
                                    <td style={s}>{fmtTasa(r.tasa_adj_25, r.tasa_adj_26)}</td>
                                    <td style={s}>{r.tasa_adj_25.toFixed(1)}%</td>
                                    <td style={{ ...s, textAlign: "center" }}>{fmtIE(ieItems)}</td>
                                    {/* Monto */}
                                    <td style={s}>{fmtM(r.monto_adj_25)}</td>
                                    <td style={{ ...s, color: GRN }}>{fmtM(r.monto_adj_26)}</td>
                                    <td style={s}>{fmtVar(r.var_monto_pct)}</td>
                                  </>
                                );
                              })()}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Postulaciones 2026 por usuario/mes ────────────────────────── */}
          {activeTab === "sgl" && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                  Postulaciones 2026 por Usuario
                </h2>
                {postRows.length > 0 && (() => {
                  const mesesDisp = [1,2,3,4,5,6,7,8,9,10,11,12].filter(m => postRows.some(r => r.mes === m));
                  return (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {mesesDisp.map(m => (
                        <button key={m}
                          onClick={() => setPostMesFiltro(m)}
                          style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid #7C3AED", cursor: "pointer", background: postMesFiltro === m ? "#7C3AED" : "white", color: postMesFiltro === m ? "white" : "#7C3AED" }}
                        >{MES_NOMBRE[m]}</button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {postLoading && <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13 }}>Cargando…</div>}
              {!postLoading && postRows.length > 0 && (() => {
                const MESES = [1,2,3,4,5,6,7,8,9,10,11,12];
                const mesesConDatos = (postMesFiltro !== null
                  ? [postMesFiltro]
                  : MESES.filter(m => postRows.some(r => r.mes === m)));
                // agrupar por usuario
                const usuarios = Array.from(new Set(postRows.map(r => r.usuario))).sort();
                const byKey = (u: string, m: number) => postRows.find(r => r.usuario === u && r.mes === m);
                const totLics  = (m: number) => postRows.filter(r => r.mes === m).reduce((s, r) => s + r.lics, 0);
                const totItems = (m: number) => postRows.filter(r => r.mes === m).reduce((s, r) => s + r.items, 0);
                const totMonto = (m: number) => postRows.filter(r => r.mes === m).reduce((s, r) => s + r.monto, 0);

                const thS: React.CSSProperties = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#6B7280", borderBottom: "2px solid #E2E8F0", textAlign: "center", whiteSpace: "nowrap", background: "#F8FAFC" };
                const thM: React.CSSProperties = { ...thS, color: "#7C3AED", borderBottom: "2px solid #7C3AED" };
                const tdS: React.CSSProperties = { padding: "5px 8px", fontSize: 11, color: "#374151", borderBottom: "1px solid #F1F5F9", textAlign: "right", whiteSpace: "nowrap" };
                const tdL: React.CSSProperties = { ...tdS, textAlign: "left", fontWeight: 600 };
                const tdT: React.CSSProperties = { ...tdS, fontWeight: 800, background: "#F8FAFC" };

                const m0 = mesesConDatos[0];

                return (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ ...thS, textAlign: "left", verticalAlign: "bottom", borderBottom: "2px solid #7C3AED" }}>Usuario</th>
                          <th colSpan={3} style={{ ...thS, textAlign: "center", background: "#F5F3FF", color: "#7C3AED", borderBottom: "1px solid #DDD6FE" }}>POSTULACIONES (fecha inicio)</th>
                          <th colSpan={5} style={{ ...thS, textAlign: "center", background: "#F0FDF4", color: "#166534", borderBottom: "1px solid #BBF7D0" }}>ADJUDICACIONES (fecha adj)</th>
                        </tr>
                        <tr>
                          <th style={{ ...thS, color: "#7C3AED" }}>Licitaciones</th>
                          <th style={{ ...thS, color: "#7C3AED" }}>Ítems</th>
                          <th style={{ ...thS, color: "#7C3AED" }}>Monto ofertado</th>
                          <th style={{ ...thS, color: "#166534" }}>Lics res.</th>
                          <th style={{ ...thS, color: "#166534" }}>Lics adj.</th>
                          <th style={{ ...thS, color: "#166534" }}>Tasa lics</th>
                          <th style={{ ...thS, color: "#166534" }}>Ítems adj.</th>
                          <th style={{ ...thS, color: "#166534" }}>Monto adj.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usuarios.map((u, i) => {
                          const r = byKey(u, m0);
                          if (!r) return null;
                          const expanded = postDrillUsuario === u;
                          const tasaLics = r.lics_res > 0 ? (r.lics_adj / r.lics_res * 100).toFixed(1) : "—";
                          return (
                            <React.Fragment key={u}>
                              <tr
                                onClick={() => loadPostDrill(u, m0)}
                                style={{ background: expanded ? "#EDE9FE" : i % 2 === 1 ? "#FAFBFC" : undefined, cursor: "pointer" }}
                              >
                                <td style={{ ...tdL, color: expanded ? "#7C3AED" : undefined }}>
                                  <span style={{ marginRight: 6, fontSize: 10 }}>{expanded ? "▼" : "▶"}</span>{u}
                                </td>
                                <td style={tdS}>{r.lics}</td>
                                <td style={tdS}>{r.items.toLocaleString("es-CL")}</td>
                                <td style={{ ...tdS, color: "#7C3AED", fontWeight: 700 }}>{fmtM(r.monto)}</td>
                                <td style={{ ...tdS, color: "#166534" }}>{r.lics_res ?? 0}</td>
                                <td style={{ ...tdS, color: "#166534", fontWeight: 700 }}>{r.lics_adj ?? 0}</td>
                                <td style={{ ...tdS, fontWeight: 700, color: Number(tasaLics) >= 30 ? "#059669" : Number(tasaLics) >= 15 ? "#D97706" : "#DC2626" }}>
                                  {tasaLics !== "—" ? `${tasaLics}%` : "—"}
                                </td>
                                <td style={{ ...tdS, color: "#166534", fontWeight: 700 }}>{(r.items_adj ?? 0).toLocaleString("es-CL")}</td>
                                <td style={{ ...tdS, color: "#059669", fontWeight: 700 }}>{fmtM(r.monto_adj ?? 0)}</td>
                              </tr>
                              {expanded && (
                                <tr>
                                  <td colSpan={4} style={{ padding: 0, background: "#F5F3FF" }}>
                                    {postDrillLoading ? (
                                      <div style={{ padding: "12px 20px", fontSize: 12, color: "#94A3B8" }}>Cargando…</div>
                                    ) : (
                                      <div style={{ padding: "10px 16px" }}>
                                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                                          <thead>
                                            <tr>
                                              <th style={{ ...thS, textAlign: "left", background: "#EDE9FE" }}>ID Licitación</th>
                                              <th style={{ ...thS, textAlign: "left", background: "#EDE9FE" }}>Organismo</th>
                                              <th style={{ ...thS, background: "#EDE9FE" }}>Región</th>
                                              <th style={{ ...thS, background: "#EDE9FE" }}>F. Inicio</th>
                                              <th style={{ ...thS, background: "#EDE9FE" }}>F. Término</th>
                                              <th style={{ ...thS, background: "#EDE9FE" }}>Ítems</th>
                                              <th style={{ ...thS, color: "#7C3AED", background: "#EDE9FE" }}>Monto</th>
                                              <th style={{ ...thS, background: "#EDE9FE" }}>Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {postDrillData.map((lic, li) => (
                                              <tr key={lic.licitacion_id} style={{ background: li % 2 === 0 ? "white" : "#F5F3FF" }}>
                                                <td style={{ ...tdS, textAlign: "left", fontFamily: "monospace", fontSize: 10 }}>{lic.licitacion_id}</td>
                                                <td style={{ ...tdS, textAlign: "left", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lic.organismo}</td>
                                                <td style={{ ...tdS, textAlign: "center" }}>{lic.region}</td>
                                                <td style={{ ...tdS, textAlign: "center" }}>{lic.fecha_inicio ? lic.fecha_inicio.slice(0,7) : "—"}</td>
                                                <td style={{ ...tdS, textAlign: "center" }}>{lic.fecha_termino ? lic.fecha_termino.slice(0,7) : "—"}</td>
                                                <td style={tdS}>{lic.items}</td>
                                                <td style={{ ...tdS, color: "#7C3AED", fontWeight: 700 }}>{fmtM(lic.monto)}</td>
                                                <td style={{ ...tdS, textAlign: "center", fontSize: 10 }}>{lic.estado_mp}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {(() => {
                          const tLicsRes  = postRows.filter(r => r.mes === m0).reduce((s, r) => s + (r.lics_res ?? 0), 0);
                          const tLicsAdj  = postRows.filter(r => r.mes === m0).reduce((s, r) => s + (r.lics_adj ?? 0), 0);
                          const tItemsAdj = postRows.filter(r => r.mes === m0).reduce((s, r) => s + (r.items_adj ?? 0), 0);
                          const tMontoAdj = postRows.filter(r => r.mes === m0).reduce((s, r) => s + (r.monto_adj ?? 0), 0);
                          const tTasa = tLicsRes > 0 ? (tLicsAdj / tLicsRes * 100).toFixed(1) : "—";
                          return (
                            <tr style={{ background: "#EDE9FE", borderTop: "2px solid #7C3AED" }}>
                              <td style={{ ...tdL, color: "#7C3AED" }}>Total</td>
                              <td style={{ ...tdT, color: "#7C3AED" }}>{totLics(m0)}</td>
                              <td style={{ ...tdT, color: "#7C3AED" }}>{totItems(m0).toLocaleString("es-CL")}</td>
                              <td style={{ ...tdT, color: "#7C3AED" }}>{fmtM(totMonto(m0))}</td>
                              <td style={{ ...tdT, color: "#166534" }}>{tLicsRes}</td>
                              <td style={{ ...tdT, color: "#166534" }}>{tLicsAdj}</td>
                              <td style={{ ...tdT, color: tTasa !== "—" && Number(tTasa) >= 30 ? "#059669" : "#D97706" }}>
                                {tTasa !== "—" ? `${tTasa}%` : "—"}
                              </td>
                              <td style={{ ...tdT, color: "#166534" }}>{tItemsAdj.toLocaleString("es-CL")}</td>
                              <td style={{ ...tdT, color: "#059669" }}>{fmtM(tMontoAdj)}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      )}

      {/* ── TAB: Perdidos por Precio ─────────────────────────────────────────── */}
      {activeTab === "perdidos" && (
        <div>
          {/* Header + filtro año */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 14px" }}>
              Solo licitaciones <strong>Adjudicadas</strong> · compara precio LBF vs precio del adjudicado ítem por ítem · fuente: falcon_gestion
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Año:</span>
              {[2024, 2025, 2026].map(y => (
                <button key={y} onClick={() => { setPerdidosAno(y); setPerdidosLoaded(false); loadPerdidos(y); }}
                  style={{ padding: "5px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${perdidosAno === y ? "#1D4ED8" : "#E2E8F0"}`,
                    background: perdidosAno === y ? "#1D4ED8" : "white",
                    color: perdidosAno === y ? "white" : "#64748B" }}>
                  {y}
                </button>
              ))}
              <button onClick={() => { setPerdidosAno(0); setPerdidosLoaded(false); loadPerdidos(0); }}
                style={{ padding: "5px 14px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${perdidosAno === 0 ? "#1D4ED8" : "#E2E8F0"}`,
                  background: perdidosAno === 0 ? "#1D4ED8" : "white",
                  color: perdidosAno === 0 ? "white" : "#64748B" }}>
                Todos
              </button>
            </div>
          </div>

          {perdidosLoading && <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: 14 }}>Cargando…</div>}

          {perdidosLoaded && perdidosData && (() => {
            const { kpis, por_mes } = perdidosData;

            const renderSeccion = (tipo: "mejor" | "mayor") => {
              const isMejor   = tipo === "mejor";
              const color     = isMejor ? "#B45309" : "#DC2626";
              const colorBg   = isMejor ? "#FFFBEB" : "#FEF2F2";
              const colorBord = isMejor ? "#FDE68A" : "#FCA5A5";
              const colorAcct = isMejor ? "#D97706" : "#B91C1C";
              const lics      = isMejor ? (kpis.mejor_lics  ?? 0) : (kpis.mayor_lics  ?? 0);
              const items     = isMejor ? (kpis.mejor_items ?? 0) : (kpis.mayor_items ?? 0);
              const titulo    = isMejor
                ? "Perdimos con Precio Mejor — LBF era más barato pero no fue adjudicado"
                : "Perdimos con Precio Mayor — LBF era más caro (pérdida esperada por precio)";
              const subtitulo = isMejor
                ? "Casos críticos: el comprador eligió al competidor a pesar de que LBF ofrecía mejor precio"
                : "Pérdida por competitividad de precio: el ganador cotizó más barato que LBF";

              const mesData = por_mes.filter(m =>
                isMejor ? ((m.mejor_lics ?? 0) > 0 || (m.mejor_items ?? 0) > 0)
                         : ((m.mayor_lics ?? 0) > 0 || (m.mayor_items ?? 0) > 0)
              );

              const th: React.CSSProperties = { padding: "7px 10px", fontSize: 10, fontWeight: 700, color: "#6B7280", borderBottom: `2px solid ${colorBord}`, whiteSpace: "nowrap", textAlign: "right", background: "#F8FAFC" };
              const thL: React.CSSProperties = { ...th, textAlign: "left" };
              const td: React.CSSProperties  = { padding: "6px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid #F1F5F9", textAlign: "right", whiteSpace: "nowrap" };
              const tdL: React.CSSProperties = { ...td, textAlign: "left" };

              return (
                <div key={tipo} style={{ ...card, marginBottom: 20, borderLeft: `4px solid ${color}` }}>
                  {/* Header */}
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 800, color }}>
                      {isMejor ? "🟡" : "🔴"} {titulo}
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: "#64748B" }}>{subtitulo}</p>
                  </div>

                  {/* KPIs */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ background: colorBg, border: `1px solid ${colorBord}`, borderRadius: 8, padding: "10px 18px", flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Licitaciones</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color }}>{lics.toLocaleString("es-CL")}</div>
                    </div>
                    <div style={{ background: colorBg, border: `1px solid ${colorBord}`, borderRadius: 8, padding: "10px 18px", flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ítems perdidos</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color }}>{items.toLocaleString("es-CL")}</div>
                    </div>
                  </div>

                  {/* Gráfico */}
                  {mesData.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart
                          data={mesData.map(m => ({
                            label:  m.label,
                            lics:   isMejor ? (m.mejor_lics  ?? 0) : (m.mayor_lics  ?? 0),
                            items:  isMejor ? (m.mejor_items ?? 0) : (m.mayor_items ?? 0),
                          }))}
                          margin={{ top: 14, right: 24, bottom: 0, left: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="lics"  orientation="left"  tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={24} />
                          <YAxis yAxisId="items" orientation="right" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                            formatter={(value: unknown, name: unknown) => [(Number(value) || 0).toLocaleString("es-CL"), String(name)]}
                          />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                          <Bar yAxisId="lics"  dataKey="lics"  name="Licitaciones" fill={colorBg} stroke={colorAcct} strokeWidth={1} radius={[3,3,0,0]}>
                            <LabelList dataKey="lics"  position="top" style={{ fontSize: 9, fill: colorAcct, fontWeight: 700 }} />
                          </Bar>
                          <Bar yAxisId="items" dataKey="items" name="Ítems"         fill={colorBord} stroke={color} strokeWidth={1} radius={[3,3,0,0]}>
                            <LabelList dataKey="items" position="top" style={{ fontSize: 9, fill: color, fontWeight: 700 }} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Tabla por mes con drill-down */}
                  {mesData.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={thL}>Mes</th>
                            <th style={{ ...th, color }}>Licitaciones</th>
                            <th style={{ ...th, color }}>Ítems</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mesData.map((m, i) => {
                            const drillKey = `${tipo}-${m.ano}-${m.mes}`;
                            const isOpen   = perdidosDrillKey === drillKey;
                            const isLoading = isOpen && perdidosDrillLoading;
                            const mLics  = isMejor ? (m.mejor_lics  ?? 0) : (m.mayor_lics  ?? 0);
                            const mItems = isMejor ? (m.mejor_items ?? 0) : (m.mayor_items ?? 0);
                            return (
                              <React.Fragment key={drillKey}>
                                <tr
                                  onClick={() => loadPerdidosDrillMes(m.ano, m.mes, tipo)}
                                  style={{
                                    background: isOpen ? colorBg : i % 2 === 1 ? "#FAFBFC" : undefined,
                                    cursor: "pointer",
                                    borderLeft: isOpen ? `3px solid ${color}` : "3px solid transparent",
                                  }}
                                >
                                  <td style={{ ...tdL, color: isOpen ? color : undefined, fontWeight: isOpen ? 700 : undefined }}>
                                    <span style={{ marginRight: 6, fontSize: 10, color: "#94A3B8" }}>{isOpen ? "▼" : "▶"}</span>
                                    {m.label}
                                  </td>
                                  <td style={td}>{mLics.toLocaleString("es-CL")}</td>
                                  <td style={{ ...td, color, fontWeight: 700 }}>{mItems.toLocaleString("es-CL")}</td>
                                </tr>
                                {isOpen && (
                                  <tr>
                                    <td colSpan={3} style={{ padding: 0, background: colorBg }}>
                                      {isLoading ? (
                                        <div style={{ padding: "12px 20px", fontSize: 12, color: "#94A3B8" }}>Cargando…</div>
                                      ) : perdidosDrillData && perdidosDrillData.rows.length > 0 ? (() => {
                                        return (
                                          <>
                                            <div style={{ overflowX: "auto" }}>
                                              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                                <thead>
                                                  <tr style={{ background: colorBg }}>
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>Licitación</th>
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>Organismo</th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent", color }}>Ítems</th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent" }}>P. LBF</th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent" }}>P. Adj.</th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent" }}>Dif %</th>
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>Competidor</th>
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>Estado SGL</th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent" }}>Acta</th>
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>Motivo (acta)</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {perdidosDrillData.rows.map((dr, di) => {
                                                    const sgl = dr.estado_sgl || "";
                                                    const sglBg    = sgl === "Cotizada"      ? "#DCFCE7"
                                                                   : sgl === "En Proceso"    ? "#EFF6FF"
                                                                   : sgl === "Sin Gestionar" ? "#FEF2F2"
                                                                   : "#F1F5F9";
                                                    const sglColor = sgl === "Cotizada"      ? "#16A34A"
                                                                   : sgl === "En Proceso"    ? "#2563EB"
                                                                   : sgl === "Sin Gestionar" ? "#DC2626"
                                                                   : "#94A3B8";
                                                    const difSign  = dr.dif_pct > 0 ? "+" : "";
                                                    const difColor = isMejor ? "#059669" : "#DC2626";
                                                    return (
                                                      <tr key={dr.licitacion_id}
                                                        style={{ background: di % 2 === 1 ? colorBg : "white" }}>
                                                        <td style={{ ...tdL, fontSize: 11, padding: "5px 10px", color: LBF_BLUE, fontFamily: "monospace" }}>
                                                          {dr.licitacion_id}
                                                        </td>
                                                        <td style={{ ...tdL, fontSize: 11, padding: "5px 10px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                          title={dr.organismo}>{dr.organismo}</td>
                                                        <td style={{ ...td, fontSize: 11, padding: "5px 10px", color, fontWeight: 700 }}>{dr.items_perdidos}</td>
                                                        <td style={{ ...td, fontSize: 11, padding: "5px 10px" }}>{fmtFull(dr.precio_lbf_avg)}</td>
                                                        <td style={{ ...td, fontSize: 11, padding: "5px 10px" }}>{fmtFull(dr.precio_adj_avg)}</td>
                                                        <td style={{ ...td, fontSize: 11, padding: "5px 10px", color: difColor, fontWeight: 700 }}>
                                                          {difSign}{dr.dif_pct.toFixed(1)}%
                                                        </td>
                                                        <td style={{ ...tdL, fontSize: 11, padding: "5px 10px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                          title={dr.competidor}>{dr.competidor}</td>
                                                        <td style={{ ...tdL, fontSize: 11, padding: "5px 10px" }}>
                                                          {sgl ? (
                                                            <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: sglBg, color: sglColor }}>
                                                              {sgl}
                                                            </span>
                                                          ) : (
                                                            <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>
                                                          )}
                                                        </td>
                                                        <td style={{ ...td, fontSize: 11, padding: "5px 10px", textAlign: "center" }}>
                                                          {dr.url_acta ? (
                                                            <a href={dr.url_acta} target="_blank" rel="noopener noreferrer"
                                                              title="Ver Acta de Adjudicación en Mercado Público"
                                                              style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "#EFF6FF", color: LBF_BLUE, textDecoration: "none", border: "1px solid #BFDBFE" }}>
                                                              📄 Ver
                                                            </a>
                                                          ) : (
                                                            <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>
                                                          )}
                                                        </td>
                                                        <td style={{ ...tdL, fontSize: 11, padding: "5px 10px", maxWidth: 260 }}>
                                                          {dr.motivo_lbf ? (
                                                            <span title={dr.motivo_lbf}
                                                              style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                              ⚠️ {dr.motivo_lbf}
                                                            </span>
                                                          ) : dr.url_acta ? (
                                                            <span style={{ color: "#94A3B8", fontSize: 10 }}>Sin inadmisibilidad</span>
                                                          ) : (
                                                            <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          </>
                                        );
                                      })() : (
                                        <div style={{ padding: "10px 20px", fontSize: 12, color: "#94A3B8" }}>Sin datos para este mes.</div>
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
                  )}
                </div>
              );
            };

            return (
              <>
                {renderSeccion("mejor")}
                {renderSeccion("mayor")}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
