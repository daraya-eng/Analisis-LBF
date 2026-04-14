"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, fmt } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import HelpButton from "@/components/help-button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";

/* ─── Types ──────────────────────────────────────────── */

interface SegKpi {
  venta_26: number;
  venta_25: number;
  crec: number;
  n_clientes: number;
  efecto_precio: number;
  efecto_volumen: number;
  diff: number;
}

interface CatRow {
  categoria: string;
  venta_26: number;
  contrib_26: number;
  margen: number;
  pct: number;
}

interface ClienteRow {
  rut: string;
  nombre: string;
  segmento: string;
  venta_26: number;
  venta_25: number;
  diff: number;
  crec: number;
  precio_25: number;
  precio_26: number;
  cant_25: number;
  cant_26: number;
}

interface DetalleData {
  efecto_precio: number;
  efecto_volumen: number;
  productos: ProdDetail[];
  productos_perdidos: ProdLost[];
  productos_nuevos: ProdNew[];
}

interface ProdDetail {
  codigo: string;
  descripcion: string;
  venta_26: number;
  venta_25: number;
  precio_26: number;
  precio_25: number;
  efecto_precio: number;
  efecto_volumen: number;
}

interface ProdLost {
  codigo: string;
  descripcion: string;
  venta_25: number;
}

interface ProdNew {
  codigo: string;
  descripcion: string;
  venta_26: number;
}

interface ClientesData {
  kpis_segmento: Record<string, SegKpi>;
  categorias: CatRow[];
  perdedores: ClienteRow[];
  ganadores: ClienteRow[];
  label: string;
  error?: string;
}

/* ─── Options ────────────────────────────────────────── */

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

const SEG_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PUBLICO", label: "Publico" },
  { value: "PRIVADO", label: "Privado" },
  { value: "Sin Segmento", label: "Sin Segmento" },
];

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

/* ─── Styles ─────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── SegCard ────────────────────────────────────────── */

function SegCard({ title, data, color, icon }: { title: string; data: SegKpi; color: string; icon: string }) {
  const crecColor = data.crec >= 0 ? "#10B981" : "#EF4444";
  return (
    <div style={{ flex: "1 1 280px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>{icon} {title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Venta 2026</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{fmtAbs(data.venta_26)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Venta 2025</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>{fmtAbs(data.venta_25)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Crec.</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: crecColor }}>{data.crec >= 0 ? "+" : ""}{fmtPct(data.crec)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{data.n_clientes} clientes activos</div>
      </div>
    </div>
  );
}

/* ─── Bar label ──────────────────────────────────────── */

function ValLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value } = props;
  if (!value || value === 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="#374151" textAnchor="middle" fontSize={10} fontWeight={700}>
      {fmt(value)}
    </text>
  );
}

/* ─── ClientDetail (expandable) ──────────────────────── */

function ClientDetail({ rut, period }: { rut: string; period: string }) {
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let q = `rut=${encodeURIComponent(rut)}&periodo=${period}`;
    if (period.startsWith("mes-")) {
      q = `rut=${encodeURIComponent(rut)}&periodo=mes&mes=${period.split("-")[1]}`;
    }
    api.get<DetalleData>(`/api/clientes/detalle?${q}`)
      .then(res => setDetalle(res))
      .catch(() => setDetalle(null))
      .finally(() => setLoading(false));
  }, [rut, period]);

  if (loading) return <div style={{ padding: 16, textAlign: "center", color: "#64748B", fontSize: 12 }}>Cargando analisis...</div>;
  if (!detalle) return <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>Sin datos</div>;

  const cc = (v: number) => v >= 0 ? "#10B981" : "#EF4444";

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Effect summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div style={{ padding: "10px 16px", background: detalle.efecto_precio >= 0 ? "#ECFDF5" : "#FEF2F2", borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Efecto Precio</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: cc(detalle.efecto_precio) }}>
            {detalle.efecto_precio >= 0 ? "+" : ""}{fmtAbs(detalle.efecto_precio)}
          </div>
        </div>
        <div style={{ padding: "10px 16px", background: detalle.efecto_volumen >= 0 ? "#ECFDF5" : "#FEF2F2", borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Efecto Volumen</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: cc(detalle.efecto_volumen) }}>
            {detalle.efecto_volumen >= 0 ? "+" : ""}{fmtAbs(detalle.efecto_volumen)}
          </div>
        </div>
      </div>

      {/* Products with price/volume */}
      {detalle.productos.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Productos en ambos periodos</div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ ...thStyle, fontSize: 10, padding: "4px 8px" }}>Producto</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Venta 25</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Venta 26</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>P.Unit 25</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>P.Unit 26</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Ef. Precio</th>
                  <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Ef. Volumen</th>
                </tr>
              </thead>
              <tbody>
                {detalle.productos.map((p) => (
                  <tr key={p.codigo} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "3px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, marginRight: 4 }}>{p.codigo}</span>{p.descripcion}
                    </td>
                    <td style={{ ...tdR, padding: "3px 8px" }}>{fmtAbs(p.venta_25)}</td>
                    <td style={{ ...tdR, padding: "3px 8px", fontWeight: 600 }}>{fmtAbs(p.venta_26)}</td>
                    <td style={{ ...tdR, padding: "3px 8px" }}>{fmtAbs(p.precio_25)}</td>
                    <td style={{ ...tdR, padding: "3px 8px" }}>{fmtAbs(p.precio_26)}</td>
                    <td style={{ ...tdR, padding: "3px 8px", fontWeight: 600, color: cc(p.efecto_precio) }}>
                      {p.efecto_precio >= 0 ? "+" : ""}{fmtAbs(p.efecto_precio)}
                    </td>
                    <td style={{ ...tdR, padding: "3px 8px", fontWeight: 600, color: cc(p.efecto_volumen) }}>
                      {p.efecto_volumen >= 0 ? "+" : ""}{fmtAbs(p.efecto_volumen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lost + New products */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {detalle.productos_perdidos.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>Productos dejados de vender ({detalle.productos_perdidos.length})</div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ background: "#FEF2F2" }}>
                  <th style={{ ...thStyle, fontSize: 9, padding: "3px 6px" }}>Producto</th>
                  <th style={{ ...thR, fontSize: 9, padding: "3px 6px" }}>Venta 2025</th>
                </tr></thead>
                <tbody>
                  {detalle.productos_perdidos.map((p) => (
                    <tr key={p.codigo} style={{ borderBottom: "1px solid #FEE2E2" }}>
                      <td style={{ padding: "2px 6px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descripcion || p.codigo}</td>
                      <td style={{ ...tdR, padding: "2px 6px", color: "#EF4444" }}>{fmtAbs(p.venta_25)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {detalle.productos_nuevos.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>Productos nuevos ({detalle.productos_nuevos.length})</div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ background: "#ECFDF5" }}>
                  <th style={{ ...thStyle, fontSize: 9, padding: "3px 6px" }}>Producto</th>
                  <th style={{ ...thR, fontSize: 9, padding: "3px 6px" }}>Venta 2026</th>
                </tr></thead>
                <tbody>
                  {detalle.productos_nuevos.map((p) => (
                    <tr key={p.codigo} style={{ borderBottom: "1px solid #D1FAE5" }}>
                      <td style={{ padding: "2px 6px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descripcion || p.codigo}</td>
                      <td style={{ ...tdR, padding: "2px 6px", color: "#10B981" }}>{fmtAbs(p.venta_26)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Client Table ───────────────────────────────────── */

function ClientTable({ title, icon, clientes, period, expandedRut, onToggle, segFilter }: {
  title: string;
  icon: React.ReactNode;
  clientes: ClienteRow[];
  period: string;
  expandedRut: string | null;
  onToggle: (rut: string) => void;
  segFilter: string;
}) {
  const filtered = segFilter ? clientes.filter(c => c.segmento === segFilter) : clientes;
  const totalDiff = filtered.reduce((s, c) => s + c.diff, 0);

  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            {title}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{filtered.length} clientes</span>
          </h3>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: totalDiff >= 0 ? "#10B981" : "#EF4444" }}>
          Total: {totalDiff >= 0 ? "+" : ""}{fmtAbs(totalDiff)}
        </span>
      </div>
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, width: 28, fontSize: 11 }}></th>
              <th style={{ ...thStyle, fontSize: 11 }}>Cliente</th>
              <th style={{ ...thStyle, fontSize: 11 }}>Seg.</th>
              <th style={{ ...thR, fontSize: 11 }}>Venta 2025</th>
              <th style={{ ...thR, fontSize: 11 }}>Venta 2026</th>
              <th style={{ ...thR, fontSize: 11 }}>Diferencia</th>
              <th style={{ ...thR, fontSize: 11 }}>Crec.</th>
              <th style={{ ...thR, fontSize: 11 }}>Precio 25</th>
              <th style={{ ...thR, fontSize: 11 }}>Precio 26</th>
              <th style={{ ...thR, fontSize: 11 }}>Cant 25</th>
              <th style={{ ...thR, fontSize: 11 }}>Cant 26</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const isExpanded = expandedRut === c.rut;
              const crecCol = c.crec >= 0 ? "#10B981" : "#EF4444";
              const diffCol = c.diff >= 0 ? "#10B981" : "#EF4444";
              const segColor = c.segmento === "PUBLICO" ? "#3B82F6" : c.segmento === "PRIVADO" ? "#10B981" : "#94A3B8";
              const rows = [];
              rows.push(
                <tr
                  key={c.rut}
                  onClick={() => onToggle(c.rut)}
                  style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isExpanded ? "#F0F9FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                >
                  <td style={{ ...tdStyle, width: 28, paddingRight: 0, color: "#94A3B8" }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.nombre || c.rut}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: segColor, padding: "2px 6px", borderRadius: 4, background: segColor + "15" }}>
                      {c.segmento === "Sin Segmento" ? "—" : c.segmento.slice(0, 4)}
                    </span>
                  </td>
                  <td style={tdR}>{fmtAbs(c.venta_25)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.venta_26)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: diffCol }}>{c.diff >= 0 ? "+" : ""}{fmtAbs(c.diff)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: crecCol }}>{c.crec >= 0 ? "+" : ""}{fmtPct(c.crec)}</td>
                  <td style={tdR}>{fmtAbs(c.precio_25)}</td>
                  <td style={tdR}>{fmtAbs(c.precio_26)}</td>
                  <td style={tdR}>{c.cant_25.toLocaleString()}</td>
                  <td style={tdR}>{c.cant_26.toLocaleString()}</td>
                </tr>
              );
              if (isExpanded) {
                rows.push(
                  <tr key={`${c.rut}-detail`}>
                    <td colSpan={11} style={{ padding: "0 20px 8px 48px", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                      <ClientDetail rut={c.rut} period={period} />
                    </td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function ClientesPage() {
  const [data, setData] = useState<ClientesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");
  const [segFilter, setSegFilter] = useState("");
  const [expandedLoss, setExpandedLoss] = useState<string | null>(null);
  const [expandedGain, setExpandedGain] = useState<string | null>(null);

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    try {
      let q = `?periodo=${p}`;
      if (p.startsWith("mes-")) q = `?periodo=mes&mes=${p.split("-")[1]}`;
      const res = await api.get<ClientesData>(`/api/clientes/${q}`);
      setData(res);
    } catch (e) {
      console.error("Failed to load clientes", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period); }, [fetchData, period]);

  const handlePeriod = useCallback((val: string) => {
    setPeriod(val);
    setExpandedLoss(null);
    setExpandedGain(null);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  if (!data || data.error) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar datos{data?.error ? `: ${data.error}` : ""}</div>;
  }

  const pub = data.kpis_segmento?.PUBLICO ?? { venta_26: 0, venta_25: 0, crec: 0, n_clientes: 0, efecto_precio: 0, efecto_volumen: 0, diff: 0 };
  const priv = data.kpis_segmento?.PRIVADO ?? { venta_26: 0, venta_25: 0, crec: 0, n_clientes: 0, efecto_precio: 0, efecto_volumen: 0, diff: 0 };

  // Chart data: efecto precio vs volumen by segment
  const chartData = [
    {
      segmento: "Publico",
      efecto_precio: pub.efecto_precio,
      efecto_volumen: pub.efecto_volumen,
      diferencia: pub.diff,
    },
    {
      segmento: "Privado",
      efecto_precio: priv.efecto_precio,
      efecto_volumen: priv.efecto_volumen,
      diferencia: priv.diff,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Analisis de Clientes y Precios</h1>
            <HelpButton module="clientes" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Venta 2026 (SQ/MAH/EQM/EVA) vs Venta total 2025 — Impacto precio/volumen
          </p>
        </div>
        <button onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); fetchData(period); }} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Filters: Period + Segment */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, marginBottom: 16,
        padding: "12px 20px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Periodo:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PERIOD_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => handlePeriod(opt.value)} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: period === opt.value ? "2px solid #3B82F6" : "1px solid #E2E8F0",
                background: period === opt.value ? "#EFF6FF" : "white",
                color: period === opt.value ? "#2563EB" : "#64748B",
                cursor: "pointer",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Segmento:</span>
          <div style={{ display: "flex", gap: 4 }}>
            {SEG_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setSegFilter(opt.value)} style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: segFilter === opt.value ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
                background: segFilter === opt.value ? "#F5F3FF" : "white",
                color: segFilter === opt.value ? "#7C3AED" : "#64748B",
                cursor: "pointer",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>{data.label}</span>
      </div>

      {/* Segment KPIs + Category + Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <SegCard title="Clientes Publicos" data={pub} color="#3B82F6" icon="🏛" />
        <SegCard title="Clientes Privados" data={priv} color="#10B981" icon="🏢" />

        {/* Category distribution 2026 */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ height: 4, background: "#8B5CF6" }} />
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>Venta 2026 por Categoria</div>
            {(data.categorias ?? []).map((c) => (
              <div key={c.categoria} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[c.categoria] || "#94A3B8" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{c.categoria}</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{fmtAbs(c.venta_26)}</span>
                  <span style={{ fontSize: 11, color: "#64748B", minWidth: 36, textAlign: "right" }}>{c.pct}%</span>
                  <span style={{ fontSize: 11, color: c.margen >= 40 ? "#059669" : c.margen >= 30 ? "#D97706" : "#DC2626", fontWeight: 600, minWidth: 40, textAlign: "right" }}>
                    M:{c.margen}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Chart: Efecto Precio vs Volumen by Segment ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
          Perdida/Ganancia de Venta — Efecto Precio vs Volumen
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="segmento" tick={{ fontSize: 13, fontWeight: 600 }} />
            <YAxis
              tickFormatter={(v) => {
                const abs = Math.abs(Number(v));
                if (abs >= 1e9) return `${(Number(v) / 1e9).toFixed(1)}MM`;
                if (abs >= 1e6) return `${(Number(v) / 1e6).toFixed(0)}M`;
                return String(v);
              }}
              tick={{ fontSize: 11 }}
              width={70}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => [fmtAbs(Number(v)), name]}
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="efecto_precio" name="Efecto Precio" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.efecto_precio >= 0 ? "#10B981" : "#EF4444"} />
              ))}
              <LabelList dataKey="efecto_precio" content={<ValLabel />} />
            </Bar>
            <Bar dataKey="efecto_volumen" name="Efecto Volumen" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.efecto_volumen >= 0 ? "#3B82F6" : "#F97316"} />
              ))}
              <LabelList dataKey="efecto_volumen" content={<ValLabel />} />
            </Bar>
            <Bar dataKey="diferencia" name="Diferencia Total" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.diferencia >= 0 ? "#059669" : "#DC2626"} />
              ))}
              <LabelList dataKey="diferencia" content={<ValLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ Clientes con Perdida ═══ */}
      <ClientTable
        title="Clientes con Perdida de Venta"
        icon={<TrendingDown size={18} color="#EF4444" />}
        clientes={data.perdedores}
        period={period}
        expandedRut={expandedLoss}
        onToggle={(rut) => setExpandedLoss(expandedLoss === rut ? null : rut)}
        segFilter={segFilter}
      />

      {/* ═══ Clientes con Ganancia ═══ */}
      <ClientTable
        title="Clientes con Ganancia de Venta"
        icon={<TrendingUp size={18} color="#10B981" />}
        clientes={data.ganadores}
        period={period}
        expandedRut={expandedGain}
        onToggle={(rut) => setExpandedGain(expandedGain === rut ? null : rut)}
        segFilter={segFilter}
      />
    </div>
  );
}
