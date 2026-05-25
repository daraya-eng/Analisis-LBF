"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, Search, X, MapPin, Building2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

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
  promedio_mensual: number; actividad_rel: number;
  estado_equipo: "activo" | "regular" | "bajo" | "sin_compra";
  tier: "A" | "B" | "C";
  n_equipos: number; pct_parque: number;
  dep_anual: number; costo_total_anual: number;
  resultado_op: number; margen_op: number; rentable: boolean;
  contrib_x_equipo_mes: number | null; contrib_x_equipo_12m: number | null;
}
interface DetalleData {
  productos: { subclase: string; descripcion: string; venta: number; contrib: number; cant: number; margen: number }[];
  tendencia: { label: string; venta: number; contrib: number; margen: number }[];
}
interface Ciudad {
  ciudad: string; region: string; lat: number; lon: number;
  n_clientes: number; venta: number; contrib: number; margen: number;
}
interface Programa {
  n_equipos_clientes: number; valor_neto_parque: number;
  depreciacion_anual: number; dep_por_equipo_anual: number;
  costo_fijo_anual: number; costo_total_anual: number; costo_total_mes: number;
  contrib_neta_mes: number; contrib_neta_12m: number;
  roi_anualizado: number; contrib_x_equipo: number;
  payback_meses: number | null; n_rentables: number;
  n_clientes_parque: number; es_ejemplo: boolean;
}
interface RenasysData {
  mes: number; ano: number; label: string;
  kpis: Kpis; clientes: Cliente[]; programa?: Programa;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => {
  if (!n && n !== 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n < 0 ? "-$" : "$") + (abs / 1e9).toFixed(1) + "MM";
  if (abs >= 1e6) return (n < 0 ? "-$" : "$") + (abs / 1e6).toFixed(1) + "M";
  return (n < 0 ? "-$" : "$") + abs.toLocaleString("es-CL");
};
const fmtPct = (n: number | null) => n == null ? "—" : n.toFixed(1) + "%";
const margenColor = (m: number) => m >= 40 ? "#10B981" : m >= 30 ? "#F59E0B" : "#EF4444";
const margenBg   = (m: number) => m >= 40 ? "#ECFDF5" : m >= 30 ? "#FFFBEB" : "#FEF2F2";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
               "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const SUBCLASE_COLORS: Record<string, string> = {
  "TPN KITS": "#3B82F6", "TPN CANISTER": "#8B5CF6", "TPN DESECHABLE": "#06B6D4",
};
const scColor = (sc: string) => SUBCLASE_COLORS[sc] ?? "#64748B";
const SUBCLASE_LABEL: Record<string, string> = {
  "TPN KITS": "Kits", "TPN CANISTER": "Canister", "TPN DESECHABLE": "Desechable",
};

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "white", borderRadius: 12, padding: "16px 18px",
      border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#94A3B8", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || "white", display: "flex", gap: 10, justifyContent: "space-between" }}>
          <span>{p.name}:</span><span style={{ fontWeight: 700 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Detalle cliente (bottom sheet) ─────────────────────────────────────────────
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
        background: "white", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "82vh",
        overflow: "auto", padding: 32, boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A" }}>{cliente.nombre}</h2>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} />{cliente.ciudad}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Building2 size={12} />{cliente.tipo}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: cliente.segmento === "PUBLICO" ? "#DBEAFE" : "#F0FDF4", color: cliente.segmento === "PUBLICO" ? "#1D4ED8" : "#15803D" }}>{cliente.segmento}</span>
              <span>KAM: <strong>{cliente.kam}</strong></span>
              <span>Zona: <strong>{cliente.vendedor.replace(/^\d+-/, "")}</strong></span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#F1F5F9", borderRadius: 8, padding: 8, cursor: "pointer" }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        {/* KPIs rápidos */}
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
            {/* Productos del mes */}
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Productos del mes</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.productos.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, borderLeft: `3px solid ${scColor(p.subclase)}` }}>
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

            {/* Tendencia 12 meses */}
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
  const [busqueda, setBusqueda] = useState("");
  const [clienteDetalle, setClienteDetalle] = useState<Cliente | null>(null);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);

  const fetchData = useCallback((m: number) => {
    const token = localStorage.getItem("lbf_token") || "";
    setLoading(true);
    fetch(`${API}/api/renasys/?mes=${m}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(`${API}/api/renasys/ciudades?mes=${m}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setCiudades(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(mes); }, [mes, fetchData]);

  const clientes = (data?.clientes ?? []).filter(c =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.ciudad.toLowerCase().includes(busqueda.toLowerCase())
  );

  const kpis = data?.kpis;

  // Totales por segmento (sobre todos los clientes, sin filtro de búsqueda)
  const todosClientes = data?.clientes ?? [];
  const segTotales = ["PUBLICO", "PRIVADO"].map(seg => {
    const lista = todosClientes.filter(c => c.segmento === seg);
    const vMes   = lista.reduce((s, c) => s + c.venta_mes, 0);
    const cMes   = lista.reduce((s, c) => s + c.contrib_mes, 0);
    const v12m   = lista.reduce((s, c) => s + c.venta_12m, 0);
    const c12m   = lista.reduce((s, c) => s + c.contrib_12m, 0);
    return {
      seg,
      n:          lista.filter(c => c.venta_mes > 0).length,
      venta_mes:  vMes,
      contrib_mes: cMes,
      margen_mes:  vMes > 0 ? cMes / vMes * 100 : 0,
      venta_12m:  v12m,
      contrib_12m: c12m,
      margen_12m:  v12m > 0 ? c12m / v12m * 100 : 0,
    };
  });

  // Totales para fila footer
  const totalVentaMes     = clientes.filter(c => c.venta_mes > 0).reduce((s, c) => s + c.venta_mes, 0);
  const totalContribMes   = clientes.filter(c => c.venta_mes > 0).reduce((s, c) => s + c.contrib_mes, 0);
  const totalVenta12m     = clientes.reduce((s, c) => s + c.venta_12m, 0);
  const totalContrib12m   = clientes.reduce((s, c) => s + c.contrib_12m, 0);
  const totalResultadoOp  = clientes.reduce((s, c) => s + c.resultado_op, 0);
  const margenTotalMes    = totalVentaMes  > 0 ? totalContribMes  / totalVentaMes  * 100 : 0;
  const margenTotal12m    = totalVenta12m  > 0 ? totalContrib12m  / totalVenta12m  * 100 : 0;
  const margenOpTotal     = totalVenta12m  > 0 ? totalResultadoOp / totalVenta12m  * 100 : 0;

  return (
    <div style={{ width: "100%" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Renasys TPN</h1>
            <span style={{ padding: "4px 10px", background: "#DBEAFE", color: "#1D4ED8", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>DEMO</span>
          </div>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 14 }}>
            Terapia de Presión Negativa · {data?.label ?? "Cargando…"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading && <div style={{ width: 18, height: 18, border: "2px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
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

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12, marginBottom: 28 }}>
        <KpiCard label="Venta mes" value={fmt(kpis?.venta_mes ?? 0)} accent="#3B82F6"
          sub={kpis?.var_mes != null ? `${kpis.var_mes >= 0 ? "+" : ""}${kpis.var_mes.toFixed(1)}% vs mes ant.` : undefined} />
        <KpiCard label="Contribución mes" value={fmt(kpis?.contrib_mes ?? 0)} accent="#10B981" />
        <KpiCard label="Margen mes" value={fmtPct(kpis?.margen_mes ?? 0)} accent={margenColor(kpis?.margen_mes ?? 0)} />
        <KpiCard label="Venta 12m" value={fmt(kpis?.venta_12m ?? 0)} accent="#8B5CF6" />
        <KpiCard label="Contribución 12m" value={fmt(kpis?.contrib_12m ?? 0)} accent="#F59E0B" />
        <KpiCard label="Margen 12m" value={fmtPct(kpis?.margen_12m ?? 0)} accent={margenColor(kpis?.margen_12m ?? 0)} />
        <KpiCard label="Clientes activos" value={String(kpis?.n_clientes ?? 0)} accent="#64748B"
          sub={`${data?.clientes.length ?? 0} en 12m`} />
      </div>

      {/* ── Totales por segmento ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {segTotales.map(s => {
          const isPublic = s.seg === "PUBLICO";
          const color    = isPublic ? "#1D4ED8" : "#15803D";
          const bg       = isPublic ? "#EFF6FF" : "#F0FDF4";
          const border   = isPublic ? "#BFDBFE" : "#BBF7D0";
          return (
            <div key={s.seg} style={{ background: bg, borderRadius: 12, border: `1px solid ${border}`, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: color, color: "white" }}>
                  {isPublic ? "PÚBLICO" : "PRIVADO"}
                </span>
                <span style={{ fontSize: 12, color, fontWeight: 500 }}>{s.n} clientes activos en el mes</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                {[
                  { label: "Venta mes",     value: fmt(s.venta_mes) },
                  { label: "Contrib. mes",  value: fmt(s.contrib_mes) },
                  { label: "Margen mes",    value: fmtPct(s.margen_mes),  isMargen: true, m: s.margen_mes },
                  { label: "Venta 12m",     value: fmt(s.venta_12m) },
                  { label: "Contrib. 12m",  value: fmt(s.contrib_12m) },
                  { label: "Margen 12m",    value: fmtPct(s.margen_12m), isMargen: true, m: s.margen_12m },
                ].map(k => (
                  <div key={k.label}>
                    <div style={{ fontSize: 10, color, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: k.isMargen ? margenColor(k.m ?? 0) : color }}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Distribución geográfica por rentabilidad ── */}
      {ciudades.length > 0 && (() => {
        // Agregar por región
        const regMap: Record<string, { venta: number; contrib: number; n_clientes: number; nombre: string }> = {};
        const NOMBRES: Record<string, string> = {
          "1":"Tarapacá","2":"Antofagasta","3":"Atacama","4":"Coquimbo","5":"Valparaíso",
          "6":"O'Higgins","7":"Maule","8":"Biobío","9":"Araucanía","10":"Los Lagos",
          "11":"Aysén","12":"Magallanes","13":"Metropolitana","14":"Los Ríos",
          "15":"Arica y Parinacota","16":"Ñuble",
        };
        ciudades.forEach(c => {
          const k = c.region || "?";
          if (!regMap[k]) regMap[k] = { venta: 0, contrib: 0, n_clientes: 0, nombre: NOMBRES[k] ?? `Región ${k}` };
          regMap[k].venta      += c.venta;
          regMap[k].contrib    += c.contrib;
          regMap[k].n_clientes += c.n_clientes;
        });
        const regiones = Object.entries(regMap)
          .map(([id, v]) => ({ id, ...v, margen: v.venta > 0 ? v.contrib / v.venta * 100 : 0 }))
          .sort((a, b) => b.venta - a.venta);
        const maxVenta = Math.max(...regiones.map(r => r.venta), 1);
        const topCiudades = [...ciudades].sort((a, b) => b.venta - a.venta).slice(0, 8);

        return (
          <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>Distribución Geográfica — Rentabilidad TPN</span>
              <span style={{ padding: "2px 8px", background: "#F1F5F9", borderRadius: 6, fontSize: 12, color: "#64748B" }}>
                {regiones.length} regiones · {ciudades.length} ciudades
              </span>
            </div>
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

              {/* Izq: barras por región */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Venta por Región · color = margen
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {regiones.map(r => {
                    const pct = r.venta / maxVenta * 100;
                    const mc  = margenColor(r.margen);
                    return (
                      <div key={r.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{r.nombre}</span>
                          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                            <span style={{ color: "#64748B" }}>{r.n_clientes} cli.</span>
                            <span style={{ color: mc, fontWeight: 700 }}>{r.margen.toFixed(0)}%</span>
                            <span style={{ color: "#0F172A", fontWeight: 600 }}>{fmt(r.venta)}</span>
                          </div>
                        </div>
                        <div style={{ height: 7, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: mc, borderRadius: 4, transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Der: top ciudades */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Top Ciudades por Venta
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                      {["Ciudad", "Venta", "Contrib.", "Margen"].map(h => (
                        <th key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", padding: "4px 6px", textAlign: h === "Ciudad" ? "left" : "right" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topCiudades.map((c, i) => {
                      const mc = margenColor(c.margen);
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                          <td style={{ fontSize: 12, padding: "5px 6px", color: "#0F172A", fontWeight: 500 }}>{c.ciudad}</td>
                          <td style={{ fontSize: 12, padding: "5px 6px", textAlign: "right", color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{fmt(c.venta)}</td>
                          <td style={{ fontSize: 12, padding: "5px 6px", textAlign: "right", color: "#64748B" }}>{fmt(c.contrib)}</td>
                          <td style={{ fontSize: 12, padding: "5px 6px", textAlign: "right", fontWeight: 700, color: mc }}>{c.margen.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Rentabilidad del Programa ── */}
      {data?.programa && (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>Rentabilidad del Programa</span>
              <span style={{ marginLeft: 12, fontSize: 12, color: "#64748B" }}>
                {data.programa.n_equipos_clientes} equipos en {data.programa.n_clientes_parque} clientes ·{" "}
                {data.programa.n_rentables} rentables / {data.programa.n_clientes_parque} con equipos
              </span>
            </div>
            {data.programa.es_ejemplo && (
              <span style={{ padding: "3px 10px", background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: 6, fontSize: 11, color: "#854D0E", fontWeight: 600 }}>
                ⚠ Sueldos pendientes dato real RRHH
              </span>
            )}
          </div>
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {[
              {
                label: "Resultado Neto Mes",
                value: fmt(data.programa.contrib_neta_mes),
                sub: `Contrib. bruta − dep. ${fmt(data.programa.depreciacion_anual / 12)} − sueldos ${fmt(data.programa.costo_fijo_anual / 12)}`,
                accent: data.programa.contrib_neta_mes >= 0 ? "#10B981" : "#EF4444",
              },
              {
                label: "Resultado Neto 12M",
                value: fmt(data.programa.contrib_neta_12m),
                sub: `Dep. ${fmt(data.programa.depreciacion_anual)} + Sueldos ${fmt(data.programa.costo_fijo_anual)} = ${fmt(data.programa.costo_total_anual)}`,
                accent: data.programa.contrib_neta_12m >= 0 ? "#10B981" : "#EF4444",
              },
              {
                label: "ROI sobre parque",
                value: data.programa.roi_anualizado.toFixed(1) + "%",
                sub: `Valor neto parque ${fmt(data.programa.valor_neto_parque)} (contabilidad)`,
                accent: data.programa.roi_anualizado >= 15 ? "#10B981" : data.programa.roi_anualizado >= 5 ? "#F59E0B" : "#EF4444",
              },
              {
                label: "Contrib. por Equipo / mes",
                value: fmt(data.programa.contrib_x_equipo),
                sub: `Dep. equipo/mes ${fmt(data.programa.dep_por_equipo_anual / 12)} · Break-even por equipo`,
                accent: "#6366F1",
              },
              {
                label: "Payback parque",
                value: data.programa.payback_meses != null ? data.programa.payback_meses.toFixed(1) + " meses" : "—",
                sub: "Recupero valor neto a ritmo contribución 12M",
                accent: "#0EA5E9",
              },
            ].map(({ label, value, sub, accent }) => (
              <div key={label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${accent}` }}>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gestión de parque: dónde reubicar ── */}
      {data?.programa && (() => {
        const prog = data.programa!;
        const breakevenAnualPorEquipo = prog.dep_por_equipo_anual + (prog.n_equipos_clientes > 0 ? prog.costo_fijo_anual / prog.n_equipos_clientes : 0);
        const breakevenMesPorEquipo  = breakevenAnualPorEquipo / 12;

        // Clientes con equipos que no cubren su break-even
        const noRentables = todosClientes
          .filter(c => c.n_equipos > 0 && c.resultado_op < 0)
          .sort((a, b) => a.resultado_op - b.resultado_op); // peor primero

        // Clientes con contrib/equipo muy alta → candidatos para recibir más
        const candidatos = todosClientes
          .filter(c => c.n_equipos > 0 && c.resultado_op > 0 && c.contrib_x_equipo_12m != null)
          .sort((a, b) => (b.contrib_x_equipo_12m ?? 0) - (a.contrib_x_equipo_12m ?? 0))
          .slice(0, 8);

        if (noRentables.length === 0) return null;

        return (
          <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>Gestión de Parque — Reubicación de Equipos</span>
              <span style={{ padding: "3px 10px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 6, fontSize: 11, color: "#6D28D9", fontWeight: 600 }}>
                Break-even: {fmt(breakevenAnualPorEquipo)}/equipo·año · {fmt(breakevenMesPorEquipo)}/mes
              </span>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                {noRentables.length} cliente{noRentables.length > 1 ? "s" : ""} no cubren el costo de sus equipos
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {/* Izquierda — quitar equipos de acá */}
              <div style={{ borderRight: "1px solid #E2E8F0" }}>
                <div style={{ padding: "10px 16px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📤</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#991B1B" }}>Considerar retirar equipos</div>
                    <div style={{ fontSize: 11, color: "#EF4444" }}>Contribución 12M no cubre costo asignado</div>
                  </div>
                </div>
                <div style={{ padding: "8px 0", maxHeight: 280, overflowY: "auto" }}>
                  {noRentables.map(c => {
                    const deficitPorEquipo = c.n_equipos > 0 ? Math.abs(c.resultado_op) / c.n_equipos : 0;
                    const contrib12mPorEq  = c.contrib_x_equipo_12m ?? 0;
                    const pctBreakeven     = breakevenAnualPorEquipo > 0 ? (contrib12mPorEq / breakevenAnualPorEquipo) * 100 : 0;
                    return (
                      <div key={c.rut} onClick={() => setClienteDetalle(c)}
                        style={{ padding: "10px 16px", borderBottom: "1px solid #FFF1F2", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FFF5F5")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#FEE2E2", color: "#991B1B", fontWeight: 700 }}>
                              {c.n_equipos} eq.
                            </span>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{c.nombre}</div>
                          </div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.ciudad}</div>
                          {/* Barra de cobertura del break-even */}
                          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 4, background: "#FEE2E2", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(pctBreakeven, 100)}%`, background: "#EF4444", borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 600, flexShrink: 0 }}>{pctBreakeven.toFixed(0)}% del min</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>{fmt(c.resultado_op)}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>faltan {fmt(deficitPorEquipo)}/eq·año</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Derecha — poner equipos acá */}
              <div>
                <div style={{ padding: "10px 16px", background: "#F0FDF4", borderBottom: "1px solid #BBF7D0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📥</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#15803D" }}>Mejores candidatos para recibir equipos</div>
                    <div style={{ fontSize: 11, color: "#16A34A" }}>Alta contribución por equipo — absorberían más rentablemente</div>
                  </div>
                </div>
                <div style={{ padding: "8px 0", maxHeight: 280, overflowY: "auto" }}>
                  {candidatos.map((c, i) => {
                    const pctSobreBreakeven = breakevenAnualPorEquipo > 0
                      ? ((c.contrib_x_equipo_12m ?? 0) / breakevenAnualPorEquipo) * 100
                      : 0;
                    return (
                      <div key={c.rut} onClick={() => setClienteDetalle(c)}
                        style={{ padding: "10px 16px", borderBottom: "1px solid #F0FDF4", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F0FDF4")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: "#94A3B8", width: 16 }}>{i + 1}</span>
                            <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#DCFCE7", color: "#15803D", fontWeight: 700 }}>
                              {c.n_equipos} eq.
                            </span>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{c.nombre}</div>
                          </div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.ciudad}</div>
                          {/* Barra de eficiencia sobre break-even */}
                          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 4, background: "#DCFCE7", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(pctSobreBreakeven, 100)}%`, background: "#10B981", borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600, flexShrink: 0 }}>{pctSobreBreakeven.toFixed(0)}% del min</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>{fmt(c.contrib_x_equipo_12m ?? 0)}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>contrib/eq·año</div>
                        </div>
                      </div>
                    );
                  })}
                  {candidatos.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Sin candidatos con alta eficiencia</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Alertas de gestión de parque ── */}
      {(() => {
        const sinCompra   = todosClientes.filter(c => c.estado_equipo === "sin_compra");
        const bajoCons    = todosClientes.filter(c => c.estado_equipo === "bajo");
        const tierA       = todosClientes.filter(c => c.tier === "A").sort((a,b) => b.contrib_12m - a.contrib_12m);
        if (sinCompra.length === 0 && bajoCons.length === 0 && tierA.length === 0) return null;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Sin compra este mes */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #FECACA", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #FEE2E2", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🔴</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>Sin compra este mes</div>
                  <div style={{ fontSize: 11, color: "#EF4444" }}>{sinCompra.length} clientes con equipo posiblemente ocioso</div>
                </div>
              </div>
              <div style={{ padding: "10px 16px", maxHeight: 200, overflowY: "auto" }}>
                {sinCompra.slice(0, 8).map(c => (
                  <div key={c.rut} onClick={() => setClienteDetalle(c)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #FFF1F2", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.ciudad} · prom. {fmt(c.promedio_mensual)}/mes</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600 }}>Sin compra</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{fmt(c.contrib_12m)} 12M</div>
                    </div>
                  </div>
                ))}
                {sinCompra.length > 8 && <div style={{ fontSize: 11, color: "#94A3B8", padding: "6px 0" }}>+{sinCompra.length - 8} más</div>}
              </div>
            </div>

            {/* Bajo consumo */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #FED7AA", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #FFEDD5", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🟡</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>Bajo consumo</div>
                  <div style={{ fontSize: 11, color: "#F97316" }}>{bajoCons.length} clientes comprando &lt;50% de su promedio</div>
                </div>
              </div>
              <div style={{ padding: "10px 16px", maxHeight: 200, overflowY: "auto" }}>
                {bajoCons.slice(0, 8).map(c => (
                  <div key={c.rut} onClick={() => setClienteDetalle(c)} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #FFF7ED", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.ciudad} · prom. {fmt(c.promedio_mensual)}/mes</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "#F97316", fontWeight: 600 }}>{c.actividad_rel.toFixed(0)}% actividad</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{fmt(c.venta_mes)} este mes</div>
                    </div>
                  </div>
                ))}
                {bajoCons.length > 8 && <div style={{ fontSize: 11, color: "#94A3B8", padding: "6px 0" }}>+{bajoCons.length - 8} más</div>}
              </div>
            </div>

            {/* Tier A — más rentables */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #BBF7D0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #DCFCE7", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>⭐</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>Clientes Tier A</div>
                  <div style={{ fontSize: 11, color: "#10B981" }}>{tierA.length} clientes con contribución &gt;$5M en 12M</div>
                </div>
              </div>
              <div style={{ padding: "10px 16px", maxHeight: 200, overflowY: "auto" }}>
                {tierA.slice(0, 8).map((c, i) => (
                  <div key={c.rut} onClick={() => setClienteDetalle(c)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F0FDF4", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#94A3B8", width: 16 }}>{i+1}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.ciudad} · margen {c.margen_12m.toFixed(0)}%</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>{fmt(c.contrib_12m)}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>contrib 12M</div>
                    </div>
                  </div>
                ))}
                {tierA.length > 8 && <div style={{ fontSize: 11, color: "#94A3B8", padding: "6px 0" }}>+{tierA.length - 8} más</div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Tabla ── */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o ciudad…"
              style={{ width: "100%", paddingLeft: 32, paddingRight: 12, height: 36, border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <span style={{ fontSize: 12, color: "#64748B" }}>{clientes.length} clientes</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                <th colSpan={3} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: "#374151", fontWeight: 700, borderBottom: "2px solid #94A3B8" }}>CLIENTE</th>
                <th colSpan={3} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#1D4ED8", fontWeight: 700, borderBottom: "2px solid #3B82F6", background: "#EFF6FF", borderRight: "1px solid #BFDBFE" }}>MES ACTUAL</th>
                <th colSpan={3} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#1D4ED8", fontWeight: 700, borderBottom: "2px solid #3B82F6", background: "#EFF6FF", borderRight: "1px solid #E2E8F0" }}>ÚLTIMOS 12 MESES</th>
                <th colSpan={2} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#059669", fontWeight: 700, borderBottom: "2px solid #10B981", background: "#F0FDF4", borderRight: "1px solid #E2E8F0" }}>USO DEL EQUIPO</th>
                <th colSpan={3} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#7C3AED", fontWeight: 700, borderBottom: "2px solid #8B5CF6", background: "#F5F3FF" }}>RENTABILIDAD OP. (12M)</th>
              </tr>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: "8px 14px", textAlign: "left",  fontSize: 11, color: "#64748B", fontWeight: 600 }}>Hospital / Clínica</th>
                <th style={{ padding: "8px 8px",  textAlign: "left",  fontSize: 11, color: "#64748B", fontWeight: 600 }}>Ciudad</th>
                <th style={{ padding: "8px 8px",  textAlign: "center",fontSize: 11, color: "#64748B", fontWeight: 600 }}>Tier</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF" }}>Venta</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF" }}>Contrib.</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF", borderRight: "1px solid #BFDBFE" }}>Margen</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF" }}>Venta</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF" }}>Contrib.</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#1D4ED8", fontWeight: 600, background: "#EFF6FF", borderRight: "1px solid #E2E8F0" }}>Margen</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#059669", fontWeight: 600, background: "#F0FDF4" }}>Actividad</th>
                <th style={{ padding: "8px 10px", textAlign: "center",fontSize: 11, color: "#059669", fontWeight: 600, background: "#F0FDF4", borderRight: "1px solid #E2E8F0" }}>Estado</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#7C3AED", fontWeight: 600, background: "#F5F3FF" }}>Equipos</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#7C3AED", fontWeight: 600, background: "#F5F3FF" }}>Resultado Op.</th>
                <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#7C3AED", fontWeight: 600, background: "#F5F3FF" }}>Margen Op.</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => {
                const estadoCfg = {
                  activo:    { label: "Activo",     bg: "#DCFCE7", color: "#15803D" },
                  regular:   { label: "Regular",    bg: "#FEF9C3", color: "#854D0E" },
                  bajo:      { label: "Bajo uso",   bg: "#FFEDD5", color: "#9A3412" },
                  sin_compra:{ label: "Sin compra", bg: "#FEE2E2", color: "#991B1B" },
                }[c.estado_equipo];
                const tierCfg = {
                  A: { bg: "#FEF9C3", color: "#854D0E" },
                  B: { bg: "#EFF6FF", color: "#1D4ED8" },
                  C: { bg: "#F1F5F9", color: "#64748B" },
                }[c.tier];
                return (
                  <tr key={i} onClick={() => setClienteDetalle(c)}
                    style={{ borderBottom: "1px solid #F8FAFC", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: c.segmento === "PUBLICO" ? "#DBEAFE" : "#F0FDF4", color: c.segmento === "PUBLICO" ? "#1D4ED8" : "#15803D", flexShrink: 0 }}>
                          {c.segmento === "PUBLICO" ? "PUB" : "PRIV"}
                        </span>
                        {c.nombre}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", color: "#64748B", whiteSpace: "nowrap", fontSize: 12 }}>{c.ciudad}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: tierCfg.bg, color: tierCfg.color }}>{c.tier}</span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", fontWeight: 600, color: c.venta_mes > 0 ? "#0F172A" : "#CBD5E1" }}>{c.venta_mes > 0 ? fmt(c.venta_mes) : "—"}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", color: c.venta_mes > 0 ? "#0F172A" : "#CBD5E1" }}>{c.venta_mes > 0 ? fmt(c.contrib_mes) : "—"}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", borderRight: "1px solid #BFDBFE" }}>
                      {c.venta_mes > 0 ? <span style={{ padding: "2px 6px", borderRadius: 4, background: margenBg(c.margen_mes), color: margenColor(c.margen_mes), fontWeight: 700 }}>{fmtPct(c.margen_mes)}</span> : <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", fontWeight: 600, color: "#0F172A" }}>{fmt(c.venta_12m)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", color: "#0F172A" }}>{fmt(c.contrib_12m)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F8FBFF", borderRight: "1px solid #E2E8F0" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 4, background: margenBg(c.margen_12m), color: margenColor(c.margen_12m), fontWeight: 700 }}>{fmtPct(c.margen_12m)}</span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F0FDF4" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: c.actividad_rel >= 80 ? "#15803D" : c.actividad_rel >= 50 ? "#854D0E" : "#991B1B" }}>
                        {c.actividad_rel.toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>vs prom. {fmt(c.promedio_mensual)}</div>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "center", background: "#F0FDF4", borderRight: "1px solid #E2E8F0" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: estadoCfg.bg, color: estadoCfg.color }}>
                        {estadoCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F5F3FF", color: "#7C3AED", fontWeight: 600 }}>
                      {c.n_equipos > 0 ? c.n_equipos : <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F5F3FF", fontWeight: 700 }}>
                      {c.n_equipos > 0
                        ? <span style={{ color: c.resultado_op >= 0 ? "#15803D" : "#991B1B" }}>{fmt(c.resultado_op)}</span>
                        : <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", background: "#F5F3FF" }}>
                      {c.n_equipos > 0
                        ? <span style={{ padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 11, background: c.margen_op >= 10 ? "#ECFDF5" : c.margen_op >= 0 ? "#FFFBEB" : "#FEF2F2", color: c.margen_op >= 10 ? "#15803D" : c.margen_op >= 0 ? "#854D0E" : "#991B1B" }}>{c.margen_op.toFixed(1)}%</span>
                        : <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
                <td style={{ padding: "11px 14px", color: "#0F172A", fontSize: 12 }}>TOTAL</td>
                <td style={{ padding: "11px 10px", color: "#64748B", fontSize: 12 }}>{clientes.filter(c => c.venta_mes > 0).length} activos</td>
                <td />
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", color: "#1D4ED8" }}>{fmt(totalVentaMes)}</td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", color: "#1D4ED8" }}>{fmt(totalContribMes)}</td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", borderRight: "1px solid #BFDBFE" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, background: margenBg(margenTotalMes), color: margenColor(margenTotalMes) }}>{fmtPct(margenTotalMes)}</span>
                </td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", color: "#1D4ED8" }}>{fmt(totalVenta12m)}</td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", color: "#1D4ED8" }}>{fmt(totalContrib12m)}</td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EFF6FF", borderRight: "1px solid #E2E8F0" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, background: margenBg(margenTotal12m), color: margenColor(margenTotal12m) }}>{fmtPct(margenTotal12m)}</span>
                </td>
                <td colSpan={2} style={{ background: "#F0FDF4", borderRight: "1px solid #E2E8F0" }} />
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EDE9FE", color: "#7C3AED", fontWeight: 700 }}>
                  {data?.programa?.n_equipos_clientes ?? "—"}
                </td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EDE9FE", fontWeight: 700, color: totalResultadoOp >= 0 ? "#15803D" : "#991B1B" }}>
                  {fmt(totalResultadoOp)}
                </td>
                <td style={{ padding: "11px 10px", textAlign: "right", background: "#EDE9FE" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontWeight: 700, background: margenOpTotal >= 10 ? "#ECFDF5" : margenOpTotal >= 0 ? "#FFFBEB" : "#FEF2F2", color: margenOpTotal >= 10 ? "#15803D" : margenOpTotal >= 0 ? "#854D0E" : "#991B1B" }}>{margenOpTotal.toFixed(1)}%</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Detalle cliente ── */}
      {clienteDetalle && (
        <DetallePanel cliente={clienteDetalle} mes={mes} onClose={() => setClienteDetalle(null)} />
      )}
    </div>
  );
}
