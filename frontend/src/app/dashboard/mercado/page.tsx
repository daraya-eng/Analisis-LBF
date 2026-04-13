"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import {
  ChevronDown, ChevronRight, Target, Award, Search,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, Legend,
} from "recharts";

/* ─── Shared styles ──────────────────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const thC: React.CSSProperties = { ...thS, textAlign: "center" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 13 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdC: React.CSSProperties = { ...td, textAlign: "center" };
const tt = { background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 };
const rowBg = (i: number, sel?: boolean) => sel ? "#EFF6FF" : i % 2 === 0 ? "white" : "#FAFBFC";
const wrColor = (wr: number) => wr >= 50 ? "#10B981" : wr >= 30 ? "#F59E0B" : "#EF4444";

const PERIOD_OPTIONS = [
  { value: "todo", label: "Todo" }, { value: "ultimo_ano", label: "Ultimo Ano" },
  { value: "ytd", label: "YTD 2026" }, { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" }, { value: "q3", label: "Q3" }, { value: "q4", label: "Q4" },
];
const TABS = [
  { id: "desempeno", label: "Desempeno LBF", icon: Target },
  { id: "competidores", label: "Competidores", icon: Award },
];

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 140, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function WinRateBar({ wr, w }: { wr: number; w?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: w || 80, background: "#F1F5F9", borderRadius: 4, height: 16, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(wr, 100)}%`, height: "100%", borderRadius: 4, background: wrColor(wr) }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: wrColor(wr) }}>{wr}%</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Tab 1: Desempeño LBF
   ════════════════════════════════════════════════════════ */
function DesempenoTab({ periodo }: { periodo: string }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); api.get<any>(`/api/mercado/?periodo=${periodo}`, { noCache: true }).then(r => { setD(r); setLoading(false); }).catch(() => setLoading(false)); }, [periodo]);
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>;
  if (!d?.kpis) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {d?.error || "sin datos"}</div>;
  const k = d.kpis;

  // Chart data: categorías LBF vs Mercado
  const catChart = (d.categorias || []).map((c: any) => ({
    name: c.categoria,
    LBF: c.monto_lbf,
    Competencia: c.monto_mercado - c.monto_lbf,
    win_rate: c.win_rate,
  }));

  // Chart data: zonas
  const zonaChart = (d.zonas || []).filter((z: any) => z.zona !== "Sin Zona").map((z: any) => ({
    name: z.zona, ganadas: z.ganadas, perdidas: z.perdidas, win_rate: z.win_rate,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Win Rate" value={`${k.win_rate}%`} color={wrColor(k.win_rate)} sub={`${k.ganadas} ganadas / ${k.perdidas} perdidas`} />
        <KpiCard title="Monto Ganado LBF" value={fmt(k.monto_ganado)} />
        <KpiCard title="Part. Mercado" value={`${k.participacion_mercado}%`} color="#3B82F6" sub={`Mercado: ${fmt(k.monto_mercado)}`} />
        <KpiCard title="Cobertura Clientes" value={`${k.cobertura}%`} color="#8B5CF6" sub={`${k.clientes_activos} de ${k.clientes_totales}`} />
        <KpiCard title="Competidores" value={k.n_competidores.toLocaleString()} />
      </div>

      {/* Categorías: LBF vs Competencia (horizontal bar) */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Monto por Categoria — LBF vs Competencia</h3>
        <ResponsiveContainer width="100%" height={Math.max(catChart.length * 45, 200)}>
          <BarChart data={catChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={80} tick={{ fill: "#374151", fontSize: 12 }} />
            <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
            <Legend />
            <Bar dataKey="LBF" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Competencia" stackId="a" fill="#E2E8F0" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Categorías tabla */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Win Rate por Categoria</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Categoria</th><th style={thC}>G</th><th style={thC}>P</th><th style={thS}>Win Rate</th><th style={thR}>Part.</th></tr></thead>
            <tbody>
              {d.categorias.map((c: any, i: number) => (
                <tr key={c.categoria} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.categoria}</td>
                  <td style={{ ...tdC, color: "#10B981" }}>{c.ganadas}</td><td style={{ ...tdC, color: "#EF4444" }}>{c.perdidas}</td>
                  <td style={td}><WinRateBar wr={c.win_rate} w={70} /></td>
                  <td style={{ ...tdR, fontWeight: 700, color: "#3B82F6" }}>{c.participacion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Zonas */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Win Rate por Zona</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Zona</th><th style={thC}>G</th><th style={thC}>P</th><th style={thS}>Win Rate</th><th style={thR}>Monto LBF</th></tr></thead>
            <tbody>
              {d.zonas.map((z: any, i: number) => (
                <tr key={z.zona} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={{ ...td, fontSize: 12 }}>{z.zona}</td>
                  <td style={{ ...tdC, color: "#10B981" }}>{z.ganadas}</td><td style={{ ...tdC, color: "#EF4444" }}>{z.perdidas}</td>
                  <td style={td}><WinRateBar wr={z.win_rate} w={60} /></td>
                  <td style={tdR}>{fmt(z.monto_lbf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Tipo licitación */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Por Tipo de Licitacion</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Tipo</th><th style={thC}>G</th><th style={thC}>P</th><th style={thS}>Win Rate</th><th style={thR}>Monto</th></tr></thead>
            <tbody>
              {d.tipos.map((t: any, i: number) => (
                <tr key={t.tipo} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={td}>{t.tipo}</td><td style={{ ...tdC, color: "#10B981" }}>{t.ganadas}</td><td style={{ ...tdC, color: "#EF4444" }}>{t.perdidas}</td>
                  <td style={td}><WinRateBar wr={t.win_rate} w={60} /></td>
                  <td style={tdR}>{fmt(t.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top 5 competidores resumen */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Top 5 Competidores</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.top5_competidores || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
              <YAxis dataKey="empresa" type="category" width={140} tick={{ fill: "#374151", fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
              <Bar dataKey="monto" fill="#EF4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Mejores productos */}
        <div style={{ ...card, borderTop: "3px solid #10B981" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#10B981", marginBottom: 12 }}>Productos Mas Competitivos (mejor win rate)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Producto</th><th style={thC}>G/P</th><th style={thS}>Win Rate</th><th style={thR}>Monto</th></tr></thead>
            <tbody>
              {(d.top_productos || []).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.producto}</td>
                  <td style={tdC}>{p.ganadas}/{p.participadas}</td>
                  <td style={td}><WinRateBar wr={p.win_rate} w={60} /></td>
                  <td style={tdR}>{fmt(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Peores productos */}
        <div style={{ ...card, borderTop: "3px solid #EF4444" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", marginBottom: 12 }}>Productos Menos Competitivos (peor win rate)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Producto</th><th style={thC}>G/P</th><th style={thS}>Win Rate</th><th style={thR}>Monto</th></tr></thead>
            <tbody>
              {(d.worst_productos || []).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.producto}</td>
                  <td style={tdC}>{p.ganadas}/{p.participadas}</td>
                  <td style={td}><WinRateBar wr={p.win_rate} w={60} /></td>
                  <td style={tdR}>{fmt(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Tab 2: Competidores
   ════════════════════════════════════════════════════════ */
function CompetidoresTab({ periodo }: { periodo: string }) {
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<any>(null);
  const [loadDet, setLoadDet] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { setLoading(true); api.get<any>(`/api/mercado/competidores?periodo=${periodo}`, { noCache: true }).then(r => { setRanking(r.ranking || []); setLoading(false); }).catch(() => setLoading(false)); }, [periodo]);

  const openDet = useCallback((emp: string) => {
    if (sel === emp) { setSel(null); setDet(null); return; }
    setSel(emp); setLoadDet(true);
    api.get<any>(`/api/mercado/competidores/detalle?empresa=${encodeURIComponent(emp)}&periodo=${periodo}`, { noCache: true })
      .then(r => { setDet(r); setLoadDet(false); }).catch(() => setLoadDet(false));
  }, [sel, periodo]);

  const filtered = search ? ranking.filter(c => c.empresa.toLowerCase().includes(search.toLowerCase())) : ranking;
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Top 10 Competidores por Monto Adjudicado</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={ranking.slice(0, 10)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis dataKey="empresa" type="category" width={180} tick={{ fill: "#374151", fontSize: 11 }} />
            <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
            <Bar dataKey="monto" fill="#EF4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Search size={14} style={{ color: "#94A3B8" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar competidor..."
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 12px", color: "#1F2937", fontSize: 13, width: 300, outline: "none" }} />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F8FAFC" }}>
            <th style={{ ...thS, width: 30 }}></th><th style={thS}>Empresa</th>
            <th style={thR}>Monto</th><th style={thR}>Lic.</th><th style={thR}>Clientes</th><th style={thR}>Cat.</th>
          </tr></thead>
          <tbody>
            {filtered.map((c, i) => (
              <Fragment key={c.empresa}>
                <tr onClick={() => openDet(c.empresa)} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer", background: rowBg(i, sel === c.empresa) }}>
                  <td style={tdC}>{sel === c.empresa ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{c.empresa}</td>
                  <td style={tdR}>{fmt(c.monto)}</td><td style={tdR}>{c.n_licitaciones}</td><td style={tdR}>{c.n_clientes}</td>
                  <td style={tdR}>{c.n_categorias}</td>
                </tr>
                {sel === c.empresa && (
                  <tr><td colSpan={6} style={{ padding: 0 }}>
                    {loadDet ? <div style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>
                      : det ? <CompDetPanel det={det} /> : null}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompDetPanel({ det }: { det: any }) {
  const h = det.head_to_head || {};
  return (
    <div style={{ padding: "16px 24px", background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <KpiCard title={`Ganadas ${det.empresa}`} value={(h.ganadas_competidor || 0).toString()} color="#EF4444" />
        <KpiCard title="Ganadas LBF" value={(h.ganadas_lbf || 0).toString()} color="#10B981" />
        <KpiCard title="Lic. Compartidas" value={(h.compartidas || 0).toString()} color="#3B82F6" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Productos</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><th style={thS}>Producto</th><th style={thS}>Cat</th><th style={thR}>Monto</th><th style={thR}>Lic.</th></tr></thead>
            <tbody>{det.productos.slice(0, 15).map((p: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.producto}</td>
                <td style={td}>{p.categoria}</td><td style={tdR}>{fmt(p.monto)}</td><td style={tdR}>{p.n_licitaciones}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={card}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Clientes Exclusivos (sin LBF)</h4>
          {det.clientes_exclusivos.length === 0 ? <div style={{ color: "#94A3B8", fontSize: 12 }}>LBF presente en todos</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={thS}>Cliente</th><th style={thR}>Monto</th><th style={thR}>Lic.</th></tr></thead>
              <tbody>{det.clientes_exclusivos.map((c: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.nombre}</td>
                  <td style={tdR}>{fmt(c.monto)}</td><td style={tdR}>{c.n_licitaciones}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {det.tendencia.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Tendencia Mensual</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={det.tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="periodo" tick={{ fill: "#64748B", fontSize: 10 }} />
              <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 10 }} />
              <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
              <Bar dataKey="monto" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════════ */
export default function MercadoPage() {
  const [tab, setTab] = useState("desempeno");
  const [periodo, setPeriodo] = useState("todo");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Analisis de Mercado</h1>
        <p style={{ fontSize: 13, color: "#94A3B8" }}>Desempeno en licitaciones, participacion y competidores</p>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.value} onClick={() => setPeriodo(p.value)} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #E2E8F0", cursor: "pointer", fontSize: 13,
            background: periodo === p.value ? "#3B82F6" : "white", color: periodo === p.value ? "white" : "#374151", fontWeight: periodo === p.value ? 600 : 400,
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E2E8F0" }}>
        {TABS.map(t => {
          const Icon = t.icon; const a = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13,
              background: "transparent", color: a ? "#3B82F6" : "#64748B", fontWeight: a ? 600 : 400,
              borderBottom: a ? "2px solid #3B82F6" : "2px solid transparent", marginBottom: -2,
            }}><Icon size={16} />{t.label}</button>
          );
        })}
      </div>

      {tab === "desempeno" && <DesempenoTab periodo={periodo} />}
      {tab === "competidores" && <CompetidoresTab periodo={periodo} />}
    </div>
  );
}
