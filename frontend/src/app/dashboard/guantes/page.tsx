"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import { ExportButton } from "@/components/table-tools";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList,
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
  const [tab, setTab] = useState<"alertas" | "transacciones" | "evolucion">("transacciones");
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

  // Build evolution chart data
  const chartData = _buildChartData(data.evolucion, data.lbf, tipoFilter);

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
        {(["transacciones", "evolucion", "alertas"] as const).map(t => (
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
            {t === "transacciones" ? `Transacciones (${finalTxn.length})` : t === "alertas" ? `Alertas (${finalAlzas.length})` : "Evolucion"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "alertas" && <AlertasTab alzas={finalAlzas} />}
      {tab === "transacciones" && <TransaccionesTab txns={finalTxn} />}
      {tab === "evolucion" && <EvolucionTab chartData={chartData} evolucion={data.evolucion} tipoFilter={tipoFilter} />}

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

/* ─── Tab: Evolucion ───────────────────────────────────────── */

function EvolucionTab({ chartData, evolucion, tipoFilter }: { chartData: any[]; evolucion: EvolRow[]; tipoFilter: string }) {
  // Build provider table from evolution data
  const provTable = _buildProviderTable(evolucion, tipoFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Chart */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
          Precio Promedio Ponderado por Mes — Top Proveedores
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toLocaleString("es-CL")}`} />
            <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString("es-CL")}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="LBF" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="HOSPITALIA" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="FLEXING" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="MADEGOM" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="REUTTER" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="GBG" stroke="#EC4899" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Provider table */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Evolucion por Proveedor (precio ponderado/unidad)
          </h3>
          <ExportButton data={provTable} filename="guantes_evolucion" columns={[
          { key: "proveedor", label: "Proveedor" },
          { key: "variacion", label: "Variacion %" },
        ]} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Proveedor</th>
                {chartData.map(d => <th key={d.mes} style={thR}>{d.mes}</th>)}
                <th style={thR}>Variacion</th>
              </tr>
            </thead>
            <tbody>
              {provTable.map((p, i) => (
                <tr key={p.proveedor} style={{ background: rowBg(i), fontWeight: p.proveedor === "LBF" ? 700 : 400 }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.proveedor}</td>
                  {chartData.map(d => (
                    <td key={d.mes} style={tdR}>
                      {p.precios[d.mes] ? `$${p.precios[d.mes].toLocaleString("es-CL")}` : "--"}
                    </td>
                  ))}
                  <td style={{ ...tdR, color: (p.variacion ?? 0) > 0 ? "#DC2626" : (p.variacion ?? 0) < 0 ? "#10B981" : "#64748B", fontWeight: 700 }}>
                    {p.variacion != null ? `${p.variacion > 0 ? "+" : ""}${p.variacion.toFixed(1)}%` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  // Shorten common long names
  return name
    .replace("COMERCIAL ", "")
    .replace(" LIMITADA", "")
    .replace(" LTDA", "")
    .replace(" SPA", "")
    .replace(" S.A.", "")
    .replace(" S A", "")
    .replace("PRODUCTOS MEDICOS ", "");
}

function _buildChartData(evolucion: EvolRow[], lbf: any[], tipoFilter: string): any[] {
  // Get unique months
  const allMeses = [...new Set(evolucion.map(e => e.mes))].sort();

  // Top providers by total monto
  const provMonto: Record<string, number> = {};
  evolucion.forEach(e => {
    const short = _shortName(e.proveedor);
    provMonto[short] = (provMonto[short] || 0) + e.monto;
  });
  const topProvs = Object.entries(provMonto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);

  // Build chart rows
  return allMeses.map(mes => {
    const row: any = { mes: mes.slice(5) }; // "04" from "2026-04"
    const mesLabel = mes;

    // LBF
    const lbfRow = lbf.find(l => l.mes === mesLabel);
    if (lbfRow) row["LBF"] = lbfRow.precio_prom;

    // Competitors
    evolucion
      .filter(e => e.mes === mesLabel)
      .forEach(e => {
        const short = _shortName(e.proveedor);
        if (topProvs.includes(short) || ["HOSPITALIA", "FLEXING", "MADEGOM", "REUTTER", "GBG"].includes(short)) {
          row[short] = e.precio_prom;
        }
      });

    return row;
  });
}

function _buildProviderTable(evolucion: EvolRow[], tipoFilter: string): { proveedor: string; precios: Record<string, number>; variacion: number | null }[] {
  const meses = [...new Set(evolucion.map(e => e.mes))].sort();
  const provData: Record<string, Record<string, number>> = {};

  evolucion.forEach(e => {
    const short = _shortName(e.proveedor);
    if (!provData[short]) provData[short] = {};
    provData[short][e.mes] = e.precio_prom;
  });

  // Sort by latest month monto
  const sorted = Object.entries(provData)
    .map(([prov, precios]) => {
      const vals = meses.map(m => precios[m]).filter(Boolean);
      const first = vals[0];
      const last = vals[vals.length - 1];
      const variacion = first && last ? ((last / first) - 1) * 100 : null;
      return { proveedor: prov, precios, variacion: variacion ?? 0 };
    })
    .sort((a, b) => {
      // LBF first, then by variacion desc
      if (a.proveedor === "LBF") return -1;
      if (b.proveedor === "LBF") return 1;
      return (b.variacion ?? 0) - (a.variacion ?? 0);
    })
    .slice(0, 15);

  return sorted;
}

function _getTopProviders(evolucion: EvolRow[]): string[] {
  const provs = new Set(evolucion.map(e => e.proveedor));
  return [...provs];
}
