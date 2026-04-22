"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import { ExportButton } from "@/components/table-tools";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

/* ─── Styles ────────────────────────────────────────────────── */

const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 11, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px 10px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 12 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const TIPO_COLORS: Record<string, string> = {
  Nitrilo: "#8B5CF6",
  "Latex Quirurgico": "#3B82F6",
  Examen: "#10B981",
  Vinilo: "#F59E0B",
  Quirurgico: "#EC4899",
  Otro: "#94A3B8",
};

const TIPOS_FILTER = [
  { id: "nitrilo", label: "Nitrilo" },
  { id: "latex", label: "Latex Quirurgico" },
  { id: "examen", label: "Examen" },
  { id: "vinilo", label: "Vinilo" },
  { id: "todos", label: "Todos" },
];

/* ─── Interfaces ─────────────────────────────────────────────── */

interface Transaccion {
  fecha: string;
  mes?: string;
  proveedor: string;
  producto: string;
  cantidad: number;
  monto: number;
  precio_unit: number;
  comprador: string;
  unidad?: string;
  tipo: string;
}

interface Alza {
  proveedor: string;
  producto: string;
  fecha: string;
  cantidad: number;
  precio_unit: number;
  precio_base: number;
  pct_alza: number;
  comprador: string;
  tipo?: string;
}

interface EvolRow {
  mes: string;
  proveedor: string;
  unidades: number;
  monto: number;
  precio_prom: number;
  n_ocs: number;
}

interface ResumenData {
  evolucion: EvolRow[];
  transacciones: Transaccion[];
  alzas: Alza[];
  lbf: { mes: string; unidades: number; monto: number; precio_prom: number; n_ocs: number }[];
  desde: string;
  hasta: string;
}

/* ─── Components ─────────────────────────────────────────────── */

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 140, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AlzaBadge({ pct }: { pct: number }) {
  const color = pct >= 50 ? "#DC2626" : pct >= 25 ? "#F59E0B" : "#10B981";
  return (
    <span style={{
      background: `${color}15`, color, fontWeight: 700, fontSize: 11,
      padding: "2px 8px", borderRadius: 4,
    }}>
      +{pct.toFixed(1)}%
    </span>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */

export default function GuantesPage() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState("nitrilo");
  const [tab, setTab] = useState<"alertas" | "transacciones" | "proveedores">("transacciones");
  const [provFilter, setProvFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get<ResumenData>(`/api/guantes/resumen?meses=4`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div className="spinner" style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#8B5CF6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748B" }}>Cargando datos de guantes...</p>
      </div>
    </div>
  );

  if (!data) return <p style={{ color: "#EF4444", padding: 40 }}>Error al cargar datos</p>;

  // Filter transactions by tipo
  const filteredTxn = tipoFilter === "todos"
    ? data.transacciones
    : data.transacciones.filter(t => t.tipo.toLowerCase().includes(tipoFilter));

  const filteredAlzas = tipoFilter === "todos"
    ? data.alzas
    : data.alzas.filter(a => (a.tipo || _classify(a.producto)).toLowerCase().includes(tipoFilter));

  // Filter by provider
  const finalTxn = provFilter
    ? filteredTxn.filter(t => t.proveedor.toLowerCase().includes(provFilter.toLowerCase()))
    : filteredTxn;
  const finalAlzas = provFilter
    ? filteredAlzas.filter(a => a.proveedor.toLowerCase().includes(provFilter.toLowerCase()))
    : filteredAlzas;

  // Top providers in current data
  const proveedores = _getTopProviders(data.evolucion);

  // KPIs
  const totalAlzas = data.alzas.length;
  const alzasNitrilo = data.alzas.filter(a => (a.tipo || _classify(a.producto)).toLowerCase().includes("nitrilo")).length;
  const lbfAbr = data.lbf.find(l => l.mes === "2026-04");
  const lbfMar = data.lbf.find(l => l.mes === "2026-03");

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Monitor Guantes EQM
          </h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0" }}>
            Seguimiento de precios de compra en Mercado Publico — transaccion por transaccion
          </p>
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          {data.desde} → {data.hasta}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard
          title="Alertas de Alza"
          value={String(totalAlzas)}
          sub={`${alzasNitrilo} en nitrilo`}
          color={totalAlzas > 0 ? "#DC2626" : "#10B981"}
        />
        <KpiCard
          title="LBF Abril"
          value={lbfAbr ? fmt(lbfAbr.monto) : "--"}
          sub={lbfAbr ? `${lbfAbr.n_ocs} OCs · ${lbfAbr.unidades.toLocaleString("es-CL")} u` : "Sin data"}
        />
        <KpiCard
          title="Precio LBF Abr"
          value={lbfAbr ? `$${lbfAbr.precio_prom.toLocaleString("es-CL")}/u` : "--"}
          sub={lbfMar ? `Mar: $${lbfMar.precio_prom.toLocaleString("es-CL")}/u` : ""}
          color={lbfAbr && lbfMar && lbfAbr.precio_prom > lbfMar.precio_prom ? "#DC2626" : "#10B981"}
        />
        <KpiCard
          title="Proveedores Activos"
          value={String(proveedores.length)}
          sub="En guantes medicos"
        />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>TIPO:</span>
        {TIPOS_FILTER.map(t => (
          <button
            key={t.id}
            onClick={() => setTipoFilter(t.id)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: tipoFilter === t.id ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
              background: tipoFilter === t.id ? "#8B5CF620" : "white",
              color: tipoFilter === t.id ? "#8B5CF6" : "#64748B",
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <input
            type="text"
            placeholder="Filtrar proveedor..."
            value={provFilter}
            onChange={e => setProvFilter(e.target.value)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, border: "1px solid #E2E8F0",
              width: 180, outline: "none",
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #E2E8F0", paddingBottom: 0 }}>
        {(["transacciones", "proveedores", "alertas"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: "none", background: "transparent",
              color: tab === t ? "#8B5CF6" : "#64748B",
              borderBottom: tab === t ? "2px solid #8B5CF6" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {t === "transacciones" ? `Transacciones (${finalTxn.length})` : t === "alertas" ? `Alertas (${finalAlzas.length})` : "Proveedores"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "alertas" && <AlertasTab alzas={finalAlzas} />}
      {tab === "transacciones" && <TransaccionesTab txns={finalTxn} />}
      {tab === "proveedores" && <ProveedoresTab evolucion={data.evolucion} lbf={data.lbf} transacciones={data.transacciones} tipoFilter={tipoFilter} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Tab: Alertas ─────────────────────────────────────────── */

function AlertasTab({ alzas }: { alzas: Alza[] }) {
  if (alzas.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40, color: "#10B981" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>&#10003;</div>
        <p style={{ fontWeight: 600 }}>Sin alertas de alzas para este tipo</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          Alzas detectadas vs precio base (meses anteriores)
        </h3>
        <ExportButton data={alzas} filename="guantes_alertas" columns={[
          { key: "proveedor", label: "Proveedor" },
          { key: "producto", label: "Producto" },
          { key: "fecha", label: "Fecha" },
          { key: "cantidad", label: "Cantidad" },
          { key: "precio_unit", label: "Precio Unit" },
          { key: "precio_base", label: "Base" },
          { key: "pct_alza", label: "% Alza" },
          { key: "comprador", label: "Comprador" },
        ]} />
      </div>
      <div style={{ overflowX: "auto", maxHeight: 500 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <th style={thS}>Proveedor</th>
              <th style={thS}>Producto</th>
              <th style={thS}>Fecha</th>
              <th style={thR}>Cantidad</th>
              <th style={thR}>Precio Unit</th>
              <th style={thR}>Base</th>
              <th style={thR}>Alza</th>
              <th style={thS}>Comprador</th>
            </tr>
          </thead>
          <tbody>
            {alzas.slice(0, 100).map((a, i) => (
              <tr key={i} style={{ background: rowBg(i) }}>
                <td style={{ ...td, fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{_shortName(a.proveedor)}</td>
                <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={a.producto}>{a.producto}</td>
                <td style={td}>{a.fecha}</td>
                <td style={tdR}>{a.cantidad.toLocaleString("es-CL")}</td>
                <td style={{ ...tdR, fontWeight: 700, color: "#DC2626" }}>${a.precio_unit.toLocaleString("es-CL")}</td>
                <td style={tdR}>${a.precio_base.toLocaleString("es-CL")}</td>
                <td style={tdR}><AlzaBadge pct={a.pct_alza} /></td>
                <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }} title={a.comprador}>{a.comprador}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Tab: Transacciones ───────────────────────────────────── */

function TransaccionesTab({ txns }: { txns: Transaccion[] }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          Transacciones individuales ({txns.length})
        </h3>
        <ExportButton data={txns} filename="guantes_transacciones" columns={[
          { key: "fecha", label: "Fecha" },
          { key: "proveedor", label: "Proveedor" },
          { key: "producto", label: "Producto" },
          { key: "tipo", label: "Tipo" },
          { key: "cantidad", label: "Cantidad" },
          { key: "monto", label: "Monto" },
          { key: "precio_unit", label: "Precio/u" },
          { key: "comprador", label: "Comprador" },
        ]} />
      </div>
      <div style={{ overflowX: "auto", maxHeight: 500 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <th style={thS}>Fecha</th>
              <th style={thS}>Proveedor</th>
              <th style={thS}>Producto</th>
              <th style={thS}>Tipo</th>
              <th style={thR}>Cantidad</th>
              <th style={thR}>Monto</th>
              <th style={thR}>Precio/u</th>
              <th style={thS}>Comprador</th>
            </tr>
          </thead>
          <tbody>
            {txns.slice(0, 200).map((t, i) => (
              <tr key={i} style={{ background: rowBg(i) }}>
                <td style={td}>{t.fecha}</td>
                <td style={{ ...td, fontWeight: 600, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{_shortName(t.proveedor)}</td>
                <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={t.producto}>{t.producto}</td>
                <td style={td}>
                  <span style={{ background: `${TIPO_COLORS[t.tipo] || "#94A3B8"}20`, color: TIPO_COLORS[t.tipo] || "#94A3B8", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                    {t.tipo}
                  </span>
                </td>
                <td style={tdR}>{t.cantidad.toLocaleString("es-CL")}</td>
                <td style={tdR}>{fmt(t.monto)}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>${t.precio_unit.toLocaleString("es-CL")}</td>
                <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }} title={t.comprador}>{t.comprador}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {txns.length > 200 && (
        <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>
          Mostrando 200 de {txns.length} transacciones
        </p>
      )}
    </div>
  );
}

/* ─── Tab: Proveedores (con drill-down) ─────────────────────── */

interface ProvResumen {
  nombre: string; // nombre original sin acortar
  short: string;
  monto: number;
  unidades: number;
  precio_prom: number;
  n_ocs: number;
  meses_activo: number;
  variacion: number | null; // precio primer vs ultimo mes con data
  evol: { mes: string; precio_prom: number; monto: number }[]; // para el mini gráfico
}

function _buildProvResumen(evolucion: EvolRow[], lbf: { mes: string; unidades: number; monto: number; precio_prom: number; n_ocs: number }[]): ProvResumen[] {
  // Agregar LBF como proveedor virtual
  const lbfRows: EvolRow[] = lbf.map(l => ({ ...l, proveedor: "LBF (COMERCIAL LBF LIMITADA)" }));
  const allRows = [...lbfRows, ...evolucion];

  const byProv: Record<string, EvolRow[]> = {};
  allRows.forEach(e => {
    if (!byProv[e.proveedor]) byProv[e.proveedor] = [];
    byProv[e.proveedor].push(e);
  });

  return Object.entries(byProv).map(([nombre, rows]) => {
    const monto = rows.reduce((s, r) => s + r.monto, 0);
    const unidades = rows.reduce((s, r) => s + r.unidades, 0);
    const n_ocs = rows.reduce((s, r) => s + r.n_ocs, 0);
    const precio_prom = unidades > 0 ? Math.round(monto / unidades) : 0;
    const evol = [...rows].sort((a, b) => a.mes.localeCompare(b.mes)).map(r => ({
      mes: r.mes.slice(5), // "04"
      precio_prom: r.precio_prom,
      monto: r.monto,
    }));
    const validos = evol.filter(e => e.precio_prom > 0);
    const variacion = validos.length >= 2
      ? ((validos[validos.length - 1].precio_prom / validos[0].precio_prom) - 1) * 100
      : null;

    return {
      nombre,
      short: _shortName(nombre),
      monto,
      unidades,
      precio_prom,
      n_ocs,
      meses_activo: rows.length,
      variacion,
      evol,
    };
  }).sort((a, b) => {
    if (a.short === "LBF") return -1;
    if (b.short === "LBF") return 1;
    return b.monto - a.monto;
  });
}

function DrillDown({ prov, transacciones }: { prov: ProvResumen; transacciones: Transaccion[] }) {
  // Transacciones del proveedor (últimos 2 meses — lo que hay en data.transacciones)
  const txns = transacciones.filter(t => t.proveedor === prov.nombre || _shortName(t.proveedor) === prov.short);

  // Agrupar por producto
  const porProducto: Record<string, { cantidad: number; monto: number; precios: number[]; compradores: Set<string> }> = {};
  txns.forEach(t => {
    if (!porProducto[t.producto]) porProducto[t.producto] = { cantidad: 0, monto: 0, precios: [], compradores: new Set() };
    porProducto[t.producto].cantidad += t.cantidad;
    porProducto[t.producto].monto += t.monto;
    if (t.precio_unit > 0) porProducto[t.producto].precios.push(t.precio_unit);
    if (t.comprador) porProducto[t.producto].compradores.add(t.comprador);
  });

  const productosRows = Object.entries(porProducto)
    .map(([nombre, d]) => ({
      nombre,
      cantidad: d.cantidad,
      monto: d.monto,
      precio_prom: d.cantidad > 0 ? Math.round(d.monto / d.cantidad) : 0,
      n_compradores: d.compradores.size,
      compradores: [...d.compradores].slice(0, 3).join(", "),
    }))
    .sort((a, b) => b.monto - a.monto);

  // Gráfico: precio prom por mes del proveedor
  const chartData = prov.evol;

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0, background: "#F8FAFC", borderBottom: "2px solid #8B5CF6" }}>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Mini gráfico precio por mes */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Precio promedio por mes
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} margin={{ top: 20, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="p" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toLocaleString("es-CL")}`} width={70} />
                <YAxis yAxisId="m" orientation="right" tick={{ fontSize: 10, fill: "#94A3B8" }}
                  tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M` : `$${(v / 1_000).toFixed(0)}k`} width={50} />
                <Tooltip formatter={(v: any, name: string) => [`$${Number(v).toLocaleString("es-CL")}`, name]} />
                <Bar yAxisId="m" dataKey="monto" name="Monto" fill="#DDD6FE" stroke="#8B5CF6" strokeWidth={1} radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="monto" position="top" style={{ fontSize: 9, fill: "#7C3AED", fontWeight: 700 }}
                    formatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}k` : ""} />
                </Bar>
                <Line yAxisId="p" type="monotone" dataKey="precio_prom" name="Precio/u" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla de productos (últimos 2 meses) */}
          {productosRows.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Detalle por producto — ultimos 2 meses ({txns.length} OC)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thS}>Producto</th>
                      <th style={thR}>Unidades</th>
                      <th style={thR}>Monto</th>
                      <th style={thR}>Precio/u</th>
                      <th style={thR}>Compradores</th>
                      <th style={thS}>Ejemplos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosRows.map((p, i) => (
                      <tr key={p.nombre} style={{ background: i % 2 === 0 ? "white" : "#F1F5F9" }}>
                        <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }} title={p.nombre}>{p.nombre}</td>
                        <td style={tdR}>{p.cantidad.toLocaleString("es-CL")}</td>
                        <td style={tdR}>{fmt(p.monto)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>${p.precio_prom.toLocaleString("es-CL")}</td>
                        <td style={{ ...tdR, color: "#64748B" }}>{p.n_compradores}</td>
                        <td style={{ ...td, fontSize: 10, color: "#94A3B8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={p.compradores}>{p.compradores}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
              Sin transacciones individuales en los ultimos 2 meses — el resumen usa data agregada mensual.
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

function ProveedoresTab({ evolucion, lbf, transacciones, tipoFilter }: {
  evolucion: EvolRow[];
  lbf: { mes: string; unidades: number; monto: number; precio_prom: number; n_ocs: number }[];
  transacciones: Transaccion[];
  tipoFilter: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const provs = _buildProvResumen(evolucion, lbf);

  const exportData = provs.map(p => ({
    proveedor: p.short,
    monto: p.monto,
    unidades: p.unidades,
    precio_prom: p.precio_prom,
    n_ocs: p.n_ocs,
    meses_activo: p.meses_activo,
    variacion: p.variacion != null ? p.variacion.toFixed(1) + "%" : "--",
  }));

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          Resumen por proveedor — haz clic en una fila para ver detalle
        </h3>
        <ExportButton data={exportData} filename="guantes_proveedores" columns={[
          { key: "proveedor", label: "Proveedor" },
          { key: "monto", label: "Monto Total" },
          { key: "unidades", label: "Unidades" },
          { key: "precio_prom", label: "Precio Prom/u" },
          { key: "n_ocs", label: "N OCs" },
          { key: "meses_activo", label: "Meses Activo" },
          { key: "variacion", label: "Variacion %" },
        ]} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>Proveedor</th>
              <th style={thR}>Monto Total</th>
              <th style={thR}>Unidades</th>
              <th style={thR}>Precio Prom/u</th>
              <th style={thR}>OCs</th>
              <th style={thR}>Meses</th>
              <th style={thR}>Var. Precio</th>
              <th style={{ ...thS, textAlign: "center", width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {provs.map((p, i) => {
              const isLbf = p.short === "LBF";
              const isOpen = selected === p.nombre;
              const varColor = p.variacion == null ? "#64748B" : p.variacion > 5 ? "#DC2626" : p.variacion < -5 ? "#10B981" : "#64748B";

              return (
                <React.Fragment key={p.nombre}>
                  <tr
                    onClick={() => setSelected(isOpen ? null : p.nombre)}
                    style={{
                      background: isOpen ? "#F5F3FF" : isLbf ? "#F5F3FF" : rowBg(i),
                      cursor: "pointer",
                      fontWeight: isLbf ? 700 : 400,
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ ...td, fontWeight: 600, color: isLbf ? "#8B5CF6" : "#0F172A" }}>
                      {isLbf && <span style={{ marginRight: 6, fontSize: 10, background: "#8B5CF6", color: "white", padding: "1px 5px", borderRadius: 3 }}>LBF</span>}
                      {p.short}
                    </td>
                    <td style={tdR}>{fmt(p.monto)}</td>
                    <td style={tdR}>{p.unidades.toLocaleString("es-CL")}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>${p.precio_prom.toLocaleString("es-CL")}</td>
                    <td style={tdR}>{p.n_ocs}</td>
                    <td style={{ ...tdR, color: "#64748B" }}>{p.meses_activo}</td>
                    <td style={{ ...tdR, color: varColor, fontWeight: 700 }}>
                      {p.variacion != null ? `${p.variacion > 0 ? "+" : ""}${p.variacion.toFixed(1)}%` : "--"}
                    </td>
                    <td style={{ textAlign: "center", padding: "6px 8px", fontSize: 12, color: "#8B5CF6" }}>
                      {isOpen ? "▲" : "▼"}
                    </td>
                  </tr>
                  {isOpen && (
                    <DrillDown prov={p} transacciones={transacciones} />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function _classify(nombre: string): string {
  const n = (nombre || "").toLowerCase();
  if (n.includes("nitrilo")) return "Nitrilo";
  if (n.includes("latex") && (n.includes("quirur") || n.includes("ester"))) return "Latex Quirurgico";
  if (n.includes("vinilo")) return "Vinilo";
  if (n.includes("examen") || n.includes("exam")) return "Examen";
  if (n.includes("quirur")) return "Quirurgico";
  return "Otro";
}

function _shortName(name: string): string {
  return name
    .replace("COMERCIAL ", "")
    .replace(" LIMITADA", "")
    .replace(" LTDA", "")
    .replace(" SPA", "")
    .replace(" S.A.", "")
    .replace(" S A", "")
    .replace("PRODUCTOS MEDICOS ", "");
}

function _getTopProviders(evolucion: EvolRow[]): string[] {
  const provs = new Set(evolucion.map(e => e.proveedor));
  return [...provs];
}
