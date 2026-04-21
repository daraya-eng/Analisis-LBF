"use client";

import React, { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import {
  ChevronDown, ChevronRight, AlertTriangle, TrendingDown, TrendingUp, Package,
  FileText, ShoppingCart, Users, Search, Zap,
} from "lucide-react";
import HelpButton from "@/components/help-button";
import { ExportButton, SearchInput, TableToolbar } from "@/components/table-tools";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ComposedChart, LabelList,
} from "recharts";

/* ─── Types ───────────────────────────────────────────── */

interface KamSummary {
  zona: string;
  kam: string;
  venta_ytd: number;
  n_clientes: number;
}

interface ClienteOp {
  rut: string;
  nombre: string;
  segmento: string;
  venta_26: number;
  venta_25: number;
  crec: number | null;
  gap: number;
  margen: number;
  contrib: number;
  ultima_compra: string | null;
  dias_sin_compra: number | null;
  meses_activos: number;
  n_productos: number;
  n_perdidos: number;
  monto_perdido: number;
  n_licitaciones: number;
  adjudicado: number;
  facturado_lic: number;
  adj_sin_facturar: number;
  monto_lbf_cm: number;
  monto_comp_cm: number;
  n_competidores_cm: number;
  alertas: string[];
  potencial: number;
  potencial_desglose: { tipo: string; monto: number }[];
}

interface Kpis {
  venta_26: number;
  venta_25: number;
  crec: number;
  n_clientes: number;
  n_declinando: number;
  n_con_perdidos: number;
  oportunidad_perdidos: number;
  adj_sin_facturar: number;
  potencial_total: number;
  cumpl_periodo: number;
  gap_meta: number;
  proyeccion_anual: number;
  cumpl_anual_proy: number;
}

interface MetaInfo {
  meta_periodo: number;
  meta_anual: number;
  meta_mes_actual: number;
  mes_actual_nombre: string;
  venta_mes_actual: number;
  ritmo_diario: number;
  ritmo_necesario: number;
  proyeccion_mes: number;
  dh_transcurridos: number;
  dh_totales: number;
  dh_restantes: number;
  cumpl_mes: number;
}

interface TopOportunidad {
  rut: string;
  nombre: string;
  potencial: number;
  desglose: { tipo: string; monto: number }[];
  venta_26: number;
  alertas: string[];
}

interface ClienteDetalle {
  productos: { codigo: string; descripcion: string; categoria: string; venta_26: number; venta_25: number; crec: number }[];
  perdidos: { codigo: string; descripcion: string; categoria: string; venta_25: number }[];
  nuevos: { codigo: string; descripcion: string; categoria: string; venta_26: number }[];
  tendencia: { mes: number; mes_nombre: string; venta_26: number; venta_25: number }[];
  licitaciones: { licitacion: string; inicio: string | null; termino: string | null; adjudicado: number; facturado: number; cumplimiento: number; dias_restantes: number | null }[];
  cm_detalle: { proveedor: string; monto: number; n_ocs: number; es_lbf: boolean }[];
  error?: string;
}

/* ─── Styles ──────────────────────────────────────────── */

const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 11, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const thC: React.CSSProperties = { ...thS, textAlign: "center" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 12 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number, sel?: boolean) => sel ? "#EFF6FF" : i % 2 === 0 ? "white" : "#FAFBFC";

const PERIOD_OPTIONS = [
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" }, { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" }, { value: "q4", label: "Q4" },
];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CAT_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "SQ", label: "SQ" },
  { value: "EVA", label: "EVA" },
  { value: "MAH", label: "MAH" },
  { value: "EQM", label: "EQM" },
];

function KpiCard({ title, value, sub, color, icon: Icon }: {
  title: string; value: string; sub?: string; color: string; icon?: React.ElementType;
}) {
  return (
    <div style={{ flex: "1 1 150px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          {Icon && <Icon size={13} style={{ color: "#94A3B8" }} />}
          <span style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Client Detail Panel — expanded when clicking a client row
   ═══════════════════════════════════════════════════════════ */

function ClientDetailPanel({ rut, periodo, categoria, zona }: { rut: string; periodo: string; categoria: string; zona?: string }) {
  const [det, setDet] = useState<ClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"productos" | "perdidos" | "licitaciones" | "cm">("productos");

  useEffect(() => {
    setLoading(true);
    // Parse periodo: "mes-3" → "periodo=mes&mes=3", "ytd" → "periodo=ytd"
    let pp = `periodo=${periodo}`;
    if (periodo.startsWith("mes-")) {
      pp = `periodo=mes&mes=${periodo.split("-")[1]}`;
    }
    const catParam = categoria ? `&categoria=${categoria}` : "";
    const zonaParam = zona ? `&zona=${encodeURIComponent(zona)}` : "";
    api.get<ClienteDetalle>(`/api/oportunidades/cliente-detalle?rut=${encodeURIComponent(rut)}&${pp}${catParam}${zonaParam}`)
      .then(r => { setDet(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rut, periodo, categoria, zona]);

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Cargando detalle...</div>;
  if (!det || det.error) return <div style={{ padding: 16, color: "#EF4444", fontSize: 12 }}>Error: {det?.error || "sin datos"}</div>;

  const tabs = [
    { id: "productos" as const, label: "Productos", count: det.productos.length },
    { id: "perdidos" as const, label: "Perdidos", count: det.perdidos.length, alert: det.perdidos.length > 0 },
    { id: "licitaciones" as const, label: "Licitaciones", count: det.licitaciones.length },
    { id: "cm" as const, label: "Conv. Marco", count: det.cm_detalle.length },
  ];

  return (
    <div style={{ padding: "16px 24px 20px", background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
      {/* Monthly trend chart */}
      {det.tendencia.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Tendencia Mensual</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={det.tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 10 }} />
              <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 11 }}
                formatter={(v: any, name: any) => [fmtAbs(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="venta_25" name="2025" fill="#CBD5E1" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="venta_25" position="top" formatter={(v: any) => v > 0 ? fmt(v) : ""} style={{ fontSize: 9, fill: "#94A3B8" }} />
              </Bar>
              <Bar dataKey="venta_26" name="2026" fill="#3B82F6" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="venta_26" position="top" formatter={(v: any) => v > 0 ? fmt(v) : ""} style={{ fontSize: 9, fill: "#3B82F6", fontWeight: 600 }} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
            background: tab === t.id ? (t.alert && t.id === "perdidos" ? "#FEE2E2" : "#DBEAFE") : "#F1F5F9",
            color: tab === t.id ? (t.alert && t.id === "perdidos" ? "#991B1B" : "#1E40AF") : "#64748B",
          }}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Productos activos */}
      {tab === "productos" && (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "#F8FAFC" }}>
              <tr><th style={{ ...thS, fontSize: 10 }}>Codigo</th><th style={{ ...thS, fontSize: 10 }}>Descripcion</th>
                <th style={{ ...thS, fontSize: 10 }}>Cat.</th><th style={{ ...thR, fontSize: 10 }}>Venta 26</th>
                <th style={{ ...thR, fontSize: 10 }}>Venta 25</th><th style={{ ...thR, fontSize: 10 }}>Crec.</th></tr>
            </thead>
            <tbody>
              {det.productos.map((p, i) => (
                <tr key={p.codigo} style={{ background: i % 2 === 0 ? "#F8FAFC" : "white" }}>
                  <td style={{ ...td, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{p.codigo}</td>
                  <td style={{ ...td, fontSize: 10, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                  <td style={{ ...td, fontSize: 10 }}>{p.categoria}</td>
                  <td style={{ ...tdR, fontSize: 10 }}>{fmtAbs(p.venta_26)}</td>
                  <td style={{ ...tdR, fontSize: 10, color: "#64748B" }}>{fmtAbs(p.venta_25)}</td>
                  <td style={{ ...tdR, fontSize: 10, fontWeight: 600, color: p.crec >= 0 ? "#10B981" : "#EF4444" }}>{p.crec > 0 ? "+" : ""}{p.crec}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Productos perdidos */}
      {tab === "perdidos" && (
        det.perdidos.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Sin productos perdidos</div> : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#FEF2F2" }}>
                <tr><th style={{ ...thS, fontSize: 10, color: "#991B1B" }}>Codigo</th>
                  <th style={{ ...thS, fontSize: 10, color: "#991B1B" }}>Descripcion</th>
                  <th style={{ ...thS, fontSize: 10, color: "#991B1B" }}>Cat.</th>
                  <th style={{ ...thR, fontSize: 10, color: "#991B1B" }}>Venta 2025</th></tr>
              </thead>
              <tbody>
                {det.perdidos.map((p, i) => (
                  <tr key={p.codigo} style={{ background: i % 2 === 0 ? "#FEF2F2" : "white" }}>
                    <td style={{ ...td, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{p.codigo}</td>
                    <td style={{ ...td, fontSize: 10, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                    <td style={{ ...td, fontSize: 10 }}>{p.categoria}</td>
                    <td style={{ ...tdR, fontSize: 10, color: "#EF4444", fontWeight: 600 }}>{fmtAbs(p.venta_25)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {det.nuevos.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", margin: "12px 0 6px" }}>Productos Nuevos 2026</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr><th style={{ ...thS, fontSize: 10, color: "#166534" }}>Codigo</th>
                      <th style={{ ...thS, fontSize: 10, color: "#166534" }}>Descripcion</th>
                      <th style={{ ...thR, fontSize: 10, color: "#166534" }}>Venta 2026</th></tr>
                  </thead>
                  <tbody>
                    {det.nuevos.map((p, i) => (
                      <tr key={p.codigo} style={{ background: i % 2 === 0 ? "#F0FDF4" : "white" }}>
                        <td style={{ ...td, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>{p.codigo}</td>
                        <td style={{ ...td, fontSize: 10, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                        <td style={{ ...tdR, fontSize: 10, color: "#10B981", fontWeight: 600 }}>{fmtAbs(p.venta_26)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )
      )}

      {/* Licitaciones */}
      {tab === "licitaciones" && (
        det.licitaciones.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Sin licitaciones adjudicadas vigentes</div> : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#F8FAFC" }}>
                <tr>
                  <th style={{ ...thS, fontSize: 10 }}>Licitacion</th>
                  <th style={{ ...thS, fontSize: 10 }}>Inicio</th>
                  <th style={{ ...thS, fontSize: 10 }}>Termino</th>
                  <th style={{ ...thR, fontSize: 10 }}>Adjudicado</th>
                  <th style={{ ...thR, fontSize: 10 }}>Facturado</th>
                  <th style={{ ...thR, fontSize: 10 }}>Pendiente</th>
                  <th style={{ ...thR, fontSize: 10 }}>Cumpl.</th>
                  <th style={{ ...thR, fontSize: 10 }}>Dias Rest.</th>
                </tr>
              </thead>
              <tbody>
                {det.licitaciones.map((l, i) => {
                  const urgente = l.dias_restantes !== null && l.dias_restantes <= 30 && l.cumplimiento < 100;
                  const pendiente = l.adjudicado - l.facturado;
                  return (
                    <tr key={l.licitacion} style={{ background: urgente ? "#FEF2F2" : i % 2 === 0 ? "#F8FAFC" : "white" }}>
                      <td style={{ ...td, fontSize: 10, fontFamily: "monospace" }}>{l.licitacion}</td>
                      <td style={{ ...td, fontSize: 10, color: "#64748B" }}>{l.inicio || "--"}</td>
                      <td style={{ ...td, fontSize: 10, color: urgente ? "#EF4444" : "#64748B", fontWeight: urgente ? 700 : 400 }}>{l.termino || "--"}</td>
                      <td style={{ ...tdR, fontSize: 10 }}>{fmtAbs(l.adjudicado)}</td>
                      <td style={{ ...tdR, fontSize: 10 }}>{fmtAbs(l.facturado)}</td>
                      <td style={{ ...tdR, fontSize: 10, fontWeight: 600, color: pendiente > 0 ? "#F59E0B" : "#10B981" }}>{fmtAbs(pendiente)}</td>
                      <td style={{ ...tdR, fontSize: 10, fontWeight: 700, color: l.cumplimiento >= 100 ? "#10B981" : l.cumplimiento >= 50 ? "#F59E0B" : "#EF4444" }}>
                        {l.cumplimiento}%
                      </td>
                      <td style={{ ...tdR, fontSize: 10, color: urgente ? "#EF4444" : "#64748B", fontWeight: urgente ? 700 : 400 }}>
                        {l.dias_restantes !== null ? `${l.dias_restantes}d` : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Convenio Marco */}
      {tab === "cm" && (
        det.cm_detalle.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Sin actividad CM registrada</div> : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#F8FAFC" }}>
                <tr><th style={{ ...thS, fontSize: 10 }}>Proveedor CM</th>
                  <th style={{ ...thR, fontSize: 10 }}>Monto</th><th style={{ ...thR, fontSize: 10 }}>OCs</th></tr>
              </thead>
              <tbody>
                {det.cm_detalle.map((c, i) => (
                  <tr key={c.proveedor} style={{ background: c.es_lbf ? "#EFF6FF" : i % 2 === 0 ? "#F8FAFC" : "white" }}>
                    <td style={{ ...td, fontSize: 10, fontWeight: c.es_lbf ? 700 : 400, color: c.es_lbf ? "#3B82F6" : "#1F2937", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.proveedor}{c.es_lbf && <span style={{ fontSize: 9, marginLeft: 4, background: "#DBEAFE", color: "#1E40AF", padding: "1px 4px", borderRadius: 3 }}>LBF</span>}
                    </td>
                    <td style={{ ...tdR, fontSize: 10, fontWeight: 600, color: c.es_lbf ? "#3B82F6" : "#EF4444" }}>{fmtAbs(c.monto)}</td>
                    <td style={{ ...tdR, fontSize: 10 }}>{c.n_ocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

export default function OportunidadesPage() {
  const [kams, setKams] = useState<KamSummary[]>([]);
  const [loadingKams, setLoadingKams] = useState(true);
  const [selectedZona, setSelectedZona] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState("ytd");
  const [categoria, setCategoria] = useState("");

  // Data for selected KAM
  const [clientes, setClientes] = useState<ClienteOp[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [topOp, setTopOp] = useState<TopOportunidad[]>([]);
  const [loadingCli, setLoadingCli] = useState(false);
  const [expandedRut, setExpandedRut] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // Load KAMs list
  useEffect(() => {
    setLoadingKams(true);
    api.get<{ kams: KamSummary[] }>("/api/oportunidades/")
      .then(r => {
        setKams(r.kams || []);
        if (r.kams?.length > 0 && !selectedZona) {
          setSelectedZona(r.kams[0].zona);
        }
        setLoadingKams(false);
      })
      .catch(() => setLoadingKams(false));
  }, []);

  // Build API query param from periodo state
  const buildPeriodoParam = useCallback((p: string) => {
    if (p.startsWith("mes-")) {
      const mesNum = p.split("-")[1];
      return `periodo=mes&mes=${mesNum}`;
    }
    return `periodo=${p}`;
  }, []);

  // Load clients when KAM, period, or category changes
  useEffect(() => {
    if (!selectedZona) return;
    setLoadingCli(true);
    setExpandedRut(null);
    setSearch("");
    const pp = buildPeriodoParam(periodo);
    const catParam = categoria ? `&categoria=${categoria}` : "";
    api.get<{ kpis: Kpis; meta: MetaInfo; clientes: ClienteOp[]; top_oportunidades: TopOportunidad[] }>(`/api/oportunidades/clientes?zona=${encodeURIComponent(selectedZona)}&${pp}${catParam}`)
      .then(r => {
        setKpis(r.kpis || null);
        setMeta(r.meta || null);
        setClientes(r.clientes || []);
        setTopOp(r.top_oportunidades || []);
        setLoadingCli(false);
      })
      .catch(() => setLoadingCli(false));
  }, [selectedZona, periodo, categoria, buildPeriodoParam]);

  const selectedKam = kams.find(k => k.zona === selectedZona);

  // Filtered clients
  const filtered = useMemo(() => {
    if (!search.trim()) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.rut.toLowerCase().includes(q)
    );
  }, [clientes, search]);

  if (loadingKams) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <div style={{ fontSize: 14, color: "#94A3B8" }}>Cargando KAMs...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>Oportunidades por KAM</h1>
          <HelpButton module="oportunidades" />
        </div>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: "4px 0 0" }}>
          Mapa de clientes para preparar reuniones — detecta oportunidades de crecimiento
        </p>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.value} onClick={() => setPeriodo(p.value)} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #E2E8F0", cursor: "pointer", fontSize: 13,
            background: periodo === p.value ? "#3B82F6" : "white", color: periodo === p.value ? "white" : "#374151",
            fontWeight: periodo === p.value ? 600 : 400,
          }}>{p.label}</button>
        ))}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m <= new Date().getMonth() + 1).map(m => (
          <button key={m} onClick={() => setPeriodo(`mes-${m}`)} style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #E2E8F0", cursor: "pointer", fontSize: 12,
            background: periodo === `mes-${m}` ? "#FEF3C7" : "white", color: periodo === `mes-${m}` ? "#92400E" : "#64748B",
            fontWeight: periodo === `mes-${m}` ? 700 : 400,
          }}>{MESES[m - 1]}</button>
        ))}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" }}>Categoria:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {CAT_OPTIONS.map(c => (
            <button key={c.value} onClick={() => setCategoria(c.value)} style={{
              padding: "5px 12px", borderRadius: 6, border: "1px solid #E2E8F0", cursor: "pointer", fontSize: 12,
              background: categoria === c.value ? "#8B5CF6" : "white",
              color: categoria === c.value ? "white" : "#374151",
              fontWeight: categoria === c.value ? 700 : 400,
            }}>{c.label}</button>
          ))}
        </div>
        {categoria && (
          <span style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 600 }}>
            Filtrando por {categoria}
          </span>
        )}
      </div>

      {/* KAM tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {kams.map(k => {
          const isActive = k.zona === selectedZona;
          return (
            <button key={k.zona} onClick={() => setSelectedZona(k.zona)} style={{
              padding: "8px 16px", borderRadius: 8, border: isActive ? "2px solid #3B82F6" : "1px solid #E2E8F0",
              cursor: "pointer", fontSize: 12, background: isActive ? "#EFF6FF" : "white",
              color: isActive ? "#1E40AF" : "#374151", fontWeight: isActive ? 700 : 400,
              whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.15s",
            }}>
              <div style={{ fontWeight: 700 }}>{k.zona}</div>
              <div style={{ fontSize: 10, color: isActive ? "#3B82F6" : "#94A3B8", marginTop: 2 }}>{k.kam}</div>
            </button>
          );
        })}
      </div>

      {/* KPI Cards — Meta & Cumplimiento */}
      {kpis && meta && !loadingCli && (
        <>
          {/* Row 1: Meta del mes actual + Cumplimiento + Proyeccion */}
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
              Meta {meta.mes_actual_nombre} — {selectedKam?.kam || selectedZona}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              {/* Meta vs Venta mes */}
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Meta mes</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{fmt(meta.meta_mes_actual)}</div>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Venta {meta.mes_actual_nombre}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#3B82F6" }}>{fmt(meta.venta_mes_actual)}</div>
              </div>
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Cumpl. mes</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: meta.cumpl_mes >= 100 ? "#10B981" : meta.cumpl_mes >= 80 ? "#F59E0B" : "#EF4444" }}>
                  {meta.cumpl_mes}%
                </div>
              </div>
              {/* Divider */}
              <div style={{ width: 1, height: 40, background: "#E2E8F0", alignSelf: "center" }} />
              {/* Ritmo */}
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Ritmo diario</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{fmt(meta.ritmo_diario)}</div>
                <div style={{ fontSize: 10, color: meta.ritmo_diario >= meta.ritmo_necesario ? "#10B981" : "#EF4444" }}>
                  Necesario: {fmt(meta.ritmo_necesario)}
                </div>
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Proyeccion mes</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: meta.proyeccion_mes >= meta.meta_mes_actual ? "#10B981" : "#EF4444" }}>
                  {fmt(meta.proyeccion_mes)}
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>
                  {meta.dh_restantes}d habiles restantes
                </div>
              </div>
              {/* Divider */}
              <div style={{ width: 1, height: 40, background: "#E2E8F0", alignSelf: "center" }} />
              {/* Meta periodo + anual */}
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Meta periodo</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{fmt(meta.meta_periodo)}</div>
                <div style={{ fontSize: 10, color: kpis.cumpl_periodo >= 100 ? "#10B981" : kpis.cumpl_periodo >= 80 ? "#F59E0B" : "#EF4444" }}>
                  Cumpl: {kpis.cumpl_periodo}% | Gap: {fmt(kpis.gap_meta)}
                </div>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Proyeccion anual</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: kpis.cumpl_anual_proy >= 100 ? "#10B981" : kpis.cumpl_anual_proy >= 80 ? "#F59E0B" : "#EF4444" }}>
                  {fmt(kpis.proyeccion_anual)}
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>
                  {kpis.cumpl_anual_proy}% de meta anual ({fmt(meta.meta_anual)})
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: KPIs de venta + oportunidad */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KpiCard title="Venta Periodo" value={fmt(kpis.venta_26)} sub={`vs ${fmt(kpis.venta_25)} (${kpis.crec > 0 ? "+" : ""}${kpis.crec}%)`}
              color={kpis.crec >= 0 ? "#10B981" : "#EF4444"} icon={Users} />
            <KpiCard title="Clientes" value={kpis.n_clientes.toString()} sub={`${kpis.n_declinando} declinando`}
              color="#3B82F6" icon={Users} />
            <KpiCard title="Prod. Perdidos" value={`${kpis.n_con_perdidos} clientes`} sub={`${fmt(kpis.oportunidad_perdidos)} recuperable`}
              color="#EF4444" icon={Package} />
            <KpiCard title="Adj. sin Facturar" value={fmt(kpis.adj_sin_facturar)}
              color="#F59E0B" icon={FileText} />
            <KpiCard title="Potencial Total" value={fmt(kpis.potencial_total)} sub="Oportunidad identificada"
              color="#8B5CF6" icon={TrendingDown} />
          </div>

          {/* Top Oportunidades */}
          {topOp.length > 0 && (
            <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                    Top Oportunidades — {selectedKam?.kam || selectedZona}
                  </h3>
                  <p style={{ fontSize: 11, color: "#94A3B8", margin: "2px 0 0" }}>
                    Clientes con mayor potencial de crecimiento. Haz clic en un cliente en la tabla para ver detalle.
                  </p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 1, background: "#F1F5F9" }}>
                {topOp.map((op, idx) => (
                  <div key={op.rut} style={{ background: "white", padding: "12px 16px", cursor: "pointer" }}
                    onClick={() => setExpandedRut(expandedRut === op.rut ? null : op.rut)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", marginRight: 6 }}>#{idx + 1}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{op.nombre}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#8B5CF6" }}>{fmt(op.potencial)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {op.desglose.map((d, j) => (
                        <span key={j} style={{
                          fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                          background: d.tipo === "Prod. perdidos" ? "#FEE2E2" : d.tipo === "Adj. sin facturar" ? "#FEF3C7" : d.tipo === "CM competencia" ? "#E0E7FF" : "#F3E8FF",
                          color: d.tipo === "Prod. perdidos" ? "#991B1B" : d.tipo === "Adj. sin facturar" ? "#92400E" : d.tipo === "CM competencia" ? "#3730A3" : "#6B21A8",
                        }}>
                          {d.tipo}: {fmt(d.monto)}
                        </span>
                      ))}
                    </div>
                    {op.alertas.length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                        {op.alertas.map((a, j) => (
                          <span key={j} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#FEF2F2", color: "#991B1B" }}>{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Client table */}
      {loadingCli ? (
        <div style={{ ...card, padding: 60, textAlign: "center", color: "#94A3B8" }}>
          Cargando clientes de {selectedKam?.kam || selectedZona}...
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <TableToolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o RUT..." width={280} />
            <ExportButton data={filtered.map(c => ({
              rut: c.rut, nombre: c.nombre, segmento: c.segmento,
              venta_26: c.venta_26, venta_25: c.venta_25,
              crec: c.crec !== null ? `${c.crec}%` : "--",
              margen: `${c.margen}%`,
              dias_sin_compra: c.dias_sin_compra ?? "--",
              n_productos: c.n_productos, n_perdidos: c.n_perdidos,
              monto_perdido: c.monto_perdido,
              n_licitaciones: c.n_licitaciones,
              adj_sin_facturar: c.adj_sin_facturar,
              monto_comp_cm: c.monto_comp_cm,
              potencial: c.potencial,
              alertas: c.alertas.join("; "),
            }))} filename={`oportunidades_${selectedZona}`} columns={[
              { key: "rut", label: "RUT" }, { key: "nombre", label: "Cliente" }, { key: "segmento", label: "Segmento" },
              { key: "venta_26", label: "Venta 2026" }, { key: "venta_25", label: "Venta 2025" }, { key: "crec", label: "Crec." },
              { key: "margen", label: "Margen" }, { key: "dias_sin_compra", label: "Dias s/compra" },
              { key: "n_productos", label: "Productos" }, { key: "n_perdidos", label: "Prod. Perdidos" },
              { key: "monto_perdido", label: "Monto Perdido" }, { key: "n_licitaciones", label: "Licitaciones" },
              { key: "adj_sin_facturar", label: "Adj. sin Fact." }, { key: "monto_comp_cm", label: "CM Competencia" },
              { key: "potencial", label: "Potencial" }, { key: "alertas", label: "Alertas" },
            ]} />
            {search && <span style={{ fontSize: 11, color: "#94A3B8" }}>{filtered.length} de {clientes.length}</span>}
          </TableToolbar>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ ...thS, width: 30 }}></th>
                  <th style={thS}>Cliente</th>
                  <th style={{ ...thS, width: 60 }}>Seg.</th>
                  <th style={thR}>Venta 26</th>
                  <th style={thR}>Venta 25</th>
                  <th style={thR}>Crec.</th>
                  <th style={thR}>Margen</th>
                  <th style={thC} title="Dias sin compra">Ult. Compra</th>
                  <th style={thC} title="Productos activos / perdidos">Prod.</th>
                  <th style={thC} title="Licitaciones vigentes">Lic.</th>
                  <th style={thR} title="Compra de competidores por Convenio Marco">CM Comp.</th>
                  <th style={thR} title="Potencial de crecimiento identificado">Potencial</th>
                  <th style={{ ...thS, minWidth: 120 }}>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={13} style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Sin clientes</td></tr>
                ) : filtered.map((c, i) => {
                  const isExpanded = expandedRut === c.rut;
                  return (
                    <Fragment key={c.rut}>
                      <tr
                        onClick={() => { setExpandedRut(isExpanded ? null : c.rut); }}
                        style={{ cursor: "pointer", borderBottom: "1px solid #F1F5F9", background: rowBg(i, isExpanded) }}
                      >
                        <td style={{ ...td, textAlign: "center" }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td style={{ ...td, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.nombre}
                          <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>{c.rut}</div>
                        </td>
                        <td style={{ ...td, fontSize: 10 }}>
                          <span style={{
                            padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                            background: c.segmento === "PUBLICO" ? "#DBEAFE" : c.segmento === "PRIVADO" ? "#F3E8FF" : "#F1F5F9",
                            color: c.segmento === "PUBLICO" ? "#1E40AF" : c.segmento === "PRIVADO" ? "#6B21A8" : "#64748B",
                          }}>{c.segmento === "PUBLICO" ? "PUB" : c.segmento === "PRIVADO" ? "PRIV" : "—"}</span>
                        </td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmt(c.venta_26)}</td>
                        <td style={{ ...tdR, color: "#64748B" }}>{fmt(c.venta_25)}</td>
                        <td style={{ ...tdR, fontWeight: 600, color: c.crec !== null ? (c.crec >= 0 ? "#10B981" : "#EF4444") : "#94A3B8" }}>
                          {c.crec !== null ? `${c.crec > 0 ? "+" : ""}${c.crec}%` : "--"}
                        </td>
                        <td style={{ ...tdR, color: c.margen >= 40 ? "#10B981" : c.margen >= 30 ? "#F59E0B" : "#EF4444" }}>
                          {c.margen}%
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {c.dias_sin_compra !== null ? (
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                              background: c.dias_sin_compra > 60 ? "#FEE2E2" : c.dias_sin_compra > 30 ? "#FEF3C7" : "#DCFCE7",
                              color: c.dias_sin_compra > 60 ? "#991B1B" : c.dias_sin_compra > 30 ? "#92400E" : "#166534",
                            }}>{c.dias_sin_compra}d</span>
                          ) : <span style={{ color: "#94A3B8", fontSize: 10 }}>--</span>}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontSize: 11 }}>
                          <span style={{ fontWeight: 600 }}>{c.n_productos}</span>
                          {c.n_perdidos > 0 && (
                            <span style={{ color: "#EF4444", fontSize: 10, marginLeft: 2 }}>(-{c.n_perdidos})</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontSize: 11 }}>
                          {c.n_licitaciones > 0 ? (
                            <span style={{ fontWeight: 600, color: "#3B82F6" }}>{c.n_licitaciones}</span>
                          ) : <span style={{ color: "#CBD5E1" }}>0</span>}
                        </td>
                        <td style={{ ...tdR, fontSize: 11, color: c.monto_comp_cm > 0 ? "#EF4444" : "#CBD5E1", fontWeight: c.monto_comp_cm > 0 ? 600 : 400 }}>
                          {c.monto_comp_cm > 0 ? fmt(c.monto_comp_cm) : "--"}
                        </td>
                        <td style={{ ...tdR, fontSize: 11, fontWeight: c.potencial > 0 ? 700 : 400, color: c.potencial > 0 ? "#8B5CF6" : "#CBD5E1" }}
                          title={c.potencial_desglose?.map(d => `${d.tipo}: ${fmt(d.monto)}`).join("\n") || ""}
                        >
                          {c.potencial > 0 ? fmt(c.potencial) : "--"}
                        </td>
                        <td style={{ ...td, fontSize: 10 }}>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {c.alertas.map((a, j) => (
                              <span key={j} style={{
                                padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 600,
                                background: a.includes("Caida") ? "#FEE2E2" : a.includes("sin compra") ? "#FEF3C7" : a.includes("perdidos") ? "#FFE4E6" : a.includes("CM") ? "#E0E7FF" : "#FEF9C3",
                                color: a.includes("Caida") ? "#991B1B" : a.includes("sin compra") ? "#92400E" : a.includes("perdidos") ? "#9F1239" : a.includes("CM") ? "#3730A3" : "#854D0E",
                              }}>{a}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr><td colSpan={13} style={{ padding: 0 }}>
                          <ClientDetailPanel rut={c.rut} periodo={periodo} categoria={categoria} zona={selectedZona ?? undefined} />
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
