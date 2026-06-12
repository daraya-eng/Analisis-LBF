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
interface GestionTipoMes {
  ano: number; mes: number; label: string; tipo: string;
  items_lbf: number; items_adj: number; tasa_adj: number;
  lics_lbf: number; lics_adj: number; monto_adj: number;
}

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
  estado_sgl: string; estado_mp?: string;
  url_acta?: string | null;
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
  const [sglPeriodo, setSglPeriodo]     = useState<"mes" | "ytd" | "mat" | "ano">("mes");
  const [sglTipoMes, setSglTipoMes]     = useState<GestionTipoMes[]>([]);

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
  const [perdidosColEstado, setPerdidosColEstado] = useState<"sgl" | "mp">("sgl");
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
      api.get<{ rows: GestionTipoMes[] }>("/api/mercados-relevantes/falcon-por-tipo-mes", { noCache: true }),
    ]).then(([res, usr, mes, est, tipo]) => {
      setSglResumen(res ?? null);
      setSglUsuarios(usr.usuarios ?? []);
      setSglMeses(mes.meses ?? []);
      setSglEstados(est.estados ?? []);
      setSglTipoMes(tipo.rows ?? []);
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
      <div style={{ marginBottom: 20, borderBottom: "2px solid #FECDD3", paddingBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#BE185D", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
          Departamento de Licitaciones
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>Carolina Jiménez</span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>·</span>
          <span style={{ fontSize: 11, color: "#64748B" }}>Jefe de Licitaciones</span>
        </div>
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
                  const today    = new Date();
                  const thisYear = today.getFullYear();
                  const thisMes  = today.getMonth() + 1;
                  const isCurrentMonth = (r: GestionMes) => r.ano === thisYear && r.mes === thisMes;

                  // ── Calcular chartData según período ──────────────────────
                  type ChartPoint = { label: string; items_lbf: number; items_adj: number; tasa_adj: number };
                  let chartData: ChartPoint[] = [];
                  let modoAno = false;

                  if (sglPeriodo === "ytd") {
                    chartData = sglMeses
                      .filter(r => r.ano === thisYear && !isCurrentMonth(r))
                      .map(r => ({ label: r.label, items_lbf: r.items_lbf, items_adj: r.items_adj, tasa_adj: r.tasa_adj }));
                  } else if (sglPeriodo === "mat") {
                    // Últimos 12 meses completos
                    const cutoff = new Date(thisYear, today.getMonth() - 12, 1);
                    chartData = sglMeses
                      .filter(r => !isCurrentMonth(r) && new Date(r.ano, r.mes - 1, 1) >= cutoff)
                      .slice(-12)
                      .map(r => ({ label: r.label, items_lbf: r.items_lbf, items_adj: r.items_adj, tasa_adj: r.tasa_adj }));
                  } else if (sglPeriodo === "ano") {
                    modoAno = true;
                    const years = [thisYear - 1, thisYear];
                    chartData = years.map(y => {
                      const rows = sglMeses.filter(r => r.ano === y && !isCurrentMonth(r));
                      const items_lbf = rows.reduce((s, r) => s + r.items_lbf, 0);
                      const items_adj = rows.reduce((s, r) => s + r.items_adj, 0);
                      return { label: String(y), items_lbf, items_adj, tasa_adj: items_lbf > 0 ? +(items_adj / items_lbf * 100).toFixed(1) : 0 };
                    });
                  } else {
                    // "mes": últimos 15 meses completos
                    const cutoff = new Date(thisYear, today.getMonth() - 15, 1);
                    chartData = sglMeses
                      .filter(r => !isCurrentMonth(r) && new Date(r.ano, r.mes - 1, 1) >= cutoff)
                      .slice(-15)
                      .map(r => ({ label: r.label, items_lbf: r.items_lbf, items_adj: r.items_adj, tasa_adj: r.tasa_adj }));
                  }

                  if (chartData.length === 0) return null;

                  const PERIODOS: { id: "mes" | "ytd" | "mat" | "ano"; label: string }[] = [
                    { id: "mes", label: "Mes" },
                    { id: "ytd", label: "YTD" },
                    { id: "mat", label: "MAT" },
                    { id: "ano", label: "Año" },
                  ];

                  const periodoLabel = sglPeriodo === "mes" ? "últimos 15 meses"
                    : sglPeriodo === "ytd" ? `Ene–${MESES_LABEL[thisMes - 1] || ""} ${thisYear}`
                    : sglPeriodo === "mat" ? "últimos 12 meses móviles"
                    : `${thisYear - 1} vs ${thisYear}`;

                  return (
                    <div style={{ ...card, marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                            Tasa de Adjudicación — LBF Licitaciones
                          </h2>
                          <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
                            {periodoLabel} · solo canal Licitación · excluye mes en curso
                          </p>
                        </div>
                        {/* Filtro período */}
                        <div style={{ display: "flex", gap: 4 }}>
                          {PERIODOS.map((p, i) => {
                            const active = sglPeriodo === p.id;
                            return (
                              <button key={p.id} onClick={() => setSglPeriodo(p.id)} style={{
                                padding: "4px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                border: `1px solid ${active ? "#BE185D" : "#E2E8F0"}`,
                                background: active ? "#BE185D" : "white",
                                color: active ? "white" : "#64748B",
                                borderRadius: i === 0 ? "6px 0 0 6px" : i === PERIODOS.length - 1 ? "0 6px 6px 0" : "0",
                              }}>{p.label}</button>
                            );
                          })}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData} margin={{ top: 20, right: 52, left: 0, bottom: 0 }} barCategoryGap={modoAno ? "40%" : "25%"}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="label" tick={{ fontSize: modoAno ? 13 : 10, fill: "#374151", fontWeight: modoAno ? 700 : 400 }} axisLine={false} tickLine={false} />
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
                          <Bar yAxisId="items" dataKey="items_lbf" name="Participados" fill="#F9A8D4" radius={[3,3,0,0]}>
                            <LabelList dataKey="items_lbf" position="top" style={{ fontSize: modoAno ? 12 : 9, fill: "#9D174D", fontWeight: 600 }} />
                          </Bar>
                          <Bar yAxisId="items" dataKey="items_adj" name="Adjudicados" fill="#BE185D" radius={[3,3,0,0]}>
                            <LabelList dataKey="items_adj" position="top" style={{ fontSize: modoAno ? 12 : 9, fill: "#881337", fontWeight: 700 }} />
                          </Bar>
                          <Line yAxisId="pct" type="monotone" dataKey="tasa_adj" name="% Adj."
                            stroke="#D97706" strokeWidth={2.5} dot={{ r: modoAno ? 6 : 3, fill: "#D97706", stroke: "white", strokeWidth: 2 }}
                            connectNulls={false}>
                            <LabelList dataKey="tasa_adj" position="top" style={{ fontSize: modoAno ? 12 : 9, fill: "#92400E", fontWeight: 700 }}
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

          {/* ── Gráfico por tipo de licitación ───────────────────────────── */}
          {activeTab === "sgl" && sglTipoMes.length > 0 && (() => {
            const today    = new Date();
            const thisYear = today.getFullYear();
            const thisMes  = today.getMonth() + 1;
            const isCurrentMonth = (ano: number, mes: number) => ano === thisYear && mes === thisMes;

            // Aplicar mismo filtro de período que el gráfico principal
            let rowsFiltrados = sglTipoMes.filter(r => !isCurrentMonth(r.ano, r.mes));
            if (sglPeriodo === "ytd") {
              rowsFiltrados = rowsFiltrados.filter(r => r.ano === thisYear);
            } else if (sglPeriodo === "mat") {
              const cutoff = new Date(thisYear, today.getMonth() - 12, 1);
              rowsFiltrados = rowsFiltrados.filter(r => new Date(r.ano, r.mes - 1, 1) >= cutoff);
            } else if (sglPeriodo === "mes") {
              const cutoff = new Date(thisYear, today.getMonth() - 15, 1);
              rowsFiltrados = rowsFiltrados.filter(r => new Date(r.ano, r.mes - 1, 1) >= cutoff);
            }

            // Paleta por tipo
            const TIPO_COLORS: Record<string, string> = {
              LR: "#BE185D", LP: "#F9A8D4", LQ: "#A78BFA",
              LE: "#FCD34D", L1: "#6EE7B7", CO: "#93C5FD", CM: "#F97316", Otro: "#CBD5E1",
            };

            // Tipos presentes en los datos
            const tipos = Array.from(new Set(rowsFiltrados.map(r => r.tipo))).sort();

            if (sglPeriodo === "ano") {
              // Modo año: agrupar por año y tipo
              const years = [thisYear - 1, thisYear];
              type AnoTipoPoint = Record<string, string | number>;
              const chartData: AnoTipoPoint[] = years.map(y => {
                const punto: AnoTipoPoint = { label: String(y) };
                tipos.forEach(t => {
                  const rows = rowsFiltrados.filter(r => r.ano === y && r.tipo === t);
                  punto[t] = rows.reduce((s, r) => s + r.items_adj, 0);
                });
                punto["monto_adj"] = rowsFiltrados.filter(r => r.ano === y).reduce((s, r) => s + r.monto_adj, 0);
                return punto;
              });
              return (
                <div style={{ ...card, marginBottom: 20 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
                    Adjudicados por Tipo de Licitación — {thisYear - 1} vs {thisYear}
                  </h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData} margin={{ top: 16, right: 70, left: 0, bottom: 0 }} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#374151", fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="items" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                      <YAxis yAxisId="monto" orientation="right" tick={{ fontSize: 9, fill: "#6D28D9" }}
                        axisLine={false} tickLine={false} width={60}
                        tickFormatter={v => `$${Math.round((v as number)/1_000_000_000)}MM`} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                        formatter={(v, name) =>
                          name === "Monto adj." ? [fmtM(v as number), name] : [(v as number).toLocaleString("es-CL"), String(name)]
                        } />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      {tipos.map(t => (
                        <Bar key={t} yAxisId="items" dataKey={t} name={t} stackId="a" fill={TIPO_COLORS[t] ?? "#CBD5E1"} radius={[0,0,0,0]}>
                          <LabelList dataKey={t} position="inside" style={{ fontSize: 9, fill: "white", fontWeight: 700 }}
                            formatter={(v: unknown) => (typeof v === "number" && v > 0) ? String(v) : ""} />
                        </Bar>
                      ))}
                      <Line yAxisId="monto" type="monotone" dataKey="monto_adj" name="Monto adj."
                        stroke="#6D28D9" strokeWidth={3} dot={{ r: 6, fill: "#6D28D9", stroke: "white", strokeWidth: 2 }}>
                        <LabelList dataKey="monto_adj" position="top" style={{ fontSize: 11, fill: "#4C1D95", fontWeight: 700 }}
                          formatter={(v: unknown) => typeof v === "number" && v > 0 ? fmtM(v) : ""} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            }

            // Modo mensual: pivotar por mes
            const mesesUnicos = Array.from(
              new Map(rowsFiltrados.map(r => [`${r.ano}-${r.mes}`, r.label])).entries()
            ).sort((a, b) => a[0].localeCompare(b[0]));

            type MesTipoPoint = Record<string, string | number>;
            const chartData: MesTipoPoint[] = mesesUnicos.map(([key, label]) => {
              const [ano, mes] = key.split("-").map(Number);
              const punto: MesTipoPoint = { label };
              tipos.forEach(t => {
                const row = rowsFiltrados.find(r => r.ano === ano && r.mes === mes && r.tipo === t);
                punto[t] = row?.items_adj ?? 0;
              });
              // monto total del mes (suma de todos los tipos)
              punto["monto_adj"] = rowsFiltrados
                .filter(r => r.ano === ano && r.mes === mes)
                .reduce((s, r) => s + r.monto_adj, 0);
              return punto;
            });

            if (chartData.length === 0) return null;

            return (
              <div style={{ ...card, marginBottom: 20 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
                  Adjudicados por Tipo de Licitación
                </h2>
                <p style={{ fontSize: 11, color: "#475569", margin: "0 0 14px" }}>
                  Ítems adjudicados apilados por tipo · línea = monto adjudicado total · mismo período que el gráfico superior
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData} margin={{ top: 16, right: 56, left: 0, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="items" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                    <YAxis yAxisId="monto" orientation="right" tick={{ fontSize: 9, fill: "#6D28D9" }}
                      axisLine={false} tickLine={false} width={52}
                      tickFormatter={v => `$${Math.round((v as number)/1_000_000)}M`} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                      formatter={(v, name) =>
                        name === "Monto adj." ? [fmtM(v as number), name] : [(v as number).toLocaleString("es-CL"), String(name)]
                      } />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    {tipos.map(t => (
                      <Bar key={t} yAxisId="items" dataKey={t} name={t} stackId="a" fill={TIPO_COLORS[t] ?? "#CBD5E1"} radius={[0,0,0,0]} />
                    ))}
                    <Line yAxisId="monto" type="monotone" dataKey="monto_adj" name="Monto adj."
                      stroke="#6D28D9" strokeWidth={2.5} dot={{ r: 3, fill: "#6D28D9", stroke: "white", strokeWidth: 2 }}
                      connectNulls={false}>
                      <LabelList dataKey="monto_adj" position="top" style={{ fontSize: 9, fill: "#4C1D95", fontWeight: 700 }}
                        formatter={(v: unknown) => typeof v === "number" && v > 0 ? fmtM(v) : ""} />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
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
              const color     = isMejor ? "#7C3AED" : "#BE185D";
              const colorBg   = isMejor ? "#F5F3FF" : "#FFF1F2";
              const colorBord = isMejor ? "#DDD6FE" : "#FECDD3";
              const colorAcct = isMejor ? "#6D28D9" : "#9D174D";
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
                      <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart
                          data={mesData.map(m => ({
                            label: m.label,
                            lics:  isMejor ? (m.mejor_lics  ?? 0) : (m.mayor_lics  ?? 0),
                            items: isMejor ? (m.mejor_items ?? 0) : (m.mayor_items ?? 0),
                          }))}
                          margin={{ top: 22, right: 16, bottom: 0, left: 0 }}
                          barCategoryGap="28%"
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                            formatter={(value: unknown, name: unknown) => [(Number(value) || 0).toLocaleString("es-CL"), String(name)]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <Bar dataKey="lics" name="Licitaciones" fill={colorBord} radius={[3,3,0,0]}>
                            <LabelList dataKey="lics" position="top" style={{ fontSize: 9, fill: colorAcct, fontWeight: 600 }} />
                          </Bar>
                          <Bar dataKey="items" name="Ítems perdidos" fill={color} radius={[3,3,0,0]}>
                            <LabelList dataKey="items" position="top" style={{ fontSize: 9, fill: colorAcct, fontWeight: 700 }} />
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
                                                    <th style={{ ...thL, fontSize: 10, padding: "6px 10px", background: "transparent" }}>
                                                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <span
                                                          onClick={() => setPerdidosColEstado("sgl")}
                                                          style={{ cursor: "pointer", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                            background: perdidosColEstado === "sgl" ? "#1D4ED8" : "#E2E8F0",
                                                            color: perdidosColEstado === "sgl" ? "white" : "#64748B" }}>SGL</span>
                                                        <span
                                                          onClick={() => setPerdidosColEstado("mp")}
                                                          style={{ cursor: "pointer", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                            background: perdidosColEstado === "mp" ? "#1D4ED8" : "#E2E8F0",
                                                            color: perdidosColEstado === "mp" ? "white" : "#64748B" }}>MP</span>
                                                        <span>Estado</span>
                                                      </div>
                                                    </th>
                                                    <th style={{ ...th,  fontSize: 10, padding: "6px 10px", background: "transparent" }}>Acta</th>
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
                                                          {perdidosColEstado === "sgl" ? (
                                                            sgl ? (
                                                              <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: sglBg, color: sglColor }}>
                                                                {sgl}
                                                              </span>
                                                            ) : (
                                                              <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>
                                                            )
                                                          ) : (
                                                            (() => {
                                                              const mp = dr.estado_mp || "";
                                                              const mpBg = mp === "Adjudicada"    ? "#DCFCE7"
                                                                         : mp === "No Adjudicada" ? "#FEF2F2"
                                                                         : "#F1F5F9";
                                                              const mpColor = mp === "Adjudicada"    ? "#16A34A"
                                                                            : mp === "No Adjudicada" ? "#DC2626"
                                                                            : "#94A3B8";
                                                              return mp ? (
                                                                <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: mpBg, color: mpColor }}>
                                                                  {mp}
                                                                </span>
                                                              ) : <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>;
                                                            })()
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
