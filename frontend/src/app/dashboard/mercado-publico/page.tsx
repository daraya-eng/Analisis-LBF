"use client";

import { useEffect, useState, useCallback } from "react";
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
  { id: "",    label: "Todos" },
  { id: "SE",  label: "SE" },
  { id: "LE",  label: "LE" },
  { id: "LP",  label: "LP" },
  { id: "LQ",  label: "LQ" },
  { id: "LR",  label: "LR" },
  { id: "TD",  label: "TD" },
  { id: "AG",  label: "AG" },
];

/* ─── Formateadores ───────────────────────────────────────────────────────── */
function fmtCLP(n: number): string {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
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
}
interface Mercado {
  ids_total: number;
  items_total: number;
  valor_total: number;
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
  efectividad: number;
  part_valor: number;
}
interface VsLic {
  licitacion_id: string;
  nombre: string;
  organismo: string;
  region: string;
  tipo: string;
  periodo: string;
  lbf_items: number;
  lbf_adj: number;
  comp_items: number;
  comp_adj: number;
  ganador: "LBF" | "COMPETIDOR" | "AMBOS" | "OTRO";
}
interface VsData {
  comp_rut: string;
  comp_nombre: string;
  ids_compartidas: number;
  lbf_total: number;
  comp_total: number;
  lbf_lics_adj: number;
  comp_lics_adj: number;
  licitaciones: VsLic[];
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

/* ─── Componentes auxiliares ─────────────────────────────────────────────── */
function PartBar({ pct: p }: { pct: number }) {
  const color = p >= 10 ? "#2563EB" : p >= 3 ? "#60A5FA" : "#BFDBFE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 80,
          height: 6,
          background: "#E2E8F0",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(p, 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "#374151",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p.toFixed(1)}%
      </span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 155 }}>
      <div
        style={{
          fontSize: 11,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: color ?? "#0F172A",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}
      >
        Cargando...
      </td>
    </tr>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg?: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}
      >
        {msg ?? "Sin datos"}
      </td>
    </tr>
  );
}

/* ─── Modal LBF vs Competidor ────────────────────────────────────────────── */
function VsModal({
  vs,
  loading,
  onClose,
}: {
  vs: VsData | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!loading && !vs) return null;

  const lbfWins  = vs ? vs.licitaciones.filter((l) => l.ganador === "LBF").length  : 0;
  const compWins = vs ? vs.licitaciones.filter((l) => l.ganador === "COMPETIDOR").length : 0;
  const ambos    = vs ? vs.licitaciones.filter((l) => l.ganador === "AMBOS").length : 0;
  const otros    = vs ? vs.licitaciones.filter((l) => l.ganador === "OTRO").length  : 0;
  const lbfAhead = vs ? vs.lbf_total > vs.comp_total : false;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, 95vw)", height: "100vh", background: "white",
          overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #E2E8F0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#F8FAFC", position: "sticky", top: 0, zIndex: 10,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
              LBF vs {vs?.comp_nombre ?? "…"}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {vs ? `${vs.ids_compartidas} licitaciones compartidas · ${data_ano_ref}` : "Cargando…"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 20, color: "#64748B", lineHeight: 1, padding: "4px 8px",
            }}
          >✕</button>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            Cargando comparación…
          </div>
        )}

        {!loading && vs && (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* KPI cards */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ ...card, flex: 1, minWidth: 150, borderLeft: "3px solid #2563EB" }}>
                <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>LBF Adjudicado</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#2563EB" }}>{fmtCLP(vs.lbf_total)}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{vs.lbf_lics_adj} lics ganadas</div>
              </div>
              <div style={{ ...card, flex: 1, minWidth: 150, borderLeft: "3px solid #EF4444" }}>
                <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>{vs.comp_nombre} Adj.</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#EF4444" }}>{fmtCLP(vs.comp_total)}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{vs.comp_lics_adj} lics ganadas</div>
              </div>
              <div style={{ ...card, flex: 1, minWidth: 150, borderLeft: `3px solid ${lbfAhead ? "#059669" : "#F59E0B"}` }}>
                <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>Diferencia</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: lbfAhead ? "#059669" : "#F59E0B" }}>
                  {lbfAhead ? "+" : ""}{fmtCLP(vs.lbf_total - vs.comp_total)}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {lbfAhead ? "LBF por delante" : "Competidor por delante"}
                </div>
              </div>
            </div>

            {/* Resumen por licitación */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "LBF gana", n: lbfWins,  color: "#2563EB" },
                { label: "Competidor gana", n: compWins, color: "#EF4444" },
                { label: "Ambos ganan", n: ambos, color: "#7C3AED" },
                { label: "Ninguno gana", n: otros,  color: "#94A3B8" },
              ].map((x) => (
                <div key={x.label} style={{
                  background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8,
                  padding: "8px 14px", display: "flex", gap: 8, alignItems: "center",
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: x.color, display: "inline-block" }} />
                  <span style={{ fontSize: 12, color: "#374151" }}>{x.label}:</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: x.color }}>{x.n}</span>
                </div>
              ))}
            </div>

            {/* Tabla de licitaciones */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>Organismo</th>
                    <th style={thS}>Tipo</th>
                    <th style={thS}>Período</th>
                    <th style={thR}>LBF Adj.</th>
                    <th style={thR}>Comp. Adj.</th>
                    <th style={{ ...thS, textAlign: "center" }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {vs.licitaciones.map((l, i) => {
                    const ganColor =
                      l.ganador === "LBF" ? "#DBEAFE" :
                      l.ganador === "COMPETIDOR" ? "#FEE2E2" :
                      l.ganador === "AMBOS" ? "#EDE9FE" : "white";
                    const ganLabel =
                      l.ganador === "LBF" ? { text: "LBF ✓", color: "#2563EB" } :
                      l.ganador === "COMPETIDOR" ? { text: "Comp. ✓", color: "#EF4444" } :
                      l.ganador === "AMBOS" ? { text: "Ambos", color: "#7C3AED" } :
                      { text: "Otro", color: "#94A3B8" };
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? ganColor : ganColor }}>
                        <td style={{ ...tdS, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>
                          {l.organismo || l.nombre.slice(0, 60)}
                        </td>
                        <td style={{ ...tdS, fontSize: 12 }}>{l.tipo}</td>
                        <td style={{ ...tdS, fontSize: 12 }}>{l.periodo}</td>
                        <td style={{ ...tdR, fontWeight: l.lbf_adj > 0 ? 700 : 400, color: l.lbf_adj > 0 ? "#2563EB" : "#94A3B8" }}>
                          {l.lbf_adj > 0 ? fmtCLP(l.lbf_adj) : "—"}
                        </td>
                        <td style={{ ...tdR, fontWeight: l.comp_adj > 0 ? 700 : 400, color: l.comp_adj > 0 ? "#EF4444" : "#94A3B8" }}>
                          {l.comp_adj > 0 ? fmtCLP(l.comp_adj) : "—"}
                        </td>
                        <td style={{ ...tdS, textAlign: "center" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: ganLabel.color,
                            background: `${ganLabel.color}20`, borderRadius: 4, padding: "2px 8px",
                          }}>
                            {ganLabel.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// variable global para pasar el año al modal sin prop drilling
let data_ano_ref = 2026;

/* ─── Gráfico evolución mensual con barras apiladas por tipo ─────────────── */
const TIPO_PALETTE: Record<string, string> = {
  LR: "#2563EB", LP: "#7C3AED", LQ: "#059669",
  LE: "#D97706", L1: "#DC2626", SE: "#0891B2",
  TD: "#9333EA", AG: "#EA580C", "?": "#94A3B8",
};
function tipoColor(t: string) { return TIPO_PALETTE[t] ?? "#94A3B8"; }

function EvoChart({ meses }: { meses: MesEvo[] }) {
  const hoy        = new Date().getMonth() + 1;
  const maxVisible = meses.filter((m) => m.mes_num <= hoy).length;

  const [visibleCount, setVisibleCount] = useState(maxVisible);
  const [playing, setPlaying]           = useState(false);

  useEffect(() => {
    setVisibleCount(maxVisible);
    setPlaying(false);
  }, [meses, maxVisible]);

  // Motor de animación — 600ms por barra (cámara lenta)
  useEffect(() => {
    if (!playing) return;
    if (visibleCount >= maxVisible) { setPlaying(false); return; }
    const t = setTimeout(() => setVisibleCount((v) => v + 1), 600);
    return () => clearTimeout(t);
  }, [playing, visibleCount, maxVisible]);

  const handlePlay = () => { setVisibleCount(0); setPlaying(true); };

  // Tipos globales ordenados por total desc
  const tiposGlobal = Array.from(
    new Set(meses.flatMap((m) => m.tipos.map((tt) => tt.tipo)))
  ).sort((a, b) => {
    const sa = meses.reduce((s, m) => s + (m.tipos.find((tt) => tt.tipo === a)?.adj ?? 0), 0);
    const sb = meses.reduce((s, m) => s + (m.tipos.find((tt) => tt.tipo === b)?.adj ?? 0), 0);
    return sb - sa;
  });

  // Acumulado por tipo hasta visibleCount (para los badges)
  const acumPorTipo: Record<string, number> = {};
  let acumTotal = 0;
  for (let i = 0; i < visibleCount; i++) {
    const m = meses[i];
    if (m.mes_num > hoy) continue;
    for (const tt of m.tipos) {
      acumPorTipo[tt.tipo] = (acumPorTipo[tt.tipo] ?? 0) + tt.adj;
      acumTotal += tt.adj;
    }
  }

  // Dimensiones — barras anchas, ancho total del contenedor
  const max     = Math.max(...meses.map((m) => m.total_adj), 1);
  const N       = 12;
  const CHART_H = 160;
  const LABEL_H = 22;
  // BAR_W se calcula dinámicamente con viewBox para ocupar todo el ancho
  const SLOT    = 100 / N; // % por mes en viewBox 0-100 * N
  const GAP     = 4;
  const BW      = SLOT - GAP;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Badges dinámicos — se actualizan con cada mes */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tiposGlobal.map((tt) => {
          const adj  = acumPorTipo[tt] ?? 0;
          const pct  = acumTotal > 0 ? (adj / acumTotal * 100) : 0;
          const col  = tipoColor(tt);
          return (
            <span key={tt} style={{
              fontSize: 12, fontWeight: 700, color: col,
              background: `${col}18`, border: `1.5px solid ${col}55`,
              borderRadius: 6, padding: "4px 10px",
              transition: "opacity 0.4s ease",
              opacity: adj > 0 ? 1 : 0.25,
              minWidth: 60, textAlign: "center",
            }}>
              {tt} {pct.toFixed(0)}%
            </span>
          );
        })}
        {acumTotal > 0 && (
          <span style={{ fontSize: 11, color: "#64748B", alignSelf: "center", marginLeft: 6 }}>
            {fmtCLP(acumTotal)}
          </span>
        )}
      </div>

      {/* SVG con viewBox para ocupar todo el ancho */}
      <svg
        viewBox={`0 0 ${N * SLOT} ${CHART_H + LABEL_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: CHART_H + LABEL_H, display: "block" }}
      >
        {meses.map((m, i) => {
          const x0       = i * SLOT + GAP / 2;
          const cx       = x0 + BW / 2;
          const isFuture = m.mes_num > hoy;
          const isActive = m.mes_num === hoy;
          const visible  = i < visibleCount && !isFuture;
          const baseY    = CHART_H - 2;

          // Segmentos apilados (de abajo hacia arriba)
          let curY = baseY;
          const segments: { tipo: string; adj: number; y: number; h: number; color: string }[] = [];
          for (const tt of [...tiposGlobal].reverse()) {
            const adj  = m.tipos.find((x) => x.tipo === tt)?.adj ?? 0;
            const segH = visible && adj > 0 ? (adj / max) * (CHART_H - 6) : 0;
            if (segH > 0) {
              segments.unshift({ tipo: tt, adj, y: curY - segH, h: segH, color: tipoColor(tt) });
              curY -= segH;
            }
          }
          const topY = segments[0]?.y ?? baseY;

          return (
            <g key={m.mes}>
              {/* Track fondo */}
              <rect x={x0} y={0} width={BW} height={CHART_H - 2} rx={2}
                fill={isFuture ? "#F1F5F9" : "#F0F4FF"} />

              {/* Segmentos */}
              {segments.map((s, si) => (
                <rect key={s.tipo}
                  x={x0} y={s.y} width={BW} height={s.h}
                  rx={si === 0 ? 2 : 0}
                  fill={s.color} opacity={isActive ? 1 : 0.85}
                  style={{ transition: "y 0.5s ease, height 0.5s ease" }}
                >
                  <title>{m.mes} · {s.tipo}: {fmtCLP(s.adj)}</title>
                </rect>
              ))}

              {/* Monto total encima */}
              {visible && m.total_adj > 0 && (
                <text x={cx} y={topY - 2} textAnchor="middle" fontSize={5} fill="#334155" fontWeight="700">
                  {(m.total_adj / 1_000_000).toFixed(0)}M
                </text>
              )}

              {/* Label mes */}
              <text x={cx} y={CHART_H + LABEL_H - 4} textAnchor="middle" fontSize={6}
                fill={isActive ? "#1D4ED8" : "#94A3B8"}
                fontWeight={isActive ? "700" : "400"}>
                {m.mes}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Controles */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <button onClick={handlePlay} disabled={playing} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 16px", borderRadius: 6, border: "none",
          cursor: playing ? "default" : "pointer",
          background: playing ? "#E2E8F0" : "#2563EB",
          color: playing ? "#94A3B8" : "white",
          fontSize: 12, fontWeight: 600, transition: "background 0.2s",
        }}>
          {playing ? "▶ Reproduciendo..." : "▶ Reproducir"}
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tiposGlobal.map((tt) => (
            <span key={tt} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: tipoColor(tt) }} />
              {tt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-tab Competencia ────────────────────────────────────────────────── */
function TabCompetencia({ data, ano, tipo }: { data: Data; ano: number; tipo: string }) {
  const lbf = data.lbf;
  data_ano_ref = ano;

  const [selectedComp, setSelectedComp] = useState<{ rut: string; nombre: string } | null>(null);
  const [vsData, setVsData] = useState<VsData | null>(null);
  const [vsLoading, setVsLoading] = useState(false);
  const [evolucion, setEvolucion] = useState<MesEvo[] | null>(null);

  useEffect(() => {
    if (!selectedComp) { setVsData(null); setVsLoading(false); return; }
    setVsLoading(true);
    setVsData(null);
    const params = new URLSearchParams({ rut: selectedComp.rut, ano: String(ano), tipo });
    api.get(`/api/mercado-publico/vs-competidor?${params}`)
      .then((r) => setVsData(r as VsData))
      .finally(() => setVsLoading(false));
  }, [selectedComp, ano, tipo]);

  useEffect(() => {
    setEvolucion(null);
    const params = new URLSearchParams({ ano: String(ano), tipo });
    api.get(`/api/mercado-publico/evolucion?${params}`)
      .then((r) => setEvolucion(r as MesEvo[]));
  }, [ano, tipo]);

  // % adj / participado (cuánto de lo ofertado fue adjudicado)
  const lbfPct =
    lbf.total_participado > 0
      ? (lbf.total_adj / lbf.total_participado) * 100
      : 0;
  // Efectividad a nivel licitación (más robusta que ítems — evita 100% por JSONB antiguo)
  const lbfEf = lbf.efectividad_lics;

  return (
    <>
      {/* KPIs superiores */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard
          title="Licitaciones participadas"
          value={fmtN(lbf.ids_participadas)}
          sub={`de ${fmtN(data.mercado.ids_total)} en el mercado`}
          color="#2563EB"
        />
        <KpiCard
          title="Licitaciones adjudicadas"
          value={fmtN(lbf.ids_adjudicadas)}
          sub={`efectividad: ${pct(lbf.efectividad_lics)}`}
          color="#2563EB"
        />
        <KpiCard
          title="% Participación (valor)"
          value={pct(lbf.part_valor)}
          sub="LBF adj / mercado adj"
          color="#7C3AED"
        />
        <KpiCard
          title="% Efectividad (ítems)"
          value={pct(lbfEf)}
          sub="ítems adj / ítems ofertados"
          color="#059669"
        />
        <KpiCard
          title="Valor adjudicado LBF"
          value={fmtCLP(lbf.total_adj)}
          sub={`mercado: ${fmtCLP(data.mercado.valor_total)}`}
          color="#0F172A"
        />
      </div>

      {/* Modal comparación */}
      {selectedComp && (
        <VsModal
          vs={vsData}
          loading={vsLoading}
          onClose={() => setSelectedComp(null)}
        />
      )}

      {/* ── Dos gráficos lado a lado ─────────────────────────────────────────── */}
      {(() => {
        // Paleta compartida
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Gráfico 1 — MS% por empresa */}
            <div style={card}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                  MS% sobre total participado LBF
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  base {fmtCLP(lbf.total_participado)}
                </div>
              </div>
              {compRows.map((row, i) => {
                const pctVal = lbf.total_participado > 0
                  ? (row.adj / lbf.total_participado) * 100 : 0;
                const barW = maxMs > 0 ? (pctVal / maxMs) * 100 : 0;
                const color = row.isLbf ? "#2563EB" : PALETTE[(i - 1 + PALETTE.length) % PALETTE.length];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 4, height: 18, borderRadius: 2,
                      background: color, flexShrink: 0,
                    }} />
                    <div style={{
                      width: 140, fontSize: 12,
                      color: row.isLbf ? "#2563EB" : "#374151",
                      fontWeight: row.isLbf ? 700 : 400,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0,
                    }}>
                      {row.nombre}
                    </div>
                    <div style={{ flex: 1, height: 14, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        width: `${barW}%`, height: "100%", background: color,
                        borderRadius: 3, transition: "width 0.4s ease",
                        opacity: row.isLbf ? 1 : 0.75,
                      }} />
                    </div>
                    <div style={{
                      width: 44, fontSize: 11, fontWeight: row.isLbf ? 700 : 400,
                      color: row.isLbf ? "#2563EB" : "#374151",
                      textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums",
                    }}>
                      {pctVal.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gráfico 2 — Evolución mensual */}
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                    Evolución adjudicado LBF {ano}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    barras apiladas por tipo · % acumulado al mes visible
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>Total adj.</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#2563EB" }}>{fmtCLP(totalTipo)}</div>
                </div>
              </div>
              {evolucion
                ? <EvoChart meses={evolucion} />
                : <div style={{ color: "#94A3B8", fontSize: 13, padding: "40px 0", textAlign: "center" }}>Cargando...</div>
              }
            </div>

          </div>
        );
      })()}

      {/* Tabla competidores */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Competidores
          </span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
            top 20 en licitaciones donde LBF participó · {data.ano} · clic en fila para comparar
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 32 }}>#</th>
                <th style={thS}>Proveedor</th>
                <th style={thR}>Monto Ofertado</th>
                <th style={thR}>Monto Adjudicado</th>
                <th style={thR}>% Éxito $</th>
                <th style={thR}>% Efect. Lics.</th>
                <th style={thR}>Ítems Ofertados</th>
                <th style={thR}>Ítems Adj.</th>
                <th style={thR}>Lics. Part.</th>
                <th style={thR}>Lics. Adj.</th>
              </tr>
            </thead>
            <tbody>
              {/* Fila LBF destacada — siempre primera */}
              <tr
                style={{
                  background: "#EFF6FF",
                  borderBottom: "2px solid #BFDBFE",
                }}
              >
                <td style={{ ...tdS, color: "#2563EB", fontWeight: 700 }}>★</td>
                <td style={{ ...tdS, fontWeight: 700, color: "#2563EB" }}>
                  LBF (tú)
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtCLP(lbf.total_participado)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtCLP(lbf.total_adj)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {pct(lbfPct)}
                </td>
                <td style={{ ...tdR, fontWeight: 700, color: "#059669" }}>
                  {pct(lbfEf)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ofertas_realizadas)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ofertas_adj)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ids_participadas)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ids_adjudicadas)}
                </td>
              </tr>

              {data.top20.map((c, i) => {
                // % adj / participado por proveedor
                // Si adj > ofertado, los datos de oferta están incompletos (JSONB antiguo)
                const cPctValid = c.total_ofertado > 0 && c.total_adj <= c.total_ofertado;
                const cPct = cPctValid
                  ? (c.total_adj / c.total_ofertado) * 100
                  : null;
                // Efectividad a nivel licitación (evita 100% por JSONB formato antiguo)
                const cEf =
                  c.ids_part > 0 ? (c.ids_adj / c.ids_part) * 100 : 0;
                const isSelected = selectedComp?.rut === c.rut;
                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedComp(isSelected ? null : { rut: c.rut, nombre: c.competidor })}
                    style={{
                      ...rowBg(i),
                      cursor: "pointer",
                      outline: isSelected ? "2px solid #2563EB" : "none",
                      outlineOffset: -1,
                    }}
                    title="Clic para comparar con LBF"
                  >
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS, color: isSelected ? "#2563EB" : undefined, fontWeight: isSelected ? 700 : undefined }}>
                      {c.competidor}
                    </td>
                    <td style={tdR}>{fmtCLP(c.total_ofertado)}</td>
                    <td style={tdR}>{fmtCLP(c.total_adj)}</td>
                    <td style={{ ...tdR, color: cPct !== null ? "#374151" : "#94A3B8" }}>
                      {cPct !== null ? pct(cPct) : "—"}
                    </td>
                    <td style={{
                      ...tdR,
                      color: cEf >= 20 ? "#059669" : cEf >= 10 ? "#D97706" : "#374151",
                    }}>
                      {pct(cEf)}
                    </td>
                    <td style={tdR}>{fmtN(c.ofertas)}</td>
                    <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
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
  clientes,
  loading,
  error,
}: {
  clientes: Cliente[] | null;
  loading: boolean;
  error: string | null;
}) {
  // Totales para barra de referencia
  const maxAdj = clientes
    ? Math.max(...clientes.map((c) => c.total_adj), 1)
    : 1;

  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
          Top 30 Organismos
        </span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
          por valor adjudicado a LBF
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: 32 }}>#</th>
              <th style={thS}>Organismo</th>
              <th style={thR}>% Éxito</th>
              <th style={thR}>% Efect. Lic.</th>
              <th style={thR}>Total Part.</th>
              <th style={thR}>Total Adj.</th>
              <th style={thR}>No Adj. $</th>
              <th style={thR}>Ofertas Real.</th>
              <th style={thR}>Ofertas Adj.</th>
              <th style={thR}>Ids Part.</th>
              <th style={thR}>Ids Adj.</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={11} />}
            {!loading && error && (
              <tr>
                <td
                  colSpan={11}
                  style={{ ...tdS, color: "#EF4444", textAlign: "center" }}
                >
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && clientes && clientes.length === 0 && (
              <EmptyRow cols={11} msg="Sin datos para los filtros seleccionados" />
            )}
            {!loading &&
              !error &&
              clientes &&
              clientes.map((c, i) => {
                const barW = maxAdj > 0 ? (c.total_adj / maxAdj) * 100 : 0;
                return (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.organismo}
                    </td>
                    <td style={tdR}>
                      <PartBar pct={c.pct_adj} />
                    </td>
                    <td
                      style={{
                        ...tdR,
                        color:
                          c.pct_ef >= 20
                            ? "#059669"
                            : c.pct_ef >= 10
                            ? "#D97706"
                            : "#374151",
                      }}
                    >
                      {pct(c.pct_ef)}
                    </td>
                    <td style={tdR}>{fmtCLP(c.total_participado)}</td>
                    <td style={tdR}>
                      {/* mini bar inline */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <div
                          style={{
                            width: 60,
                            height: 4,
                            background: "#E2E8F0",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${barW}%`,
                              height: "100%",
                              background: "#2563EB",
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtCLP(c.total_adj)}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdR, color: "#EF4444" }}>
                      {fmtCLP(c.total_no_adj)}
                    </td>
                    <td style={tdR}>{fmtN(c.ofertas)}</td>
                    <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Sub-tab Región ─────────────────────────────────────────────────────── */
function TabRegion({
  regiones,
  loading,
  error,
}: {
  regiones: RegionData[] | null;
  loading: boolean;
  error: string | null;
}) {
  const maxAdj = regiones
    ? Math.max(...regiones.map((r) => r.total_adj), 1)
    : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Gráfico de barras horizontales */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Adjudicado por Región
          </span>
        </div>

        {loading && (
          <div style={{ color: "#94A3B8", fontSize: 13, padding: "12px 0" }}>
            Cargando...
          </div>
        )}
        {!loading && error && (
          <div style={{ color: "#EF4444", fontSize: 13 }}>{error}</div>
        )}
        {!loading && !error && regiones && regiones.length === 0 && (
          <div style={{ color: "#94A3B8", fontSize: 13 }}>Sin datos</div>
        )}
        {!loading &&
          !error &&
          regiones &&
          regiones.map((r, i) => {
            const barW = maxAdj > 0 ? (r.total_adj / maxAdj) * 100 : 0;
            const color =
              i === 0
                ? "#1D4ED8"
                : i < 3
                ? "#2563EB"
                : i < 6
                ? "#3B82F6"
                : "#93C5FD";
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      fontWeight: i === 0 ? 700 : 500,
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.region}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      fontVariantNumeric: "tabular-nums",
                      marginLeft: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtCLP(r.total_adj)}{" "}
                    <span style={{ color: "#94A3B8" }}>({pct(r.pct_adj)} s.part.)</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 20,
                    background: "#F1F5F9",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${barW}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${color}, ${color}CC)`,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {/* Tabla resumen */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Detalle por Región
          </span>
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
                <tr>
                  <td
                    colSpan={8}
                    style={{ ...tdS, color: "#EF4444", textAlign: "center" }}
                  >
                    {error}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                regiones &&
                regiones.map((r, i) => (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS, fontWeight: i === 0 ? 700 : 400 }}>
                      {r.region}
                    </td>
                    <td style={tdR}>{fmtN(r.ids_part)}</td>
                    <td style={tdR}>{fmtN(r.ids_adj)}</td>
                    <td style={tdR}>{fmtCLP(r.total_participado)}</td>
                    <td
                      style={{
                        ...tdR,
                        fontWeight: i === 0 ? 700 : 400,
                        color: i === 0 ? "#2563EB" : "#1F2937",
                      }}
                    >
                      {fmtCLP(r.total_adj)}
                    </td>
                    <td style={tdR}>{pct(r.pct_adj)}</td>
                    <td
                      style={{
                        ...tdR,
                        color:
                          r.pct_of >= 20
                            ? "#059669"
                            : r.pct_of >= 10
                            ? "#D97706"
                            : "#374151",
                      }}
                    >
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

/* ─── Página principal ───────────────────────────────────────────────────── */
type TabId = "competencia" | "clientes" | "region";

export default function MercadoPublicoPage() {
  const [ano, setAno]   = useState(2026);
  const [tipo, setTipo] = useState("");
  const [tab, setTab]   = useState<TabId>("competencia");

  // Datos por tab
  const [data, setData]         = useState<Data | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [regiones, setRegiones] = useState<RegionData[] | null>(null);

  const [loadingComp, setLoadingComp] = useState(false);
  const [loadingCli,  setLoadingCli]  = useState(false);
  const [loadingReg,  setLoadingReg]  = useState(false);

  const [errorComp, setErrorComp] = useState<string | null>(null);
  const [errorCli,  setErrorCli]  = useState<string | null>(null);
  const [errorReg,  setErrorReg]  = useState<string | null>(null);

  // Al cambiar filtros: limpiar datos y recargar tab activo + competencia siempre
  useEffect(() => {
    setData(null);
    setClientes(null);
    setRegiones(null);
    setErrorComp(null); setErrorCli(null); setErrorReg(null);

    const params = new URLSearchParams({ ano: String(ano), tipo });

    setLoadingComp(true);
    api.get(`/api/mercado-publico/participacion?${params}`)
      .then((r) => setData(r as Data))
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, tipo]);

  // Al cambiar tab: cargar datos si aún no están
  useEffect(() => {
    const params = new URLSearchParams({ ano: String(ano), tipo });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loading = tab === "competencia" ? loadingComp
    : tab === "clientes" ? loadingCli
    : loadingReg;

  return (
    <div
      style={{ padding: "24px 28px", background: "#F1F5F9", minHeight: "100vh" }}
    >
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
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Año */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}
          >
            AÑO
          </span>
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setAno(y)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: ano === y ? "#2563EB" : "#CBD5E1",
                background: ano === y ? "#2563EB" : "white",
                color: ano === y ? "white" : "#374151",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Tipo */}
        <div
          style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
        >
          <span
            style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}
          >
            TIPO
          </span>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: tipo === t.id ? "#7C3AED" : "#CBD5E1",
                background: tipo === t.id ? "#7C3AED" : "white",
                color: tipo === t.id ? "white" : "#374151",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <span style={{ fontSize: 12, color: "#94A3B8" }}>Cargando...</span>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          borderBottom: "2px solid #E2E8F0",
        }}
      >
        {(
          [
            { id: "competencia", label: "Competencia" },
            { id: "clientes",    label: "Clientes" },
            { id: "region",      label: "Región" },
          ] as { id: TabId; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 22px",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent",
              background: "transparent",
              color: tab === t.id ? "#2563EB" : "#64748B",
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              marginBottom: -2,
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
      {tab === "competencia" && (
        <>
          {loadingComp && !data && (
            <div style={{ ...card, color: "#94A3B8", textAlign: "center", padding: 32 }}>
              Cargando datos de competencia...
            </div>
          )}
          {data && <TabCompetencia data={data} ano={ano} tipo={tipo} />}
        </>
      )}

      {tab === "clientes" && (
        <TabClientes
          clientes={clientes}
          loading={loadingCli}
          error={errorCli}
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
