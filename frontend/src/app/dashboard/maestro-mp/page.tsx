"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { ChevronDown, ChevronRight } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Competidor {
  rut: string;
  nombre: string;
  items: number;
  adj: number;
}

interface ProductoRow {
  codigo_mp: number;
  nombre_mp: string;
  codigo_lbf: string;
  desc_lbf: string;
  categoria: string;
  n_lics: number;
  n_items: number;
  n_adj_lbf: number;
  win_rate: number;
  venta_lbf: number;
  monto_perdido: number;
  n_inst_objetivo: number;
  lider_es_lbf: boolean;
  lider_nombre: string;
  lider_adj: number;
  competidores: Competidor[];
}

interface ProductoOpp {
  codigo_lbf: string;
  desc_lbf: string;
  categoria: string;
  n_items: number;
  monto: number;
  ganador: string;
}

interface InstRow {
  rut: string;
  nombre: string;
  region: string;
  n_productos: number;
  n_items_perdidos: number;
  monto_perdido: number;
  top_competidor: string;
  productos: ProductoOpp[];
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const YEARS = [2026, 2025, 2024];
const CATS  = ["SQ", "MAH", "EQM", "EVA", "?"];
const CAT_COLORS: Record<string, string> = {
  SQ: "#2563EB", EVA: "#7C3AED", MAH: "#D97706", EQM: "#059669", "?": "#94A3B8",
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function fmtM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}MM`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("es-CL")}`;
}

function winColor(wr: number) {
  if (wr >= 50) return "#059669";
  if (wr >= 20) return "#D97706";
  return "#EF4444";
}

/* ─── KPI Card ──────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ flex: "1 1 150px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function MaestroMPPage() {
  const [ano, setAno]             = useState(2026);
  const [tab, setTab]             = useState<"liderazgo" | "oportunidades">("liderazgo");
  const [catFilter, setCatFilter] = useState("");
  const [liderFilter, setLider]   = useState<"all" | "lbf" | "comp">("all");
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [opps, setOpps]           = useState<InstRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = useCallback((a: number) => {
    setLoading(true);
    setError(null);
    setExpanded(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150_000); // 150s timeout
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}/api/maestro-mp/liderazgo?ano=${a}`, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${localStorage.getItem("lbf_token") || ""}` },
      }).then(r => r.json()),
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}/api/maestro-mp/oportunidades?ano=${a}`, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${localStorage.getItem("lbf_token") || ""}` },
      }).then(r => r.json()),
    ])
      .then(([p, o]) => { setProductos(Array.isArray(p) ? p : []); setOpps(Array.isArray(o) ? o : []); })
      .catch(e => { if (e.name !== "AbortError") setError("Error cargando datos. Intenta nuevamente."); })
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  useEffect(() => { load(ano); }, [ano, load]);

  // Normalize empty categoria to "?" for display
  const normCat = (c: string) => c || "?";

  // Filtered products
  const filteredProductos = useMemo(() => {
    let list = productos;
    if (catFilter) list = list.filter(p => normCat(p.categoria) === catFilter);
    if (liderFilter === "lbf")  list = list.filter(p => p.lider_es_lbf);
    if (liderFilter === "comp") list = list.filter(p => !p.lider_es_lbf);
    return list;
  }, [productos, catFilter, liderFilter]);

  const filteredOpps = useMemo(() => {
    if (!catFilter) return opps;
    return opps.map(inst => ({
      ...inst,
      productos: inst.productos.filter(p => normCat(p.categoria) === catFilter),
    })).filter(inst => inst.productos.length > 0)
      .map(inst => ({
        ...inst,
        monto_perdido: inst.productos.reduce((s, p) => s + p.monto, 0),
        n_productos: inst.productos.length,
      }))
      .sort((a, b) => b.monto_perdido - a.monto_perdido);
  }, [opps, catFilter]);

  // KPIs liderazgo
  const kpiLbf    = productos.filter(p => p.lider_es_lbf).length;
  const kpiComp   = productos.filter(p => !p.lider_es_lbf).length;
  const totalAdj  = productos.reduce((s, p) => s + p.n_adj_lbf, 0);
  const totalItems = productos.reduce((s, p) => s + p.n_items, 0);
  const totalGanado = productos.reduce((s, p) => s + p.venta_lbf, 0);
  const totalPerdido = productos.reduce((s, p) => s + p.monto_perdido, 0);
  const winRateGlobal = totalItems > 0 ? totalAdj / totalItems * 100 : 0;

  // KPIs oportunidades
  const totalOppMonto = opps.reduce((s, i) => s + i.monto_perdido, 0);
  const totalOppInst  = opps.length;
  const totalOppProd  = opps.reduce((s, i) => s + i.n_productos, 0);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
        <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Cargando análisis de liderazgo (puede tardar ~30s)…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12 }}>
        <p style={{ fontSize: 15, color: "#EF4444", margin: 0 }}>{error}</p>
        <button onClick={() => load(ano)} style={{ padding: "8px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
            Mercado Público · Liderazgo por Producto
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "3px 0 0" }}>
            Ítems donde LBF compite directamente · quién lidera · dónde ir a recuperar
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {YEARS.map(y => (
            <button key={y} onClick={() => setAno(y)} style={{
              padding: "5px 16px", borderRadius: 8, border: "none",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: ano === y ? "#1E40AF" : "#E2E8F0",
              color:      ano === y ? "white"   : "#374151",
            }}>{y}</button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Categoría:</span>
        {["", ...CATS].map(c => (
          <button key={c || "all"} onClick={() => setCatFilter(c)} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: catFilter === c ? `2px solid ${CAT_COLORS[c] || "#374151"}` : "1px solid #E2E8F0",
            background: catFilter === c ? (CAT_COLORS[c] ? `${CAT_COLORS[c]}15` : "#F1F5F9") : "white",
            color: catFilter === c ? (CAT_COLORS[c] || "#374151") : "#64748B",
            cursor: "pointer",
          }}>{c || "Todas"}</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 4, width: "fit-content" }}>
        {([["liderazgo", "🏆 Liderazgo por Producto"], ["oportunidades", "🎯 Oportunidades de Mercado"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setExpanded(null); }} style={{
            padding: "7px 20px", borderRadius: 8, border: "none",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            background: tab === key ? "#1E40AF" : "transparent",
            color:      tab === key ? "white"   : "#64748B",
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════════════ TAB: LIDERAZGO ══════════════════ */}
      {tab === "liderazgo" && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard label="🟢 LBF lidera" value={String(kpiLbf)} sub={`de ${productos.length} productos`} color="#059669" />
            <KpiCard label="🔴 Competidor lidera" value={String(kpiComp)} sub={`${kpiComp} oportunidades`} color="#EF4444" />
            <KpiCard label="Win Rate global" value={`${winRateGlobal.toFixed(1)}%`} sub={`${totalAdj} adj / ${totalItems} items`} color={winColor(winRateGlobal)} />
            <KpiCard label="$ Ganado LBF" value={fmtM(totalGanado)} color="#2563EB" />
            <KpiCard label="$ Perdido a competidores" value={fmtM(totalPerdido)} sub="oportunidad total" color="#F59E0B" />
          </div>

          {/* Sub-filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Mostrar:</span>
            {[["all","Todos"], ["lbf","Solo donde LBF lidera 🟢"], ["comp","Solo donde pierde 🔴"]].map(([k, l]) => (
              <button key={k} onClick={() => setLider(k as "all"|"lbf"|"comp")} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: liderFilter === k ? "2px solid #1E40AF" : "1px solid #E2E8F0",
                background: liderFilter === k ? "#EFF6FF" : "white",
                color: liderFilter === k ? "#1E40AF" : "#64748B", cursor: "pointer",
              }}>{l}</button>
            ))}
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>{filteredProductos.length} productos</span>
          </div>

          {/* Product table */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ ...th, width: 28 }} />
                  <th style={th}>Código LBF</th>
                  <th style={th}>Descripción</th>
                  <th style={th}>Cat</th>
                  <th style={thR} title="Ítems donde LBF participó">Items</th>
                  <th style={thR} title="Ítems adjudicados a LBF">Adj LBF</th>
                  <th style={thR} title="% ítems ganados por LBF">Win%</th>
                  <th style={th} title="Quién tiene más adjudicaciones">Líder</th>
                  <th style={thR}>$ Ganado</th>
                  <th style={thR}>$ Perdido</th>
                  <th style={thR} title="Instituciones donde LBF perdió">Obj.</th>
                </tr>
              </thead>
              <tbody>
                {filteredProductos.map((p) => {
                  const key     = `${p.codigo_mp}`;
                  const isExp   = expanded === key;
                  const rowBg   = p.lider_es_lbf ? "#F0FDF4" : "#FFF7F7";
                  const borderL = p.lider_es_lbf ? "3px solid #059669" : "3px solid #EF4444";
                  const catColor = CAT_COLORS[normCat(p.categoria)] || "#64748B";

                  return [
                    <tr
                      key={key}
                      onClick={() => setExpanded(isExp ? null : key)}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: isExp ? (p.lider_es_lbf ? "#DCFCE7" : "#FEE2E2") : rowBg,
                        borderLeft: borderL,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ ...td, width: 28, color: "#94A3B8" }}>
                        {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td style={{ ...td, fontWeight: 700, fontSize: 12, color: catColor, whiteSpace: "nowrap" }}>
                        {p.codigo_lbf || "—"}
                      </td>
                      <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                        {p.desc_lbf || p.nombre_mp}
                      </td>
                      <td style={{ ...td }}>
                        <span style={{ background: `${catColor}20`, color: catColor, padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
                          {normCat(p.categoria)}
                        </span>
                      </td>
                      <td style={tdR}>{p.n_items}</td>
                      <td style={tdR}>{p.n_adj_lbf}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: winColor(p.win_rate) }}>
                        {p.win_rate.toFixed(0)}%
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>
                        {p.lider_es_lbf
                          ? <span style={{ color: "#059669", fontWeight: 700 }}>🟢 LBF ({p.lider_adj} adj)</span>
                          : <span style={{ color: "#EF4444", fontWeight: 600 }}>🔴 {p.lider_nombre} ({p.lider_adj})</span>
                        }
                      </td>
                      <td style={{ ...tdR, color: "#059669", fontWeight: 600 }}>{fmtM(p.venta_lbf)}</td>
                      <td style={{ ...tdR, color: p.monto_perdido > 0 ? "#D97706" : "#94A3B8", fontWeight: 600 }}>
                        {p.monto_perdido > 0 ? fmtM(p.monto_perdido) : "—"}
                      </td>
                      <td style={{ ...tdR, color: p.n_inst_objetivo > 0 ? "#EF4444" : "#94A3B8" }}>
                        {p.n_inst_objetivo > 0 ? p.n_inst_objetivo : "—"}
                      </td>
                    </tr>,

                    isExp && (
                      <tr key={`${key}-detail`}>
                        <td colSpan={11} style={{ padding: 0 }}>
                          <div style={{ background: "#F8FAFC", padding: "12px 20px 12px 48px", borderBottom: "2px solid #E2E8F0" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                              {/* Competidores */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                                  Competidores directos en este producto
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                  <thead>
                                    <tr style={{ background: "#EFF6FF" }}>
                                      <th style={{ ...thSm, textAlign: "left" }}>Empresa</th>
                                      <th style={thSmR}>Items</th>
                                      <th style={thSmR}>Adj</th>
                                      <th style={thSmR}>Win%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* LBF row */}
                                    <tr style={{ background: "#DBEAFE", fontWeight: 700 }}>
                                      <td style={{ padding: "4px 8px" }}>🔵 LBF (tú)</td>
                                      <td style={{ ...tdSmR }}>{p.n_items}</td>
                                      <td style={{ ...tdSmR }}>{p.n_adj_lbf}</td>
                                      <td style={{ ...tdSmR, color: winColor(p.win_rate) }}>{p.win_rate.toFixed(0)}%</td>
                                    </tr>
                                    {p.competidores.map((c, i) => {
                                      const cwr = c.items > 0 ? c.adj / c.items * 100 : 0;
                                      const isLider = !p.lider_es_lbf && c.adj === p.lider_adj;
                                      return (
                                        <tr key={i} style={{ borderBottom: "1px solid #E8EDFB", background: isLider ? "#FEF2F2" : "white" }}>
                                          <td style={{ padding: "4px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {isLider ? "🔴 " : ""}{c.nombre}
                                          </td>
                                          <td style={tdSmR}>{c.items}</td>
                                          <td style={{ ...tdSmR, fontWeight: isLider ? 700 : 400 }}>{c.adj}</td>
                                          <td style={{ ...tdSmR, color: winColor(cwr) }}>{cwr.toFixed(0)}%</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Info producto */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                                  Datos del producto
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                  {[
                                    ["Código MP", String(p.codigo_mp)],
                                    ["Nombre MP", p.nombre_mp.slice(0, 60) || "—"],
                                    ["Licitaciones", String(p.n_lics)],
                                    ["$ Oportunidad", fmtM(p.monto_perdido)],
                                    ["Instituc. objetivo", String(p.n_inst_objetivo)],
                                    ["Categoría", p.categoria || "Sin mapear"],
                                  ].map(([label, val]) => (
                                    <div key={label} style={{ background: "white", borderRadius: 6, padding: "8px 10px", border: "1px solid #E2E8F0" }}>
                                      <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937", marginTop: 2 }}>{val}</div>
                                    </div>
                                  ))}
                                </div>
                                {!p.lider_es_lbf && (
                                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#FEF3C7", borderRadius: 8, border: "1px solid #FCD34D", fontSize: 12 }}>
                                    <strong>🎯 Acción:</strong> {p.n_inst_objetivo} institución{p.n_inst_objetivo !== 1 ? "es" : ""} compra este producto a {p.lider_nombre}. Ver pestaña <em>Oportunidades</em> para el listado.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
            {filteredProductos.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Sin productos para los filtros seleccionados</div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════ TAB: OPORTUNIDADES ══════════════════ */}
      {tab === "oportunidades" && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard label="Instituciones objetivo" value={String(totalOppInst)} sub="compraron a competidores" color="#EF4444" />
            <KpiCard label="$ Total perdido" value={fmtM(totalOppMonto)} sub="oportunidad de recuperar" color="#F59E0B" />
            <KpiCard label="Productos en juego" value={String(totalOppProd)} sub="combinaciones inst.×prod." color="#8B5CF6" />
          </div>

          {/* Opportunities table */}
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #E2E8F0" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                Instituciones que compraron a competidores en productos LBF
              </span>
              <span style={{ fontSize: 12, color: "#64748B", marginLeft: 8 }}>
                — ordenadas por monto perdido, {filteredOpps.length} instituciones
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ ...th, width: 28 }} />
                  <th style={th}>Institución</th>
                  <th style={th}>Región</th>
                  <th style={thR}>Productos</th>
                  <th style={thR}>Ítems perdidos</th>
                  <th style={thR}>$ Perdido</th>
                  <th style={th}>Quién les vende</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpps.map((inst, i) => {
                  const key   = inst.rut || String(i);
                  const isExp = expanded === key;
                  return [
                    <tr
                      key={key}
                      onClick={() => setExpanded(isExp ? null : key)}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: isExp ? "#FFF7ED" : i % 2 === 0 ? "white" : "#FAFBFD",
                        borderLeft: "3px solid #F59E0B",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ ...td, width: 28, color: "#94A3B8" }}>
                        {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td style={{ ...td, fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inst.nombre || inst.rut}
                      </td>
                      <td style={{ ...td, fontSize: 12, color: "#64748B" }}>
                        {inst.region || "—"}
                      </td>
                      <td style={tdR}>{inst.n_productos}</td>
                      <td style={tdR}>{inst.n_items_perdidos}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: "#D97706" }}>
                        {fmtM(inst.monto_perdido)}
                      </td>
                      <td style={{ ...td, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                        {inst.top_competidor !== "Sin datos" ? `🔴 ${inst.top_competidor}` : "—"}
                      </td>
                    </tr>,

                    isExp && (
                      <tr key={`${key}-detail`}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div style={{ background: "#FFFBEB", padding: "10px 20px 14px 48px", borderBottom: "2px solid #FCD34D" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                              Productos comprados a competidores en {inst.nombre}
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                              <thead>
                                <tr style={{ background: "#FEF3C7" }}>
                                  <th style={{ ...thSm, textAlign: "left" }}>Código LBF</th>
                                  <th style={{ ...thSm, textAlign: "left" }}>Descripción</th>
                                  <th style={{ ...thSm, textAlign: "center" }}>Cat</th>
                                  <th style={thSmR}>Ítems</th>
                                  <th style={thSmR}>$ Perdido</th>
                                  <th style={{ ...thSm, textAlign: "left" }}>Quién ganó</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inst.productos.map((prod, j) => {
                                  const cc = CAT_COLORS[normCat(prod.categoria)] || "#64748B";
                                  return (
                                    <tr key={j} style={{ borderBottom: "1px solid #FDE68A" }}>
                                      <td style={{ padding: "4px 8px", fontWeight: 700, color: cc, fontSize: 11 }}>
                                        {prod.codigo_lbf || "—"}
                                      </td>
                                      <td style={{ padding: "4px 8px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {prod.desc_lbf || "—"}
                                      </td>
                                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                        <span style={{ background: `${cc}20`, color: cc, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                                          {normCat(prod.categoria)}
                                        </span>
                                      </td>
                                      <td style={tdSmR}>{prod.n_items}</td>
                                      <td style={{ ...tdSmR, fontWeight: 700, color: "#D97706" }}>{fmtM(prod.monto)}</td>
                                      <td style={{ padding: "4px 8px", color: prod.ganador !== "Sin datos" ? "#EF4444" : "#94A3B8", fontSize: 11 }}>
                                        {prod.ganador !== "Sin datos" ? `🔴 ${prod.ganador}` : "Sin datos (2024-25)"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
            {filteredOpps.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Sin oportunidades para los filtros seleccionados</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const th: React.CSSProperties = {
  padding: "10px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties  = { padding: "8px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const thSm: React.CSSProperties  = { padding: "4px 8px", fontWeight: 600, color: "#374151", fontSize: 11, borderBottom: "1px solid #D1D5DB" };
const thSmR: React.CSSProperties = { ...thSm, textAlign: "right" };
const tdSmR: React.CSSProperties = { padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#1F2937" };
