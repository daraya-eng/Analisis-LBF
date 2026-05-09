"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

/* ─── Estilos ─────────────────────────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "16px 20px" };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap", background: "#F8FAFC" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const tdS: React.CSSProperties = { padding: "8px 12px", color: "#1F2937", fontSize: 13, whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number): React.CSSProperties => ({ background: i % 2 === 0 ? "white" : "#FAFBFC" });

const YEARS = [2026, 2025, 2024, 2023];
const TIPOS = [
  { id: "ALL", label: "Todos (con CM)" },
  { id: "",    label: "Sin CM" },
  { id: "CM",  label: "Convenio Marco" },
  { id: "SE",  label: "SE — Pequeña" },
  { id: "LE",  label: "LE — Mediana" },
  { id: "LP",  label: "LP — Grande" },
  { id: "LQ",  label: "LQ" },
  { id: "LR",  label: "LR" },
  { id: "LS",  label: "LS" },
  { id: "TD",  label: "Trato Directo" },
  { id: "AG",  label: "Compra Ágil" },
];

function fmt(n: number): string {
  if (!n && n !== 0) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("es-CL")}`;
}
function fmtN(n: number): string { return n?.toLocaleString("es-CL") ?? "0"; }
function pct(n: number): string  { return n != null ? `${n.toFixed(1)}%` : "—"; }

function KpiCard({ title, value, sub, highlight, color }: {
  title: string; value: string; sub?: string; highlight?: boolean; color?: string;
}) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 155 }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? (highlight ? "#2563EB" : "#0F172A") }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PartBar({ pct: p }: { pct: number }) {
  const color = p >= 10 ? "#2563EB" : p >= 3 ? "#60A5FA" : "#BFDBFE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 80, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(p, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{p.toFixed(1)}%</span>
    </div>
  );
}

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
}
interface Mercado { ids_total: number; items_total: number; valor_total: number; }
interface Comp {
  competidor: string;
  ids_part: number;
  ofertas: number;
  ofertas_adj: number;
  ids_adj: number;
  total_adj: number;
  total_ofertado: number;
  efectividad: number;
  part_valor: number;
}
interface Data { ano: number; tipo: string; lbf: Lbf; mercado: Mercado; top20: Comp[]; }

export default function MercadoPublicoPage() {
  const [ano, setAno]     = useState(2026);
  const [tipo, setTipo]   = useState("");
  const [data, setData]   = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ano: String(ano), tipo });
      const res = await api.get(`/api/mercado-publico/participacion?${params}`);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [ano, tipo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "24px 28px", background: "#F1F5F9", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Mercado Público</h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Participación LBF en insumos médicos</p>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>AÑO</span>
          {YEARS.map(y => (
            <button key={y} onClick={() => setAno(y)} style={{
              padding: "5px 14px", borderRadius: 6, border: "1px solid",
              borderColor: ano === y ? "#2563EB" : "#CBD5E1",
              background: ano === y ? "#2563EB" : "white",
              color: ano === y ? "white" : "#374151",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>{y}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>TIPO</span>
          {TIPOS.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)} style={{
              padding: "5px 14px", borderRadius: 6, border: "1px solid",
              borderColor: tipo === t.id ? "#7C3AED" : "#CBD5E1",
              background: tipo === t.id ? "#7C3AED" : "white",
              color: tipo === t.id ? "white" : "#374151",
              fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
        {loading && <span style={{ fontSize: 12, color: "#94A3B8" }}>Cargando...</span>}
      </div>

      {error && (
        <div style={{ ...card, color: "#EF4444", marginBottom: 20 }}>Error: {error}</div>
      )}

      {data && (
        <>
          {/* ── Fila 1: Participación en licitaciones ── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Participación en licitaciones · {data.ano}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard
              title="Licitaciones participadas"
              value={fmtN(data.lbf.ids_participadas)}
              sub={`de ${fmtN(data.mercado.ids_total)} en el mercado`}
              highlight
            />
            <KpiCard
              title="% Participación (licitaciones)"
              value={pct(data.lbf.part_ids)}
              sub="LBF / mercado total"
              color="#7C3AED"
            />
            <KpiCard
              title="Licitaciones adjudicadas"
              value={fmtN(data.lbf.ids_adjudicadas)}
              sub={`efectividad licitaciones: ${pct(data.lbf.efectividad_lics)}`}
              highlight
            />
            <KpiCard
              title="% Efectividad (licitaciones)"
              value={pct(data.lbf.efectividad_lics)}
              sub="licitaciones adj / participadas"
              color="#059669"
            />
          </div>

          {/* ── Fila 2: Ofertas e ítems ── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Ofertas e ítems
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard
              title="Ofertas realizadas"
              value={fmtN(data.lbf.ofertas_realizadas)}
              sub={`${fmtN(data.lbf.ofertas_con_precio)} con precio`}
            />
            <KpiCard
              title="Ofertas adjudicadas"
              value={fmtN(data.lbf.ofertas_adj)}
              sub={`${pct(data.lbf.efectividad_items)} efectividad ítems`}
            />
            <KpiCard
              title="% Efectividad (ítems)"
              value={pct(data.lbf.efectividad_items)}
              sub="ítems adj / ítems ofertados"
              color="#059669"
            />
            <KpiCard
              title="Ítems en el mercado"
              value={fmtN(data.mercado.items_total)}
              sub="total ítems categoría"
            />
          </div>

          {/* ── Fila 3: Valores ── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Valores
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <KpiCard
              title="Valor adjudicado LBF"
              value={fmt(data.lbf.total_adj)}
              sub={`mercado total: ${fmt(data.mercado.valor_total)}`}
              highlight
            />
            <KpiCard
              title="% Participación (valor)"
              value={pct(data.lbf.part_valor)}
              sub="LBF adj / mercado adj"
              color="#7C3AED"
            />
            <KpiCard
              title="Total ofertado LBF"
              value={fmt(data.lbf.total_participado)}
              sub="suma de precios ofertados"
            />
          </div>

          {/* ── Tabla Top 20 Competidores ── */}
          <div style={card}>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Top 20 Competidores</span>
              <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
                en las mismas licitaciones donde participó LBF · {data.ano}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, width: 30 }}>#</th>
                    <th style={thS}>Competidor</th>
                    <th style={thR}>Lic. part.</th>
                    <th style={thR}>Lic. adj.</th>
                    <th style={thR}>Ofertas</th>
                    <th style={thR}>Ofertas adj.</th>
                    <th style={thR}>Efectividad</th>
                    <th style={thR}>Valor adjudicado</th>
                    <th style={{ ...thR, minWidth: 130 }}>Part. valor</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fila LBF destacada */}
                  <tr style={{ background: "#EFF6FF", borderBottom: "2px solid #BFDBFE" }}>
                    <td style={{ ...tdS, color: "#2563EB", fontWeight: 700 }}>★</td>
                    <td style={{ ...tdS, fontWeight: 700, color: "#2563EB" }}>LBF (tú)</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(data.lbf.ids_participadas)}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(data.lbf.ids_adjudicadas)}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(data.lbf.ofertas_realizadas)}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(data.lbf.ofertas_adj)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: "#059669" }}>{pct(data.lbf.efectividad_items)}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmt(data.lbf.total_adj)}</td>
                    <td style={tdR}><PartBar pct={data.lbf.part_valor} /></td>
                  </tr>
                  {data.top20.map((c, i) => (
                    <tr key={i} style={rowBg(i)}>
                      <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>{i + 1}</td>
                      <td style={tdS}>{c.competidor}</td>
                      <td style={tdR}>{fmtN(c.ids_part)}</td>
                      <td style={tdR}>{fmtN(c.ids_adj)}</td>
                      <td style={tdR}>{fmtN(c.ofertas)}</td>
                      <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                      <td style={{ ...tdR, color: c.efectividad >= 20 ? "#059669" : c.efectividad >= 10 ? "#D97706" : "#374151" }}>
                        {pct(c.efectividad)}
                      </td>
                      <td style={tdR}>{fmt(c.total_adj)}</td>
                      <td style={tdR}><PartBar pct={c.part_valor} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
