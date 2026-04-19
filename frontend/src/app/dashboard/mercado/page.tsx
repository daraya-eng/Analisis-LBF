"use client";

import { useEffect, useState, useCallback, Fragment, useMemo } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import {
  ChevronDown, ChevronRight, Target, Award, Search, ShoppingCart, AlertTriangle,
} from "lucide-react";
import HelpButton from "@/components/help-button";
import { ExportButton, SearchInput, TableToolbar } from "@/components/table-tools";
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
  { id: "cm", label: "Convenio Marco", icon: ShoppingCart },
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
            <Bar dataKey="Competencia" stackId="a" fill="#94A3B8" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Categorías tabla */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Win Rate por Categoria</h3>
            <ExportButton data={d.categorias || []} filename="categorias_winrate" columns={[
              { key: "categoria", label: "Categoria" }, { key: "ganadas", label: "Ganadas" }, { key: "perdidas", label: "Perdidas" },
              { key: "win_rate", label: "Win Rate %" }, { key: "participacion", label: "Participacion %" },
            ]} />
          </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Win Rate por Zona</h3>
            <ExportButton data={d.zonas || []} filename="zonas_winrate" columns={[
              { key: "zona", label: "Zona" }, { key: "ganadas", label: "Ganadas" }, { key: "perdidas", label: "Perdidas" },
              { key: "win_rate", label: "Win Rate %" }, { key: "monto_lbf", label: "Monto LBF" },
            ]} />
          </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Por Tipo de Licitacion</h3>
            <ExportButton data={d.tipos || []} filename="tipos_licitacion" columns={[
              { key: "tipo", label: "Tipo" }, { key: "ganadas", label: "Ganadas" }, { key: "perdidas", label: "Perdidas" },
              { key: "win_rate", label: "Win Rate %" }, { key: "monto", label: "Monto" },
            ]} />
          </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#10B981", margin: 0 }}>Productos Mas Competitivos (mejor win rate)</h3>
            <ExportButton data={d.top_productos || []} filename="productos_competitivos" columns={[
              { key: "producto", label: "Producto" }, { key: "ganadas", label: "Ganadas" }, { key: "participadas", label: "Participadas" },
              { key: "win_rate", label: "Win Rate %" }, { key: "monto", label: "Monto" },
            ]} />
          </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", margin: 0 }}>Productos Menos Competitivos (peor win rate)</h3>
            <ExportButton data={d.worst_productos || []} filename="productos_menos_competitivos" columns={[
              { key: "producto", label: "Producto" }, { key: "ganadas", label: "Ganadas" }, { key: "participadas", label: "Participadas" },
              { key: "win_rate", label: "Win Rate %" }, { key: "monto", label: "Monto" },
            ]} />
          </div>
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

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <TableToolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar competidor..." width={280} />
          <ExportButton data={filtered} filename="competidores_ranking" columns={[
            { key: "empresa", label: "Empresa" }, { key: "monto", label: "Monto" },
            { key: "n_licitaciones", label: "Licitaciones" }, { key: "n_clientes", label: "Clientes" }, { key: "n_categorias", label: "Categorias" },
          ]} />
          {search && <span style={{ fontSize: 11, color: "#94A3B8" }}>{filtered.length} de {ranking.length}</span>}
        </TableToolbar>
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
   Tab 3: Convenio Marco
   ════════════════════════════════════════════════════════ */
function ConvenioMarcoTab() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get<any>("/api/mercado/cm", { noCache: true })
      .then(r => { setD(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>;
  if (!d?.kpis) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {d?.error || "sin datos"}</div>;
  const k = d.kpis;

  const compChart = (d.competidores || []).slice(0, 10).map((c: any) => ({
    name: c.proveedor.length > 25 ? c.proveedor.substring(0, 25) + "..." : c.proveedor,
    monto: c.monto,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Market Share LBF" value={`${k.share}%`} color="#3B82F6" sub={`Mercado: ${fmt(k.monto_mercado)}`} />
        <KpiCard title="Monto LBF en CM" value={fmt(k.monto_lbf)} color="#10B981" sub={`${k.ocs_lbf.toLocaleString()} OCs`} />
        <KpiCard title="Productos en CM" value={k.n_productos.toLocaleString()} color="#8B5CF6" />
        <KpiCard title="Instituciones con Fuga" value={(d.fuga || []).length.toString()} color="#EF4444" sub="Lic. LBF + CM competidor" />
      </div>

      {/* Competidores en instituciones LBF */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
          Top Competidores CM en Instituciones con Licitacion LBF
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(compChart.length * 40, 200)}>
          <BarChart data={compChart} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={180} tick={{ fill: "#374151", fontSize: 11 }} />
            <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
            <Bar dataKey="monto" fill="#EF4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Fuga: instituciones con lic LBF + CM competidor */}
        <div style={{ ...card, borderTop: "3px solid #EF4444" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={16} style={{ color: "#EF4444" }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", margin: 0 }}>Fuga por Convenio Marco</h3>
            </div>
            <ExportButton data={d.fuga || []} filename="fuga_cm" columns={[
              { key: "nombre", label: "Institucion" }, { key: "ocs_competidor", label: "OCs Competidor" },
              { key: "monto_competidor", label: "Monto Competidor" }, { key: "n_proveedores", label: "Proveedores" },
            ]} />
          </div>
          <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>Instituciones donde LBF tiene licitacion pero compran a competidores por CM</p>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ position: "sticky", top: 0, background: "white" }}>
                <th style={thS}>Institucion</th><th style={thR}>OCs Comp.</th><th style={thR}>Monto Comp.</th><th style={thR}>Proveedores</th>
              </tr></thead>
              <tbody>
                {(d.fuga || []).map((f: any, i: number) => (
                  <tr key={f.rut} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                    <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>{f.nombre}</td>
                    <td style={tdR}>{f.ocs_competidor}</td>
                    <td style={{ ...tdR, fontWeight: 600, color: "#EF4444" }}>{fmt(f.monto_competidor)}</td>
                    <td style={tdR}>{f.n_proveedores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Productos LBF en CM */}
        <div style={{ ...card, borderTop: "3px solid #10B981" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#10B981", margin: 0 }}>Productos LBF en Convenio Marco</h3>
            <ExportButton data={d.productos_lbf || []} filename="productos_lbf_cm" columns={[
              { key: "tipo", label: "Tipo Producto" }, { key: "ocs", label: "OCs" }, { key: "monto", label: "Monto" },
            ]} />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thS}>Tipo Producto</th><th style={thR}>OCs</th><th style={thR}>Monto</th></tr></thead>
            <tbody>
              {(d.productos_lbf || []).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{p.tipo}</td>
                  <td style={tdR}>{p.ocs}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmt(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Competidores tabla detalle */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Competidores CM en Instituciones LBF — Detalle</h3>
          <ExportButton data={d.competidores || []} filename="competidores_cm_detalle" columns={[
            { key: "proveedor", label: "Proveedor" }, { key: "instituciones", label: "Instituciones" },
            { key: "ocs", label: "OCs" }, { key: "monto", label: "Monto" },
          ]} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F8FAFC" }}>
            <th style={thS}>Proveedor</th><th style={thR}>Instituciones</th><th style={thR}>OCs</th><th style={thR}>Monto</th>
          </tr></thead>
          <tbody>
            {(d.competidores || []).map((c: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                <td style={{ ...td, fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{c.proveedor}</td>
                <td style={tdR}>{c.instituciones}</td>
                <td style={tdR}>{c.ocs}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmt(c.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clientes LBF en CM */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Top Instituciones que Compran a LBF por CM</h3>
          <ExportButton data={d.clientes_lbf || []} filename="instituciones_lbf_cm" columns={[
            { key: "nombre", label: "Institucion" }, { key: "ocs", label: "OCs" }, { key: "monto", label: "Monto" },
          ]} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F8FAFC" }}>
            <th style={thS}>Institucion</th><th style={thR}>OCs</th><th style={thR}>Monto</th>
          </tr></thead>
          <tbody>
            {(d.clientes_lbf || []).map((c: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{c.nombre}</td>
                <td style={tdR}>{c.ocs}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmt(c.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Analisis de Mercado</h1>
          <HelpButton module="mercado" />
        </div>
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
      {tab === "cm" && <ConvenioMarcoTab />}
    </div>
  );
}
