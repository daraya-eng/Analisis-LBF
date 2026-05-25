"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => {
  if (!n && n !== 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n < 0 ? "-" : "") + "$" + (abs / 1e9).toFixed(1) + "MM";
  if (abs >= 1e6) return (n < 0 ? "-" : "") + "$" + (abs / 1e6).toFixed(1) + "M";
  return (n < 0 ? "-" : "") + "$" + abs.toLocaleString("es-CL");
};
const pct = (n: number, decimals = 1) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(decimals) + "%";
const clr = (v: number) => v >= 0 ? "#10B981" : "#EF4444";
const margenColor = (m: number) => m >= 40 ? "#10B981" : m >= 30 ? "#F59E0B" : "#EF4444";
const cumplColor  = (c: number) => c >= 90 ? "#10B981" : c >= 75 ? "#F59E0B" : "#EF4444";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Kpis {
  venta_26: number; venta_25: number; meta_ytd: number;
  cumpl: number; crec: number; gap_meta: number; margen: number;
  n_clientes: number; n_caida: number; n_nuevos: number;
}
interface Potencial {
  adj_sin_facturar: number; skus_perdidos: number;
  cm_share_gap: number; cm_captacion: number;
}
interface MesData { mes: number; label: string; venta_26: number; venta_25: number }
interface Cliente {
  rut: string; nombre: string; segmento: string;
  venta_26: number; venta_25: number; margen: number; crec: number;
  gap: number; dias_sin_compra: number | null; es_nuevo: boolean; en_caida: boolean;
}
interface SkuCliente {
  rut: string; cliente: string; total_perdido: number; n_skus: number;
  skus: { codigo: string; descripcion: string; categoria: string; venta_25: number }[];
}
interface AdjItem { rut: string; cliente: string; n_licitaciones: number; monto: number }
interface CmLbf {
  organismo: string; monto_lbf: number; monto_comp: number;
  share_lbf: number; proveedores_comp: string[];
}
interface CmCaptacion { organismo: string; monto_comp: number; proveedores: string[] }
interface Categoria { cat: string; venta: number; contrib: number; margen: number; n_clientes: number; n_skus: number }
interface Data {
  zona: string; kam: string; periodo_label: string; meses: number[];
  kpis: Kpis; potencial: Potencial; meses_data: MesData[];
  categorias: Categoria[];
  clientes: Cliente[]; skus_por_cliente: SkuCliente[];
  adj_sin_facturar: AdjItem[]; cm_lbf: CmLbf[]; cm_captacion: CmCaptacion[];
  lics_competidor: { rut: string; cliente: string; competidor: string; monto: number }[];
}

// Tipos de drill-down
interface AdjLic { licitacion: string; categoria: string; n_items: number; monto: number; fecha_termino: string; obs?: string }
interface ProductoDetalle { codigo: string; descripcion: string; categoria: string; venta_26: number; margen: number }
interface SkuPerdido { codigo: string; descripcion: string; categoria: string; venta_25: number }
interface ClientDetail {
  rut: string; venta_26: number; venta_25: number; margen: number;
  meses_data: MesData[];
  top_productos: ProductoDetalle[];
  skus_perdidos: SkuPerdido[];
  adj_sin_facturar: AdjLic[];
}
interface CatTopCliente { rut: string; nombre: string; venta_26: number; margen: number; n_skus: number }
interface CatTopSku { codigo: string; descripcion: string; venta_26: number; margen: number; n_clientes: number }
interface CatDetail { cat: string; top_clientes: CatTopCliente[]; top_skus: CatTopSku[] }

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, small }: {
  label: string; value: string; sub?: string; color?: string; small?: boolean;
}) {
  return (
    <div style={{
      background: "white", borderRadius: 10, padding: small ? "10px 14px" : "14px 18px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)", flex: "1 1 120px",
    }}>
      <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 18 : 22, fontWeight: 800, color: color ?? "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Bar chart SVG ─────────────────────────────────────────────────────────────
function BarChart({ data, height = 110 }: { data: MesData[]; height?: number }) {
  if (!data.length) return null;
  const maxV = Math.max(...data.flatMap(d => [d.venta_26, d.venta_25]), 1);
  const colW = 60;
  const barW = 18;
  const W = data.length * colW;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height + 26}`} style={{ overflow: "visible", display: "block" }}>
      {data.map((d, i) => {
        const x = i * colW + colW / 2;
        const h25 = (d.venta_25 / maxV) * height;
        const h26 = (d.venta_26 / maxV) * height;
        return (
          <g key={d.mes}>
            <rect x={x - barW - 2} y={height - h25} width={barW} height={h25} fill="#CBD5E1" rx={3} />
            <rect x={x + 2}        y={height - h26} width={barW} height={h26} fill="#3B82F6" rx={3} />
            <text x={x} y={height + 16} textAnchor="middle" fontSize={9} fill="#94A3B8">{d.label}</text>
          </g>
        );
      })}
      <line x1={0} y1={height} x2={W} y2={height} stroke="#E2E8F0" strokeWidth={1} />
    </svg>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }: {
  label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
      background: active ? "#3B82F6" : "transparent",
      color: active ? "white" : "#64748B",
      fontWeight: active ? 700 : 500, fontSize: 13,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          background: active ? "rgba(255,255,255,0.3)" : "#EF4444",
          color: "white", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pctVal = Math.min((value / Math.max(max, 1)) * 100, 100);
  return (
    <div style={{ background: "#F1F5F9", borderRadius: 4, height: 6, width: "100%" }}>
      <div style={{ width: pctVal + "%", height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

// ── Share bar para CM ─────────────────────────────────────────────────────────
function ShareBar({ lbf, total }: { lbf: number; total: number }) {
  const p = total > 0 ? Math.min((lbf / total) * 100, 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, background: "#FEE2E2", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: p + "%", height: "100%", background: "#3B82F6", borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: p > 10 ? "#10B981" : "#EF4444", minWidth: 36, textAlign: "right" }}>
        {p.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Spinner mini ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
      <div className="spinner-ring animate-spin-ring" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
    </div>
  );
}

// ── Panel lateral de cliente ──────────────────────────────────────────────────
function ClientDrawer({
  nombre, cliente, detail, loading, onClose,
}: {
  nombre: string;
  cliente: Cliente | null;
  detail: ClientDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 200 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 580,
        background: "white", zIndex: 201, overflowY: "auto",
        boxShadow: "-6px 0 32px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#0F172A", marginBottom: 4, lineHeight: 1.2 }}>{nombre}</div>
            {cliente && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {cliente.rut} · {cliente.segmento}
                {cliente.en_caida && <span style={{ marginLeft: 8, color: "#EF4444", fontWeight: 700 }}>⚠ En caída</span>}
                {cliente.es_nuevo && <span style={{ marginLeft: 8, color: "#3B82F6", fontWeight: 700 }}>✦ Cliente nuevo</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14, color: "#64748B", borderRadius: 6, padding: "4px 10px" }}>✕ Cerrar</button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
          {/* KPIs del cliente */}
          {cliente && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <KpiCard small label="Venta 2026" value={fmt(cliente.venta_26)} />
              <KpiCard small label="Venta 2025" value={fmt(cliente.venta_25)} color="#94A3B8" />
              <KpiCard small label="vs 2025" value={pct(cliente.crec)} color={clr(cliente.crec)} />
              <KpiCard small label="Margen" value={cliente.margen.toFixed(1) + "%"} color={margenColor(cliente.margen)} />
              {cliente.dias_sin_compra != null && (
                <KpiCard small label="Días sin compra" value={cliente.dias_sin_compra + "d"}
                  color={cliente.dias_sin_compra > 30 ? "#EF4444" : cliente.dias_sin_compra > 15 ? "#F59E0B" : "#10B981"} />
              )}
            </div>
          )}

          {loading ? <Spinner /> : detail ? (
            <>
              {/* Tendencia mensual */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", marginBottom: 10 }}>Evolución mensual</div>
                <BarChart data={detail.meses_data} height={90} />
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#64748B" }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3B82F6", borderRadius: 2, marginRight: 4 }} />2026</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#CBD5E1", borderRadius: 2, marginRight: 4 }} />2025</span>
                </div>
              </div>

              {/* Alerta: licitaciones adjudicadas sin facturar */}
              {detail.adj_sin_facturar.length > 0 && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", marginBottom: 10 }}>
                    ⚠ {detail.adj_sin_facturar.length} licitación{detail.adj_sin_facturar.length > 1 ? "es" : ""} adjudicada{detail.adj_sin_facturar.length > 1 ? "s" : ""} sin facturar
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #FECACA" }}>
                        {["Licitación", "Categoría", "Ítems", "Monto", "Vence", "Obs. KAM"].map(h => (
                          <th key={h} style={{ padding: "4px 8px", textAlign: h === "Monto" || h === "Ítems" ? "right" : "left", color: "#B91C1C", fontWeight: 600, fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.adj_sin_facturar.map(a => (
                        <tr key={a.licitacion} style={{ borderBottom: "1px solid #FEE2E2" }}>
                          <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 10, color: "#64748B" }}>{a.licitacion}</td>
                          <td style={{ padding: "5px 8px", color: "#374151" }}>{a.categoria}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", color: "#64748B" }}>{a.n_items}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: "#DC2626" }}>{fmt(a.monto)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", color: "#64748B", fontSize: 10 }}>{a.fecha_termino}</td>
                          <td style={{ padding: "5px 8px", color: "#64748B", fontSize: 10, fontStyle: a.obs ? "normal" : "italic" }}>{a.obs || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dos columnas: productos actuales | SKUs perdidos */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Top productos 2026 */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", marginBottom: 10 }}>
                    Productos comprados 2026
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#94A3B8" }}>({detail.top_productos.length})</span>
                  </div>
                  {detail.top_productos.length === 0
                    ? <div style={{ fontSize: 12, color: "#94A3B8" }}>Sin ventas en el período</div>
                    : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
                        {detail.top_productos.map(p => (
                          <div key={p.codigo} style={{ background: "#F8FAFC", borderRadius: 7, padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace" }}>{p.codigo}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", whiteSpace: "nowrap" }}>{fmt(p.venta_26)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.3 }}>{p.descripcion}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                              <span style={{ fontSize: 10, color: "#94A3B8" }}>{p.categoria}</span>
                              <span style={{ fontSize: 10, color: margenColor(p.margen), fontWeight: 600 }}>{p.margen.toFixed(1)}% mg</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>

                {/* SKUs perdidos */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#D97706", marginBottom: 10 }}>
                    SKUs no pedidos en 2026
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#94A3B8" }}>({detail.skus_perdidos.length})</span>
                  </div>
                  {detail.skus_perdidos.length === 0
                    ? <div style={{ fontSize: 12, color: "#10B981", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>✓</span> Sin SKUs perdidos en este período
                      </div>
                    : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
                        {detail.skus_perdidos.map(s => (
                          <div key={s.codigo} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7, padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace" }}>{s.codigo}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706", whiteSpace: "nowrap" }}>{fmt(s.venta_25)} <span style={{ fontWeight: 400, fontSize: 9 }}>('25)</span></span>
                            </div>
                            <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.3 }}>{s.descripcion}</div>
                            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{s.categoria}</div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KamMaulePage() {
  const { token } = useAuth() as { token: string };
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"resumen" | "oportunidades" | "clientes" | "cm" | "seguimiento">("resumen");

  // Drill-down: panel de cliente
  const [drawerRut, setDrawerRut]     = useState<string | null>(null);
  const [drawerNombre, setDrawerNombre] = useState("");
  const [clientDetails, setClientDetails] = useState<Record<string, ClientDetail>>({});
  const [clientLoading, setClientLoading] = useState<Record<string, boolean>>({});
  const fetchingCliRef = useRef<Set<string>>(new Set());

  // Drill-down: adj sin facturar (expansión)
  const [expandedAdj, setExpandedAdj] = useState<string | null>(null);

  // Drill-down: categorías
  const [expandedCat, setExpandedCat]   = useState<string | null>(null);
  const [catDetails, setCatDetails]     = useState<Record<string, CatDetail>>({});
  const [catLoading, setCatLoading]     = useState<Record<string, boolean>>({});
  const fetchingCatRef = useRef<Set<string>>(new Set());

  // Drill-down: CM
  const [expandedCmLbf, setExpandedCmLbf]   = useState<string | null>(null);
  const [expandedCmCapt, setExpandedCmCapt] = useState<string | null>(null);

  // SKUs expandidos (oportunidades)
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  // Clientes: filtros
  const [clientFilter, setClientFilter] = useState<"todos" | "caida" | "nuevos">("todos");
  const [clientSearch, setClientSearch] = useState("");

  // Seguimiento: checklist persistido
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("kam_maule_checks");
    if (saved) { try { setChecks(JSON.parse(saved)); } catch {} }
  }, []);

  // Carga principal
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/kam-maule/resumen`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const mesesToParam = data ? data.meses.join(",") : "1,2,3,4,5";

  // Fetch de detalle de cliente (cacheado por RUT)
  const fetchClientDetail = (rut: string) => {
    if (clientDetails[rut] || fetchingCliRef.current.has(rut)) return;
    fetchingCliRef.current.add(rut);
    setClientLoading(p => ({ ...p, [rut]: true }));
    fetch(`${API}/api/kam-maule/cliente/${rut}?meses=${mesesToParam}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setClientDetails(p => ({ ...p, [rut]: d })))
      .finally(() => {
        fetchingCliRef.current.delete(rut);
        setClientLoading(p => ({ ...p, [rut]: false }));
      });
  };

  const openDrawer = (rut: string, nombre: string) => {
    setDrawerRut(rut);
    setDrawerNombre(nombre);
    fetchClientDetail(rut);
  };

  const toggleAdj = (rut: string) => {
    const next = expandedAdj === rut ? null : rut;
    setExpandedAdj(next);
    if (next) fetchClientDetail(next);
  };

  const toggleCat = (cat: string) => {
    const next = expandedCat === cat ? null : cat;
    setExpandedCat(next);
    if (next && !catDetails[cat] && !fetchingCatRef.current.has(cat)) {
      fetchingCatRef.current.add(cat);
      setCatLoading(p => ({ ...p, [cat]: true }));
      fetch(`${API}/api/kam-maule/categoria/${encodeURIComponent(cat)}?meses=${mesesToParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => setCatDetails(p => ({ ...p, [cat]: d })))
        .finally(() => {
          fetchingCatRef.current.delete(cat);
          setCatLoading(p => ({ ...p, [cat]: false }));
        });
    }
  };

  const toggleCheck = (key: string) => {
    setChecks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("kam_maule_checks", JSON.stringify(next));
      return next;
    });
  };

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
      <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
    </div>
  );
  if (!data) return <div style={{ color: "#EF4444", padding: 32 }}>Error cargando datos.</div>;

  const { kpis, potencial, meses_data, clientes, skus_por_cliente,
          adj_sin_facturar, cm_lbf, cm_captacion, lics_competidor } = data;

  const totalPotencial = potencial.adj_sin_facturar + potencial.skus_perdidos;

  const drawerCliente = drawerRut ? clientes.find(c => c.rut === drawerRut) ?? null : null;
  const drawerDetail  = drawerRut ? clientDetails[drawerRut] ?? null : null;
  const drawerLoading = drawerRut ? (clientLoading[drawerRut] ?? false) : false;

  const filteredClientes = clientes
    .filter(c =>
      clientFilter === "todos" ||
      (clientFilter === "caida"  && c.en_caida) ||
      (clientFilter === "nuevos" && c.es_nuevo)
    )
    .filter(c =>
      !clientSearch ||
      c.nombre.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.rut.includes(clientSearch)
    );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%" }}>

      {/* Panel lateral de cliente */}
      {drawerRut && (
        <ClientDrawer
          nombre={drawerNombre}
          cliente={drawerCliente}
          detail={drawerDetail}
          loading={drawerLoading}
          onClose={() => { setDrawerRut(null); setDrawerNombre(""); }}
        />
      )}

      {/* Título */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ background: "#EF4444", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Plan Estratégico</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>Jun–Ago 2026</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            KAM Maule Sur — Noelia Parra
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13 }}>
            Zona 08-MAULE-SUR · {data.periodo_label} · {kpis.n_clientes} clientes activos
          </p>
        </div>
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", fontSize: 12, color: "#92400E" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Potencial identificado</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#B45309" }}>{fmt(totalPotencial)}</div>
          <div style={{ color: "#92400E", fontSize: 11 }}>adjudicados + SKUs recuperables</div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <KpiCard label="Venta YTD" value={fmt(kpis.venta_26)} sub={`Meta: ${fmt(kpis.meta_ytd)}`} />
        <KpiCard label="Cumplimiento" value={kpis.cumpl.toFixed(1) + "%"} sub={fmt(kpis.gap_meta) + " gap"} color={cumplColor(kpis.cumpl)} />
        <KpiCard label="vs 2025" value={pct(kpis.crec)} color={clr(kpis.crec)} />
        <KpiCard label="Margen" value={kpis.margen.toFixed(1) + "%"} color={margenColor(kpis.margen)} />
        <KpiCard label="Clientes activos" value={String(kpis.n_clientes)} sub={`${kpis.n_caida} en caída · ${kpis.n_nuevos} nuevos`} />
        <KpiCard label="Adj. sin facturar" value={fmt(potencial.adj_sin_facturar)} sub={`${adj_sin_facturar.length} clientes`} color="#DC2626" />
        <KpiCard label="SKUs recuperables" value={fmt(potencial.skus_perdidos)} sub="en clientes activos" color="#D97706" />
      </div>

      {/* Barra de cumplimiento */}
      <div style={{ background: "white", borderRadius: 10, padding: "12px 18px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: "#64748B" }}>Avance meta YTD</span>
          <span style={{ fontWeight: 700, color: cumplColor(kpis.cumpl) }}>{kpis.cumpl.toFixed(1)}%</span>
        </div>
        <ProgressBar value={kpis.venta_26} max={kpis.meta_ytd} color={cumplColor(kpis.cumpl)} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#94A3B8" }}>
          <span>{fmt(kpis.venta_26)}</span><span>{fmt(kpis.meta_ytd)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "white", borderRadius: 10, padding: 6, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", flexWrap: "wrap" }}>
        <Tab label="Resumen" active={tab === "resumen"} onClick={() => setTab("resumen")} />
        <Tab label="Oportunidades" active={tab === "oportunidades"} onClick={() => setTab("oportunidades")} badge={adj_sin_facturar.length} />
        <Tab label="Clientes" active={tab === "clientes"} onClick={() => setTab("clientes")} badge={kpis.n_caida} />
        <Tab label="Convenio Marco" active={tab === "cm"} onClick={() => setTab("cm")} />
        <Tab label="Seguimiento" active={tab === "seguimiento"} onClick={() => setTab("seguimiento")} />
      </div>

      {/* ── TAB RESUMEN ─────────────────────────────────────────────────────── */}
      {tab === "resumen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 2fr", gap: 16 }}>

            {/* Gráfico mensual */}
            <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Venta mensual 2026 vs 2025</h3>
              <BarChart data={meses_data} />
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11 }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#3B82F6", borderRadius: 2, marginRight: 4 }} />2026</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#CBD5E1", borderRadius: 2, marginRight: 4 }} />2025</span>
              </div>
            </div>

            {/* Tabla de categorías con drill-down */}
            <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Por categoría</h3>
              <p style={{ margin: "0 0 12px", fontSize: 11, color: "#94A3B8" }}>Haz clic para ver clientes y productos</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F1F5F9" }}>
                    {["Cat.", "Venta", "Mg.", "Cli."].map(h => (
                      <th key={h} style={{ textAlign: h === "Cat." ? "left" : "right", padding: "4px 6px", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.categorias.map((c, i) => (
                    <React.Fragment key={c.cat}>
                      <tr
                        onClick={() => toggleCat(c.cat)}
                        style={{
                          borderBottom: "1px solid #F8FAFC",
                          background: expandedCat === c.cat ? "#EFF6FF" : i % 2 ? "#FAFAFA" : "white",
                          cursor: "pointer",
                        }}
                        onMouseEnter={e => { if (expandedCat !== c.cat) (e.currentTarget as HTMLTableRowElement).style.background = "#F8FAFC"; }}
                        onMouseLeave={e => { if (expandedCat !== c.cat) (e.currentTarget as HTMLTableRowElement).style.background = i % 2 ? "#FAFAFA" : "white"; }}
                      >
                        <td style={{ padding: "7px 6px", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>{expandedCat === c.cat ? "▲" : "▼"}</span>
                          {c.cat}
                        </td>
                        <td style={{ textAlign: "right", padding: "7px 6px", fontSize: 11 }}>{fmt(c.venta)}</td>
                        <td style={{ textAlign: "right", padding: "7px 6px", color: margenColor(c.margen ?? 0), fontWeight: 600 }}>{(c.margen ?? 0).toFixed(0)}%</td>
                        <td style={{ textAlign: "right", padding: "7px 6px", color: "#64748B" }}>{c.n_clientes}</td>
                      </tr>
                      {/* Expansión de categoría */}
                      {expandedCat === c.cat && (
                        <tr>
                          <td colSpan={4} style={{ padding: 0, background: "#F0F7FF" }}>
                            {catLoading[c.cat]
                              ? <Spinner />
                              : catDetails[c.cat]
                                ? (
                                  <div style={{ padding: "12px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    {/* Top clientes */}
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", marginBottom: 6, textTransform: "uppercase" }}>Top clientes</div>
                                      {catDetails[c.cat].top_clientes.slice(0, 5).map(tc => (
                                        <div
                                          key={tc.rut}
                                          onClick={() => openDrawer(tc.rut, tc.nombre)}
                                          style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", borderRadius: 5, cursor: "pointer", fontSize: 11, marginBottom: 2 }}
                                          onMouseEnter={e => (e.currentTarget.style.background = "#DBEAFE")}
                                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                        >
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "#1D4ED8", textDecoration: "underline" }}>
                                            {tc.nombre.length > 22 ? tc.nombre.slice(0, 22) + "…" : tc.nombre}
                                          </span>
                                          <span style={{ fontWeight: 700, whiteSpace: "nowrap", marginLeft: 6 }}>{fmt(tc.venta_26)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {/* Top SKUs */}
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", marginBottom: 6, textTransform: "uppercase" }}>Top productos</div>
                                      {catDetails[c.cat].top_skus.slice(0, 5).map(sk => (
                                        <div key={sk.codigo} style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", fontSize: 11, marginBottom: 2 }}>
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "#374151" }}>
                                            {sk.descripcion.length > 22 ? sk.descripcion.slice(0, 22) + "…" : sk.descripcion}
                                          </span>
                                          <span style={{ fontWeight: 700, whiteSpace: "nowrap", marginLeft: 6 }}>{fmt(sk.venta_26)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                                : null
                            }
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vectores de oportunidad */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Adjudicados sin facturar", value: potencial.adj_sin_facturar, color: "#EF4444", border: "#FEE2E2", desc: `${adj_sin_facturar.length} clientes · Activar esta semana`, tab: "oportunidades" as const },
                { label: "SKUs perdidos recuperables", value: potencial.skus_perdidos, color: "#F97316", border: "#FED7AA", desc: `${skus_por_cliente.length} clientes · Propuesta por cliente`, tab: "oportunidades" as const },
                { label: "CM — Ampliar share", value: potencial.cm_share_gap, color: "#D97706", border: "#FEF3C7", desc: `En ${cm_lbf.length} organismos · Ampliar catálogo CM`, tab: "cm" as const },
                { label: "CM — Nuevos organismos", value: potencial.cm_captacion, color: "#3B82F6", border: "#DBEAFE", desc: `${cm_captacion.length} sin LBF · Captación mes 2`, tab: "cm" as const },
              ].map(v => (
                <div
                  key={v.label}
                  onClick={() => setTab(v.tab)}
                  style={{ flex: 1, border: `1px solid ${v.border}`, borderLeft: `4px solid ${v.color}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = v.border)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>{v.label}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>{v.desc}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: v.color, whiteSpace: "nowrap" }}>{fmt(v.value)}</div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── TAB OPORTUNIDADES ───────────────────────────────────────────────── */}
      {tab === "oportunidades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Adjudicados sin facturar — expandibles */}
          <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>URGENTE</span>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Adjudicados sin facturar</h3>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "#DC2626", fontSize: 16 }}>{fmt(potencial.adj_sin_facturar)}</span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748B" }}>
              LBF ganó estas licitaciones, el contrato está vigente y no se ha facturado. Haz clic en una fila para ver el detalle de cada licitación.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {adj_sin_facturar.map((a, i) => {
                const expanded = expandedAdj === a.rut;
                const det = clientDetails[a.rut];
                const loadingAdj = clientLoading[a.rut];
                return (
                  <div key={a.rut} style={{ border: "1px solid #FEE2E2", borderRadius: 8, overflow: "hidden" }}>
                    {/* Fila principal */}
                    <div
                      style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: expanded ? "#FEF2F2" : i % 2 ? "#FFF5F5" : "white" }}
                      onClick={() => toggleAdj(a.rut)}
                    >
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>{expanded ? "▲" : "▼"}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}
                        onClick={e => { e.stopPropagation(); openDrawer(a.rut, a.cliente); }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                        title="Abrir detalle completo del cliente"
                      >
                        {a.cliente}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>{a.n_licitaciones} licitacion{a.n_licitaciones > 1 ? "es" : ""}</span>
                      <span style={{ fontWeight: 800, color: "#DC2626", fontSize: 15 }}>{fmt(a.monto)}</span>
                      <span style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>Contactar</span>
                    </div>
                    {/* Expansión: lista de licitaciones */}
                    {expanded && (
                      loadingAdj ? <Spinner /> : det ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, borderTop: "1px solid #FEE2E2" }}>
                          <thead>
                            <tr style={{ background: "#FEF2F2" }}>
                              {["N° Licitación", "Categoría", "Ítems", "Monto", "Vence", "Obs. KAM"].map(h => (
                                <th key={h} style={{ padding: "5px 12px", textAlign: h === "Monto" || h === "Ítems" ? "right" : "left", color: "#B91C1C", fontWeight: 600, fontSize: 10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {det.adj_sin_facturar.length === 0
                              ? <tr><td colSpan={6} style={{ padding: "8px 12px", color: "#94A3B8", fontSize: 11 }}>Sin detalle disponible</td></tr>
                              : det.adj_sin_facturar.map(lic => (
                                <tr key={lic.licitacion} style={{ borderTop: "1px solid #FEE2E2" }}>
                                  <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 10, color: "#64748B" }}>{lic.licitacion}</td>
                                  <td style={{ padding: "6px 12px", color: "#374151" }}>{lic.categoria}</td>
                                  <td style={{ padding: "6px 12px", textAlign: "right", color: "#64748B" }}>{lic.n_items}</td>
                                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 800, color: "#DC2626" }}>{fmt(lic.monto)}</td>
                                  <td style={{ padding: "6px 12px", textAlign: "right", color: "#64748B", fontSize: 10 }}>{lic.fecha_termino}</td>
                                  <td style={{ padding: "6px 12px", color: "#64748B", fontSize: 10, fontStyle: lic.obs ? "normal" : "italic" }}>{lic.obs || "—"}</td>
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      ) : null
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SKUs perdidos — expansión ya existente */}
          <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ background: "#FED7AA", color: "#C2410C", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>RECUPERACIÓN</span>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>SKUs perdidos — cliente activo pero no recompra</h3>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "#D97706", fontSize: 16 }}>{fmt(potencial.skus_perdidos)}</span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748B" }}>
              Productos comprados en 2025, no pedidos en 2026. Haz clic en el cliente para abrir su ficha completa.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {skus_por_cliente.map(s => (
                <div key={s.rut} style={{ border: "1px solid #F1F5F9", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, background: expandedSku === s.rut ? "#FFFBEB" : "white", cursor: "pointer" }}
                    onClick={() => setExpandedSku(expandedSku === s.rut ? null : s.rut)}
                  >
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{expandedSku === s.rut ? "▲" : "▼"}</span>
                    <span
                      style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
                      onClick={e => { e.stopPropagation(); openDrawer(s.rut, s.cliente); }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                      title="Abrir ficha completa del cliente"
                    >
                      {s.cliente}
                    </span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{s.n_skus} SKUs</span>
                    <span style={{ fontWeight: 800, color: "#D97706", fontSize: 14 }}>{fmt(s.total_perdido)}</span>
                  </div>
                  {expandedSku === s.rut && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, borderTop: "1px solid #F1F5F9" }}>
                      <thead>
                        <tr style={{ background: "#FFFBEB" }}>
                          {["Código", "Descripción", "Categoría", "Venta 2025"].map(h => (
                            <th key={h} style={{ padding: "5px 10px", textAlign: h === "Venta 2025" ? "right" : "left", color: "#B45309", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.skus.map(sku => (
                          <tr key={sku.codigo} style={{ borderTop: "1px solid #FEF3C7" }}>
                            <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "#64748B", fontSize: 10 }}>{sku.codigo}</td>
                            <td style={{ padding: "5px 10px" }}>{sku.descripcion}</td>
                            <td style={{ padding: "5px 10px", color: "#64748B" }}>{sku.categoria}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#D97706" }}>{fmt(sku.venta_25)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Licitaciones ganadas por competidores */}
          {lics_competidor.length > 0 && (
            <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>Licitaciones vigentes ganadas por competidores</h3>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748B" }}>
                Contratos activos en hospitales y organismos de la zona donde LBF no participó o no ganó.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F1F5F9" }}>
                    {["Cliente", "Competidor adjudicado", "Monto contrato"].map(h => (
                      <th key={h} style={{ padding: "5px 8px", textAlign: h === "Monto contrato" ? "right" : "left", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lics_competidor.map((l, i) => (
                    <tr
                      key={l.rut + i}
                      style={{ borderBottom: "1px solid #F8FAFC", cursor: "pointer" }}
                      onClick={() => openDrawer(l.rut, l.cliente)}
                      onMouseEnter={e => (e.currentTarget.style.background = "#FEF2F2")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{l.cliente}</td>
                      <td style={{ padding: "7px 8px", color: "#EF4444", fontWeight: 600 }}>{l.competidor}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{fmt(l.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB CLIENTES ────────────────────────────────────────────────────── */}
      {tab === "clientes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Filtros */}
          <div style={{ background: "white", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["todos", "caida", "nuevos"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setClientFilter(f)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: clientFilter === f ? (f === "caida" ? "#EF4444" : f === "nuevos" ? "#3B82F6" : "#0F172A") : "#F1F5F9",
                    color: clientFilter === f ? "white" : "#64748B",
                  }}
                >
                  {f === "todos" ? `Todos (${clientes.length})` : f === "caida" ? `⚠ En caída (${kpis.n_caida})` : `✦ Nuevos (${kpis.n_nuevos})`}
                </button>
              ))}
            </div>
            <input
              placeholder="Buscar cliente o RUT…"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, flex: 1, minWidth: 180, outline: "none" }}
            />
            <span style={{ fontSize: 11, color: "#94A3B8" }}>{filteredClientes.length} cliente{filteredClientes.length !== 1 ? "s" : ""} · Clic en fila para ver detalle</span>
          </div>

          {/* Tabla de clientes */}
          <div style={{ background: "white", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F1F5F9", background: "#FAFAFA" }}>
                  {["Cliente", "Venta 2026", "Venta 2025", "Margen", "vs 2025", "Gap $", "Días sin compra", "Estado"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: h === "Cliente" ? "left" : "right", color: "#94A3B8", fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((c, i) => {
                  const estado = c.en_caida ? "⚠ Caída" : c.es_nuevo ? "✦ Nuevo" : "✓ OK";
                  const estadoColor = c.en_caida ? "#EF4444" : c.es_nuevo ? "#3B82F6" : "#10B981";
                  return (
                    <tr
                      key={c.rut}
                      onClick={() => openDrawer(c.rut, c.nombre)}
                      style={{ borderBottom: "1px solid #F8FAFC", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#EFF6FF")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 ? "#FAFAFA" : "white")}
                    >
                      <td style={{ padding: "9px 12px", fontWeight: 600, maxWidth: 220 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.segmento}</div>
                      </td>
                      <td style={{ textAlign: "right", padding: "9px 12px", fontWeight: 700 }}>{fmt(c.venta_26)}</td>
                      <td style={{ textAlign: "right", padding: "9px 12px", color: "#94A3B8" }}>{fmt(c.venta_25)}</td>
                      <td style={{ textAlign: "right", padding: "9px 12px", color: margenColor(c.margen), fontWeight: 600 }}>{c.margen.toFixed(1)}%</td>
                      <td style={{ textAlign: "right", padding: "9px 12px", color: clr(c.crec), fontWeight: 600 }}>{pct(c.crec)}</td>
                      <td style={{ textAlign: "right", padding: "9px 12px", color: c.gap >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>{fmt(c.gap)}</td>
                      <td style={{ textAlign: "right", padding: "9px 12px" }}>
                        {c.dias_sin_compra != null
                          ? <span style={{ color: c.dias_sin_compra > 30 ? "#EF4444" : c.dias_sin_compra > 15 ? "#F59E0B" : "#64748B", fontWeight: c.dias_sin_compra > 30 ? 700 : 400 }}>{c.dias_sin_compra}d</span>
                          : "—"
                        }
                      </td>
                      <td style={{ textAlign: "right", padding: "9px 12px" }}>
                        <span style={{ background: estadoColor + "20", color: estadoColor, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>{estado}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB CONVENIO MARCO ──────────────────────────────────────────────── */}
      {tab === "cm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Organismos con LBF */}
          <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>LBF vs Competidores — Organismos donde ya vendemos por CM</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748B" }}>
              Haz clic para ver el share visual y los competidores actuales. La oportunidad es ampliar catálogo en cada uno.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cm_lbf.map((c, i) => (
                <div key={c.organismo} style={{ border: "1px solid #F1F5F9", borderRadius: 8, overflow: "hidden" }}>
                  {/* Fila principal */}
                  <div
                    onClick={() => setExpandedCmLbf(expandedCmLbf === c.organismo ? null : c.organismo)}
                    style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "2fr 100px 100px 1fr 20px", gap: 12, alignItems: "center", cursor: "pointer", background: expandedCmLbf === c.organismo ? "#EFF6FF" : i % 2 ? "#FAFAFA" : "white" }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.organismo}</span>
                    <span style={{ textAlign: "right", fontSize: 12, color: "#3B82F6", fontWeight: 700 }}>{fmt(c.monto_lbf)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, color: "#EF4444" }}>{fmt(c.monto_comp)}</span>
                    <ShareBar lbf={c.monto_lbf} total={c.monto_lbf + c.monto_comp} />
                    <span style={{ color: "#94A3B8", fontSize: 10 }}>{expandedCmLbf === c.organismo ? "▲" : "▼"}</span>
                  </div>
                  {/* Expansión */}
                  {expandedCmLbf === c.organismo && (
                    <div style={{ padding: "12px 14px", borderTop: "1px solid #DBEAFE", background: "#F0F7FF" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", marginBottom: 8 }}>Detalle de venta LBF</div>
                          <div style={{ fontSize: 13 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ color: "#64748B" }}>LBF vende</span>
                              <span style={{ fontWeight: 700, color: "#3B82F6" }}>{fmt(c.monto_lbf)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ color: "#64748B" }}>Competidores</span>
                              <span style={{ fontWeight: 700, color: "#EF4444" }}>{fmt(c.monto_comp)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ color: "#64748B" }}>Total mercado</span>
                              <span style={{ fontWeight: 700 }}>{fmt(c.monto_lbf + c.monto_comp)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "#64748B" }}>Oportunidad</span>
                              <span style={{ fontWeight: 800, color: "#D97706" }}>{fmt(c.monto_comp)}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>Proveedores competidores</div>
                          {c.proveedores_comp.length === 0
                            ? <div style={{ fontSize: 12, color: "#94A3B8" }}>Sin competidores registrados</div>
                            : c.proveedores_comp.map(p => (
                              <div key={p} style={{ fontSize: 12, color: "#EF4444", padding: "3px 0", borderBottom: "1px solid #FEE2E2" }}>• {p}</div>
                            ))
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {cm_lbf.length === 0 && (
              <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: 24 }}>Sin datos de CM para la zona</div>
            )}
          </div>

          {/* Captación: organismos sin LBF */}
          <div style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>Organismos sin LBF — Solo compran CM a competidores</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748B" }}>
              {cm_captacion.length} organismos de la zona comprando insumos médicos por CM sin LBF. Haz clic para ver a quién compran.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cm_captacion.map((c, i) => (
                <div key={c.organismo} style={{ border: "1px solid #F1F5F9", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpandedCmCapt(expandedCmCapt === c.organismo ? null : c.organismo)}
                    style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: expandedCmCapt === c.organismo ? "#FFF7ED" : i % 2 ? "#FAFAFA" : "white" }}
                  >
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{expandedCmCapt === c.organismo ? "▲" : "▼"}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.organismo}</span>
                    <span style={{ fontWeight: 700, color: "#3B82F6", whiteSpace: "nowrap" }}>{fmt(c.monto_comp)}</span>
                    <span style={{ background: "#DBEAFE", color: "#1D4ED8", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>Captar</span>
                  </div>
                  {expandedCmCapt === c.organismo && (
                    <div style={{ padding: "12px 14px", borderTop: "1px solid #FEE2E2", background: "#FFF7ED" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>Proveedores actuales (CM 2026)</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {c.proveedores.map(p => (
                          <div key={p} style={{ fontSize: 12, color: "#374151", padding: "4px 8px", background: "white", borderRadius: 5, border: "1px solid #FDE68A" }}>
                            🏢 {p}
                          </div>
                        ))}
                        {c.proveedores.length === 0 && (
                          <div style={{ fontSize: 12, color: "#94A3B8" }}>Sin información de proveedores</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB SEGUIMIENTO ─────────────────────────────────────────────────── */}
      {tab === "seguimiento" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            {
              mesKey: "jun", mes: "Junio 2026", color: "#EF4444",
              foco: "Activación y diagnóstico rápido",
              items: [
                "Contactar Hospital Curicó — revisar estado licitación $97.9M adjudicada",
                "Contactar Hospital San Carlos — revisar estado licitación $71.2M adjudicada",
                "Contactar Hospital Cauquenes — revisar 4 licitaciones $56.3M adjudicadas",
                "Llamada Hospital Herminda Martín — diagnóstico envolturas esterilización ($43M perdido)",
                "Llamada Clínica Lircay — diagnóstico guantes vinilo ($11.4M perdido)",
                "Llamada Hospital Curicó — diagnóstico catéter y guantes QX",
              ],
              kpi: "Meta: $80.7M venta · $50M adj. facturados · 5+ clientes contactados",
            },
            {
              mesKey: "jul", mes: "Julio 2026", color: "#F97316",
              foco: "Recuperación SKUs + CM nuevos organismos",
              items: [
                "Enviar propuesta formal SKUs perdidos por cliente (con precios actualizados)",
                "Seguimiento cotizaciones enviadas en junio",
                "Propuesta CM a I. Municipalidad de Talca (Tecnika SA actual — $237M)",
                "Propuesta CM a I. Municipalidad San Javier ($113M en competidores)",
                "Propuesta CM a Departamento Salud Parral ($109M en competidores)",
              ],
              kpi: "Meta: $80.7M venta · 3+ cotizaciones CM · $30M SKUs recuperados",
            },
            {
              mesKey: "ago", mes: "Agosto 2026", color: "#3B82F6",
              foco: "Captación CM y consolidación",
              items: [
                "Hospital Talca: propuesta ampliar catálogo CM (share actual 0.5%)",
                "Hospital Herminda Martín: propuesta CM línea esterilización",
                "Hospital Curicó: propuesta CM guantes y catéteres",
                "Seguimiento municipalidades contactadas en julio",
                "Evaluar I. Municipalidad Chillán y Curicó para CM",
              ],
              kpi: "Meta: $80.7M venta · 1+ nuevo organismo CM · Cumpl. anual >85%",
            },
          ].map(m => {
            const done = m.items.filter((_, j) => checks[`${m.mesKey}.${j}`]).length;
            const total = m.items.length;
            return (
              <div key={m.mes} style={{ background: "white", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", borderLeft: `4px solid ${m.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ background: m.color + "20", color: m.color, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10 }}>{m.mes}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", flex: 1 }}>{m.foco}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: done === total ? "#10B981" : m.color }}>
                    {done}/{total} completado{done === total ? " ✓" : ""}
                  </span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <ProgressBar value={done} max={total} color={done === total ? "#10B981" : m.color} />
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 11, color: "#94A3B8" }}>{m.kpi}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {m.items.map((it, j) => {
                    const key = `${m.mesKey}.${j}`;
                    const checked = !!checks[key];
                    return (
                      <label
                        key={j}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "6px 8px", borderRadius: 6, transition: "background 0.1s", background: checked ? "#F0FDF4" : "transparent" }}
                        onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLLabelElement).style.background = "#F8FAFC"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.background = checked ? "#F0FDF4" : "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCheck(key)}
                          style={{ marginTop: 2, accentColor: m.color, width: 14, height: 14, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13, color: checked ? "#94A3B8" : "#374151", textDecoration: checked ? "line-through" : "none" }}>
                          {it}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
