"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, semaforo, fmt } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface TVKpis {
  ppto_anual: number;
  ppto_ytd: number;
  ppto_mes: number;
  meta_ytd: number;
  venta_ytd: number;
  venta_ytd_facturas: number;
  venta_ytd_guias: number;
  venta_mes: number;
  venta_mes_facturas: number;
  venta_mes_guias: number;
  venta_ytd_25: number;
  venta_mes_25: number;
  cumpl_ytd: number;
  cumpl_mes: number;
  crec_ytd: number;
  crec_mes: number;
  gap_ytd: number;
  gap_mes: number;
  n_clientes_ppto: number;
  n_productos_ppto: number;
  n_clientes_nuevos: number;
  n_clientes_q4_sin_compra: number;
  total_venta_nuevos: number;
  total_venta_q4: number;
  mes_nombre: string;
}

interface VentaMensual {
  MES: number;
  mes_nombre: string;
  ppto: number;
  venta: number;
  cumplimiento: number | null;
}

interface AvanceSemanal {
  semana: string;
  periodo: string;
  venta_semana: number;
  acumulado: number;
  meta_mes: number;
  cumplimiento: number;
}

interface ClienteRow {
  RUT: string;
  NOMBRE: string;
  venta_2026?: number;
  venta_2025?: number;
  venta_q4_2025?: number;
  contribucion_2026?: number;
  contribucion_q4_2025?: number;
  margen_pct?: number;
}

interface ProductoRow {
  CODIGO: string;
  DESCRIPCION: string;
  venta_2025: number;
  venta_2026: number;
  crecimiento: number | null;
  margen_pct: number;
}

interface TVData {
  kpis: TVKpis;
  clientes_nuevos: ClienteRow[];
  clientes_q4_sin_compra: ClienteRow[];
  top10_clientes: ClienteRow[];
  ventas_mensuales: VentaMensual[];
  avance_semanal: AvanceSemanal[];
  error?: string;
}

/* ─── Stat Card ─────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: "1 1 180px", background: "white", borderRadius: 10,
      border: "1px solid #E2E8F0", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Section title ─────────────────────────────────────────────────── */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
        {title}
        {subtitle && (
          <span style={{ fontSize: 13, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>
            {subtitle}
          </span>
        )}
      </h3>
    </div>
  );
}

/* ─── Custom bar label ──────────────────────────────────────────────── */

function BarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="#475569" textAnchor="middle" fontSize={10} fontWeight={600}>
      {fmt(value)}
    </text>
  );
}

/* ─── Product drill-down row ────────────────────────────────────────── */

function ProductDrillDown({ rut }: { rut: string }) {
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ productos: ProductoRow[] }>(`/api/televentas/cliente-productos?rut=${encodeURIComponent(rut)}`);
        setProductos(res.productos ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [rut]);

  if (loading) return <tr><td colSpan={8} style={{ padding: 16, textAlign: "center", color: "#64748B" }}>Cargando productos...</td></tr>;
  if (!productos.length) return <tr><td colSpan={8} style={{ padding: 16, textAlign: "center", color: "#94A3B8" }}>Sin productos</td></tr>;

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0 }}>
        <div style={{ background: "#F8FAFC", borderTop: "1px solid #E2E8F0", borderBottom: "2px solid #E2E8F0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#EEF2FF" }}>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px" }}>Codigo</th>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px" }}>Descripcion</th>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px", textAlign: "right" }}>Venta 2025</th>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px", textAlign: "right" }}>Venta 2026</th>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px", textAlign: "right" }}>Crec. %</th>
                <th style={{ ...thStyle, fontSize: 11, padding: "6px 14px", textAlign: "right" }}>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p, j) => {
                const crecColor = p.crecimiento === null ? "#94A3B8" : p.crecimiento >= 0 ? "#059669" : "#DC2626";
                const margenColor = p.margen_pct >= 40 ? "#059669" : p.margen_pct >= 30 ? "#D97706" : "#DC2626";
                return (
                  <tr key={j} style={{ borderBottom: "1px solid #E2E8F0", background: j % 2 === 0 ? "#F8FAFC" : "#F1F5F9" }}>
                    <td style={{ padding: "5px 14px", color: "#374151", fontWeight: 500 }}>{p.CODIGO}</td>
                    <td style={{ padding: "5px 14px", color: "#374151", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.DESCRIPCION}</td>
                    <td style={{ padding: "5px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtAbs(p.venta_2025)}</td>
                    <td style={{ padding: "5px 14px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtAbs(p.venta_2026)}</td>
                    <td style={{ padding: "5px 14px", textAlign: "right", color: crecColor, fontWeight: 600 }}>
                      {p.crecimiento !== null ? `${p.crecimiento >= 0 ? "+" : ""}${p.crecimiento.toFixed(1)}%` : "--"}
                    </td>
                    <td style={{ padding: "5px 14px", textAlign: "right", color: margenColor, fontWeight: 600 }}>
                      {p.margen_pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

/* ─── Expandable client table ───────────────────────────────────────── */

function ClientTable({
  title,
  subtitle,
  clients,
  columns,
}: {
  title: string;
  subtitle?: string;
  clients: ClienteRow[];
  columns: { key: string; label: string; align?: "right"; render?: (c: ClienteRow, i: number) => React.ReactNode }[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", marginBottom: 24, overflow: "hidden" }}>
      <SectionTitle title={title} subtitle={subtitle} />
      <div style={{ maxHeight: 500, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, width: 30 }}></th>
              {columns.map((col) => (
                <th key={col.key} style={{ ...thStyle, textAlign: col.align || "left" }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => {
              const isExpanded = expanded === c.RUT;
              return (
                <Fragment key={c.RUT}>
                  <tr
                    onClick={() => setExpanded(isExpanded ? null : c.RUT)}
                    style={{
                      borderBottom: "1px solid #F1F5F9",
                      background: isExpanded ? "#EEF2FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: "center", width: 30, padding: "8px 6px" }}>
                      {isExpanded ? <ChevronDown size={14} color="#6366F1" /> : <ChevronRight size={14} color="#94A3B8" />}
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} style={{ ...(col.align === "right" ? tdRight : tdStyle) }}>
                        {col.render ? col.render(c, i) : String((c as never)[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && <ProductDrillDown rut={c.RUT} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Period options ────────────────────────────────────────────────── */

const PERIOD_OPTIONS = [
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "mes-1", label: "Ene" },
  { value: "mes-2", label: "Feb" },
  { value: "mes-3", label: "Mar" },
  { value: "mes-4", label: "Abr" },
  { value: "mes-5", label: "May" },
  { value: "mes-6", label: "Jun" },
  { value: "mes-7", label: "Jul" },
  { value: "mes-8", label: "Ago" },
  { value: "mes-9", label: "Sep" },
  { value: "mes-10", label: "Oct" },
  { value: "mes-11", label: "Nov" },
  { value: "mes-12", label: "Dic" },
];

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function TeleventasPage() {
  const [data, setData] = useState<TVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");

  const loadData = useCallback(async (p?: string) => {
    setLoading(true);
    try {
      const sel = p ?? period;
      let url = `/api/televentas/all?periodo=${sel}`;
      if (sel.startsWith("mes-")) {
        url = `/api/televentas/all?periodo=mes&mes=${sel.split("-")[1]}`;
      }
      const res = await api.get<TVData>(url);
      setData(res);
    } catch (e) {
      console.error("Error loading Televentas data", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  const k = data?.kpis;
  if (!k) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar datos de Televentas{data?.error ? `: ${data.error}` : ""}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Televentas</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            PPTO vs Venta (Facturas + Guias) &mdash; Canal 16-TELEVENTAS
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

      {/* Period filter */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap",
        padding: "10px 16px", background: "white", borderRadius: 10,
        border: "1px solid #E2E8F0",
      }}>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setPeriod(opt.value); loadData(opt.value); }}
            style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: period === opt.value ? "1px solid #3B82F6" : "1px solid #E2E8F0",
              background: period === opt.value ? "#EFF6FF" : "transparent",
              color: period === opt.value ? "#2563EB" : "#64748B",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ═══ KPIs ROW 1 — YTD ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label="PPTO Anual 2026" value={fmtAbs(k.ppto_anual)} color="#6366F1" />
        <StatCard label="Meta YTD" value={fmtAbs(k.ppto_ytd)} sub={`Ene - ${k.mes_nombre}`} color="#6366F1" />
        <StatCard
          label="Venta YTD"
          value={fmtAbs(k.venta_ytd)}
          sub={`Fact: ${fmtAbs(k.venta_ytd_facturas)} | Guias: ${fmtAbs(k.venta_ytd_guias)}`}
          color="#3B82F6"
        />
        <StatCard
          label="Cumpl. YTD"
          value={`${semaforo(k.cumpl_ytd)} ${fmtPct(k.cumpl_ytd)}`}
          sub={`Gap: ${fmtAbs(k.gap_ytd)}`}
          color={k.cumpl_ytd >= 100 ? "#10B981" : k.cumpl_ytd >= 80 ? "#F59E0B" : "#EF4444"}
        />
        <StatCard
          label="Crec. vs 2025 YTD"
          value={`${k.crec_ytd >= 0 ? "+" : ""}${fmtPct(k.crec_ytd)}`}
          sub={`2025 YTD: ${fmtAbs(k.venta_ytd_25)}`}
          color={k.crec_ytd >= 0 ? "#10B981" : "#EF4444"}
        />
      </div>

      {/* ═══ KPIs ROW 2 — Mes Actual ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label={`Meta ${k.mes_nombre}`} value={fmtAbs(k.ppto_mes)} color="#8B5CF6" />
        <StatCard
          label={`Venta ${k.mes_nombre}`}
          value={fmtAbs(k.venta_mes)}
          sub={`Fact: ${fmtAbs(k.venta_mes_facturas)} | Guias: ${fmtAbs(k.venta_mes_guias)}`}
          color="#3B82F6"
        />
        <StatCard
          label={`Cumpl. ${k.mes_nombre}`}
          value={`${semaforo(k.cumpl_mes)} ${fmtPct(k.cumpl_mes)}`}
          sub={`Gap: ${fmtAbs(k.gap_mes)}`}
          color={k.cumpl_mes >= 100 ? "#10B981" : k.cumpl_mes >= 80 ? "#F59E0B" : "#EF4444"}
        />
        <StatCard
          label={`Crec. vs ${k.mes_nombre} 2025`}
          value={`${k.crec_mes >= 0 ? "+" : ""}${fmtPct(k.crec_mes)}`}
          sub={`2025: ${fmtAbs(k.venta_mes_25)}`}
          color={k.crec_mes >= 0 ? "#10B981" : "#EF4444"}
        />
        <StatCard label="Clientes PPTO" value={String(k.n_clientes_ppto)} sub={`${k.n_productos_ppto} productos`} color="#64748B" />
      </div>

      {/* ═══ Mini KPI badges with totals ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{ padding: "10px 20px", borderRadius: 8, background: "#ECFDF5", border: "1px solid #A7F3D0", fontSize: 14, fontWeight: 600, color: "#065F46" }}>
          Clientes Nuevos 2026: <strong>{k.n_clientes_nuevos}</strong>
          <span style={{ marginLeft: 12, color: "#059669", fontWeight: 800 }}>{fmtAbs(k.total_venta_nuevos)}</span>
        </div>
        <div style={{ padding: "10px 20px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 14, fontWeight: 600, color: "#991B1B" }}>
          Clientes Q4-2025 sin compra 2026: <strong>{k.n_clientes_q4_sin_compra}</strong>
          <span style={{ marginLeft: 12, color: "#DC2626", fontWeight: 800 }}>-{fmtAbs(k.total_venta_q4)}</span>
        </div>
      </div>

      {/* ═══ Two columns: Chart + Weekly Progress ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* CHART — PPTO vs Venta mensual with cumplimiento line */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
            PPTO vs Venta Mensual 2026
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data?.ventas_mensuales ?? []} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => {
                  const abs = Math.abs(Number(v));
                  if (abs >= 1e9) return `${(Number(v)/1e9).toFixed(0)}MM`;
                  if (abs >= 1e6) return `${(Number(v)/1e6).toFixed(0)}M`;
                  return String(v);
                }}
                tick={{ fontSize: 11 }}
                width={60}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
                width={50}
                domain={[0, 140]}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, name: any) => {
                  if (name === "Cumpl. %") return [`${Number(v).toFixed(1)}%`, name];
                  return [fmtAbs(Number(v)), name];
                }}
                labelFormatter={(l) => `Mes: ${l}`}
                contentStyle={{ borderRadius: 8, fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar yAxisId="left" dataKey="ppto" name="Presupuesto" fill="#C084FC" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="ppto" content={<BarLabel />} />
              </Bar>
              <Bar yAxisId="left" dataKey="venta" name="Venta" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="venta" content={<BarLabel />} />
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumplimiento"
                name="Cumpl. %"
                stroke="#F59E0B"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#F59E0B" }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* AVANCE SEMANAL — only weeks with data */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <SectionTitle title={`Avance Semanal ${k.mes_nombre}`} subtitle={`Meta: ${fmtAbs(k.ppto_mes)}`} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={thStyle}>Semana</th>
                  <th style={thStyle}>Periodo</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Venta Semana</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Acumulado</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {(data?.avance_semanal ?? []).map((s, i) => {
                  const color = s.cumplimiento >= 100 ? "#10B981" : s.cumplimiento >= 80 ? "#F59E0B" : "#EF4444";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{s.semana}</td>
                      <td style={tdStyle}>{s.periodo}</td>
                      <td style={tdRight}>{fmtAbs(s.venta_semana)}</td>
                      <td style={{ ...tdRight, fontWeight: 600 }}>{fmtAbs(s.acumulado)}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color }}>
                        {semaforo(s.cumplimiento)} {fmtPct(s.cumplimiento)}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                {(data?.avance_semanal ?? []).length > 0 && (() => {
                  const last = data!.avance_semanal[data!.avance_semanal.length - 1];
                  const totalVenta = data!.avance_semanal.reduce((s, w) => s + w.venta_semana, 0);
                  return (
                    <tr style={{ borderTop: "2px solid #D1D5DB", background: "#F1F5F9", fontWeight: 700 }}>
                      <td style={tdStyle} colSpan={2}>Total {k.mes_nombre}</td>
                      <td style={tdRight}>{fmtAbs(totalVenta)}</td>
                      <td style={tdRight}>{fmtAbs(last.acumulado)}</td>
                      <td style={{ ...tdRight, color: last.cumplimiento >= 100 ? "#10B981" : last.cumplimiento >= 80 ? "#F59E0B" : "#EF4444" }}>
                        {semaforo(last.cumplimiento)} {fmtPct(last.cumplimiento)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
          {/* Progress bar */}
          {data?.avance_semanal && data.avance_semanal.length > 0 && (() => {
            const last = data.avance_semanal[data.avance_semanal.length - 1];
            const pct = Math.min(last.cumplimiento, 100);
            return (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 6 }}>
                  <span>Avance meta {k.mes_nombre}</span>
                  <span style={{ fontWeight: 700, color: "#0F172A" }}>{fmtPct(last.cumplimiento)}</span>
                </div>
                <div style={{ height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: last.cumplimiento >= 100 ? "#10B981" : last.cumplimiento >= 80 ? "#F59E0B" : "#EF4444",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ═══ TOP 10 CLIENTES with venta 2025, growth, margin ═══ */}
      {data?.top10_clientes && data.top10_clientes.length > 0 && (
        <ClientTable
          title="Top 10 Clientes 2026"
          subtitle="Por venta YTD (facturas) — click para ver productos"
          clients={data.top10_clientes}
          columns={[
            { key: "#", label: "#", render: (_c, i) => (
              <span style={{ fontWeight: 700, color: i < 3 ? "#3B82F6" : "#64748B" }}>{i + 1}</span>
            )},
            { key: "RUT", label: "RUT" },
            { key: "NOMBRE", label: "Nombre" },
            { key: "venta_2026", label: "Venta 2026", align: "right", render: (c) => (
              <span style={{ fontWeight: 600 }}>{fmtAbs(c.venta_2026 ?? 0)}</span>
            )},
            { key: "venta_2025", label: "Venta 2025", align: "right", render: (c) => (
              <span>{fmtAbs(c.venta_2025 ?? 0)}</span>
            )},
            { key: "crec", label: "Crec. %", align: "right", render: (c) => {
              const v26 = c.venta_2026 ?? 0;
              const v25 = c.venta_2025 ?? 0;
              if (v25 === 0) return <span style={{ color: "#94A3B8" }}>--</span>;
              const crec = ((v26 / v25) - 1) * 100;
              return (
                <span style={{ fontWeight: 700, color: crec >= 0 ? "#059669" : "#DC2626" }}>
                  {crec >= 0 ? "+" : ""}{crec.toFixed(1)}%
                </span>
              );
            }},
            { key: "margen", label: "Margen %", align: "right", render: (c) => {
              const m = c.margen_pct ?? 0;
              const color = m >= 40 ? "#059669" : m >= 30 ? "#D97706" : "#DC2626";
              return <span style={{ fontWeight: 600, color }}>{m.toFixed(1)}%</span>;
            }},
          ]}
        />
      )}

      {/* ═══ TABLE — Clientes Nuevos 2026 ═══ */}
      {data?.clientes_nuevos && data.clientes_nuevos.length > 0 && (
        <ClientTable
          title="Clientes Nuevos 2026"
          subtitle={`${data.clientes_nuevos.length} clientes con primera compra en 2026 — Total: ${fmtAbs(k.total_venta_nuevos)}`}
          clients={data.clientes_nuevos}
          columns={[
            { key: "RUT", label: "RUT" },
            { key: "NOMBRE", label: "Nombre" },
            { key: "venta_2026", label: "Venta 2026", align: "right", render: (c) => (
              <span style={{ fontWeight: 600 }}>{fmtAbs(c.venta_2026 ?? 0)}</span>
            )},
            { key: "margen", label: "Margen %", align: "right", render: (c) => {
              const m = c.margen_pct ?? 0;
              const color = m >= 40 ? "#059669" : m >= 30 ? "#D97706" : "#DC2626";
              return <span style={{ fontWeight: 600, color }}>{m.toFixed(1)}%</span>;
            }},
          ]}
        />
      )}

      {/* ═══ TABLE — Clientes Q4-2025 sin compra 2026 ═══ */}
      {data?.clientes_q4_sin_compra && data.clientes_q4_sin_compra.length > 0 && (
        <ClientTable
          title="Clientes Q4-2025 sin compra en 2026"
          subtitle={`${data.clientes_q4_sin_compra.length} clientes — Venta perdida: ${fmtAbs(k.total_venta_q4)}`}
          clients={data.clientes_q4_sin_compra}
          columns={[
            { key: "RUT", label: "RUT" },
            { key: "NOMBRE", label: "Nombre" },
            { key: "venta_q4_2025", label: "Venta Q4-2025", align: "right", render: (c) => (
              <span style={{ fontWeight: 600, color: "#DC2626" }}>{fmtAbs(c.venta_q4_2025 ?? 0)}</span>
            )},
            { key: "margen", label: "Margen %", align: "right", render: (c) => {
              const m = c.margen_pct ?? 0;
              const color = m >= 40 ? "#059669" : m >= 30 ? "#D97706" : "#DC2626";
              return <span style={{ fontWeight: 600, color }}>{m.toFixed(1)}%</span>;
            }},
          ]}
        />
      )}
    </div>
  );
}

/* ─── Shared table styles ────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  fontSize: 12,
  borderBottom: "2px solid #E2E8F0",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 14px",
  color: "#1F2937",
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
