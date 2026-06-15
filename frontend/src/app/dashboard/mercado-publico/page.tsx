"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { api } from "@/lib/api";

/* ─── Estilos compartidos ─────────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "16px 20px",
};
const thS: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  fontSize: 12,
  borderBottom: "2px solid #E2E8F0",
  whiteSpace: "nowrap",
  background: "#F8FAFC",
};
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const tdS: React.CSSProperties = {
  padding: "7px 12px",
  color: "#1F2937",
  fontSize: 13,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #F1F5F9",
};
const tdR: React.CSSProperties = {
  ...tdS,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const rowBg = (i: number): React.CSSProperties => ({
  background: i % 2 === 0 ? "white" : "#FAFBFC",
});

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const YEARS = [2026, 2025, 2024, 2023];
const TIPOS = [
  { id: "",   label: "Todos" },
  { id: "SE", label: "SE" },
  { id: "LE", label: "LE" },
  { id: "LP", label: "LP" },
  { id: "LQ", label: "LQ" },
  { id: "LR", label: "LR" },
  { id: "TD", label: "TD" },
  { id: "AG", label: "AG" },
];
const CATS = [
  { id: "",    label: "Todos" },
  { id: "SQ",  label: "SQ" },
  { id: "EVA", label: "EVA" },
  { id: "MAH", label: "MAH" },
  { id: "EQM", label: "EQM" },
];
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

/* ─── Formateadores ───────────────────────────────────────────────────────── */
function fmtCLP(n: number): string {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function fmtM(n: number): string {
  if (!n && n !== 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}MM`;
  if (abs >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  return fmtCLP(n);
}
function fmtN(n: number): string {
  return n != null ? n.toLocaleString("es-CL") : "0";
}
function pct(n: number): string {
  return n != null ? `${n.toFixed(1)}%` : "—";
}

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface Lbf {
  ids_participadas: number;
  ids_adjudicadas: number;
  ofertas_realizadas: number;
  ofertas_con_precio: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  efectividad_items: number;
  efectividad_lics: number;
  part_ids: number;
  part_valor: number;
  total_adj_prev: number;
  adj_from_prev_pub: number;
}
interface Mercado {
  ids_total: number;
  items_total: number;
  valor_total: number;
  valor_total_prev: number;
}
interface ClienteCat {
  categoria: string;
  monto_adj: number;
  pct: number;
}
interface Comp {
  competidor: string;
  rut: string;
  ids_part: number;
  ofertas: number;
  ofertas_adj: number;
  ids_adj: number;
  total_adj: number;
  total_ofertado: number;
  lbf_adj_compartido: number;
  efectividad: number;
  part_valor: number;
}
interface PorTipo {
  tipo: string;
  ids_adj: number;
  total_adj: number;
}
interface TipoAdj { tipo: string; adj: number; }
interface MesEvo {
  mes: string;
  mes_num: number;
  total_adj: number;
  tipos: TipoAdj[];
}
interface Data {
  ano: number;
  tipo: string;
  lbf: Lbf;
  mercado: Mercado;
  top20: Comp[];
  por_tipo: PorTipo[];
}
interface Cliente {
  organismo: string;
  ids_part: number;
  ids_adj: number;
  ofertas: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  total_no_adj: number;
  pct_adj: number;
  pct_ef: number;
}
interface RegionData {
  region: string;
  ids_part: number;
  ids_adj: number;
  ofertas: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  pct_adj: number;
  pct_of: number;
}

/* ─── Nuevas interfaces ───────────────────────────────────────────────────── */
interface EvoMes {
  mes: number;
  mes_nom: string;
  ids_part: number;
  ids_adj: number;
  efectividad: number;
  total_adj: number;
  total_adj_prev: number;
}

interface Perdido {
  codigo: string;
  licitacion: string;
  organismo: string;
  producto: string;
  tipo: string;
  lbf_precio: number;
  ganador_precio: number;
  diferencia_pct: number;
  ganador_nombre: string;
  ganador_rut: string;
  item_id: number;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  url_acta: string;
}
interface PerdidoOferente {
  rut: string;
  nombre: string;
  precio_total: number;
  precio_unitario: number;
  cantidad_ofertada: number;
  monto_adj: number;
  seleccionada: boolean;
  estado: string;
  fecha_envio: string;
}
interface PerdidoCriterio {
  nombre: string;
  ponderacion: string;
  ponderacion_num: number | null;
  observaciones: string;
  es_precio: boolean;
}
interface ActaAnalisis {
  criterios: PerdidoCriterio[];
  lbf_admisible: boolean | null;
  lbf_causal: string | null;
  razon_perdida: string | null;
  error?: string;
}
interface PerdidoDetalle {
  item: {
    nombre_producto: string;
    descripcion: string;
    cantidad: number;
    unidad_medida: string;
    url_acta: string;
    acta_numero: string;
    acta_fecha: string;
    licitacion: string;
    codigo: string;
    organismo: string;
  };
  oferentes: PerdidoOferente[];
  analisis: string[];
  criterios: PerdidoCriterio[];
}

/* ─── Componentes auxiliares ─────────────────────────────────────────────── */
function PartBar({ pct: p }: { pct: number }) {
  const color = p >= 10 ? "#2563EB" : p >= 3 ? "#60A5FA" : "#BFDBFE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 80, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(p, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
        {p.toFixed(1)}%
      </span>
    </div>
  );
}

function KpiCard({ title, value, sub, color }: {
  title: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 155 }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "#0F172A" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}>
        Cargando...
      </td>
    </tr>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}>
        {msg ?? "Sin datos"}
      </td>
    </tr>
  );
}

const TIPO_PALETTE: Record<string, string> = {
  LR: "#2563EB", LP: "#7C3AED", LQ: "#059669",
  LE: "#D97706", L1: "#DC2626", SE: "#0891B2",
  TD: "#9333EA", AG: "#EA580C", "?": "#94A3B8",
};
function tipoColor(t: string) { return TIPO_PALETTE[t] ?? "#94A3B8"; }

/* ─── Sub-tab Competencia ────────────────────────────────────────────────── */
function TabCompetencia({
  data, ano, tipo, mat, clientes,
}: {
  data: Data;
  ano: number;
  tipo: string;
  mat: boolean;
  clientes: Cliente[] | null;
}) {
  const lbf = data?.lbf;
  const [showExtra, setShowExtra] = useState(false);

  if (!lbf) return (
    <div style={{ color: "#94A3B8", padding: 32, textAlign: "center" }}>
      Sin datos de participación LBF.
    </div>
  );

  const lbfEf = lbf.efectividad_lics;

  // Calcular insight chips
  const mejorOrganismo = clientes && clientes.length > 0
    ? clientes[0]
    : null;
  const tipoLider = data.por_tipo && data.por_tipo.length > 0
    ? data.por_tipo[0]
    : null;
  const totalTipoAdj = (data.por_tipo ?? []).reduce((s, t) => s + t.total_adj, 0);
  const tipoLiderPct = tipoLider && totalTipoAdj > 0
    ? (tipoLider.total_adj / totalTipoAdj) * 100
    : 0;

  return (
    <>
      {/* ── 3 tarjetas principales ─────────────────────────────────────────── */}
      {(() => {
        const mktDelta = data.mercado.valor_total_prev > 0
          ? ((data.mercado.valor_total - data.mercado.valor_total_prev) / data.mercado.valor_total_prev) * 100
          : null;
        const adjDelta = lbf.total_adj_prev > 0
          ? ((lbf.total_adj - lbf.total_adj_prev) / lbf.total_adj_prev) * 100
          : null;
        const deltaStyle = (d: number | null): React.CSSProperties => ({
          fontSize: 12, fontWeight: 700,
          color: d === null ? "#94A3B8" : d >= 0 ? "#059669" : "#EF4444",
          marginLeft: 6,
        });
        const deltaLabel = (d: number | null) =>
          d === null ? "" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}% vs ${mat ? "12M ant." : data.ano - 1}`;
        const pctMercado = data.mercado.valor_total > 0
          ? (lbf.total_participado / data.mercado.valor_total) * 100 : 0;
        const pctPart = lbf.total_participado > 0
          ? (lbf.total_adj / lbf.total_participado) * 100 : 0;
        const pctMkt = data.mercado.valor_total > 0
          ? (lbf.total_adj / data.mercado.valor_total) * 100 : 0;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ ...card, borderTop: "3px solid #64748B" }}>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Mercado total insumos médicos
              </div>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                  {fmtCLP(data.mercado.valor_total)}
                </div>
                <span style={deltaStyle(mktDelta)}>{deltaLabel(mktDelta)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                {fmtN(data.mercado.ids_total)} licitaciones adjudicadas · {mat ? "Año Móvil" : data.ano}
              </div>
              {data.mercado.valor_total_prev > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {data.ano - 1}: {fmtCLP(data.mercado.valor_total_prev)}
                </div>
              )}
            </div>

            <div style={{ ...card, borderTop: "3px solid #2563EB" }}>
              <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                LBF participó
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#2563EB", fontVariantNumeric: "tabular-nums" }}>
                {fmtCLP(lbf.total_participado)}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, marginBottom: 8 }}>
                {fmtN(lbf.ids_participadas)} licitaciones · {pctMercado.toFixed(1)}% del mercado
              </div>
              <div style={{ height: 6, background: "#EFF6FF", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(pctMercado, 100)}%`, height: "100%", background: "#2563EB", borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ ...card, borderTop: "3px solid #059669" }}>
              <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                LBF adjudicó
              </div>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
                  {fmtCLP(lbf.total_adj)}
                </div>
                <span style={deltaStyle(adjDelta)}>{deltaLabel(adjDelta)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, marginBottom: 8 }}>
                {pctPart.toFixed(1)}% de lo participado · {pctMkt.toFixed(1)}% del mercado
              </div>
              <div style={{ height: 6, background: "#F0FDF4", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(pctPart, 100)}%`, height: "100%", background: "#059669", borderRadius: 3 }} />
              </div>
              {lbf.adj_from_prev_pub > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                  {fmtCLP(lbf.adj_from_prev_pub)} provienen de lics publicadas en {data.ano - 1}
                  {" "}({lbf.total_adj > 0 ? ((lbf.adj_from_prev_pub / lbf.total_adj) * 100).toFixed(1) : 0}%)
                </div>
              )}
              {lbf.total_adj_prev > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {data.ano - 1}: {fmtCLP(lbf.total_adj_prev)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Métricas secundarias ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard title="Lics. participadas" value={fmtN(lbf.ids_participadas)} sub={`de ${fmtN(data.mercado.ids_total)} en el mercado`} color="#2563EB" />
        <KpiCard title="Lics. adjudicadas" value={fmtN(lbf.ids_adjudicadas)} sub={`efectividad: ${pct(lbf.efectividad_lics)}`} color="#059669" />
        <KpiCard title="MS% valor" value={pct(lbf.part_valor)} sub="LBF adj / mercado adj" color="#7C3AED" />
        <KpiCard title="Efectividad lics." value={pct(lbfEf)} sub="lics. adj / lics. participadas" color="#D97706" />
        <KpiCard title="Efectividad ítems" value={pct(lbf.efectividad_items)} sub="ítems adj / ítems ofertados" color="#0891B2" />
      </div>

      {/* ── Resumen ejecutivo (reemplaza funnel) ─────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 200,
          background: "#F0F9FF", border: "1px solid #BAE6FD",
          borderRadius: 8, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <div>
            <div style={{ fontSize: 11, color: "#0369A1", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Mejor organismo
            </div>
            <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600, marginTop: 2 }}>
              {mejorOrganismo
                ? `${mejorOrganismo.organismo.length > 30 ? mejorOrganismo.organismo.slice(0, 30) + "…" : mejorOrganismo.organismo} · ${fmtM(mejorOrganismo.total_adj)}`
                : "—"}
            </div>
          </div>
        </div>

        <div style={{
          flex: 1, minWidth: 200,
          background: "#F5F3FF", border: "1px solid #DDD6FE",
          borderRadius: 8, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <div>
            <div style={{ fontSize: 11, color: "#6D28D9", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Tipo líder
            </div>
            <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600, marginTop: 2 }}>
              {tipoLider
                ? `${tipoLider.tipo} · ${tipoLiderPct.toFixed(1)}% del adj.`
                : "—"}
            </div>
          </div>
        </div>

        <div style={{
          flex: 1, minWidth: 200,
          background: "#F0FDF4", border: "1px solid #BBF7D0",
          borderRadius: 8, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📈</span>
          <div>
            <div style={{ fontSize: 11, color: "#15803D", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Efectividad
            </div>
            <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600, marginTop: 2 }}>
              {pct(lbf.efectividad_items)} ítems · {pct(lbfEf)} lics.
            </div>
          </div>
        </div>
      </div>

      {/* ── Dos gráficos lado a lado ──────────────────────────────────────── */}
      {(() => {
        const PALETTE = [
          "#2563EB", "#7C3AED", "#059669", "#D97706",
          "#DC2626", "#0891B2", "#9333EA", "#EA580C",
          "#16A34A", "#CA8A04", "#BE185D", "#0284C7",
        ];
        const compRows = [
          { nombre: "LBF (tú)", adj: lbf.total_adj, isLbf: true },
          ...data.top20.slice(0, 11).map((c) => ({ nombre: c.competidor, adj: c.total_adj, isLbf: false })),
        ];
        const maxMs = lbf.total_participado > 0
          ? Math.max(...compRows.map((r) => r.adj / lbf.total_participado * 100))
          : 1;
        const porTipo = data.por_tipo ?? [];
        const totalTipo = porTipo.reduce((s, t) => s + t.total_adj, 0);

        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={card}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>MS% sobre total participado LBF</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>base {fmtCLP(lbf.total_participado)}</div>
              </div>
              {compRows.map((row, i) => {
                const pctVal = lbf.total_participado > 0 ? (row.adj / lbf.total_participado) * 100 : 0;
                const barW = maxMs > 0 ? (pctVal / maxMs) * 100 : 0;
                const color = row.isLbf ? "#2563EB" : PALETTE[(i - 1 + PALETTE.length) % PALETTE.length];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 4, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <div style={{ width: 140, fontSize: 12, color: row.isLbf ? "#2563EB" : "#374151", fontWeight: row.isLbf ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                      {row.nombre}
                    </div>
                    <div style={{ flex: 1, height: 14, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${barW}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease", opacity: row.isLbf ? 1 : 0.75 }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: row.isLbf ? 700 : 400, color: row.isLbf ? "#2563EB" : "#374151", fontVariantNumeric: "tabular-nums" }}>
                        {pctVal.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 10, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCLP(row.adj)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Por tipo de licitación</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{fmtCLP(totalTipo)}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>total adj.</div>
              </div>
              {(() => {
                if (porTipo.length === 0) return <div style={{ color: "#94A3B8", fontSize: 13 }}>Sin datos</div>;
                const maxAdj = Math.max(...porTipo.map((t) => t.total_adj), 1);
                const vals = porTipo.map((t) => ({
                  pctVal: totalTipo > 0 ? (t.total_adj / totalTipo) * 100 : 0,
                  barPct: (t.total_adj / maxAdj) * 100,
                  color:  tipoColor(t.tipo),
                }));
                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "auto", minHeight: 0 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: porTipo.length * 110 }}>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0, marginBottom: 6 }}>
                        {porTipo.map((t, i) => (
                          <div key={i} style={{ flex: 1, minWidth: 90, textAlign: "center" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: vals[i].color, whiteSpace: "nowrap" }}>{fmtCLP(t.total_adj)}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{vals[i].pctVal.toFixed(1)}%</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{fmtN(t.ids_adj)} lics.</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "flex-end", minHeight: 0 }}>
                        {porTipo.map((t, i) => (
                          <div key={i} style={{ flex: 1, minWidth: 80, height: `${vals[i].barPct}%`, minHeight: t.total_adj > 0 ? 4 : 0 }}>
                            <div style={{ width: "100%", height: "100%", background: vals[i].color, borderRadius: "5px 5px 0 0", transition: "height 0.5s ease" }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexShrink: 0 }}>
                        {porTipo.map((t, i) => (
                          <div key={i} style={{ flex: 1, minWidth: 80, textAlign: "center", fontSize: 13, fontWeight: 800, color: vals[i].color }}>{t.tipo}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── Tabla competidores (compacta + toggle) ────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Competidores</span>
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
              top 20 en licitaciones donde LBF participó · {mat ? "Año Móvil" : data.ano}
            </span>
          </div>
          <button
            onClick={() => setShowExtra((v) => !v)}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #CBD5E1",
              background: showExtra ? "#F1F5F9" : "white",
              color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            {showExtra ? "Ver menos ▲" : "Ver más ▼"}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 32 }}>#</th>
                <th style={thS}>Proveedor</th>
                <th style={thR}>Monto Adj.</th>
                <th style={{ ...thR, color: "#2563EB" }}>LBF adj. en sus lics.</th>
                <th style={{ ...thR, color: "#059669" }}>% Ef. Lics.</th>
                <th style={thR}>Lics. Part.</th>
                <th style={thR}>Lics. Adj.</th>
                <th style={{ ...thR, color: "#0891B2" }}>% Ef. Ítems</th>
                {showExtra && <>
                  <th style={{ ...thR, borderLeft: "2px solid #E2E8F0" }}>Monto Ofertado</th>
                  <th style={thR}>Ítems Ofert.</th>
                  <th style={thR}>Ítems Adj.</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {/* Fila LBF destacada */}
              <tr style={{ background: "#EFF6FF", borderBottom: "2px solid #BFDBFE" }}>
                <td style={{ ...tdS, color: "#2563EB", fontWeight: 700 }}>★</td>
                <td style={{ ...tdS, fontWeight: 700, color: "#2563EB" }}>LBF (tú)</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmtCLP(lbf.total_adj)}</td>
                <td style={{ ...tdR, fontWeight: 700, color: "#2563EB" }}>—</td>
                <td style={{ ...tdR, fontWeight: 700, color: "#059669" }}>{pct(lbfEf)}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(lbf.ids_participadas)}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(lbf.ids_adjudicadas)}</td>
                <td style={{ ...tdR, fontWeight: 700, color: "#0891B2" }}>{pct(lbf.efectividad_items)}</td>
                {showExtra && <>
                  <td style={{ ...tdR, fontWeight: 700, borderLeft: "2px solid #E2E8F0" }}>{fmtCLP(lbf.total_participado)}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(lbf.ofertas_realizadas)}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(lbf.ofertas_adj)}</td>
                </>}
              </tr>

              {data.top20.map((c, i) => {
                const cEfItems = c.ofertas > 0 ? (c.ofertas_adj / c.ofertas) * 100 : 0;
                const cEfLics  = c.ids_part > 0 ? (c.ids_adj / c.ids_part) * 100 : 0;
                return (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>{i + 1}</td>
                    <td style={tdS}>{c.competidor}</td>
                    <td style={tdR}>{fmtCLP(c.total_adj)}</td>
                    <td style={{ ...tdR, color: "#2563EB", fontWeight: 600 }}>{fmtCLP(c.lbf_adj_compartido)}</td>
                    <td style={{ ...tdR, color: cEfLics >= lbfEf ? "#059669" : cEfLics >= lbfEf * 0.7 ? "#D97706" : "#374151" }}>
                      {pct(cEfLics)}
                    </td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
                    <td style={{ ...tdR, color: "#0891B2", fontWeight: cEfItems >= lbf.efectividad_items ? 700 : 400 }}>
                      {c.ofertas > 0 ? pct(cEfItems) : "—"}
                    </td>
                    {showExtra && <>
                      <td style={{ ...tdR, borderLeft: "2px solid #F1F5F9" }}>{fmtCLP(c.total_ofertado)}</td>
                      <td style={tdR}>{fmtN(c.ofertas)}</td>
                      <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ─── Sub-tab Clientes ───────────────────────────────────────────────────── */
function TabClientes({
  clientes, loading, error, ano, tipo,
}: {
  clientes: Cliente[] | null;
  loading: boolean;
  error: string | null;
  ano: number;
  tipo: string;
}) {
  const maxAdj = clientes ? Math.max(...clientes.map((c) => c.total_adj), 1) : 1;
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [catData, setCatData]       = useState<Record<string, ClienteCat[]>>({});
  const [catLoading, setCatLoading] = useState<string | null>(null);

  const handleRowClick = useCallback((organismo: string) => {
    if (expanded === organismo) { setExpanded(null); return; }
    setExpanded(organismo);
    if (catData[organismo]) return;
    setCatLoading(organismo);
    const params = new URLSearchParams({ organismo, ano: String(ano), tipo });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/mercado-publico/clientes-categorias?${params}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${localStorage.getItem("lbf_token") || ""}` },
    })
      .then((r) => r.json())
      .then((r) => setCatData((prev) => ({ ...prev, [organismo]: Array.isArray(r) ? r : [] })))
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setCatLoading(null); });
  }, [expanded, catData, ano, tipo]);

  const totalAdj = clientes ? clientes.reduce((s, c) => s + c.total_adj, 0) : 0;

  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Top 30 Organismos Compradores</span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
          por monto adjudicado a LBF · clic para ver categorías
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: 32 }}>#</th>
              <th style={thS}>Organismo</th>
              <th style={{ ...thR, color: "#059669" }}><span title="Monto adjudicado a LBF / Monto total ofertado por LBF">% Éxito ($)</span></th>
              <th style={{ ...thR, color: "#2563EB" }}><span title="Licitaciones donde LBF fue adjudicado / Licitaciones donde LBF participó">% Éxito Lics.</span></th>
              <th style={thR}>Monto Ofertado</th>
              <th style={thR}>Monto Adj. LBF</th>
              <th style={{ ...thR, color: "#EF4444" }}>Monto No Adj.</th>
              <th style={thR}>Ítems Ofertados</th>
              <th style={thR}>Ítems Adj.</th>
              <th style={thR}>Lics. Part.</th>
              <th style={thR}>Lics. Adj.</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={11} />}
            {!loading && error && (
              <tr><td colSpan={11} style={{ ...tdS, color: "#EF4444", textAlign: "center" }}>{error}</td></tr>
            )}
            {!loading && !error && clientes && clientes.length === 0 && (
              <EmptyRow cols={11} msg="Sin datos para los filtros seleccionados" />
            )}
            {!loading && !error && clientes && clientes.map((c, i) => {
              const barW = totalAdj > 0 ? (c.total_adj / totalAdj) * 100 : 0;
              const isExp = expanded === c.organismo;
              return (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => handleRowClick(c.organismo)}
                    style={{ ...rowBg(i), cursor: "pointer", outline: isExp ? "2px solid #2563EB" : "none", outlineOffset: -1 }}
                    title="Clic para ver desglose por categoría"
                  >
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...tdS, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", color: isExp ? "#2563EB" : undefined, fontWeight: isExp ? 700 : undefined }}>
                      {c.organismo}
                    </td>
                    <td style={{ ...tdR, color: c.pct_adj >= 30 ? "#059669" : c.pct_adj >= 10 ? "#D97706" : "#374151" }}>
                      <PartBar pct={c.pct_adj} />
                    </td>
                    <td style={{ ...tdR, color: c.pct_ef >= 20 ? "#059669" : c.pct_ef >= 10 ? "#D97706" : "#374151" }}>
                      {pct(c.pct_ef)}
                    </td>
                    <td style={tdR}>{fmtCLP(c.total_participado)}</td>
                    <td style={tdR}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <div style={{ width: 60, height: 4, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${barW}%`, height: "100%", background: "#2563EB", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCLP(c.total_adj)}</span>
                      </div>
                    </td>
                    <td style={{ ...tdR, color: "#EF4444" }}>{fmtCLP(c.total_no_adj)}</td>
                    <td style={tdR}>{fmtN(c.ofertas)}</td>
                    <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    <td style={{ ...tdR, color: "#0891B2" }}>
                      {c.ofertas > 0 ? pct((c.ofertas_adj / c.ofertas) * 100) : "—"}
                    </td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
                  </tr>
                  {isExp && (
                    <tr key={`${i}-cat`}>
                      <td colSpan={11} style={{ padding: "12px 24px", background: "#F0F7FF", borderBottom: "2px solid #BFDBFE" }}>
                        {catLoading === c.organismo ? (
                          <span style={{ fontSize: 12, color: "#94A3B8" }}>Cargando categorías…</span>
                        ) : catData[c.organismo] ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", marginBottom: 8 }}>
                              Desglose por categoría — {c.organismo}
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {catData[c.organismo].map((cat, ci) => (
                                <div key={ci} style={{ background: "white", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 14px", minWidth: 160 }}>
                                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {cat.categoria}
                                  </div>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: "#2563EB" }}>{cat.pct.toFixed(1)}%</div>
                                  <div style={{ fontSize: 11, color: "#64748B", fontVariantNumeric: "tabular-nums" }}>{fmtCLP(cat.monto_adj)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
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

/* ─── Sub-tab Región ─────────────────────────────────────────────────────── */
function TabRegion({ regiones, loading, error }: {
  regiones: RegionData[] | null;
  loading: boolean;
  error: string | null;
}) {
  const maxAdj = regiones ? Math.max(...regiones.map((r) => r.total_adj), 1) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Adjudicado por Región</span>
        </div>
        {loading && <div style={{ color: "#94A3B8", fontSize: 13, padding: "12px 0" }}>Cargando...</div>}
        {!loading && error && <div style={{ color: "#EF4444", fontSize: 13 }}>{error}</div>}
        {!loading && !error && regiones && regiones.length === 0 && <div style={{ color: "#94A3B8", fontSize: 13 }}>Sin datos</div>}
        {!loading && !error && regiones && regiones.map((r, i) => {
          const barW = maxAdj > 0 ? (r.total_adj / maxAdj) * 100 : 0;
          const color = i === 0 ? "#1D4ED8" : i < 3 ? "#2563EB" : i < 6 ? "#3B82F6" : "#93C5FD";
          return (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#374151", fontWeight: i === 0 ? 700 : 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.region}
                </span>
                <span style={{ fontSize: 12, color: "#374151", fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtCLP(r.total_adj)}{" "}
                  <span style={{ color: "#94A3B8" }}>({pct(r.pct_adj)} s.part.)</span>
                </span>
              </div>
              <div style={{ height: 20, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${barW}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}CC)`, borderRadius: 4, transition: "width 0.4s ease" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Detalle por Región</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 32 }}>#</th>
                <th style={thS}>Región</th>
                <th style={thR}>Ids Part.</th>
                <th style={thR}>Ids Adj.</th>
                <th style={thR}>Total Part.</th>
                <th style={thR}>Total Adj.</th>
                <th style={thR}>% S.Part.</th>
                <th style={thR}>% Efect. Items</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow cols={8} />}
              {!loading && error && (
                <tr><td colSpan={8} style={{ ...tdS, color: "#EF4444", textAlign: "center" }}>{error}</td></tr>
              )}
              {!loading && !error && regiones && regiones.map((r, i) => (
                <tr key={i} style={rowBg(i)}>
                  <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...tdS, fontWeight: i === 0 ? 700 : 400 }}>{r.region}</td>
                  <td style={tdR}>{fmtN(r.ids_part)}</td>
                  <td style={tdR}>{fmtN(r.ids_adj)}</td>
                  <td style={tdR}>{fmtCLP(r.total_participado)}</td>
                  <td style={{ ...tdR, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "#2563EB" : "#1F2937" }}>
                    {fmtCLP(r.total_adj)}
                  </td>
                  <td style={tdR}>{pct(r.pct_adj)}</td>
                  <td style={{ ...tdR, color: r.pct_of >= 20 ? "#059669" : r.pct_of >= 10 ? "#D97706" : "#374151" }}>
                    {pct(r.pct_of)}
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

/* ─── Sub-tab Evolución ──────────────────────────────────────────────────── */
function TabEvolucion({ evolucion, loading, error }: {
  evolucion: EvoMes[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return (
    <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 48 }}>
      Cargando evolución mensual...
    </div>
  );
  if (error) return (
    <div style={{ ...card, color: "#EF4444" }}>Error: {error}</div>
  );
  if (!evolucion || evolucion.length === 0) return (
    <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 48 }}>Sin datos</div>
  );

  // Tooltip personalizado para recharts
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: 2 }}>
            {p.name}: {p.name === "Efectividad %" ? `${p.value.toFixed(1)}%` : fmtCLP(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Gráfico de barras + línea */}
      <div style={{ ...card }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Adjudicado mensual LBF</span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>barras = monto adj. · línea = % efectividad licitaciones</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={evolucion} margin={{ top: 10, right: 48, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis
              dataKey="mes_nom"
              tick={{ fontSize: 12, fill: "#64748B" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={(v: number) => fmtM(v)}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#F97316" }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Bar
              yAxisId="left"
              dataKey="total_adj"
              name="Monto Adj."
              fill="#2563EB"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="efectividad"
              name="Efectividad %"
              stroke="#F97316"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#F97316", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla mensual */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Detalle mensual</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Mes</th>
                <th style={thR}>Lics. Part.</th>
                <th style={thR}>Lics. Adj.</th>
                <th style={{ ...thR, color: "#F97316" }}>% Ef. Lics.</th>
                <th style={{ ...thR, color: "#2563EB" }}>Monto Adj.</th>
                <th style={thR}>vs Año Ant.</th>
              </tr>
            </thead>
            <tbody>
              {evolucion.map((row, i) => {
                const vsAnt = row.total_adj_prev > 0
                  ? ((row.total_adj - row.total_adj_prev) / row.total_adj_prev) * 100
                  : null;
                return (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, fontWeight: 600 }}>{row.mes_nom}</td>
                    <td style={tdR}>{fmtN(row.ids_part)}</td>
                    <td style={tdR}>{fmtN(row.ids_adj)}</td>
                    <td style={{ ...tdR, color: row.efectividad >= 30 ? "#059669" : row.efectividad >= 15 ? "#D97706" : "#374151", fontWeight: 600 }}>
                      {pct(row.efectividad)}
                    </td>
                    <td style={{ ...tdR, color: "#2563EB", fontWeight: 600 }}>{fmtCLP(row.total_adj)}</td>
                    <td style={{ ...tdR, color: vsAnt === null ? "#94A3B8" : vsAnt >= 0 ? "#059669" : "#EF4444", fontWeight: vsAnt !== null ? 600 : 400 }}>
                      {vsAnt === null ? "—" : `${vsAnt >= 0 ? "▲" : "▼"} ${Math.abs(vsAnt).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-tab Perdidos ───────────────────────────────────────────────────── */
function analisisBadge(line: string) {
  const [tipo, texto] = line.split("|");
  const cfg: Record<string, { bg: string; color: string; icon: string }> = {
    OFERTA_OK:       { bg: "#F0FDF4", color: "#166534", icon: "✓" },
    OFERTA_WARN:     { bg: "#FEF9C3", color: "#854D0E", icon: "!" },
    PRECIO_ALTO:     { bg: "#FEF2F2", color: "#991B1B", icon: "↑↑" },
    PRECIO_MEDIO:    { bg: "#FFF7ED", color: "#9A3412", icon: "↑" },
    PRECIO_BAJO:     { bg: "#EFF6FF", color: "#1E40AF", icon: "~" },
    ACTA:            { bg: "#F5F3FF", color: "#5B21B6", icon: "→" },
    CRITERIO_PRECIO: { bg: "#FFF7ED", color: "#7C3AED", icon: "%" },
  };
  const s = cfg[tipo] ?? { bg: "#F8FAFC", color: "#374151", icon: "·" };
  return (
    <div key={line} style={{ display: "flex", gap: 8, alignItems: "flex-start",
      background: s.bg, borderRadius: 6, padding: "8px 12px", marginBottom: 6 }}>
      <span style={{ fontWeight: 800, color: s.color, minWidth: 20, fontSize: 13 }}>{s.icon}</span>
      <span style={{ fontSize: 12, color: s.color, lineHeight: 1.5 }}>{texto}</span>
    </div>
  );
}

function TabPerdidos({ perdidos, loading, error }: {
  perdidos: Perdido[] | null;
  loading: boolean;
  error: string | null;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Record<number, PerdidoDetalle>>({});
  const [loadingDet, setLoadingDet] = useState<number | null>(null);
  const [acta, setActa] = useState<Record<number, ActaAnalisis>>({});
  const [loadingActa, setLoadingActa] = useState<number | null>(null);

  const sorted = perdidos
    ? [...perdidos]
        .filter((r, idx, arr) => arr.findIndex(x => x.item_id === r.item_id) === idx)
        .sort((a, b) => b.diferencia_pct - a.diferencia_pct)
    : null;

  const totalItems   = sorted?.length ?? 0;
  const montoEnJuego = sorted?.reduce((s, r) => s + r.lbf_precio, 0) ?? 0;
  const avgDif       = sorted && sorted.length > 0
    ? sorted.reduce((s, r) => s + r.diferencia_pct, 0) / sorted.length : 0;

  function toggleRow(row: Perdido) {
    if (expandedId === row.item_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.item_id);
    // Fetch item detail
    if (!detalle[row.item_id]) {
      setLoadingDet(row.item_id);
      api.get(`/api/mercado-publico/perdidos-detalle?item_id=${row.item_id}`)
        .then((r) => {
          const d = r as PerdidoDetalle;
          setDetalle(prev => ({ ...prev, [row.item_id]: d }));
          // Also fetch acta analysis if there's an acta URL
          if (d?.item?.url_acta && !acta[row.item_id]) {
            setLoadingActa(row.item_id);
            api.get(`/api/mercado-publico/perdidos-acta?acta_url=${encodeURIComponent(d.item.url_acta)}`)
              .then((a) => setActa(prev => ({ ...prev, [row.item_id]: a as ActaAnalisis })))
              .catch(() => {})
              .finally(() => setLoadingActa(null));
          }
        })
        .catch(() => setDetalle(prev => ({ ...prev, [row.item_id]: { item: {} as PerdidoDetalle["item"], oferentes: [], analisis: [], criterios: [] } })))
        .finally(() => setLoadingDet(null));
    } else if (detalle[row.item_id]?.item?.url_acta && !acta[row.item_id]) {
      // Already have detail but not acta yet
      const url = detalle[row.item_id].item.url_acta;
      setLoadingActa(row.item_id);
      api.get(`/api/mercado-publico/perdidos-acta?acta_url=${encodeURIComponent(url)}`)
        .then((a) => setActa(prev => ({ ...prev, [row.item_id]: a as ActaAnalisis })))
        .catch(() => {})
        .finally(() => setLoadingActa(null));
    }
  }

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 48 }}>
        Cargando licitaciones perdidas...
      </div>
    </div>
  );
  if (error) return (
    <div style={{ ...card, color: "#EF4444" }}>Error: {error}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Badge explicativo */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#FEF2F2", border: "1px solid #FECACA",
        borderRadius: 8, padding: "10px 16px",
      }}>
        <span style={{ fontSize: 18 }}>🔴</span>
        <span style={{ fontSize: 13, color: "#991B1B", fontWeight: 600 }}>
          Licitaciones donde LBF ofertó el precio más bajo pero NO fue adjudicado · Haz clic en una fila para ver todos los oferentes
        </span>
      </div>

      {/* KPI chips */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: 1, minWidth: 160, borderTop: "3px solid #EF4444" }}>
          <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Total ítems</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#EF4444" }}>{fmtN(totalItems)}</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 160, borderTop: "3px solid #D97706" }}>
          <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Monto en juego</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#D97706" }}>{fmtM(montoEnJuego)}</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 160, borderTop: "3px solid #7C3AED" }}>
          <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Diferencia promedio</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#7C3AED" }}>+{avgDif.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>el ganador cobró X% más que LBF</div>
        </div>
      </div>

      {/* Tabla */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Detalle de ítems perdidos</span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>clic en fila para ver todos los oferentes</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 28 }} />
                <th style={{ ...thS, maxWidth: 190 }}>Organismo</th>
                <th style={{ ...thS, maxWidth: 220 }}>Licitación</th>
                <th style={thS}>Tipo</th>
                <th style={{ ...thR, color: "#059669" }}>Precio LBF</th>
                <th style={{ ...thR, color: "#EF4444" }}>Precio Ganador</th>
                <th style={{ ...thR, color: "#7C3AED" }}>Diferencia %</th>
                <th style={thS}>Quién ganó</th>
                <th style={thS}>Código</th>
              </tr>
            </thead>
            <tbody>
              {(!sorted || sorted.length === 0) && (
                <EmptyRow cols={9} msg="Sin licitaciones perdidas para los filtros seleccionados" />
              )}
              {sorted && sorted.map((row, i) => {
                const isExp = expandedId === row.item_id;
                const isLoadingThis = loadingDet === row.item_id;
                const rowDetail = detalle[row.item_id];
                const rowActa = acta[row.item_id];
                const isLoadingActa = loadingActa === row.item_id;
                // Merge criterios: prefer acta-parsed over fichas_extra
                const criteriosDisplay = (rowActa?.criterios?.length ?? 0) > 0
                  ? rowActa!.criterios : (rowDetail?.criterios ?? []);
                return (
                  <React.Fragment key={row.item_id}>
                    <tr
                      style={{
                        ...rowBg(i),
                        cursor: "pointer",
                        borderLeft: isExp ? "3px solid #EF4444" : "3px solid transparent",
                      }}
                      onClick={() => toggleRow(row)}
                    >
                      <td style={{ ...tdS, width: 28, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                        {isLoadingThis ? "⏳" : isExp ? "▼" : "▶"}
                      </td>
                      <td style={{ ...tdS, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.organismo}>
                        {row.organismo}
                      </td>
                      <td style={{ ...tdS, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.licitacion}>
                        {row.licitacion}
                      </td>
                      <td style={tdS}>
                        <span style={{
                          background: `${tipoColor(row.tipo)}18`, color: tipoColor(row.tipo),
                          borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700,
                        }}>
                          {row.tipo}
                        </span>
                      </td>
                      <td style={{ ...tdR, color: "#059669", fontWeight: 700 }}>{fmtCLP(row.lbf_precio)}</td>
                      <td style={{ ...tdR, color: "#EF4444" }}>{fmtCLP(row.ganador_precio)}</td>
                      <td style={{ ...tdR, color: "#7C3AED", fontWeight: 700 }}>+{row.diferencia_pct.toFixed(1)}%</td>
                      <td style={{ ...tdS, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={row.ganador_nombre}>
                        {row.ganador_nombre}
                      </td>
                      <td style={tdS}>
                        <a
                          href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${row.codigo}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "#2563EB", fontSize: 12, textDecoration: "none", fontFamily: "monospace" }}
                        >
                          {row.codigo} ↗
                        </a>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${row.item_id}-det`}>
                        <td colSpan={9} style={{ background: "#FAFAFA", borderBottom: "2px solid #EF4444", padding: 0 }}>
                          {isLoadingThis || !rowDetail ? (
                            <div style={{ padding: "16px 40px", color: "#94A3B8", fontSize: 12 }}>Cargando detalle...</div>
                          ) : !rowDetail.item ? (
                            <div style={{ padding: "16px 40px", color: "#EF4444", fontSize: 12 }}>
                              Error al cargar detalle. Intenta nuevamente o{" "}
                              <a href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${row.codigo}`}
                                target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB" }}>
                                ver en Mercado Público ↗
                              </a>
                            </div>
                          ) : (
                            <div style={{ padding: "16px 24px 20px 40px", display: "flex", flexDirection: "column", gap: 16 }}>

                              {/* Ficha producto */}
                              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ flex: 2, minWidth: 260 }}>
                                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Producto</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{rowDetail.item.nombre_producto}</div>
                                  {rowDetail.item.descripcion && (
                                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>{rowDetail.item.descripcion}</div>
                                  )}
                                </div>
                                <div style={{ minWidth: 100 }}>
                                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Cantidad</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                                    {rowDetail.item.cantidad} <span style={{ fontWeight: 400, color: "#64748B", fontSize: 12 }}>{rowDetail.item.unidad_medida}</span>
                                  </div>
                                </div>
                                {rowDetail.item.url_acta && (
                                  <div style={{ minWidth: 160 }}>
                                    <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Acta adjudicación</div>
                                    <a
                                      href={rowDetail.item.url_acta}
                                      target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700, textDecoration: "none",
                                        display: "inline-flex", alignItems: "center", gap: 4,
                                        background: "#F5F3FF", padding: "4px 10px", borderRadius: 6,
                                        border: "1px solid #DDD6FE" }}
                                    >
                                      N° {rowDetail.item.acta_numero} · {rowDetail.item.acta_fecha} ↗
                                    </a>
                                  </div>
                                )}
                              </div>

                              {/* Razón de pérdida desde el Acta */}
                              {rowActa?.lbf_admisible === false && rowActa.lbf_causal && (
                                <div style={{
                                  background: "#FEF2F2", border: "1px solid #FCA5A5",
                                  borderRadius: 8, padding: "12px 16px",
                                  display: "flex", gap: 12, alignItems: "flex-start",
                                }}>
                                  <span style={{ fontSize: 20, flexShrink: 0 }}>🚫</span>
                                  <div>
                                    <div style={{ fontWeight: 700, color: "#991B1B", fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      Razón real de la pérdida —{" "}
                                      <span style={{ fontFamily: "monospace", background: "#FCA5A5", borderRadius: 4, padding: "1px 6px", fontSize: 12 }}>{row.codigo}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.5 }}>
                                      {rowActa.lbf_causal}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 6, fontStyle: "italic" }}>
                                      LBF fue declarada <strong>inadmisible técnicamente</strong> antes de la evaluación por puntajes. Todos los ítems de esta licitación comparten la misma causal.
                                    </div>
                                  </div>
                                </div>
                              )}
                              {isLoadingActa && !rowActa && (
                                <div style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 6 }}>
                                  <div className="spinner-ring animate-spin-ring" style={{ width: 12, height: 12, borderWidth: 2, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
                                  Leyendo Acta de Adjudicación...
                                </div>
                              )}

                              {/* Criterios de evaluacion (bases) */}
                              <div>
                                <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                                  Criterios de evaluación (bases licitación)
                                  {isLoadingActa && <span style={{ marginLeft: 6, fontSize: 10, color: "#94A3B8" }}>cargando...</span>}
                                </div>
                              {criteriosDisplay.length > 0 ? (
                                <div>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#FAFAFA", borderRadius: 8, overflow: "hidden" }}>
                                    <thead>
                                      <tr style={{ background: "#F1F5F9" }}>
                                        <th style={{ ...thS, fontSize: 11 }}>Criterio</th>
                                        <th style={{ ...thS, fontSize: 11, width: 140 }}>Ponderación</th>
                                        <th style={{ ...thS, fontSize: 11 }}>Observaciones</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {criteriosDisplay.map((c, ci) => (
                                        <tr key={ci} style={{ background: c.es_precio ? "#FFFBEB" : ci % 2 === 0 ? "#FFFFFF" : "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                                          <td style={{ ...tdS, fontSize: 12, fontWeight: c.es_precio ? 700 : 500, color: c.es_precio ? "#7C3AED" : "#0F172A" }}>
                                            {c.es_precio && <span style={{ marginRight: 4, fontSize: 11 }}>💰</span>}
                                            {c.nombre}
                                          </td>
                                          <td style={{ ...tdS, fontSize: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                              <div style={{ width: 80, height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                                                <div style={{
                                                  width: `${Math.min(c.ponderacion_num ?? 0, 100)}%`,
                                                  height: "100%",
                                                  background: c.es_precio
                                                    ? (c.ponderacion_num ?? 0) <= 15 ? "#EF4444" : (c.ponderacion_num ?? 0) <= 40 ? "#F59E0B" : "#10B981"
                                                    : "#6366F1",
                                                  borderRadius: 4,
                                                }} />
                                              </div>
                                              <span style={{ fontWeight: 700, color: c.es_precio ? "#7C3AED" : "#374151", minWidth: 36 }}>
                                                {c.ponderacion}
                                              </span>
                                              {c.es_precio && c.ponderacion_num !== null && c.ponderacion_num <= 15 && (
                                                <span style={{ fontSize: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>bajo</span>
                                              )}
                                            </div>
                                          </td>
                                          <td style={{ ...tdS, fontSize: 11, color: "#64748B", maxWidth: 340 }}>
                                            {c.observaciones ? (
                                              <span title={c.observaciones} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                                {c.observaciones}
                                              </span>
                                            ) : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 10,
                                  background: "#F8FAFC", border: "1px dashed #CBD5E1",
                                  borderRadius: 8, padding: "10px 14px",
                                }}>
                                  <span style={{ fontSize: 18 }}>📄</span>
                                  <span style={{ fontSize: 12, color: "#64748B" }}>
                                    Los criterios de evaluación no están disponibles para esta licitación.
                                    {rowDetail.item.url_acta ? (
                                      <> Ver <a href={rowDetail.item.url_acta} target="_blank" rel="noopener noreferrer"
                                        style={{ color: "#7C3AED", fontWeight: 600 }}>Acta de Adjudicación</a> para los puntajes exactos por criterio.</>
                                    ) : " Consulta el expediente en Mercado Público para ver los puntajes por criterio."}
                                  </span>
                                </div>
                              )}
                              </div>

                              {/* Análisis automático */}
                              {rowDetail.analisis.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                                    Análisis de la pérdida
                                  </div>
                                  {rowDetail.analisis.map((line) => analisisBadge(line))}
                                </div>
                              )}

                              {/* Tabla de oferentes */}
                              <div>
                                <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                                  Todos los oferentes (ordenados por precio)
                                </div>
                                {rowDetail.oferentes.length === 0 ? (
                                  <div style={{ color: "#94A3B8", fontSize: 12 }}>Sin datos de oferentes</div>
                                ) : (
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: "#F1F5F9" }}>
                                        <th style={{ ...thS, fontSize: 11, width: 24 }}>#</th>
                                        <th style={{ ...thS, fontSize: 11 }}>Empresa</th>
                                        <th style={{ ...thS, fontSize: 11 }}>RUT</th>
                                        <th style={{ ...thR, fontSize: 11 }}>Precio unit.</th>
                                        <th style={{ ...thR, fontSize: 11 }}>Total ofertado</th>
                                        <th style={{ ...thR, fontSize: 11 }}>Cant. ofertada</th>
                                        <th style={{ ...thS, fontSize: 11 }}>Fecha envío</th>
                                        <th style={{ ...thS, fontSize: 11 }}>Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rowDetail.oferentes.map((o, j) => {
                                        const isLbf = o.rut === "93.366.000-1";
                                        return (
                                          <tr key={j} style={{
                                            background: o.seleccionada ? "#F0FDF4" : isLbf ? "#FFF1F2" : j % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
                                          }}>
                                            <td style={{ ...tdS, fontSize: 11, color: "#94A3B8", width: 24 }}>{j + 1}</td>
                                            <td style={{ ...tdS, fontSize: 11, fontWeight: isLbf || o.seleccionada ? 700 : 400 }}>
                                              {isLbf ? "★ LBF (menor precio)" : o.nombre}
                                            </td>
                                            <td style={{ ...tdS, fontSize: 11, color: "#64748B", fontFamily: "monospace" }}>{o.rut}</td>
                                            <td style={{ ...tdR, fontSize: 11, fontWeight: 700, color: isLbf ? "#059669" : o.seleccionada ? "#DC2626" : "#374151" }}>
                                              {o.precio_unitario > 0 ? fmtCLP(o.precio_unitario) : "—"}
                                            </td>
                                            <td style={{ ...tdR, fontSize: 11, fontWeight: 700, color: isLbf ? "#059669" : o.seleccionada ? "#DC2626" : "#374151" }}>
                                              {fmtCLP(o.precio_total)}
                                            </td>
                                            <td style={{ ...tdR, fontSize: 11, color: "#64748B" }}>
                                              {o.cantidad_ofertada > 0 ? `${o.cantidad_ofertada}` : "—"}
                                            </td>
                                            <td style={{ ...tdS, fontSize: 11, color: "#94A3B8" }}>{o.fecha_envio || "—"}</td>
                                            <td style={{ ...tdS, fontSize: 11 }}>
                                              {o.seleccionada ? (
                                                <span style={{ background: "#DCFCE7", color: "#166534", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>Adjudicado</span>
                                              ) : isLbf ? (
                                                <span style={{ background: "#FEE2E2", color: "#991B1B", borderRadius: 4, padding: "2px 8px" }}>No adj.</span>
                                              ) : (
                                                <span style={{ color: "#94A3B8" }}>No adj.</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-tab Visión MP (todos los canales) ──────────────────────────────── */
interface CanalRow {
  canal: string; label: string;
  mercado: number; n_ocs: number; n_prov: number;
  lbf: number; lbf_ocs: number; ms: number;
  mercado_prev: number; lbf_prev: number;
}
interface EmpresaRow {
  rank: number; rut: string; nombre: string;
  total: number; n_ocs: number; n_compradores: number; n_canales: number;
  ms: number; es_lbf: boolean;
}
interface VisionData {
  periodo_label: string;
  ano: number;
  global: {
    mercado: number; lbf: number; ms: number;
    mercado_prev: number; lbf_prev: number;
    lbf_rank: number | null; n_competidores: number;
  };
  canales: CanalRow[];
  empresas: EmpresaRow[];
  error?: string;
}

const CANAL_COLOR: Record<string, string> = {
  SE: "#2563EB", CM: "#059669", TD: "#D97706",
  AG: "#7C3AED", CC: "#0891B2", CT: "#64748B",
};

function TabVision({ data, loading, error }: {
  data: VisionData | null; loading: boolean; error: string | null;
}) {
  if (loading) return (
    <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 48 }}>
      Cargando visión global de Mercado Público...
    </div>
  );
  if (error) return <div style={{ ...card, color: "#EF4444" }}>Error: {error}</div>;
  if (!data || !data.global) return (
    <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 48 }}>Sin datos</div>
  );

  const g = data.global;
  const mktDelta = g.mercado_prev > 0 ? ((g.mercado - g.mercado_prev) / g.mercado_prev) * 100 : null;
  const lbfDelta = g.lbf_prev > 0 ? ((g.lbf - g.lbf_prev) / g.lbf_prev) * 100 : null;
  const maxCanal = Math.max(...data.canales.map((c) => c.mercado), 1);
  const maxEmp = Math.max(...data.empresas.map((e) => e.total), 1);
  const mejorCanal = data.canales.length
    ? [...data.canales].sort((a, b) => b.ms - a.ms)[0] : null;

  const deltaTag = (d: number | null) => d === null ? null : (
    <span style={{ fontSize: 12, fontWeight: 700, color: d >= 0 ? "#059669" : "#EF4444", marginLeft: 6 }}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Badge explicativo */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#F0F9FF", border: "1px solid #BAE6FD",
        borderRadius: 8, padding: "10px 16px",
      }}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <span style={{ fontSize: 13, color: "#0C4A6E", fontWeight: 500 }}>
          <strong>Todo lo transado</strong> en insumos médicos vía órdenes de compra —
          Licitación, Convenio Marco, Trato Directo, Compra Ágil y más. MS% = participación LBF sobre el mercado.
        </span>
      </div>

      {/* Hero global */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
        <div style={{ ...card, borderTop: "3px solid #64748B" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Mercado total
          </div>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#0F172A" }}>{fmtM(g.mercado)}</span>
            {deltaTag(mktDelta)}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>insumos médicos · {data.periodo_label}</div>
        </div>

        <div style={{ ...card, borderTop: "3px solid #2563EB" }}>
          <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            LBF transó
          </div>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#2563EB" }}>{fmtM(g.lbf)}</span>
            {deltaTag(lbfDelta)}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{fmtCLP(g.lbf)}</div>
        </div>

        <div style={{ ...card, borderTop: "3px solid #7C3AED" }}>
          <div style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Market Share LBF
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#7C3AED" }}>{pct(g.ms)}</div>
          <div style={{ height: 6, background: "#F5F3FF", borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${Math.min(g.ms, 100)}%`, height: "100%", background: "#7C3AED", borderRadius: 3 }} />
          </div>
        </div>

        <div style={{ ...card, borderTop: "3px solid #059669" }}>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Ranking LBF
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#059669" }}>
            {g.lbf_rank ? `#${g.lbf_rank}` : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
            de {fmtN(g.n_competidores)} proveedores
            {mejorCanal && <> · mejor en <strong style={{ color: "#059669" }}>{mejorCanal.label}</strong> ({pct(mejorCanal.ms)})</>}
          </div>
        </div>
      </div>

      {/* Mercado por canal */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Mercado por canal</span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
            tamaño del mercado · barra azul = participación LBF (MS%)
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.canales.map((c) => {
            const color = CANAL_COLOR[c.canal] ?? "#64748B";
            const barW = (c.mercado / maxCanal) * 100;
            const lbfW = c.mercado > 0 ? (c.lbf / c.mercado) * 100 : 0;
            return (
              <div key={c.canal}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{fmtN(c.n_prov)} proveedores · {fmtN(c.n_ocs)} OCs</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {fmtCLP(c.mercado)}
                  </div>
                </div>
                {/* Barra mercado con segmento LBF */}
                <div style={{ position: "relative", height: 22, background: "#F1F5F9", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`, background: `${color}22`, borderRadius: 5 }} />
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW * lbfW / 100}%`, background: color, borderRadius: 5, transition: "width 0.4s ease" }} />
                  <div style={{ position: "absolute", left: 10, top: 0, height: "100%", display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: "#0F172A" }}>
                    <span style={{ color: "#fff", mixBlendMode: "difference" as const }}>
                      LBF {fmtM(c.lbf)} · MS {pct(c.ms)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top empresas */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Top empresas que más transan</span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
            insumos médicos · todos los canales · {data.periodo_label}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 40 }}>#</th>
                <th style={thS}>Empresa</th>
                <th style={thR}>Total Transado</th>
                <th style={{ ...thR, color: "#7C3AED" }}>MS%</th>
                <th style={thR}>Canales</th>
                <th style={thR}>OCs</th>
                <th style={thR}>Compradores</th>
              </tr>
            </thead>
            <tbody>
              {data.empresas.length === 0 && <EmptyRow cols={7} />}
              {data.empresas.map((e, i) => (
                <tr key={e.rut + i} style={e.es_lbf
                  ? { background: "#EFF6FF", borderTop: "2px solid #BFDBFE", borderBottom: "2px solid #BFDBFE" }
                  : rowBg(i)}>
                  <td style={{ ...tdS, color: e.es_lbf ? "#2563EB" : "#94A3B8", fontWeight: 700 }}>
                    {e.es_lbf ? "★" : e.rank}
                  </td>
                  <td style={{ ...tdS, fontWeight: e.es_lbf ? 700 : 400, color: e.es_lbf ? "#2563EB" : "#1F2937", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={e.nombre}>
                    {e.es_lbf ? "★ LBF (tú)" : e.nombre}
                  </td>
                  <td style={{ ...tdR, fontWeight: e.es_lbf ? 700 : 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <div style={{ width: 70, height: 5, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(e.total / maxEmp) * 100}%`, height: "100%", background: e.es_lbf ? "#2563EB" : "#94A3B8", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCLP(e.total)}</span>
                    </div>
                  </td>
                  <td style={{ ...tdR, color: "#7C3AED", fontWeight: e.es_lbf ? 700 : 500 }}>{pct(e.ms)}</td>
                  <td style={tdR}>{e.n_canales}</td>
                  <td style={tdR}>{fmtN(e.n_ocs)}</td>
                  <td style={tdR}>{fmtN(e.n_compradores)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Página principal ───────────────────────────────────────────────────── */
type TabId = "vision" | "competencia" | "clientes" | "evolucion" | "perdidos" | "region";

export default function MercadoPublicoPage() {
  const [ano,  setAno]  = useState(2026);
  const [tipo, setTipo] = useState("");
  const [cat,  setCat]  = useState("");
  const [mat,  setMat]  = useState(false);
  const [mes,  setMes]  = useState(0);
  const [tab,  setTab]  = useState<TabId>("vision");

  // Datos por tab
  const [vision,    setVision]    = useState<VisionData | null>(null);
  const [data,      setData]      = useState<Data | null>(null);
  const [clientes,  setClientes]  = useState<Cliente[] | null>(null);
  const [regiones,  setRegiones]  = useState<RegionData[] | null>(null);
  const [evolucion, setEvolucion] = useState<EvoMes[] | null>(null);
  const [perdidos,  setPerdidos]  = useState<Perdido[] | null>(null);

  const [loadingVis,  setLoadingVis]  = useState(false);
  const [errorVis,    setErrorVis]    = useState<string | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [loadingCli,  setLoadingCli]  = useState(false);
  const [loadingReg,  setLoadingReg]  = useState(false);
  const [loadingEvo,  setLoadingEvo]  = useState(false);
  const [loadingPerd, setLoadingPerd] = useState(false);

  const [errorComp, setErrorComp] = useState<string | null>(null);
  const [errorCli,  setErrorCli]  = useState<string | null>(null);
  const [errorReg,  setErrorReg]  = useState<string | null>(null);
  const [errorEvo,  setErrorEvo]  = useState<string | null>(null);
  const [errorPerd, setErrorPerd] = useState<string | null>(null);

  // Construir params comunes
  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ ano: String(ano), tipo });
    if (cat)    params.set("cat", cat);
    if (mat)    params.set("mat", "true");
    if (mes > 0) params.set("mes", String(mes));
    return params;
  }, [ano, tipo, cat, mat, mes]);

  // Al cambiar filtros: limpiar datos y recargar tab activo + competencia siempre
  useEffect(() => {
    setVision(null);
    setData(null);
    setClientes(null);
    setRegiones(null);
    setEvolucion(null);
    setPerdidos(null);
    setErrorVis(null);
    setErrorComp(null); setErrorCli(null); setErrorReg(null);
    setErrorEvo(null);  setErrorPerd(null);

    const params = buildParams();

    if (tab === "vision") {
      setLoadingVis(true);
      api.get(`/api/mercado-publico/canales?${params}`)
        .then((r) => setVision(r as VisionData))
        .catch((e: unknown) => setErrorVis(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingVis(false));
    }

    setLoadingComp(true);
    api.get(`/api/mercado-publico/participacion?${params}`)
      .then((r: unknown) => {
        const d = r as Record<string, unknown>;
        if (d && typeof d === "object" && d.lbf) {
          setData(d as unknown as Data);
        } else {
          setErrorComp((d?.error as string) ?? "Respuesta inesperada del servidor");
        }
      })
      .catch((e: unknown) => setErrorComp(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoadingComp(false));

    if (tab === "clientes") {
      setLoadingCli(true);
      api.get(`/api/mercado-publico/clientes?${params}`)
        .then((r) => setClientes(r as Cliente[]))
        .catch((e: unknown) => setErrorCli(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingCli(false));
    }
    if (tab === "region") {
      setLoadingReg(true);
      api.get(`/api/mercado-publico/region?${params}`)
        .then((r) => setRegiones(r as RegionData[]))
        .catch((e: unknown) => setErrorReg(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingReg(false));
    }
    if (tab === "evolucion") {
      setLoadingEvo(true);
      api.get(`/api/mercado-publico/evolucion?${params}`)
        .then((r) => setEvolucion(r as EvoMes[]))
        .catch((e: unknown) => setErrorEvo(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingEvo(false));
    }
    if (tab === "perdidos") {
      setLoadingPerd(true);
      api.get(`/api/mercado-publico/perdidos?${params}`)
        .then((r) => setPerdidos(r as Perdido[]))
        .catch((e: unknown) => setErrorPerd(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingPerd(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, tipo, cat, mat, mes]);

  // Al cambiar tab: cargar datos si aún no están
  useEffect(() => {
    const params = buildParams();

    if (tab === "vision" && !vision && !loadingVis) {
      setLoadingVis(true);
      api.get(`/api/mercado-publico/canales?${params}`)
        .then((r) => setVision(r as VisionData))
        .catch((e: unknown) => setErrorVis(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingVis(false));
    }
    if (tab === "clientes" && !clientes && !loadingCli) {
      setLoadingCli(true);
      api.get(`/api/mercado-publico/clientes?${params}`)
        .then((r) => setClientes(r as Cliente[]))
        .catch((e: unknown) => setErrorCli(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingCli(false));
    }
    if (tab === "region" && !regiones && !loadingReg) {
      setLoadingReg(true);
      api.get(`/api/mercado-publico/region?${params}`)
        .then((r) => setRegiones(r as RegionData[]))
        .catch((e: unknown) => setErrorReg(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingReg(false));
    }
    if (tab === "evolucion" && !evolucion && !loadingEvo) {
      setLoadingEvo(true);
      api.get(`/api/mercado-publico/evolucion?${params}`)
        .then((r) => setEvolucion(r as EvoMes[]))
        .catch((e: unknown) => setErrorEvo(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingEvo(false));
    }
    if (tab === "perdidos" && !perdidos && !loadingPerd) {
      setLoadingPerd(true);
      api.get(`/api/mercado-publico/perdidos?${params}`)
        .then((r) => setPerdidos(r as Perdido[]))
        .catch((e: unknown) => setErrorPerd(e instanceof Error ? e.message : "Error"))
        .finally(() => setLoadingPerd(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loading = tab === "vision" ? loadingVis
    : tab === "competencia" ? loadingComp
    : tab === "clientes"   ? loadingCli
    : tab === "region"     ? loadingReg
    : tab === "evolucion"  ? loadingEvo
    : loadingPerd;

  const TAB_LIST: { id: TabId; label: string }[] = [
    { id: "vision",      label: "Visión MP" },
    { id: "competencia", label: "Competencia" },
    { id: "clientes",    label: "Clientes" },
    { id: "evolucion",   label: "Evolución" },
    { id: "perdidos",    label: "Perdidos ↓ Precio" },
    { id: "region",      label: "Región" },
  ];

  return (
    <div style={{ padding: "24px 28px", background: "#F1F5F9", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          Mercado Público
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          Participación LBF en insumos médicos (equipamiento)
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>

        {/* Año + 12M Móvil */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}>PERÍODO</span>
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => { setAno(y); setMat(false); }}
              style={{
                padding: "5px 14px", borderRadius: 6, border: "1px solid",
                borderColor: !mat && ano === y ? "#2563EB" : "#CBD5E1",
                background: !mat && ano === y ? "#2563EB" : "white",
                color: !mat && ano === y ? "white" : mat ? "#94A3B8" : "#374151",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              {y}
            </button>
          ))}
          <button
            onClick={() => { setMat(true); setMes(0); }}
            style={{
              padding: "5px 14px", borderRadius: 6, border: "1px solid",
              borderColor: mat ? "#7C3AED" : "#CBD5E1",
              background: mat ? "#7C3AED" : "white",
              color: mat ? "white" : "#374151",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            12M Móvil
          </button>
        </div>

        {/* Mes (solo cuando no es MAT) */}
        {!mat && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}>MES</span>
            <button
              onClick={() => setMes(0)}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "1px solid",
                borderColor: mes === 0 ? "#475569" : "#CBD5E1",
                background: mes === 0 ? "#47556918" : "white",
                color: mes === 0 ? "#374151" : "#94A3B8",
                fontWeight: mes === 0 ? 700 : 500, fontSize: 12, cursor: "pointer",
              }}
            >
              YTD
            </button>
            {MESES.map((m, i) => (
              <button
                key={i}
                onClick={() => setMes(mes === i + 1 ? 0 : i + 1)}
                style={{
                  padding: "4px 8px", borderRadius: 6, border: "1px solid",
                  borderColor: mes === i + 1 ? "#0891B2" : "#CBD5E1",
                  background: mes === i + 1 ? "#0891B2" : "white",
                  color: mes === i + 1 ? "white" : "#64748B",
                  fontWeight: mes === i + 1 ? 700 : 400, fontSize: 12, cursor: "pointer",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Categoría y Tipo — no aplican a Visión MP */}
        {tab !== "vision" && (
        <>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}>CATS</span>
          {CATS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid",
                borderColor: cat === c.id ? "#059669" : "#CBD5E1",
                background: cat === c.id ? "#059669" : "white",
                color: cat === c.id ? "white" : "#374151",
                fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Tipo */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}>TIPO</span>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid",
                borderColor: tipo === t.id ? "#7C3AED" : "#CBD5E1",
                background: tipo === t.id ? "#7C3AED" : "white",
                color: tipo === t.id ? "white" : "#374151",
                fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        </>
        )}

        {loading && <span style={{ fontSize: 12, color: "#94A3B8" }}>Cargando...</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E2E8F0" }}>
        {TAB_LIST.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 22px", border: "none",
              borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent",
              background: "transparent",
              color: tab === t.id ? "#2563EB" : "#64748B",
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14, cursor: "pointer", marginBottom: -2,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error Competencia */}
      {tab === "competencia" && errorComp && (
        <div style={{ ...card, color: "#EF4444", marginBottom: 16 }}>
          Error: {errorComp}
        </div>
      )}

      {/* Contenido del tab activo */}
      {tab === "vision" && (
        <TabVision data={vision} loading={loadingVis} error={errorVis} />
      )}

      {tab === "competencia" && (
        <>
          {loadingComp && !data && (
            <div style={{ ...card, color: "#94A3B8", textAlign: "center", padding: 32 }}>
              Cargando datos de competencia...
            </div>
          )}
          {data && (
            <TabCompetencia
              data={data}
              ano={ano}
              tipo={tipo}
              mat={mat}
              clientes={clientes}
            />
          )}
        </>
      )}

      {tab === "clientes" && (
        <TabClientes
          clientes={clientes}
          loading={loadingCli}
          error={errorCli}
          ano={ano}
          tipo={tipo}
        />
      )}

      {tab === "evolucion" && (
        <TabEvolucion
          evolucion={evolucion}
          loading={loadingEvo}
          error={errorEvo}
        />
      )}

      {tab === "perdidos" && (
        <TabPerdidos
          perdidos={perdidos}
          loading={loadingPerd}
          error={errorPerd}
        />
      )}

      {tab === "region" && (
        <TabRegion
          regiones={regiones}
          loading={loadingReg}
          error={errorReg}
        />
      )}
    </div>
  );
}
