"use client";

import React, { useEffect, useState, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Kpis {
  venta_mes: number;
  contrib_mes: number;
  margen_mes: number;
  venta_12m: number;
  contrib_12m: number;
  margen_12m: number;
  n_clientes: number;
  var_mes: number;
  venta_mes_ant: number;
}

interface ClienteRow {
  rut: string;
  nombre: string;
  venta_mes: number;
  contrib_mes: number;
  margen_mes: number;
  venta_12m: number;
  contrib_12m: number;
  margen_12m: number;
  n_equipos: number | null;
  pct_parque: number | null;
  eficiencia_mes: number | null;
  eficiencia_12m: number | null;
  resultado_op_12m: number | null;
  margen_op_12m: number | null;
}

interface RenasysData {
  mes: number;
  ano: number;
  label: string;
  kpis: Kpis;
  clientes: ClienteRow[];
  error?: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  const abs = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${s}$${(abs / 1_000_000_000).toFixed(1)}MM`;
  if (abs >= 1_000_000)     return `${s}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${s}$${(abs / 1_000).toFixed(0)}K`;
  return `${s}$${abs.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function posColor(n: number) { return n >= 0 ? "#10B981" : "#EF4444"; }

function semaforo(m: number) {
  if (m >= 40) return "#10B981";
  if (m >= 30) return "#F59E0B";
  return "#EF4444";
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color, badge }: {
  label: string; value: string; sub?: string; color?: string; badge?: string;
}) {
  return (
    <div style={{
      background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
      padding: "16px 20px", borderLeft: `4px solid ${color ?? "#3B82F6"}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)", flex: "1 1 160px",
    }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "#0F172A", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
      {badge && (
        <div style={{
          display: "inline-block", marginTop: 6, padding: "2px 8px",
          borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: badge.startsWith("+") ? "#DCFCE7" : "#FEE2E2",
          color: badge.startsWith("+") ? "#166534" : "#991B1B",
        }}>
          {badge} vs mes ant.
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function RenasysPage() {
  const curMonth = new Date().getMonth() + 1;
  const [mes, setMes] = useState(curMonth);
  const [data, setData] = useState<RenasysData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback((m: number) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("lbf_token") || "";
    fetch(`${API}/api/renasys/?mes=${m}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: RenasysData) => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(e.message || "Error cargando datos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(mes); }, [mes, load]);

  const thS: React.CSSProperties = {
    padding: "9px 12px", fontSize: 11, fontWeight: 600, color: "#64748B",
    textAlign: "left", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0",
    whiteSpace: "nowrap",
  };
  const thR: React.CSSProperties = { ...thS, textAlign: "right" };
  const td: React.CSSProperties = {
    padding: "8px 12px", fontSize: 12, borderBottom: "1px solid #F1F5F9", color: "#0F172A",
  };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  const rows = data?.clientes.filter(c =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.rut.includes(busqueda)
  ) ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              background: "#EFF6FF", border: "1px solid #BFDBFE",
              borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#1D4ED8",
            }}>
              DEMO · Equipos pendientes de integración IT
            </div>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>
            Renasys TPN
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            Terapia de Presión Negativa · {data?.label ?? "cargando…"}
          </p>
        </div>

        {/* Selector de mes */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Array.from({ length: curMonth }, (_, i) => i + 1).map(m => (
            <button key={m} onClick={() => setMes(m)} style={{
              padding: "6px 11px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: mes === m ? 700 : 400,
              background: mes === m ? "#DBEAFE" : "#F1F5F9",
              color: mes === m ? "#1E40AF" : "#64748B",
            }}>
              {MESES[m]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>Cargando datos…</div>
      )}
      {!loading && error && (
        <div style={{ padding: 20, background: "#FEF2F2", borderRadius: 10, color: "#EF4444", border: "1px solid #FECACA" }}>
          Error: {error}
        </div>
      )}

      {!loading && data && !error && (() => {
        const k = data.kpis;
        const varBadge = fmtPct(k.var_mes);

        return (
          <>
            {/* KPIs */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <KpiCard
                label="Venta del mes"
                value={fmt(k.venta_mes)}
                sub={`${MESES[mes]} ${data.ano}`}
                color="#3B82F6"
                badge={varBadge}
              />
              <KpiCard
                label="Contribución mes"
                value={fmt(k.contrib_mes)}
                color="#10B981"
              />
              <KpiCard
                label="Margen mes"
                value={`${k.margen_mes.toFixed(1)}%`}
                color={semaforo(k.margen_mes)}
              />
              <KpiCard
                label="Venta últ. 12 meses"
                value={fmt(k.venta_12m)}
                color="#6366F1"
              />
              <KpiCard
                label="Contrib. últ. 12 meses"
                value={fmt(k.contrib_12m)}
                color="#8B5CF6"
              />
              <KpiCard
                label="Margen 12 meses"
                value={`${k.margen_12m.toFixed(1)}%`}
                color={semaforo(k.margen_12m)}
              />
              <KpiCard
                label="Clientes activos"
                value={String(k.n_clientes)}
                sub="con venta en el mes"
                color="#F59E0B"
              />
            </div>

            {/* Tabla */}
            <div style={{
              background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px", borderBottom: "1px solid #E2E8F0",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                    Detalle por Cliente
                  </span>
                  <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 10 }}>
                    {rows.length} clientes
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Buscar cliente…"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={{
                    padding: "6px 12px", border: "1px solid #E2E8F0", borderRadius: 6,
                    fontSize: 12, color: "#0F172A", outline: "none", width: 200,
                  }}
                />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thS}>Cliente</th>
                      {/* Datos reales */}
                      <th style={{ ...thR, borderLeft: "2px solid #DBEAFE", color: "#1D4ED8" }}>Venta {MESES[mes]}</th>
                      <th style={{ ...thR, color: "#1D4ED8" }}>Contrib. {MESES[mes]}</th>
                      <th style={{ ...thR, color: "#1D4ED8" }}>Margen {MESES[mes]}</th>
                      <th style={{ ...thR, color: "#1D4ED8" }}>Venta 12m</th>
                      <th style={{ ...thR, color: "#1D4ED8" }}>Contrib. 12m</th>
                      <th style={{ ...thR, color: "#1D4ED8" }}>Margen 12m</th>
                      {/* Placeholders */}
                      <th style={{ ...thR, borderLeft: "2px solid #FEF3C7", color: "#92400E", background: "#FFFBEB" }}>N° Equipos</th>
                      <th style={{ ...thR, color: "#92400E", background: "#FFFBEB" }}>% Parque</th>
                      <th style={{ ...thR, color: "#92400E", background: "#FFFBEB" }}>Efic./Equipo mes</th>
                      <th style={{ ...thR, color: "#92400E", background: "#FFFBEB" }}>Efic./Equipo 12m</th>
                      <th style={{ ...thR, color: "#92400E", background: "#FFFBEB" }}>Result. Op. 12m</th>
                      <th style={{ ...thR, color: "#92400E", background: "#FFFBEB" }}>Margen Op. 12m</th>
                    </tr>
                    <tr>
                      <td colSpan={7} style={{ padding: "2px 12px", fontSize: 10, color: "#3B82F6", background: "#EFF6FF", fontWeight: 600 }}>
                        ● Datos reales desde BI_TOTAL_FACTURA
                      </td>
                      <td colSpan={6} style={{ padding: "2px 12px", fontSize: 10, color: "#92400E", background: "#FFFBEB", fontWeight: 600 }}>
                        ● Pendiente integración con IT (parque de equipos)
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => (
                      <tr key={c.rut} style={{ background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                        <td style={{ ...td, maxWidth: 280 }}>
                          <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 12 }}>{c.nombre || c.rut}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.rut}</div>
                        </td>
                        {/* Reales */}
                        <td style={{ ...tdR, borderLeft: "2px solid #DBEAFE" }}>{fmt(c.venta_mes)}</td>
                        <td style={tdR}>{fmt(c.contrib_mes)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: semaforo(c.margen_mes) }}>
                          {c.margen_mes.toFixed(1)}%
                        </td>
                        <td style={tdR}>{fmt(c.venta_12m)}</td>
                        <td style={tdR}>{fmt(c.contrib_12m)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: semaforo(c.margen_12m) }}>
                          {c.margen_12m.toFixed(1)}%
                        </td>
                        {/* Placeholders */}
                        <td style={{ ...tdR, background: "#FFFBEB", borderLeft: "2px solid #FEF3C7", color: "#D97706" }}>—</td>
                        <td style={{ ...tdR, background: "#FFFBEB", color: "#D97706" }}>—</td>
                        <td style={{ ...tdR, background: "#FFFBEB", color: "#D97706" }}>—</td>
                        <td style={{ ...tdR, background: "#FFFBEB", color: "#D97706" }}>—</td>
                        <td style={{ ...tdR, background: "#FFFBEB", color: "#D97706" }}>—</td>
                        <td style={{ ...tdR, background: "#FFFBEB", color: "#D97706" }}>—</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totales */}
                  <tfoot>
                    <tr style={{ background: "#F1F5F9", fontWeight: 700 }}>
                      <td style={{ ...td, fontWeight: 700, color: "#0F172A" }}>TOTAL</td>
                      <td style={{ ...tdR, borderLeft: "2px solid #DBEAFE", fontWeight: 700 }}>{fmt(k.venta_mes)}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{fmt(k.contrib_mes)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: semaforo(k.margen_mes) }}>{k.margen_mes.toFixed(1)}%</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{fmt(k.venta_12m)}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{fmt(k.contrib_12m)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: semaforo(k.margen_12m) }}>{k.margen_12m.toFixed(1)}%</td>
                      <td colSpan={6} style={{ ...tdR, background: "#FFFBEB", borderLeft: "2px solid #FEF3C7", color: "#92400E", fontSize: 11 }}>
                        Pendiente IT
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
