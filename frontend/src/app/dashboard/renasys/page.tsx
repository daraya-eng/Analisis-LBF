"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  MapPin, TrendingUp, Users, DollarSign,
  Percent, Activity, ChevronDown, X, Building2, Search,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Kpis {
  venta_mes: number; contrib_mes: number; margen_mes: number;
  venta_12m: number; contrib_12m: number; margen_12m: number;
  n_clientes: number; var_mes: number; venta_mes_ant: number;
}
interface Cliente {
  rut: string; nombre: string; region: string; ciudad: string;
  vendedor: string; segmento: string; kam: string; tipo: string;
  venta_mes: number; contrib_mes: number; margen_mes: number;
  venta_12m: number; contrib_12m: number; margen_12m: number;
}
interface Region {
  region: string; nombre: string; lat: number; lon: number;
  venta: number; contrib: number; margen: number; n_clientes: number; top_cliente: string;
}
interface Zona { vendedor: string; kam: string; venta: number; contrib: number; margen: number; n_clientes: number }
interface Subclase { subclase: string; label: string; venta: number; contrib: number; pct: number; margen: number }
interface Modelo { subclase: string; descripcion: string; venta: number; contrib: number; cant: number }
interface Tendencia { mes: number; label: string; venta: number; contrib: number; margen: number; n_clientes: number }
interface RenasysData {
  mes: number; ano: number; label: string;
  kpis: Kpis; clientes: Cliente[]; regiones: Region[];
  zonas: Zona[]; subclases: Subclase[]; modelos: Modelo[]; tendencia: Tendencia[];
}
interface DetalleData {
  productos: { subclase: string; descripcion: string; venta: number; contrib: number; cant: number; margen: number }[];
  tendencia: { label: string; venta: number; contrib: number; margen: number }[];
}

// ── Lazy load del mapa (requiere window) ───────────────────────────────────────
const ChileMap = dynamic(() => import("./ChileMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 13 }}>
      Cargando mapa…
    </div>
  ),
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => {
  if (!n && n !== 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n < 0 ? "-$" : "$") + (abs / 1e9).toFixed(1) + "MM";
  if (abs >= 1e6) return (n < 0 ? "-$" : "$") + (abs / 1e6).toFixed(1) + "M";
  return (n < 0 ? "-$" : "$") + abs.toLocaleString("es-CL");
};
const fmtPct = (n: number) => (n == null ? "—" : n.toFixed(1) + "%");
const margenColor = (m: number) => m >= 40 ? "#10B981" : m >= 30 ? "#F59E0B" : "#EF4444";

const SUBCLASE_COLORS: Record<string, string> = {
  "TPN KITS": "#3B82F6",
  "TPN CANISTER": "#8B5CF6",
  "TPN DESECHABLE": "#06B6D4",
};
const scColor = (sc: string) => SUBCLASE_COLORS[sc] ?? "#64748B";

const SUBCLASE_LABEL: Record<string, string> = {
  "TPN KITS": "Kits", "TPN CANISTER": "Canister", "TPN DESECHABLE": "Desechable",
};

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
               "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ElementType;
}) {
  return (
    <div style={{
      background: "white", borderRadius: 12, padding: "16px 18px",
      border: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 6,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748B" }}>{sub}</div>}
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
      fontSize: 13, fontWeight: active ? 600 : 400,
      background: active ? "#3B82F6" : "transparent",
      color: active ? "white" : "#64748B",
      transition: "all 0.15s",
    }}>
      {children}
    </button>
  );
}

// ── Tooltip personalizado ──────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }}>
      <div style={{ color: "#94A3B8", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || "white", display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === "number" ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Panel de detalle cliente (bottom sheet) ────────────────────────────────────
function DetallePanel({ cliente, mes, onClose }: { cliente: Cliente; mes: number; onClose: () => void }) {
  const [data, setData] = useState<DetalleData | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("lbf_token") || "";
    fetch(`${API}/api/renasys/detalle?rut=${encodeURIComponent(cliente.rut)}&mes=${mes}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData).catch(() => {});
  }, [cliente.rut, mes]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "white", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "80vh",
        overflow: "auto", padding: 32, boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A" }}>{cliente.nombre}</h2>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 6, display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} />{cliente.ciudad}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Building2 size={12} />{cliente.tipo}</span>
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: cliente.segmento === "PUBLICO" ? "#DBEAFE" : "#F0FDF4",
                color: cliente.segmento === "PUBLICO" ? "#1D4ED8" : "#15803D",
              }}>{cliente.segmento}</span>
              <span style={{ color: "#94A3B8" }}>KAM: {cliente.kam}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#F1F5F9", borderRadius: 8, padding: 8, cursor: "pointer" }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Venta mes", value: fmt(cliente.venta_mes) },
            { label: "Contribución mes", value: fmt(cliente.contrib_mes) },
            { label: "Margen mes", value: fmtPct(cliente.margen_mes) },
            { label: "Venta 12m", value: fmt(cliente.venta_12m) },
          ].map(k => (
            <div key={k.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{k.value}</div>
            </div>
          ))}
        </div>

        {!data ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: 40 }}>Cargando detalle…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Productos del mes</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.productos.map((p, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "#F8FAFC", borderRadius: 8,
                    borderLeft: `3px solid ${scColor(p.subclase)}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.descripcion.replace(/^\S+\s/, "")}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{p.cant} unid. · {SUBCLASE_LABEL[p.subclase] || p.subclase}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmt(p.venta)}</div>
                      <div style={{ fontSize: 11, color: margenColor(p.margen), fontWeight: 600 }}>{fmtPct(p.margen)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Tendencia 12 meses</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.tendencia} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="venta" name="Venta" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="contrib" name="Contribución" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function RenasysPage() {
  const mesActual = new Date().getMonth() + 1;
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<RenasysData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"mapa" | "zona" | "clientes">("mapa");
  const [regionFiltro, setRegionFiltro] = useState<string | null>(null);
  const [clienteDetalle, setClienteDetalle] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const fetchData = useCallback((m: number) => {
    const token = localStorage.getItem("lbf_token") || "";
    setLoading(true);
    fetch(`${API}/api/renasys/?mes=${m}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(mes); }, [mes, fetchData]);

  const clientesFiltrados = (data?.clientes ?? []).filter(c => {
    const matchRegion = !regionFiltro || c.region === regionFiltro;
    const matchBusq = !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.ciudad.toLowerCase().includes(busqueda.toLowerCase());
    return matchRegion && matchBusq;
  });

  const kpis = data?.kpis;
  const regionNombre = data?.regiones.find(r => r.region === regionFiltro)?.nombre;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Renasys TPN</h1>
            <span style={{ padding: "4px 10px", background: "#DBEAFE", color: "#1D4ED8", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>DEMO</span>
          </div>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            Terapia de Presión Negativa · {data?.label ?? "Cargando…"}
            {regionFiltro && (
              <button onClick={() => setRegionFiltro(null)} style={{
                padding: "2px 10px", background: "#EFF6FF", color: "#2563EB", borderRadius: 20,
                fontSize: 12, border: "1px solid #BFDBFE", cursor: "pointer", fontWeight: 500,
              }}>
                {regionNombre} ×
              </button>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading && (
            <div style={{ width: 18, height: 18, border: "2px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          )}
          <div style={{ position: "relative" }}>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{
              padding: "8px 32px 8px 12px", border: "1px solid #E2E8F0", borderRadius: 10,
              fontSize: 13, fontWeight: 600, color: "#0F172A", background: "white", cursor: "pointer", appearance: "none",
            }}>
              {MESES.slice(1, mesActual + 1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m} {data?.ano ?? new Date().getFullYear()}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748B" }} />
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── KPI Bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Venta mes" value={fmt(kpis?.venta_mes ?? 0)} color="#3B82F6" icon={DollarSign}
          sub={kpis?.var_mes != null ? `${kpis.var_mes >= 0 ? "+" : ""}${kpis.var_mes.toFixed(1)}% vs mes ant.` : undefined} />
        <KpiCard label="Contribución" value={fmt(kpis?.contrib_mes ?? 0)} color="#10B981" icon={TrendingUp} />
        <KpiCard label="Margen mes" value={fmtPct(kpis?.margen_mes ?? 0)} color={margenColor(kpis?.margen_mes ?? 0)} icon={Percent} />
        <KpiCard label="Venta 12m" value={fmt(kpis?.venta_12m ?? 0)} color="#8B5CF6" icon={Activity} />
        <KpiCard label="Contrib 12m" value={fmt(kpis?.contrib_12m ?? 0)} color="#F59E0B" icon={TrendingUp} />
        <KpiCard label="Margen 12m" value={fmtPct(kpis?.margen_12m ?? 0)} color={margenColor(kpis?.margen_12m ?? 0)} icon={Percent} />
        <KpiCard label="Clientes activos" value={String(kpis?.n_clientes ?? 0)} color="#64748B" icon={Users}
          sub={`${data?.regiones.length ?? 0} regiones`} />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#F1F5F9", borderRadius: 10, padding: 4, width: "fit-content" }}>
        <TabBtn active={tab === "mapa"}     onClick={() => setTab("mapa")}>🗺 Mapa</TabBtn>
        <TabBtn active={tab === "zona"}     onClick={() => setTab("zona")}>📊 Por Zona</TabBtn>
        <TabBtn active={tab === "clientes"} onClick={() => setTab("clientes")}>🏥 Clientes</TabBtn>
      </div>

      {/* ══ Tab: Mapa ══ */}
      {tab === "mapa" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>
          {/* Mapa interactivo */}
          <div style={{ background: "white", borderRadius: 16, overflow: "hidden", border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", height: 580 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>Distribución por Región</span>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>Haz clic en un burbuja para filtrar</span>
            </div>
            <div style={{ height: "calc(100% - 53px)" }}>
              <ChileMap
                regiones={data?.regiones ?? []}
                regionFiltro={regionFiltro}
                onRegionClick={(r) => {
                  setRegionFiltro(regionFiltro === r ? null : r);
                  setTab("clientes");
                }}
              />
            </div>
          </div>

          {/* Panel derecho */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Mix por subclase */}
            <div style={{ background: "white", borderRadius: 16, padding: 20, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Mix de Productos</h3>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={data?.subclases ?? []} dataKey="venta" cx="50%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={3}>
                      {(data?.subclases ?? []).map((s, i) => <Cell key={i} fill={scColor(s.subclase)} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(data?.subclases ?? []).map((s, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: scColor(s.subclase) }} />
                          <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 500 }}>{s.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{s.pct}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "#F1F5F9" }}>
                        <div style={{ height: 4, borderRadius: 2, background: scColor(s.subclase), width: `${s.pct}%`, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        {fmt(s.venta)} · <span style={{ color: margenColor(s.margen), fontWeight: 600 }}>{fmtPct(s.margen)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top productos */}
            <div style={{ background: "white", borderRadius: 16, padding: 20, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Top Productos</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(data?.modelos ?? []).slice(0, 8).map((m, i) => {
                  const total = (data?.kpis.venta_mes ?? 1) || 1;
                  const pct = Math.max(Math.round(m.venta / total * 100), 2);
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: scColor(m.subclase), flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "#334155", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {m.descripcion.replace(/^\S+\s/, "")}
                        </div>
                        <div style={{ height: 3, background: "#F1F5F9", borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: 3, borderRadius: 2, background: scColor(m.subclase), width: `${pct}%`, transition: "width 0.5s" }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", flexShrink: 0 }}>{fmt(m.venta)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tendencia mensual */}
            <div style={{ background: "white", borderRadius: 16, padding: 20, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Tendencia {data?.ano}</h3>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={data?.tendencia ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} tick={{ fontSize: 10 }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="venta" name="Venta" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: "#3B82F6" }} />
                  <Line type="monotone" dataKey="contrib" name="Contribución" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: "#10B981" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: Por Zona ══ */}
      {tab === "zona" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Venta por Zona</h3>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={data?.zonas ?? []} layout="vertical" margin={{ top: 4, right: 70, left: 10, bottom: 4 }}>
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="vendedor" tick={{ fontSize: 10 }} width={110}
                  tickFormatter={(v: string) => v.replace(/^\d+-/, "")} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="venta" name="Venta" fill="#3B82F6" radius={[0, 4, 4, 0]}
                  label={{ position: "right", formatter: (v: number) => fmt(v), fontSize: 10, fill: "#64748B" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: 24, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Detalle por Zona</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F1F5F9" }}>
                  {["Zona", "KAM", "Clientes", "Venta", "Contribución", "Margen"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: ["Zona", "KAM"].includes(h) ? "left" : "right", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.zonas ?? []).map((z, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td style={{ padding: "10px", color: "#0F172A", fontWeight: 500 }}>{z.vendedor.replace(/^\d+-/, "")}</td>
                    <td style={{ padding: "10px", color: "#64748B", fontSize: 12 }}>{z.kam}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "#64748B" }}>{z.n_clientes}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#0F172A" }}>{fmt(z.venta)}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: "#0F172A" }}>{fmt(z.contrib)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: margenColor(z.margen) }}>{fmtPct(z.margen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Tab: Clientes ══ */}
      {tab === "clientes" && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente o ciudad…"
                style={{ width: "100%", paddingLeft: 32, paddingRight: 12, height: 36, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <span style={{ fontSize: 12, color: "#64748B" }}>{clientesFiltrados.length} clientes</span>
            {regionFiltro && (
              <button onClick={() => setRegionFiltro(null)} style={{ fontSize: 12, color: "#3B82F6", border: "1px solid #BFDBFE", background: "#EFF6FF", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                {regionNombre} ×
              </button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  {["Cliente", "Ciudad", "Reg.", "Segmento", "KAM", "Venta mes", "Margen mes", "Venta 12m", "Margen 12m"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: ["Cliente", "Ciudad", "Segmento", "KAM"].includes(h) ? "left" : "right", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c, i) => (
                  <tr key={i}
                    onClick={() => setClienteDetalle(c)}
                    style={{ borderBottom: "1px solid #F8FAFC", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 14px", color: "#0F172A", fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</td>
                    <td style={{ padding: "12px 14px", color: "#64748B" }}>{c.ciudad}</td>
                    <td style={{ padding: "12px 14px", color: "#64748B", textAlign: "center" }}>{c.region}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: c.segmento === "PUBLICO" ? "#DBEAFE" : "#F0FDF4", color: c.segmento === "PUBLICO" ? "#1D4ED8" : "#15803D" }}>
                        {c.segmento}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#64748B", fontSize: 12 }}>{c.kam}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: c.venta_mes > 0 ? "#0F172A" : "#94A3B8" }}>{c.venta_mes > 0 ? fmt(c.venta_mes) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: c.venta_mes > 0 ? margenColor(c.margen_mes) : "#94A3B8" }}>{c.venta_mes > 0 ? fmtPct(c.margen_mes) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#0F172A" }}>{fmt(c.venta_12m)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: margenColor(c.margen_12m) }}>{fmtPct(c.margen_12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detalle cliente (bottom sheet) ── */}
      {clienteDetalle && (
        <DetallePanel cliente={clienteDetalle} mes={mes} onClose={() => setClienteDetalle(null)} />
      )}
    </div>
  );
}
