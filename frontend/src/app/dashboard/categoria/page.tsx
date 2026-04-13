"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Line, ComposedChart, LabelList,
} from "recharts";

/* ─── Types ──────────────────────────────────────────────── */

interface Kpis {
  venta_ytd_26: number;
  venta_ytd_25: number;
  crec_ytd: number;
  margen_ytd: number;
  venta_mes_26: number;
  venta_mes_25: number;
  crec_mes: number;
  productos: number;
  mes_nombre: string;
  mes_anterior: string;
}

interface Tendencia {
  mes: number;
  mes_nombre: string;
  venta_25: number;
  venta_26: number;
  crec: number | null;
}

interface Semana {
  semana: string;
  periodo: string;
  venta_actual: number;
  venta_anterior: number;
  acum_actual: number;
  acum_anterior: number;
  crec: number | null;
}

interface CatRow {
  categoria: string;
  venta_26: number;
  venta_25: number;
  crec: number | null;
  margen: number;
  pct: number;
}

interface ProdRow {
  codigo: string;
  descripcion: string;
  venta_26: number;
  venta_25: number;
  crec: number | null;
  margen: number;
  cant: number;
}

interface MPData {
  kpis: Kpis;
  tendencia: Tendencia[];
  avance_semanal: Semana[];
  categorias: CatRow[];
  productos: ProdRow[];
  error?: string;
}

/* ─── Colors ─────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

/* ─── StatCard ───────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: "1 1 160px", background: "white", borderRadius: 10,
      border: "1px solid #E2E8F0", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "14px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Main Page ──────────────────────────────────────────── */

export default function MultiProductoPage() {
  const [data, setData] = useState<MPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllProds, setShowAllProds] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<MPData>("/api/multiproducto/all");
      setData(res);
    } catch (e) {
      console.error("Failed to load multiproducto", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  if (!data || !data.kpis) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar datos{data?.error ? `: ${data.error}` : ""}</div>;
  }

  const k = data.kpis;
  const crecColor = (v: number) => v >= 0 ? "#10B981" : "#EF4444";
  const crecSign = (v: number) => v >= 0 ? "+" : "";

  // Products to display
  const prodsToShow = showAllProds ? data.productos : data.productos.slice(0, 20);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Cliente MultiProducto</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Seguimiento de ventas 2025 vs 2026 — partner con precios especiales
          </p>
        </div>
        <button onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); loadData(); }} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Venta YTD 2026" value={fmtAbs(k.venta_ytd_26)} sub={`2025: ${fmtAbs(k.venta_ytd_25)}`} color="#3B82F6" />
        <StatCard
          label="Crec. YTD"
          value={`${crecSign(k.crec_ytd)}${fmtPct(k.crec_ytd)}`}
          color={crecColor(k.crec_ytd)}
        />
        <StatCard label={`Venta ${k.mes_nombre}`} value={fmtAbs(k.venta_mes_26)} sub={`2025: ${fmtAbs(k.venta_mes_25)}`} color="#8B5CF6" />
        <StatCard
          label={`Crec. ${k.mes_nombre}`}
          value={`${crecSign(k.crec_mes)}${fmtPct(k.crec_mes)}`}
          color={crecColor(k.crec_mes)}
        />
        <StatCard label="Margen YTD" value={fmtPct(k.margen_ytd)} color={k.margen_ytd >= 30 ? "#10B981" : "#F59E0B"} />
        <StatCard label="Productos Activos" value={String(k.productos)} color="#64748B" />
      </div>

      {/* ═══ Charts: Tendencia + Avance Semanal ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Chart 1: Tendencia mensual 2025 vs 2026 */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
            Tendencia Mensual
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>2025 vs 2026</span>
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} tick={{ fontSize: 11 }} width={60} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={(v: any) => fmtAbs(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="venta_25" name="2025" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={24}>
                <LabelList dataKey="venta_25" position="top" formatter={(v: unknown) => `$${(Number(v) / 1e6).toFixed(0)}M`} style={{ fontSize: 9, fill: "#94A3B8" }} />
              </Bar>
              <Bar dataKey="venta_26" name="2026" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={24}>
                <LabelList dataKey="venta_26" position="top" formatter={(v: unknown) => `$${(Number(v) / 1e6).toFixed(0)}M`} style={{ fontSize: 9, fill: "#1E40AF", fontWeight: 700 }} />
              </Bar>
              <Line dataKey="crec" name="Crec. %" yAxisId="right" type="monotone" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }}>
                <LabelList dataKey="crec" position="top" formatter={(v: unknown) => v !== null ? `${Number(v) > 0 ? "+" : ""}${v}%` : ""} style={{ fontSize: 9, fill: "#F59E0B", fontWeight: 700 }} />
              </Line>
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={50} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Avance semanal — seguimiento mes actual */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
            Seguimiento Semanal
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{k.mes_nombre} 2026</span>
          </h3>
          {data.avance_semanal.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={data.avance_semanal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} tick={{ fontSize: 11 }} width={55} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => fmtAbs(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="venta_actual" name="Venta Semanal" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={28}>
                    <LabelList dataKey="venta_actual" position="top" formatter={(v: unknown) => `$${(Number(v) / 1e6).toFixed(1)}M`} style={{ fontSize: 10, fill: "#1E40AF", fontWeight: 700 }} />
                  </Bar>
                  <Line dataKey="acum_actual" name="Acumulado" type="monotone" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }}>
                    <LabelList dataKey="acum_actual" position="top" formatter={(v: unknown) => `$${(Number(v) / 1e6).toFixed(1)}M`} style={{ fontSize: 9, fill: "#F59E0B", fontWeight: 700 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
              {/* Weekly table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px" }}>Semana</th>
                    <th style={{ ...thStyle, fontSize: 11, padding: "6px 10px" }}>Periodo</th>
                    <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Venta</th>
                    <th style={{ ...thR, fontSize: 11, padding: "6px 10px" }}>Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.avance_semanal.map((w) => (
                    <tr key={w.semana} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "5px 10px", fontWeight: 700 }}>{w.semana}</td>
                      <td style={{ padding: "5px 10px", color: "#64748B" }}>{w.periodo}</td>
                      <td style={{ ...tdR, padding: "5px 10px", fontWeight: 600 }}>{fmtAbs(w.venta_actual)}</td>
                      <td style={{ ...tdR, padding: "5px 10px", fontWeight: 700, color: "#1E40AF" }}>{fmtAbs(w.acum_actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Sin datos del mes</div>
          )}
        </div>
      </div>

      {/* ═══ Categorías ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Venta por Categoria
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>YTD 2025 vs 2026</span>
          </h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={thStyle}>Categoria</th>
              <th style={thR}>Venta 2026</th>
              <th style={thR}>Venta 2025</th>
              <th style={thR}>Crec.</th>
              <th style={thR}>Margen</th>
              <th style={thR}>% del Total</th>
            </tr>
          </thead>
          <tbody>
            {data.categorias.map((c, i) => (
              <tr key={c.categoria} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: 2,
                    background: CAT_COLORS[c.categoria] || "#94A3B8", marginRight: 6,
                  }} />
                  {c.categoria}
                </td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.venta_26)}</td>
                <td style={{ ...tdR, color: "#64748B" }}>{fmtAbs(c.venta_25)}</td>
                <td style={{ ...tdR, fontWeight: 600, color: c.crec !== null ? crecColor(c.crec) : "#64748B" }}>
                  {c.crec !== null ? `${crecSign(c.crec)}${c.crec.toFixed(1)}%` : "Nuevo"}
                </td>
                <td style={{ ...tdR, color: c.margen >= 30 ? "#10B981" : c.margen >= 20 ? "#F59E0B" : "#EF4444" }}>
                  {c.margen.toFixed(1)}%
                </td>
                <td style={tdR}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <div style={{ width: 50, height: 5, background: "#E2E8F0", borderRadius: 3 }}>
                      <div style={{ width: `${Math.min(c.pct, 100)}%`, height: "100%", background: CAT_COLORS[c.categoria] || "#94A3B8", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, minWidth: 32 }}>{c.pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {/* Total */}
            <tr style={{ borderTop: "2px solid #D1D5DB", background: "#F1F5F9", fontWeight: 700 }}>
              <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
              <td style={{ ...tdR, fontWeight: 800 }}>{fmtAbs(k.venta_ytd_26)}</td>
              <td style={tdR}>{fmtAbs(k.venta_ytd_25)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: crecColor(k.crec_ytd) }}>
                {crecSign(k.crec_ytd)}{fmtPct(k.crec_ytd)}
              </td>
              <td style={{ ...tdR, color: (k.margen_ytd ?? 0) >= 30 ? "#10B981" : "#F59E0B" }}>{(k.margen_ytd ?? 0).toFixed(1)}%</td>
              <td style={{ ...tdR, fontWeight: 800 }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ═══ Productos del mes ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Productos — {k.mes_nombre}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>2025 vs 2026</span>
          </h3>
          {data.productos.length > 20 && (
            <button
              onClick={() => setShowAllProds(!showAllProds)}
              style={{
                fontSize: 12, fontWeight: 600, color: "#3B82F6", background: "none",
                border: "none", cursor: "pointer",
              }}
            >
              {showAllProds ? "Mostrar Top 20" : `Ver todos (${data.productos.length})`}
            </button>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ ...thStyle, fontSize: 11 }}>Codigo</th>
              <th style={{ ...thStyle, fontSize: 11, maxWidth: 300 }}>Descripcion</th>
              <th style={{ ...thR, fontSize: 11 }}>Cant.</th>
              <th style={{ ...thR, fontSize: 11 }}>Venta 2026</th>
              <th style={{ ...thR, fontSize: 11 }}>Venta 2025</th>
              <th style={{ ...thR, fontSize: 11 }}>Crec.</th>
              <th style={{ ...thR, fontSize: 11 }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {prodsToShow.map((p, i) => (
              <tr key={p.codigo || i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td style={{ ...tdStyle, fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{p.codigo}</td>
                <td style={{ ...tdStyle, fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.descripcion}
                </td>
                <td style={{ ...tdR, fontSize: 11 }}>{p.cant.toLocaleString("es-CL")}</td>
                <td style={{ ...tdR, fontSize: 11, fontWeight: 600 }}>{fmtAbs(p.venta_26)}</td>
                <td style={{ ...tdR, fontSize: 11, color: "#64748B" }}>{fmtAbs(p.venta_25)}</td>
                <td style={{ ...tdR, fontSize: 11, fontWeight: 600, color: p.crec !== null ? crecColor(p.crec) : "#64748B" }}>
                  {p.crec !== null ? `${crecSign(p.crec)}${p.crec.toFixed(1)}%` : "Nuevo"}
                </td>
                <td style={{ ...tdR, fontSize: 11, color: p.margen >= 30 ? "#10B981" : p.margen >= 20 ? "#F59E0B" : "#EF4444" }}>
                  {p.margen.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
