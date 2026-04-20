"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs } from "@/lib/format";
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Search as SearchIcon, Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { SearchInput, ExportButton, TableToolbar } from "@/components/table-tools";
import HelpButton from "@/components/help-button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, Legend, PieChart, Pie,
} from "recharts";

/* ═══ Types ═══ */
interface StockCat {
  categoria: string;
  articulos: number;
  unidades: number;
  fecha_snapshot: string;
}
interface VPResumen {
  clasificacion: string;
  registros: number;
  total_perdido: number;
  productos_afectados: number;
  clientes_afectados: number;
}
interface VPMensual {
  mes: number;
  clasificacion: string;
  registros: number;
  total_perdido: number;
}
interface Quiebre {
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string | null;
  veces_quiebre: number;
  total_perdido: number;
  stock_actual: number;
}
interface QuiebreEvento {
  nota_venta: number;
  rut_cliente: string;
  nombre_cliente: string;
  vendedor: string;
  fecha_documento: string;
  cantidad_pendiente: number;
  precio_unitario: number;
  monto_perdido: number;
  stock_al_momento: number;
  clasificacion: string;
}
interface StockProducto {
  codigo_producto: string;
  descripcion: string;
  categoria: string;
  stock_unidades: number;
  n_ubicaciones: number;
}
interface StockBusqueda extends StockProducto {
  fecha_snapshot: string;
  venta_ytd: number;
  cant_ytd: number;
  n_clientes: number;
}
interface ClienteResult {
  RUT: string;
  NOMBRE: string;
  VENDEDOR: string;
  venta_total: number;
}
interface CotizacionItem {
  codigo: string;
  descripcion: string;
  categoria: string;
  stock: number;
  ultimo_precio: number;
  fecha_ultimo_precio: string | null;
  precio_convenio: number;
  convenio_vigente_hasta: string | null;
  precio_lista: number;
  precio_promedio_mercado: number;
  precio_sugerido: number;
  costo_promedio: number;
  margen_sugerido: number;
  // Editables
  cantidad: number;
  precio_unitario: number;
}

interface QuiebreMesCat {
  mes: number;
  categoria: string;
  registros: number;
  total_perdido: number;
  productos: number;
}
interface TopCliente {
  nombre_cliente: string;
  vendedor: string;
  registros: number;
  total_perdido: number;
  productos: number;
}

/* ─── Shared styles (same as other pages) ──────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const thC: React.CSSProperties = { ...thS, textAlign: "center" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 13 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdC: React.CSSProperties = { ...td, textAlign: "center" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

/* ─── Helpers ──────────────────────────────────────────── */
const fmtN = (n: number) => n.toLocaleString("es-CL");
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const stockSemaforo = (stock: number, veces: number) => {
  if (stock === 0) return { color: "#EF4444", bg: "#FEF2F2", label: "Sin stock" };
  if (stock < veces * 5) return { color: "#F59E0B", bg: "#FFFBEB", label: "Bajo" };
  return { color: "#10B981", bg: "#F0FDF4", label: "OK" };
};

/* ─── KPI Card (same pattern) ──────────────────────────── */
function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 150, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ─── Sort helpers ─────────────────────────────────────── */
type SortDir = "asc" | "desc" | null;
function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <ArrowUp size={12} />;
  if (dir === "desc") return <ArrowDown size={12} />;
  return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
}

function SortTh({ label, field, current, dir, onSort, style }: {
  label: string; field: string; current: string; dir: SortDir;
  onSort: (f: string) => void; style?: React.CSSProperties;
}) {
  return (
    <th
      style={{ ...thR, cursor: "pointer", userSelect: "none", ...style }}
      onClick={() => onSort(field)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label} <SortIcon dir={current === field ? dir : null} />
      </span>
    </th>
  );
}

/* ═══ Main Page ═══ */
export default function StockPage() {
  const [loading, setLoading] = useState(true);
  const [stockCat, setStockCat] = useState<StockCat[]>([]);
  const [fechaStock, setFechaStock] = useState("");
  const [totalArticulos, setTotalArticulos] = useState(0);
  const [totalUnidades, setTotalUnidades] = useState(0);
  const [vpResumen, setVpResumen] = useState<VPResumen[]>([]);
  const [vpMensual, setVpMensual] = useState<VPMensual[]>([]);

  const [quiebres, setQuiebres] = useState<Quiebre[]>([]);
  const [quiebreCat, setQuiebreCat] = useState<string>("");
  const [quiebreMes, setQuiebreMes] = useState<number>(0);
  const [loadingQ, setLoadingQ] = useState(false);

  const [detalleCode, setDetalleCode] = useState<string | null>(null);
  const [detalleEventos, setDetalleEventos] = useState<QuiebreEvento[]>([]);
  const [loadingDet, setLoadingDet] = useState(false);

  const [stockDetalle, setStockDetalle] = useState<StockProducto[]>([]);
  const [stockDetCat, setStockDetCat] = useState<string | null>(null);
  const [loadingStockDet, setLoadingStockDet] = useState(false);

  // Quiebres stats (charts)
  const [qStats, setQStats] = useState<{ porMesCat: QuiebreMesCat[]; topClientes: TopCliente[] } | null>(null);

  const [sortKey, setSortKey] = useState<string>("total_perdido");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<"stock" | "quiebres" | "consulta" | "cotizacion">("stock");
  const [qSearch, setQSearch] = useState("");

  // Consulta stock
  const [busqInput, setBusqInput] = useState("");
  const [busqResults, setBusqResults] = useState<StockBusqueda[]>([]);
  const [busqLoading, setBusqLoading] = useState(false);
  const [busqDone, setBusqDone] = useState(false);

  // Cotización
  const [cotCatalog, setCotCatalog] = useState<StockProducto[]>([]);
  const [cotCatalogLoading, setCotCatalogLoading] = useState(false);
  const [cotCatalogFilter, setCotCatalogFilter] = useState("");
  const [cotItems, setCotItems] = useState<CotizacionItem[]>([]);
  const [cotAddingCode, setCotAddingCode] = useState<string | null>(null);
  const [cotClienteRut, setCotClienteRut] = useState("");
  const [cotClienteNombre, setCotClienteNombre] = useState("");
  const [cotClienteApplied, setCotClienteApplied] = useState(false);
  const [cotPricingLoading, setCotPricingLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{
          stock: { fecha_snapshot: string; total_articulos: number; total_unidades: number; por_categoria: StockCat[] };
          ventas_perdidas: { resumen: VPResumen[]; mensual: VPMensual[] };
        }>("/api/stock/");
        setStockCat(data.stock.por_categoria);
        setFechaStock(data.stock.fecha_snapshot);
        setTotalArticulos(data.stock.total_articulos);
        setTotalUnidades(data.stock.total_unidades);
        setVpResumen(data.ventas_perdidas.resumen);
        setVpMensual(data.ventas_perdidas.mensual);
      } catch (e) { console.error("Error loading stock:", e); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadQuiebres = useCallback(async (cat: string, mes: number) => {
    setLoadingQ(true);
    try {
      const params = new URLSearchParams();
      if (cat) params.set("categoria", cat);
      if (mes) params.set("mes", String(mes));
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await api.get<{ quiebres: Quiebre[] }>(`/api/stock/quiebres${q}`, { noCache: true });
      setQuiebres(data.quiebres);
    } catch (e) { console.error(e); }
    finally { setLoadingQ(false); }
  }, []);

  useEffect(() => { if (tab === "quiebres") loadQuiebres(quiebreCat, quiebreMes); }, [tab, quiebreCat, quiebreMes, loadQuiebres]);

  // Load quiebres stats for charts
  useEffect(() => {
    if (tab === "quiebres" && !qStats) {
      api.get<{ por_mes_cat: QuiebreMesCat[]; top_clientes: TopCliente[] }>("/api/stock/quiebres-stats")
        .then(d => setQStats({ porMesCat: d.por_mes_cat, topClientes: d.top_clientes }))
        .catch(console.error);
    }
  }, [tab, qStats]);

  const toggleDetalle = async (codigo: string) => {
    if (detalleCode === codigo) { setDetalleCode(null); return; }
    setDetalleCode(codigo);
    setLoadingDet(true);
    try {
      const data = await api.get<{ eventos: QuiebreEvento[] }>(
        `/api/stock/quiebres-detalle?codigo=${encodeURIComponent(codigo)}`
      );
      setDetalleEventos(data.eventos);
    } catch (e) { console.error(e); }
    finally { setLoadingDet(false); }
  };

  const toggleStockDetalle = async (cat: string) => {
    if (stockDetCat === cat) { setStockDetCat(null); return; }
    setStockDetCat(cat);
    setLoadingStockDet(true);
    try {
      const data = await api.get<{ productos: StockProducto[] }>(
        `/api/stock/detalle?categoria=${encodeURIComponent(cat)}`
      );
      setStockDetalle(data.productos);
    } catch (e) { console.error(e); }
    finally { setLoadingStockDet(false); }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : sortDir === "asc" ? null : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const buscarStock = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) { setBusqResults([]); setBusqDone(false); return; }
    setBusqLoading(true);
    setBusqDone(false);
    try {
      const data = await api.get<{ productos: StockBusqueda[] }>(
        `/api/stock/buscar?q=${encodeURIComponent(q)}`, { noCache: true }
      );
      setBusqResults(data.productos);
      setBusqDone(true);
    } catch (e) { console.error(e); }
    finally { setBusqLoading(false); }
  }, []);

  // Cotización: cargar catálogo completo
  const loadCotCatalog = useCallback(async () => {
    if (cotCatalog.length > 0) return;
    setCotCatalogLoading(true);
    try {
      const data = await api.get<{ productos: StockProducto[] }>("/api/stock/detalle");
      setCotCatalog(data.productos);
    } catch (e) { console.error(e); }
    finally { setCotCatalogLoading(false); }
  }, [cotCatalog.length]);

  useEffect(() => { if (tab === "cotizacion") loadCotCatalog(); }, [tab, loadCotCatalog]);

  // Catálogo filtrado
  const cotCatalogFiltered = cotCatalogFilter.trim().length >= 2
    ? cotCatalog.filter(p => {
        const q = cotCatalogFilter.toLowerCase();
        return p.codigo_producto.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q);
      })
    : cotCatalog;

  // Cotización: agregar producto con pricing
  const agregarProducto = useCallback(async (prod: StockProducto) => {
    if (cotItems.some(i => i.codigo === prod.codigo_producto)) return;
    setCotAddingCode(prod.codigo_producto);
    try {
      const params = new URLSearchParams({ codigo: prod.codigo_producto });
      if (cotClienteRut.trim()) params.set("rut", cotClienteRut.trim());
      const data = await api.get<{
        ultimo_precio: number; precio_convenio: number; precio_lista: number;
        precio_tv: number; precio_promedio_mercado: number; precio_sugerido: number;
        costo_promedio: number; margen_sugerido: number;
        fecha_ultimo_precio: string | null; convenio_vigente_hasta: string | null;
        lista_vigente_hasta: string | null;
      }>(`/api/stock/cotizar?${params.toString()}`, { noCache: true });
      setCotItems(prev => [...prev, {
        codigo: prod.codigo_producto,
        descripcion: prod.descripcion,
        categoria: prod.categoria,
        stock: prod.stock_unidades,
        ...data,
        cantidad: 1,
        precio_unitario: data.precio_sugerido,
      }]);
    } catch (e) { console.error(e); }
    finally { setCotAddingCode(null); }
  }, [cotItems, cotClienteRut]);

  // Cotización: aplicar RUT de cliente a todos los items
  const aplicarCliente = useCallback(async () => {
    const rut = cotClienteRut.trim();
    if (!rut || cotItems.length === 0) { setCotClienteApplied(!!rut); return; }
    setCotPricingLoading(true);
    try {
      const updated = await Promise.all(cotItems.map(async (item) => {
        const params = new URLSearchParams({ codigo: item.codigo, rut });
        const data = await api.get<{
          ultimo_precio: number; precio_convenio: number; precio_lista: number;
          precio_tv: number; precio_promedio_mercado: number; precio_sugerido: number;
          costo_promedio: number; margen_sugerido: number;
          fecha_ultimo_precio: string | null; convenio_vigente_hasta: string | null;
          lista_vigente_hasta: string | null;
        }>(`/api/stock/cotizar?${params.toString()}`, { noCache: true });
        return { ...item, ...data, precio_unitario: data.precio_sugerido };
      }));
      setCotItems(updated);
      setCotClienteApplied(true);
    } catch (e) { console.error(e); }
    finally { setCotPricingLoading(false); }
  }, [cotClienteRut, cotItems]);

  // Cotización: actualizar campo editable
  const updateCotItem = useCallback((codigo: string, field: "cantidad" | "precio_unitario", value: number) => {
    setCotItems(prev => prev.map(i =>
      i.codigo === codigo ? { ...i, [field]: value } : i
    ));
  }, []);

  // Cotización: eliminar producto
  const removeCotItem = useCallback((codigo: string) => {
    setCotItems(prev => prev.filter(i => i.codigo !== codigo));
  }, []);

  // Cotización: exportar Excel
  const exportarCotizacion = useCallback(() => {
    if (cotItems.length === 0) return;
    const clienteInfo = cotClienteNombre ? `Cliente:\t${cotClienteNombre}\nRUT:\t${cotClienteRut}\n` : "Cliente:\tNuevo / Sin especificar\n";
    const header = `COTIZACIÓN LBF\n${clienteInfo}Fecha:\t${new Date().toLocaleDateString("es-CL")}\n\n`;
    const cols = ["Código", "Producto", "Stock", "Cantidad", "Precio Unit.", "Total", "Costo", "Margen %"];
    const rows = cotItems.map(i => {
      const total = i.cantidad * i.precio_unitario;
      const margen = i.precio_unitario > 0 && i.costo_promedio > 0
        ? ((i.precio_unitario - i.costo_promedio) / i.precio_unitario * 100).toFixed(1) : "0";
      return [i.codigo, i.descripcion, i.stock, i.cantidad, i.precio_unitario, total, i.costo_promedio, margen].join("\t");
    });
    const totalGeneral = cotItems.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    rows.push(["", "", "", "", "TOTAL", totalGeneral, "", ""].join("\t"));
    const content = header + cols.join("\t") + "\n" + rows.join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion_${cotClienteRut || "nuevo"}_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cotItems, cotClienteRut, cotClienteNombre]);

  const filteredQuiebres = qSearch.trim()
    ? quiebres.filter(q => {
        const lower = qSearch.toLowerCase().trim();
        return q.codigo_producto.toLowerCase().includes(lower) ||
               q.descripcion_producto.toLowerCase().includes(lower) ||
               (q.categoria || "").toLowerCase().includes(lower);
      })
    : quiebres;

  const sortedQuiebres = [...filteredQuiebres].sort((a, b) => {
    if (!sortDir || !sortKey) return 0;
    const av = (a as unknown as Record<string, number>)[sortKey];
    const bv = (b as unknown as Record<string, number>)[sortKey];
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const vpQuiebre = vpResumen.find(v => v.clasificacion === "Quiebre");
  const vpOtro = vpResumen.find(v => v.clasificacion === "Otro");
  const totalPerdido = (vpQuiebre?.total_perdido || 0) + (vpOtro?.total_perdido || 0);
  const mesesConDatos = [...new Set(vpMensual.map(v => v.mes))].sort((a, b) => a - b);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  const cats4 = stockCat.filter(c => ["SQ", "EVA", "MAH", "EQM"].includes(c.categoria));
  const catColors: Record<string, string> = { SQ: "#3B82F6", EVA: "#10B981", MAH: "#F59E0B", EQM: "#8B5CF6" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Inventario & Quiebres de Stock
            </h1>
            <HelpButton module="stock" />
          </div>
          <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
            Stock al {fechaStock} &middot; Fuente: WMS + ERP
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard title="Productos en stock" value={fmtN(totalArticulos)} sub={`${fmtN(totalUnidades)} uds totales`} />
        <KpiCard title="Quiebres 2026" value={fmtN(vpQuiebre?.registros || 0)} sub={`${fmt(vpQuiebre?.total_perdido || 0)} perdidos`} color="#EF4444" />
        <KpiCard title="Otras pérdidas" value={fmtN(vpOtro?.registros || 0)} sub={`${fmt(vpOtro?.total_perdido || 0)} monto`} color="#F59E0B" />
        <KpiCard title="Total venta perdida" value={fmt(totalPerdido)} sub={`${fmtN((vpQuiebre?.productos_afectados || 0) + (vpOtro?.productos_afectados || 0))} productos`} color="#7C3AED" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E2E8F0" }}>
        {([["stock", "Stock Actual"], ["consulta", "Consulta Stock"], ["cotizacion", "Cotización"], ["quiebres", "Quiebres de Stock"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#3B82F6" : "#64748B", background: "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #3B82F6" : "2px solid transparent",
              cursor: "pointer", marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: STOCK ACTUAL ═══ */}
      {tab === "stock" && (
        <>
          {/* Stock table by category */}
          <div style={{ ...card, marginBottom: 20, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px 0", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
              Stock por Categoría
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thS, width: 30, padding: "8px" }} />
                  <th style={thS}>Categoría</th>
                  <th style={thR}>Artículos</th>
                  <th style={thR}>Unidades</th>
                  <th style={{ ...thS, textAlign: "left", width: "40%" }}>Distribución</th>
                </tr>
              </thead>
              <tbody>
                {cats4.map((c, i) => {
                  const maxU = Math.max(...cats4.map(x => x.unidades));
                  const pct = maxU > 0 ? (c.unidades / maxU) * 100 : 0;
                  const isOpen = stockDetCat === c.categoria;
                  return (
                    <Fragment key={c.categoria}>
                      <tr
                        onClick={() => toggleStockDetalle(c.categoria)}
                        style={{ background: isOpen ? "#F8FAFC" : rowBg(i), cursor: "pointer", borderBottom: "1px solid #F1F5F9" }}
                      >
                        <td style={{ ...td, textAlign: "center", padding: "7px 8px" }}>
                          {isOpen ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#94A3B8" />}
                        </td>
                        <td style={td}>
                          <span style={{ fontWeight: 700 }}>{c.categoria}</span>
                        </td>
                        <td style={tdR}>{fmtN(c.articulos)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(c.unidades)}</td>
                        <td style={{ ...td, paddingRight: 20 }}>
                          <div style={{ height: 18, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`, borderRadius: 4,
                              background: catColors[c.categoria] || "#3B82F6",
                              transition: "width 0.3s ease",
                            }} />
                          </div>
                        </td>
                      </tr>
                      {/* Drill-down */}
                      {isOpen && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div style={{ background: "#F8FAFC", padding: "12px 20px 12px 44px", borderBottom: "2px solid #E2E8F0" }}>
                              {loadingStockDet ? (
                                <div style={{ padding: 16, color: "#94A3B8", fontSize: 13 }}>Cargando...</div>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...thS, fontSize: 11 }}>Código</th>
                                      <th style={{ ...thS, fontSize: 11 }}>Descripción</th>
                                      <th style={{ ...thR, fontSize: 11 }}>Unidades</th>
                                      <th style={{ ...thR, fontSize: 11 }}>Ubicaciones</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {stockDetalle.slice(0, 30).map((p, j) => (
                                      <tr key={p.codigo_producto} style={{ background: rowBg(j), borderBottom: "1px solid #F1F5F9" }}>
                                        <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{p.codigo_producto}</td>
                                        <td style={td}>{p.descripcion}</td>
                                        <td style={{ ...tdR, fontWeight: 600 }}>{fmtN(p.stock_unidades)}</td>
                                        <td style={tdR}>{p.n_ubicaciones}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {stockDetalle.length > 30 && (
                                <div style={{ fontSize: 11, color: "#94A3B8", padding: "6px 0" }}>
                                  Mostrando 30 de {stockDetalle.length} productos
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {/* Total row */}
                <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0" }}>
                  <td style={{ ...td, padding: "7px 8px" }} />
                  <td style={{ ...td, fontWeight: 800 }}>Total</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{fmtN(cats4.reduce((s, c) => s + c.articulos, 0))}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{fmtN(cats4.reduce((s, c) => s + c.unidades, 0))}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
            {/* Other categories */}
            {stockCat.filter(c => !["SQ", "EVA", "MAH", "EQM"].includes(c.categoria)).length > 0 && (
              <div style={{ padding: "10px 20px 14px", borderTop: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 12 }}>Otras:</span>
                {stockCat.filter(c => !["SQ", "EVA", "MAH", "EQM"].includes(c.categoria)).map(c => (
                  <span key={c.categoria} style={{ fontSize: 12, color: "#64748B", marginRight: 16 }}>
                    <b>{c.categoria}</b> {fmtN(c.unidades)} uds
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Monthly lost sales chart */}
          {(() => {
            const BAR_H = 160;
            const maxMonth = Math.max(
              ...mesesConDatos.map(mm => {
                const q = vpMensual.find(v => v.mes === mm && v.clasificacion === "Quiebre");
                const o = vpMensual.find(v => v.mes === mm && v.clasificacion === "Otro");
                return (q?.total_perdido || 0) + (o?.total_perdido || 0);
              })
            );
            return (
              <div style={{ ...card }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
                  Venta Perdida Mensual 2026
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                  {mesesConDatos.map(m => {
                    const quiebreM = vpMensual.find(v => v.mes === m && v.clasificacion === "Quiebre");
                    const otroM = vpMensual.find(v => v.mes === m && v.clasificacion === "Otro");
                    const qVal = quiebreM?.total_perdido || 0;
                    const oVal = otroM?.total_perdido || 0;
                    const totalM = qVal + oVal;
                    const hQ = maxMonth > 0 ? Math.max((qVal / maxMonth) * BAR_H, totalM > 0 ? 3 : 0) : 0;
                    const hO = maxMonth > 0 ? Math.max((oVal / maxMonth) * BAR_H, totalM > 0 ? 3 : 0) : 0;
                    return (
                      <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 10, color: "#374151", marginBottom: 6, fontWeight: 700 }}>
                          {fmt(totalM)}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 52, gap: 1 }}>
                          <div style={{ height: hO, background: "#FCD34D", borderRadius: "4px 4px 0 0" }} />
                          <div style={{ height: hQ, background: "#EF4444", borderRadius: "0 0 4px 4px" }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, fontWeight: 500 }}>{MESES[m]}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748B" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "#EF4444" }} /> Quiebre
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748B" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "#FCD34D" }} /> Otro
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ═══ TAB: COTIZACIÓN ═══ */}
      {tab === "cotizacion" && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {/* Catálogo de productos */}
            <div style={{ ...card, flex: 1, minWidth: 350, padding: 0, overflow: "hidden", maxHeight: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                  Productos disponibles
                </div>
                <div style={{ position: "relative" }}>
                  <SearchIcon size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
                  <input
                    type="text"
                    value={cotCatalogFilter}
                    onChange={(e) => setCotCatalogFilter(e.target.value)}
                    placeholder="Filtrar por código o nombre..."
                    style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                    autoFocus
                  />
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                  {cotCatalogLoading ? "Cargando..." : `${cotCatalogFiltered.length} productos`}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {cotCatalogFiltered.slice(0, 100).map((p, i) => {
                  const yaAgregado = cotItems.some(it => it.codigo === p.codigo_producto);
                  const adding = cotAddingCode === p.codigo_producto;
                  return (
                    <div
                      key={p.codigo_producto}
                      style={{ padding: "5px 14px", background: yaAgregado ? "#F0FDF4" : rowBg(i), borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#64748B", marginRight: 6 }}>{p.codigo_producto}</span>
                          {p.descripcion}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: p.stock_unidades > 0 ? "#10B981" : "#EF4444", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmtN(p.stock_unidades)}
                      </span>
                      <button
                        onClick={() => agregarProducto(p)}
                        disabled={yaAgregado || adding}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: "none", fontSize: 14, cursor: yaAgregado ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          background: yaAgregado ? "#D1FAE5" : adding ? "#DBEAFE" : "#3B82F6",
                          color: yaAgregado ? "#10B981" : "white", flexShrink: 0,
                        }}
                        title={yaAgregado ? "Ya agregado" : "Agregar"}
                      >
                        {adding ? "..." : <Plus size={14} />}
                      </button>
                    </div>
                  );
                })}
                {cotCatalogFiltered.length > 100 && (
                  <div style={{ padding: "8px 14px", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
                    Mostrando 100 de {cotCatalogFiltered.length} — usa el filtro para encontrar más
                  </div>
                )}
              </div>
            </div>

            {/* Panel derecho: cliente + info */}
            <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Cliente (opcional) */}
              <div style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                  Cliente (opcional)
                </div>
                <input
                  type="text"
                  value={cotClienteRut}
                  onChange={(e) => { setCotClienteRut(e.target.value); setCotClienteApplied(false); }}
                  placeholder="RUT del cliente..."
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", marginBottom: 6, boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                />
                <input
                  type="text"
                  value={cotClienteNombre}
                  onChange={(e) => setCotClienteNombre(e.target.value)}
                  placeholder="Nombre (para el Excel)..."
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                />
                <button
                  onClick={aplicarCliente}
                  disabled={!cotClienteRut.trim() || cotPricingLoading || cotItems.length === 0}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: cotClienteRut.trim() && cotItems.length > 0 ? "pointer" : "not-allowed",
                    background: cotClienteApplied ? "#D1FAE5" : cotClienteRut.trim() && cotItems.length > 0 ? "#3B82F6" : "#E2E8F0",
                    color: cotClienteApplied ? "#065F46" : cotClienteRut.trim() && cotItems.length > 0 ? "white" : "#94A3B8",
                  }}
                >
                  {cotPricingLoading ? "Aplicando..." : cotClienteApplied ? "Precios aplicados" : "Aplicar precios del cliente"}
                </button>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                  Sin cliente → precio lista Televentas
                </div>
              </div>

              {/* Resumen */}
              {cotItems.length > 0 && (
                <div style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Resumen</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>Productos</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{cotItems.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#64748B" }}>Unidades</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtN(cotItems.reduce((s, i) => s + i.cantidad, 0))}</span>
                  </div>
                  <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>Total</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{fmt(cotItems.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0))}</span>
                  </div>
                  <button
                    onClick={exportarCotizacion}
                    style={{ width: "100%", marginTop: 12, padding: "9px 0", borderRadius: 8, border: "none", background: "#0F172A", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <FileSpreadsheet size={14} /> Exportar Excel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tabla de cotización */}
          {cotItems.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 20px", borderBottom: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                Detalle Cotización
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, width: 30 }} />
                      <th style={thS}>Código</th>
                      <th style={thS}>Producto</th>
                      <th style={thR}>Stock</th>
                      <th style={{ ...thC, background: "#EFF6FF" }}>Cant.</th>
                      <th style={{ ...thR, background: "#EFF6FF" }}>Precio Unit.</th>
                      <th style={thR}>Total</th>
                      <th style={{ ...thR, fontSize: 11, color: "#6B7280" }}>Costo</th>
                      <th style={thC}>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotItems.map((item, i) => {
                      const total = item.cantidad * item.precio_unitario;
                      const margen = item.precio_unitario > 0 && item.costo_promedio > 0
                        ? (item.precio_unitario - item.costo_promedio) / item.precio_unitario * 100 : 0;
                      const margenColor = margen >= 40 ? "#10B981" : margen >= 25 ? "#F59E0B" : "#EF4444";
                      return (
                        <tr key={item.codigo} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                          <td style={{ ...td, textAlign: "center", padding: "7px 4px" }}>
                            <button onClick={() => removeCotItem(item.codigo)} style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", padding: 2 }} title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{item.codigo}</td>
                          <td style={{ ...td, fontSize: 12, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>{item.descripcion}</td>
                          <td style={{ ...tdR, fontWeight: 600, color: item.stock > 0 ? "#10B981" : "#EF4444" }}>{fmtN(item.stock)}</td>
                          <td style={{ ...tdC, background: "#FAFBFF", padding: "4px 6px" }}>
                            <input type="number" min={1} value={item.cantidad}
                              onChange={(e) => updateCotItem(item.codigo, "cantidad", Math.max(1, parseInt(e.target.value) || 1))}
                              style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, textAlign: "center", outline: "none" }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                            />
                          </td>
                          <td style={{ ...tdR, background: "#FAFBFF", padding: "4px 6px" }}>
                            <input type="number" min={0} value={item.precio_unitario}
                              onChange={(e) => updateCotItem(item.codigo, "precio_unitario", Math.max(0, parseInt(e.target.value) || 0))}
                              style={{ width: 100, padding: "4px 6px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, textAlign: "right", outline: "none" }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                            />
                          </td>
                          <td style={{ ...tdR, fontWeight: 800, fontSize: 13 }}>{fmt(total)}</td>
                          <td style={{ ...tdR, color: "#6B7280", fontSize: 12 }}>{item.costo_promedio > 0 ? `$${fmtN(item.costo_promedio)}` : "—"}</td>
                          <td style={tdC}>
                            <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: margenColor, background: margen >= 40 ? "#F0FDF4" : margen >= 25 ? "#FFFBEB" : "#FEF2F2" }}>
                              {margen.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#F1F5F9", borderTop: "2px solid #E2E8F0" }}>
                      <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 800, fontSize: 14, paddingRight: 12 }}>TOTAL</td>
                      <td style={{ ...tdR, fontWeight: 800, fontSize: 14 }}>{fmt(cotItems.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: CONSULTA STOCK ═══ */}
      {tab === "consulta" && (
        <>
          {/* Search bar */}
          <div style={{ ...card, marginBottom: 20, padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
              Buscar producto por código o nombre
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); buscarStock(busqInput); }}
              style={{ display: "flex", gap: 10, alignItems: "center" }}
            >
              <div style={{ position: "relative", flex: 1, maxWidth: 500 }}>
                <SearchIcon size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
                <input
                  type="text"
                  value={busqInput}
                  onChange={(e) => setBusqInput(e.target.value)}
                  placeholder="Ej: 037-04181, GUANTE, JERINGA..."
                  style={{
                    width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10,
                    border: "1px solid #E2E8F0", fontSize: 14, color: "#1F2937",
                    outline: "none", background: "white", transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={busqInput.trim().length < 2 || busqLoading}
                style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: busqInput.trim().length >= 2 ? "#3B82F6" : "#E2E8F0",
                  color: busqInput.trim().length >= 2 ? "white" : "#94A3B8",
                  fontSize: 14, fontWeight: 600, cursor: busqInput.trim().length >= 2 ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                {busqLoading ? "Buscando..." : "Buscar"}
              </button>
            </form>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
              Ingresa al menos 2 caracteres. Busca en código de producto y descripción.
            </div>
          </div>

          {/* Results */}
          {busqDone && (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                  {busqResults.length > 0
                    ? `${busqResults.length} producto${busqResults.length > 1 ? "s" : ""} encontrado${busqResults.length > 1 ? "s" : ""}`
                    : "Sin resultados"}
                </span>
                {busqResults.length > 0 && (
                  <ExportButton
                    data={busqResults}
                    columns={[
                      { key: "codigo_producto", label: "Codigo" },
                      { key: "descripcion", label: "Producto" },
                      { key: "categoria", label: "Categoria" },
                      { key: "stock_unidades", label: "Stock" },
                      { key: "n_ubicaciones", label: "Ubicaciones" },
                      { key: "venta_ytd", label: "Venta YTD" },
                      { key: "cant_ytd", label: "Cant YTD" },
                      { key: "n_clientes", label: "Clientes" },
                    ]}
                    filename="consulta_stock"
                  />
                )}
              </div>
              {busqResults.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>
                    <SearchIcon size={40} style={{ color: "#E2E8F0" }} />
                  </div>
                  <div style={{ fontSize: 14, color: "#94A3B8" }}>
                    No se encontraron productos para &quot;{busqInput}&quot;
                  </div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thS}>Código</th>
                      <th style={thS}>Producto</th>
                      <th style={thS}>Categoría</th>
                      <th style={thR}>Stock</th>
                      <th style={thR}>Ubic.</th>
                      <th style={thR}>Venta YTD</th>
                      <th style={thR}>Cant YTD</th>
                      <th style={thR}>Clientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {busqResults.map((p, i) => {
                      const semColor = p.stock_unidades === 0
                        ? "#EF4444"
                        : p.stock_unidades < 50
                          ? "#F59E0B"
                          : "#10B981";
                      return (
                        <tr key={p.codigo_producto} style={{ background: rowBg(i), borderBottom: "1px solid #F1F5F9" }}>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{p.codigo_producto}</td>
                          <td style={{ ...td, maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                          <td style={td}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#F1F5F9", color: "#475569" }}>
                              {p.categoria}
                            </span>
                          </td>
                          <td style={{ ...tdR, fontWeight: 800, color: semColor }}>{fmtN(p.stock_unidades)}</td>
                          <td style={tdR}>{p.n_ubicaciones}</td>
                          <td style={tdR}>{p.venta_ytd > 0 ? fmt(p.venta_ytd) : "—"}</td>
                          <td style={tdR}>{p.cant_ytd > 0 ? fmtN(p.cant_ytd) : "—"}</td>
                          <td style={tdR}>{p.n_clientes > 0 ? fmtN(p.n_clientes) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: QUIEBRES ═══ */}
      {tab === "quiebres" && (
        <>
          {/* Filters: category + month */}
          <div style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["", "SQ", "EVA", "MAH", "EQM"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setQuiebreCat(cat)}
                  style={{
                    padding: "5px 14px", borderRadius: 6, fontSize: 12,
                    border: quiebreCat === cat ? "1px solid #3B82F6" : "1px solid #E2E8F0",
                    background: quiebreCat === cat ? "#EFF6FF" : "white",
                    color: quiebreCat === cat ? "#3B82F6" : "#64748B",
                    fontWeight: quiebreCat === cat ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {cat || "Todas"}
                </button>
              ))}
            </div>
            <div style={{ height: 20, width: 1, background: "#E2E8F0" }} />
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m === 0 || mesesConDatos.includes(m)).map(m => (
                <button
                  key={m}
                  onClick={() => setQuiebreMes(m)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 12,
                    border: quiebreMes === m ? "1px solid #3B82F6" : "1px solid #E2E8F0",
                    background: quiebreMes === m ? "#EFF6FF" : "white",
                    color: quiebreMes === m ? "#3B82F6" : "#64748B",
                    fontWeight: quiebreMes === m ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {m === 0 ? "Todo" : MESES[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Charts section */}
          {qStats && (
            <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
              {/* Bar chart: quiebres por mes stacked by category */}
              <div style={{ ...card, flex: 2, minWidth: 400 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
                  Quiebres por Mes
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>
                  Monto perdido por categoría (solo quiebres de stock)
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(() => {
                    const meses = [...new Set(qStats.porMesCat.map(r => r.mes))].sort((a, b) => a - b);
                    return meses.map(m => {
                      const row: Record<string, unknown> = { mes: MESES[m] };
                      const cats = ["SQ", "EVA", "MAH", "EQM"];
                      cats.forEach(cat => {
                        const found = qStats.porMesCat.find(r => r.mes === m && r.categoria === cat);
                        row[cat] = found ? found.total_perdido : 0;
                      });
                      // Otras categorías
                      const otrasSum = qStats.porMesCat
                        .filter(r => r.mes === m && !cats.includes(r.categoria))
                        .reduce((s, r) => s + r.total_perdido, 0);
                      row["Otro"] = otrasSum;
                      return row;
                    });
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${(v / 1e3).toFixed(0)}K`} width={60} />
                    <Tooltip
                      formatter={(value) => [fmt(Number(value ?? 0))]}
                      contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="SQ" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="MAH" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="EQM" stackId="a" fill="#8B5CF6" />
                    <Bar dataKey="EVA" stackId="a" fill="#10B981" />
                    <Bar dataKey="Otro" stackId="a" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top clientes afectados */}
              <div style={{ ...card, flex: 1, minWidth: 300 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
                  Clientes más afectados
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>
                  Top 10 por monto perdido en quiebres
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {qStats.topClientes.map((c, i) => {
                    const maxVal = qStats.topClientes[0]?.total_perdido || 1;
                    const pct = (c.total_perdido / maxVal) * 100;
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.nombre_cliente}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>{fmt(c.total_perdido)}</span>
                        </div>
                        <div style={{ height: 12, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${pct}%`, borderRadius: 3,
                            background: i < 3 ? "#EF4444" : i < 6 ? "#F59E0B" : "#3B82F6",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Quiebres table */}
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <TableToolbar>
              <SearchInput value={qSearch} onChange={setQSearch} placeholder="Buscar producto o codigo..." width={240} />
              {qSearch && (
                <span style={{ fontSize: 12, color: "#64748B" }}>{sortedQuiebres.length} de {quiebres.length}</span>
              )}
              <div style={{ flex: 1 }} />
              <ExportButton
                data={sortedQuiebres}
                columns={[
                  { key: "codigo_producto", label: "Codigo" }, { key: "descripcion_producto", label: "Producto" },
                  { key: "categoria", label: "Categoria" }, { key: "veces_quiebre", label: "Quiebres" },
                  { key: "total_perdido", label: "Venta Perdida" }, { key: "stock_actual", label: "Stock Actual" },
                ]}
                filename="quiebres_stock"
              />
            </TableToolbar>
            {loadingQ ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, width: 30, padding: "8px" }} />
                    <th style={thS}>Código</th>
                    <th style={thS}>Producto</th>
                    <th style={thS}>Cat</th>
                    <SortTh label="Quiebres" field="veces_quiebre" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh label="Venta Perdida" field="total_perdido" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh label="Stock Actual" field="stock_actual" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <th style={thC}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuiebres.map((q, i) => {
                    const sem = stockSemaforo(q.stock_actual, q.veces_quiebre);
                    const isOpen = detalleCode === q.codigo_producto;
                    return (
                      <Fragment key={q.codigo_producto}>
                        <tr
                          onClick={() => toggleDetalle(q.codigo_producto)}
                          style={{
                            borderBottom: "1px solid #F1F5F9",
                            background: isOpen ? "#F8FAFC" : rowBg(i),
                            cursor: "pointer",
                          }}
                        >
                          <td style={{ ...td, textAlign: "center", padding: "7px 8px" }}>
                            {isOpen ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#94A3B8" />}
                          </td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{q.codigo_producto}</td>
                          <td style={{ ...td, maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {q.descripcion_producto}
                          </td>
                          <td style={td}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: "#F1F5F9", color: "#475569",
                            }}>
                              {q.categoria || "—"}
                            </span>
                          </td>
                          <td style={{ ...tdR, fontWeight: 700, color: "#EF4444" }}>{q.veces_quiebre}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmt(q.total_perdido)}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(q.stock_actual)}</td>
                          <td style={tdC}>
                            <span style={{
                              padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: sem.bg, color: sem.color,
                            }}>
                              {sem.label}
                            </span>
                          </td>
                        </tr>
                        {/* Detail row */}
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div style={{ background: "#F8FAFC", padding: "12px 20px 12px 44px", borderBottom: "2px solid #E2E8F0" }}>
                                {loadingDet ? (
                                  <div style={{ padding: 12, color: "#94A3B8", fontSize: 13 }}>Cargando detalle...</div>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                                      Eventos de quiebre &mdash; {q.descripcion_producto}
                                    </div>
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <thead>
                                        <tr>
                                          <th style={{ ...thS, fontSize: 11 }}>Fecha</th>
                                          <th style={{ ...thS, fontSize: 11 }}>Cliente</th>
                                          <th style={{ ...thS, fontSize: 11 }}>Vendedor</th>
                                          <th style={{ ...thR, fontSize: 11 }}>Pedido</th>
                                          <th style={{ ...thR, fontSize: 11 }}>Stock</th>
                                          <th style={{ ...thR, fontSize: 11 }}>Monto</th>
                                          <th style={{ ...thC, fontSize: 11 }}>Tipo</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detalleEventos.map((e, j) => (
                                          <tr key={j} style={{ background: rowBg(j), borderBottom: "1px solid #F1F5F9" }}>
                                            <td style={td}>{e.fecha_documento}</td>
                                            <td style={{ ...td, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                                              {e.nombre_cliente}
                                            </td>
                                            <td style={td}>{e.vendedor}</td>
                                            <td style={tdR}>{fmtN(e.cantidad_pendiente)}</td>
                                            <td style={{ ...tdR, color: e.stock_al_momento === 0 ? "#EF4444" : "#F59E0B", fontWeight: 600 }}>
                                              {fmtN(e.stock_al_momento)}
                                            </td>
                                            <td style={{ ...tdR, fontWeight: 700 }}>{fmt(e.monto_perdido)}</td>
                                            <td style={tdC}>
                                              <span style={{
                                                padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                background: e.clasificacion === "Quiebre" ? "#FEF2F2" : "#FFFBEB",
                                                color: e.clasificacion === "Quiebre" ? "#EF4444" : "#F59E0B",
                                              }}>
                                                {e.clasificacion}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
