"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */

interface CatRow {
  categoria: string;
  venta_25: number;
  venta_26: number;
  variacion: number;
  variacion_pct: number;
  perdida_abs: number;
}

interface ClienteRow {
  rut: string;
  nombre: string;
  venta_25: number;
  venta_26: number;
  variacion: number;
  variacion_pct: number;
  perdida_abs: number;
  precio_25: number;
  precio_26: number;
  cant_25: number;
  cant_26: number;
}

interface ProdRow {
  codigo: string;
  descripcion: string;
  venta_25: number;
  venta_26: number;
  perdida_abs: number;
  variacion_pct: number;
  precio_25: number;
  precio_26: number;
  cant_25: number;
  cant_26: number;
  impacto_precio: number;
  impacto_volumen: number;
}

interface PreciosData {
  categorias: CatRow[];
  clientes: ClienteRow[];
  label: string;
  error?: string;
}

interface ProdData {
  total_impacto_precio: number;
  total_impacto_volumen: number;
  productos: ProdRow[];
}

/* ─── Period / Category options ─────────────────────── */

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

const CAT_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "SQ", label: "SQ" },
  { value: "MAH", label: "MAH" },
  { value: "EQM", label: "EQM" },
  { value: "EVA", label: "EVA" },
];

/* ─── Styles ─────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Product detail (expandable) ────────────────────── */

function ProductDetail({ rut, period, categoria }: { rut: string; period: string; categoria: string }) {
  const [data, setData] = useState<ProdData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let q = `rut=${encodeURIComponent(rut)}&periodo=${period}`;
    if (period.startsWith("mes-")) {
      q = `rut=${encodeURIComponent(rut)}&periodo=mes&mes=${period.split("-")[1]}`;
    }
    if (categoria) q += `&categoria=${encodeURIComponent(categoria)}`;
    api.get<ProdData>(`/api/precios/productos?${q}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [rut, period, categoria]);

  if (loading) return <div style={{ padding: 16, textAlign: "center", color: "#64748B", fontSize: 12 }}>Cargando productos...</div>;
  if (!data) return <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>Sin datos</div>;

  const crecColor = (v: number) => v >= 0 ? "#059669" : "#DC2626";

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Totals */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div style={{ padding: "10px 16px", background: data.total_impacto_precio >= 0 ? "#ECFDF5" : "#FEF2F2", borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Impacto Precio Total</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: crecColor(data.total_impacto_precio) }}>
            {data.total_impacto_precio >= 0 ? "+" : ""}{fmtAbs(data.total_impacto_precio)}
          </div>
        </div>
        <div style={{ padding: "10px 16px", background: data.total_impacto_volumen >= 0 ? "#ECFDF5" : "#FEF2F2", borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Impacto Volumen Total</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: crecColor(data.total_impacto_volumen) }}>
            {data.total_impacto_volumen >= 0 ? "+" : ""}{fmtAbs(data.total_impacto_volumen)}
          </div>
        </div>
      </div>

      {/* Product table */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, fontSize: 10, padding: "5px 8px" }}>Descripcion</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Perdida Abs</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Var. %</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Precio 2025</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Precio 2026</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Cant 2025</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Cant 2026</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Imp. Precio</th>
              <th style={{ ...thR, fontSize: 10, padding: "5px 8px" }}>Imp. Volumen</th>
            </tr>
          </thead>
          <tbody>
            {data.productos.map((p, i) => (
              <tr key={p.codigo} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td style={{ padding: "4px 8px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.descripcion || p.codigo}
                </td>
                <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(p.perdida_abs)}</td>
                <td style={{ ...tdR, padding: "4px 8px", color: crecColor(p.variacion_pct), fontWeight: 600 }}>
                  {p.variacion_pct >= 0 ? "+" : ""}{fmtPct(p.variacion_pct)}
                </td>
                <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(p.precio_25)}</td>
                <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(p.precio_26)}</td>
                <td style={{ ...tdR, padding: "4px 8px" }}>{p.cant_25.toLocaleString()}</td>
                <td style={{ ...tdR, padding: "4px 8px" }}>{p.cant_26.toLocaleString()}</td>
                <td style={{ ...tdR, padding: "4px 8px", fontWeight: 600, color: crecColor(p.impacto_precio) }}>
                  {p.impacto_precio >= 0 ? "+" : ""}{fmtAbs(p.impacto_precio)}
                </td>
                <td style={{ ...tdR, padding: "4px 8px", fontWeight: 600, color: crecColor(p.impacto_volumen) }}>
                  {p.impacto_volumen >= 0 ? "+" : ""}{fmtAbs(p.impacto_volumen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function PreciosPage() {
  const [data, setData] = useState<PreciosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");
  const [categoria, setCategoria] = useState("");
  const [expandedRut, setExpandedRut] = useState<string | null>(null);

  const fetchData = useCallback(async (p: string, cat: string) => {
    setLoading(true);
    try {
      let q = `?periodo=${p}`;
      if (p.startsWith("mes-")) q = `?periodo=mes&mes=${p.split("-")[1]}`;
      if (cat) q += `&categoria=${encodeURIComponent(cat)}`;
      const res = await api.get<PreciosData>(`/api/precios/${q}`);
      setData(res);
    } catch (e) {
      console.error("Failed to load precios", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period, categoria); }, [fetchData, period, categoria]);

  const handlePeriod = (val: string) => {
    setPeriod(val);
    setExpandedRut(null);
  };
  const handleCategoria = (val: string) => {
    setCategoria(val);
    setExpandedRut(null);
  };

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

  const crecColor = (v: number) => v >= 0 ? "#059669" : "#DC2626";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Analisis de Precios</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Variacion por categoria, impacto precio/volumen por cliente y producto
          </p>
        </div>
        <button onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); fetchData(period, categoria); }} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, marginBottom: 16,
        padding: "12px 20px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
        flexWrap: "wrap",
      }}>
        {/* Period */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Periodo:</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
        {/* Category */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Categoria:</span>
          <div style={{ display: "flex", gap: 4 }}>
            {CAT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => handleCategoria(opt.value)} style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: categoria === opt.value ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
                background: categoria === opt.value ? "#F5F3FF" : "white",
                color: categoria === opt.value ? "#7C3AED" : "#64748B",
                cursor: "pointer",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>{data.label}</span>
      </div>

      {/* ═══ Two-column layout: Category + Client tables ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Detalle Variación por Categoría */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", background: "#FEF2F2" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#991B1B", margin: 0 }}>Detalle Variacion</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ ...thStyle, fontSize: 11 }}>CAT26</th>
                <th style={{ ...thR, fontSize: 11 }}>Venta 2025 YTD</th>
                <th style={{ ...thR, fontSize: 11 }}>Venta 2026 YTD</th>
                <th style={{ ...thR, fontSize: 11 }}>Variacion Venta</th>
                <th style={{ ...thR, fontSize: 11 }}>Variacion %</th>
                <th style={{ ...thR, fontSize: 11 }}>Perdida Abs</th>
              </tr>
            </thead>
            <tbody>
              {data.categorias.map((c, i) => {
                const isTotal = c.categoria === "Total";
                return (
                  <tr key={c.categoria} style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isTotal ? "#F1F5F9" : i % 2 === 0 ? "white" : "#FAFBFD",
                    fontWeight: isTotal ? 700 : 400,
                  }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{c.categoria}</td>
                    <td style={tdR}>{fmtAbs(c.venta_25)}</td>
                    <td style={tdR}>{fmtAbs(c.venta_26)}</td>
                    <td style={{ ...tdR, color: crecColor(c.variacion), fontWeight: 600 }}>
                      {fmtAbs(c.variacion)}
                    </td>
                    <td style={{ ...tdR, color: crecColor(c.variacion_pct), fontWeight: 600 }}>
                      {c.variacion_pct >= 0 ? "+" : ""}{fmtPct(c.variacion_pct)}
                    </td>
                    <td style={tdR}>{fmtAbs(c.perdida_abs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detalle Producto Precio — top clients */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", background: "#EFF6FF" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF", margin: 0 }}>
              Detalle Producto Precio
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>por cliente</span>
            </h3>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ ...thStyle, fontSize: 10 }}>Nombre</th>
                  <th style={{ ...thR, fontSize: 10 }}>Perdida Abs</th>
                  <th style={{ ...thR, fontSize: 10 }}>Var. %</th>
                  <th style={{ ...thR, fontSize: 10 }}>Precio 2025</th>
                  <th style={{ ...thR, fontSize: 10 }}>Precio 2026</th>
                  <th style={{ ...thR, fontSize: 10 }}>Cant 2025</th>
                  <th style={{ ...thR, fontSize: 10 }}>Cant 2026</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.slice(0, 30).map((c, i) => (
                  <tr key={c.rut} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                    <td style={{ padding: "4px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                      {c.nombre || c.rut}
                    </td>
                    <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(c.perdida_abs)}</td>
                    <td style={{ ...tdR, padding: "4px 8px", color: crecColor(c.variacion_pct), fontWeight: 600 }}>
                      {c.variacion_pct >= 0 ? "+" : ""}{fmtPct(c.variacion_pct)}
                    </td>
                    <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(c.precio_25)}</td>
                    <td style={{ ...tdR, padding: "4px 8px" }}>{fmtAbs(c.precio_26)}</td>
                    <td style={{ ...tdR, padding: "4px 8px" }}>{c.cant_25.toLocaleString()}</td>
                    <td style={{ ...tdR, padding: "4px 8px" }}>{c.cant_26.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══ Bottom: Full client table with expandable product detail ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Detalle Producto Precio
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>Click en cliente para ver productos con Impacto Precio / Volumen</span>
          </h3>
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ ...thStyle, width: 28 }}></th>
                <th style={thStyle}>Cliente</th>
                <th style={thR}>Perdida Abs</th>
                <th style={thR}>Var. %</th>
                <th style={thR}>Precio 2025</th>
                <th style={thR}>Precio 2026</th>
                <th style={thR}>Cant 2025</th>
                <th style={thR}>Cant 2026</th>
              </tr>
            </thead>
            <tbody>
              {data.clientes.map((c, i) => {
                const isExpanded = expandedRut === c.rut;
                const rows = [];
                rows.push(
                  <tr
                    key={c.rut}
                    onClick={() => setExpandedRut(isExpanded ? null : c.rut)}
                    style={{
                      borderBottom: "1px solid #F1F5F9",
                      background: isExpanded ? "#F0F9FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                  >
                    <td style={{ ...tdStyle, width: 28, paddingRight: 0, color: "#94A3B8" }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.nombre || c.rut}
                    </td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.perdida_abs)}</td>
                    <td style={{ ...tdR, fontWeight: 600, color: crecColor(c.variacion_pct) }}>
                      {c.variacion_pct >= 0 ? "+" : ""}{fmtPct(c.variacion_pct)}
                    </td>
                    <td style={tdR}>{fmtAbs(c.precio_25)}</td>
                    <td style={tdR}>{fmtAbs(c.precio_26)}</td>
                    <td style={tdR}>{c.cant_25.toLocaleString()}</td>
                    <td style={tdR}>{c.cant_26.toLocaleString()}</td>
                  </tr>
                );
                if (isExpanded) {
                  rows.push(
                    <tr key={`${c.rut}-detail`}>
                      <td colSpan={8} style={{ padding: "0 20px 8px 48px", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                        <ProductDetail rut={c.rut} period={period} categoria={categoria} />
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
    </div>
  );
}
