"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/format";
import HelpButton from "@/components/help-button";
import { ExportButton, SearchInput, TableToolbar } from "@/components/table-tools";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from "recharts";

/* ─── Shared styles ──────────────────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 13 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const TABS = [
  { id: "se", label: "Licitaciones (SE)" },
  { id: "cm", label: "Convenio Marco (CM)" },
  { id: "td", label: "Trato Directo (TD)" },
  { id: "ag", label: "Compra Agil (AG)" },
];
const YEARS = [2026, 2025];
const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 150, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span style={{ color: "#94A3B8" }}>--</span>;
  const color = value > 0 ? "#10B981" : value < 0 ? "#EF4444" : "#64748B";
  const arrow = value > 0 ? "\u25B2" : value < 0 ? "\u25BC" : "";
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{arrow} {Math.abs(value).toFixed(1)}%</span>;
}

function ShareBar({ share, w }: { share: number; w?: number }) {
  const color = share >= 5 ? "#3B82F6" : share >= 1 ? "#60A5FA" : "#93C5FD";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: w || 80, background: "#F1F5F9", borderRadius: 4, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(share * 5, 100)}%`, height: "100%", borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{share}%</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Channel Overview (SE, CM, TD)
   ════════════════════════════════════════════════════════ */
function ChannelOverview({ canal, ano }: { canal: string; ano: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchComp, setSearchComp] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/mercado-publico/overview?canal=${canal}&ano=${ano}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [canal, ano]);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const visibleTrend = data?.tendencia?.filter((t: any) => {
    if (ano < currentYear) return true;
    return t.mes <= currentMonth;
  }) || [];

  const filteredComp = useMemo(() => {
    const comps = data?.competidores || [];
    if (!searchComp.trim()) return comps;
    const q = searchComp.toLowerCase().trim();
    return comps.filter((c: any) => (c.empresa || "").toLowerCase().includes(q));
  }, [data, searchComp]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando datos...</div>;
  if (!data || data.error) return <div style={{ ...card, padding: 40, color: "#EF4444" }}>Error: {data?.error || "sin datos"}</div>;

  const k = data.kpis;
  const subcats = data.subcategorias || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Note about scope */}
      <div style={{ ...card, padding: "12px 18px", background: "#F8FAFC", borderColor: "#E2E8F0" }}>
        <div style={{ fontSize: 12, color: "#475569" }}>
          <strong>Competencia directa:</strong> Solo subcategorias donde LBF vende (cuidado de heridas, quirurgicos, vestuario clinico, esterilizacion, etc.) — no toda la categoria 42.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Mercado Directo" value={fmt(k.mercado_total)} sub={<GrowthBadge value={k.growth_mercado} />} />
        <KpiCard title="Venta LBF" value={fmt(k.lbf_total)} color="#3B82F6" sub={<GrowthBadge value={k.growth_lbf} />} />
        <KpiCard title="Participacion" value={`${k.share}%`} color="#8B5CF6" />
        <KpiCard title="Ranking" value={`#${k.ranking}`} color="#F59E0B" sub={`de ${k.total_proveedores} proveedores`} />
        <KpiCard title="OCs LBF" value={(k.lbf_ocs || 0).toLocaleString()} sub={`de ${(k.total_ocs || 0).toLocaleString()} totales`} />
        <KpiCard title="Instituciones" value={(k.lbf_instituciones || 0).toLocaleString()} sub={`de ${(k.total_instituciones || 0).toLocaleString()} totales`} />
      </div>

      {/* Subcategory breakdown */}
      {subcats.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
              Lineas de Producto LBF — Participacion por Subcategoria
            </h3>
            <ExportButton
              data={subcats}
              columns={[
                { key: "subcategoria", label: "Subcategoria" },
                { key: "mercado", label: "Mercado" },
                { key: "lbf", label: "LBF" },
                { key: "share", label: "Share %" },
              ]}
              filename={`mp_subcategorias_${canal}_${ano}`}
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thS}>Subcategoria</th>
                  <th style={thR}>Mercado</th>
                  <th style={thR}>LBF</th>
                  <th style={thR}>Share</th>
                </tr>
              </thead>
              <tbody>
                {subcats.map((s: any, i: number) => (
                  <tr key={i} style={{ background: rowBg(i) }}>
                    <td style={{ ...td, maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis" }}>{s.subcategoria}</td>
                    <td style={tdR}>{fmt(s.mercado)}</td>
                    <td style={{ ...tdR, color: "#3B82F6", fontWeight: 600 }}>{fmt(s.lbf)}</td>
                    <td style={tdR}><ShareBar share={s.share} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trend chart */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Tendencia Mensual {ano} — Mercado vs LBF</h3>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={visibleTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#8B5CF6", fontSize: 11 }} domain={[0, "auto"]} />
            <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
              formatter={(value: any, name: any) => name === "Share %" ? [`${value}%`, name] : [fmt(value), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="mercado" name="Mercado" fill="#94A3B8" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="lbf" name="LBF" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" dataKey="share" name="Share %" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Growth comparison */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Crecimiento YoY — LBF vs Mercado</h3>
        <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 16px" }}>{ano} vs {ano - 1}, por mes</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={visibleTrend.filter((t: any) => t.growth_mercado !== null || t.growth_lbf !== null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#64748B", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
              formatter={(value: any, name: any) => [`${Number(value)?.toFixed(1)}%`, name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="growth_mercado" name="Crecimiento Mercado" stroke="#94A3B8" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line dataKey="growth_lbf" name="Crecimiento LBF" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly detail table */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Detalle Mensual</h3>
          <ExportButton
            data={visibleTrend.map((t: any) => ({ ...t, mes_nombre: MESES_FULL[t.mes - 1] }))}
            columns={[
              { key: "mes_nombre", label: "Mes" },
              { key: "mercado", label: `Mercado ${ano}` },
              { key: "lbf", label: `LBF ${ano}` },
              { key: "share", label: "Share %" },
              { key: "mercado_prev", label: `Mercado ${ano - 1}` },
              { key: "lbf_prev", label: `LBF ${ano - 1}` },
              { key: "growth_mercado", label: "Crec. Mercado" },
              { key: "growth_lbf", label: "Crec. LBF" },
            ]}
            filename={`mp_detalle_mensual_${canal}_${ano}`}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Mes</th>
                <th style={thR}>Mercado {ano}</th>
                <th style={thR}>LBF {ano}</th>
                <th style={thR}>Share</th>
                <th style={thR}>Mercado {ano - 1}</th>
                <th style={thR}>LBF {ano - 1}</th>
                <th style={thR}>Crec. Mercado</th>
                <th style={thR}>Crec. LBF</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrend.map((t: any, i: number) => (
                <tr key={t.mes} style={{ background: rowBg(i) }}>
                  <td style={td}>{MESES_FULL[t.mes - 1]}</td>
                  <td style={tdR}>{fmt(t.mercado)}</td>
                  <td style={{ ...tdR, color: "#3B82F6", fontWeight: 600 }}>{fmt(t.lbf)}</td>
                  <td style={{ ...tdR, color: "#8B5CF6", fontWeight: 600 }}>{t.share}%</td>
                  <td style={tdR}>{fmt(t.mercado_prev)}</td>
                  <td style={tdR}>{fmt(t.lbf_prev)}</td>
                  <td style={tdR}><GrowthBadge value={t.growth_mercado} /></td>
                  <td style={tdR}><GrowthBadge value={t.growth_lbf} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 20 competitors */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Top 20 Proveedores — Competencia Directa</h3>
          <ExportButton
            data={filteredComp}
            columns={[
              { key: "empresa", label: "Proveedor" },
              { key: "monto", label: "Monto" },
              { key: "share", label: "Part. %" },
              { key: "n_ocs", label: "OCs" },
              { key: "n_instituciones", label: "Instituciones" },
            ]}
            filename={`mp_competidores_${canal}_${ano}`}
          />
        </div>
        <TableToolbar>
          <SearchInput value={searchComp} onChange={setSearchComp} placeholder="Buscar proveedor..." width={220} />
          {searchComp && <span style={{ fontSize: 12, color: "#64748B" }}>{filteredComp.length} de {(data.competidores || []).length}</span>}
        </TableToolbar>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 40 }}>#</th>
                <th style={thS}>Proveedor</th>
                <th style={thR}>Monto</th>
                <th style={thR}>Part. %</th>
                <th style={thR}>OCs</th>
                <th style={thR}>Instituciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredComp.map((c: any, i: number) => {
                const isLbf = c.empresa.toLowerCase().includes("lbf");
                return (
                  <tr key={i} style={{ background: isLbf ? "#EFF6FF" : rowBg(i), fontWeight: isLbf ? 700 : 400 }}>
                    <td style={{ ...td, fontWeight: 700, color: "#64748B" }}>{i + 1}</td>
                    <td style={{ ...td, color: isLbf ? "#3B82F6" : "#1F2937", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{c.empresa}</td>
                    <td style={tdR}>{fmt(c.monto)}</td>
                    <td style={{ ...tdR, color: "#8B5CF6", fontWeight: 600 }}>{c.share}%</td>
                    <td style={tdR}>{c.n_ocs.toLocaleString()}</td>
                    <td style={tdR}>{c.n_instituciones.toLocaleString()}</td>
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

/* ════════════════════════════════════════════════════════
   Compra Agil Tab
   ════════════════════════════════════════════════════════ */
function CompraAgilTab({ ano }: { ano: number }) {
  const [data, setData] = useState<any>(null);
  const [resellers, setResellers] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRes, setLoadingRes] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchRes, setSearchRes] = useState("");
  const [searchProv, setSearchProv] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadingRes(true);
    setExpandedRow(null);
    api.get<any>(`/api/mercado-publico/compra-agil?ano=${ano}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
    api.get<any>(`/api/mercado-publico/ag-resellers?ano=${ano}`, { noCache: true })
      .then(r => { setResellers(r); setLoadingRes(false); })
      .catch(() => setLoadingRes(false));
  }, [ano]);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const visibleTrend = data?.tendencia?.filter((t: any) => {
    if (ano < currentYear) return true;
    return t.mes <= currentMonth;
  }) || [];

  const filteredResellers = useMemo(() => {
    const list = resellers?.resellers || [];
    if (!searchRes.trim()) return list;
    const q = searchRes.toLowerCase().trim();
    return list.filter((r: any) =>
      (r.nombre_lbf || "").toLowerCase().includes(q) ||
      (r.nombre_mp || "").toLowerCase().includes(q)
    );
  }, [resellers, searchRes]);

  const filteredProv = useMemo(() => {
    const list = data?.primer_llamado || [];
    if (!searchProv.trim()) return list;
    const q = searchProv.toLowerCase().trim();
    return list.filter((c: any) => (c.empresa || "").toLowerCase().includes(q));
  }, [data, searchProv]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando datos de Compra Agil...</div>;
  if (!data || data.error) return <div style={{ ...card, padding: 40, color: "#EF4444" }}>Error: {data?.error || "sin datos"}</div>;

  const k = data.kpis || {};
  const res = resellers || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Note */}
      <div style={{ ...card, padding: "12px 18px", background: "#F8FAFC", borderColor: "#E2E8F0" }}>
        <div style={{ fontSize: 12, color: "#475569" }}>
          <strong>Compra Agil:</strong> LBF no puede participar en primer llamado. Clientes de LBF compran nuestros productos y los revenden en AG. Aqui identificamos esos revendedores. Analisis detallado en el modulo <strong style={{ color: "#F59E0B" }}>Compra Agil</strong>.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Mercado AG" value={fmt(k.mercado_total || 0)} sub={<GrowthBadge value={k.growth_mercado} />} />
        <KpiCard title="Venta LBF (2do llamado)" value={fmt(k.lbf_total || 0)} color="#3B82F6" sub={<GrowthBadge value={k.growth_lbf} />} />
        <KpiCard title="Participacion" value={`${k.share || 0}%`} color="#8B5CF6" />
        <KpiCard title="Revendedores" value={`${res.total_resellers || 0}`} color="#F59E0B" sub="clientes LBF en AG" />
        <KpiCard title="Compra a LBF" value={fmt(res.total_compra_lbf || 0)} color="#10B981" sub="por revendedores YTD" />
      </div>

      {/* ═══ RESELLERS TABLE with monthly expand ═══ */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Revendedores — Clientes LBF que venden en Compra Agil (YTD {ano})
          </h3>
          <ExportButton
            data={(res.resellers || []).map((r: any) => ({
              nombre_lbf: r.nombre_lbf, nombre_mp: r.nombre_mp,
              compra_lbf: r.compra_lbf, venta_ag: r.venta_ag,
              ratio: r.compra_lbf > 0 ? (r.venta_ag / r.compra_lbf * 100).toFixed(0) + "%" : "--",
              n_ocs_ag: r.n_ocs_ag, n_instituciones: r.n_instituciones,
            }))}
            columns={[
              { key: "nombre_lbf", label: "Cliente LBF" },
              { key: "nombre_mp", label: "Nombre en MP" },
              { key: "compra_lbf", label: "Compra a LBF" },
              { key: "venta_ag", label: "Venta AG" },
              { key: "ratio", label: "Ratio" },
              { key: "n_ocs_ag", label: "OCs AG" },
              { key: "n_instituciones", label: "Instituciones" },
            ]}
            filename={`mp_revendedores_ag_${ano}`}
          />
        </div>
        <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 8px" }}>
          Cruce entre facturacion LBF y proveedores AG en Mercado Publico. Haz clic en fila para ver detalle mensual.
        </p>
        {loadingRes ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cruzando bases de datos...</div>
        ) : resellers?.error ? (
          <div style={{ padding: 20, color: "#EF4444" }}>Error: {resellers.error}</div>
        ) : (
          <>
          <TableToolbar>
            <SearchInput value={searchRes} onChange={setSearchRes} placeholder="Buscar cliente..." width={220} />
            {searchRes && <span style={{ fontSize: 12, color: "#64748B" }}>{filteredResellers.length} de {(res.resellers || []).length}</span>}
          </TableToolbar>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thS, width: 35 }}>#</th>
                  <th style={thS}>Cliente LBF</th>
                  <th style={thS}>Nombre en MP</th>
                  <th style={thR}>Compra a LBF</th>
                  <th style={thR}>Venta AG</th>
                  <th style={thR}>Ratio</th>
                  <th style={thR}>OCs AG</th>
                  <th style={thR}>Instituciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredResellers.map((r: any, i: number) => {
                  const sameName = r.nombre_lbf.toLowerCase().replace(/\s/g, '') === r.nombre_mp.toLowerCase().replace(/\s/g, '');
                  const isMp = r.destacado;
                  const ratio = r.compra_lbf > 0 ? (r.venta_ag / r.compra_lbf * 100).toFixed(0) : "--";
                  const isExpanded = expandedRow === i;
                  return (
                    <>
                      <tr
                        key={i}
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        style={{
                          background: isMp ? "#FFFBEB" : rowBg(i),
                          cursor: "pointer",
                          borderLeft: isMp ? "3px solid #F59E0B" : "3px solid transparent",
                        }}
                      >
                        <td style={{ ...td, fontWeight: 700, color: "#64748B" }}>{i + 1}</td>
                        <td style={{ ...td, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", fontWeight: isMp ? 700 : 400, color: isMp ? "#B45309" : "#1F2937" }}>
                          {r.nombre_lbf}
                          {isMp && <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>PRECIO ESPECIAL</span>}
                        </td>
                        <td style={{ ...td, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", color: sameName ? "#94A3B8" : "#F59E0B", fontStyle: sameName ? "normal" : "italic" }}>
                          {sameName ? "\u2014" : r.nombre_mp}
                        </td>
                        <td style={{ ...tdR, color: "#10B981", fontWeight: 600 }}>{fmt(r.compra_lbf)}</td>
                        <td style={{ ...tdR, color: "#3B82F6", fontWeight: 700 }}>{fmt(r.venta_ag)}</td>
                        <td style={{ ...tdR, color: Number(ratio) > 500 ? "#EF4444" : "#64748B", fontSize: 12 }}>{ratio}%</td>
                        <td style={tdR}>{r.n_ocs_ag.toLocaleString()}</td>
                        <td style={tdR}>{r.n_instituciones.toLocaleString()}</td>
                      </tr>
                      {isExpanded && r.meses && r.meses.length > 0 && (
                        <tr key={`exp-${i}`}>
                          <td colSpan={8} style={{ padding: 0, background: "#F8FAFC" }}>
                            <div style={{ padding: "8px 16px 12px 48px" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>Detalle mensual {ano}</div>
                              <table style={{ width: "auto", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...thS, fontSize: 11, padding: "4px 10px" }}>Mes</th>
                                    <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Compra LBF</th>
                                    <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Venta AG</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.meses.map((m: any) => (
                                    <tr key={m.mes}>
                                      <td style={{ ...td, fontSize: 12, padding: "3px 10px" }}>{MESES_FULL[m.mes - 1]}</td>
                                      <td style={{ ...tdR, fontSize: 12, padding: "3px 10px", color: "#10B981" }}>{fmt(m.compra_lbf)}</td>
                                      <td style={{ ...tdR, fontSize: 12, padding: "3px 10px", color: "#3B82F6" }}>{fmt(m.venta_ag)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Primer Llamado: top providers in LBF product categories */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Top Proveedores AG — En categorias LBF
          </h3>
          <ExportButton
            data={filteredProv}
            columns={[
              { key: "empresa", label: "Proveedor" },
              { key: "monto", label: "Monto" },
              { key: "share", label: "Part. %" },
              { key: "n_ocs", label: "OCs" },
              { key: "n_instituciones", label: "Instituciones" },
            ]}
            filename={`mp_proveedores_ag_${ano}`}
          />
        </div>
        <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 8px" }}>
          Quienes venden mas en las lineas de producto donde LBF compite
        </p>
        <TableToolbar>
          <SearchInput value={searchProv} onChange={setSearchProv} placeholder="Buscar proveedor..." width={220} />
          {searchProv && <span style={{ fontSize: 12, color: "#64748B" }}>{filteredProv.length} de {(data.primer_llamado || []).length}</span>}
        </TableToolbar>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 40 }}>#</th>
                <th style={thS}>Proveedor</th>
                <th style={thR}>Monto</th>
                <th style={thR}>Part. %</th>
                <th style={thR}>OCs</th>
                <th style={thR}>Instituciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProv.map((c: any, i: number) => {
                const isLbf = c.empresa.toLowerCase().includes("lbf");
                const isRenhet = c.empresa.toLowerCase().includes("renhet") || c.empresa.toLowerCase().includes("multiproducto");
                return (
                  <tr key={i} style={{ background: isLbf ? "#EFF6FF" : isRenhet ? "#FFFBEB" : rowBg(i), fontWeight: isLbf || isRenhet ? 700 : 400 }}>
                    <td style={{ ...td, fontWeight: 700, color: "#64748B" }}>{i + 1}</td>
                    <td style={{ ...td, color: isLbf ? "#3B82F6" : isRenhet ? "#B45309" : "#1F2937", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.empresa}
                      {isRenhet && <span style={{ fontSize: 10, color: "#92400E", marginLeft: 6 }}>= Multiproducto</span>}
                    </td>
                    <td style={tdR}>{fmt(c.monto)}</td>
                    <td style={{ ...tdR, color: "#8B5CF6", fontWeight: 600 }}>{c.share}%</td>
                    <td style={tdR}>{c.n_ocs.toLocaleString()}</td>
                    <td style={tdR}>{c.n_instituciones.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly trend */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Tendencia Mensual Compra Agil {ano}</h3>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={visibleTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#8B5CF6", fontSize: 11 }} domain={[0, "auto"]} />
            <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
              formatter={(value: any, name: any) => name === "Share %" ? [`${value}%`, name] : [fmt(value), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="mercado" name="Mercado" fill="#94A3B8" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="lbf" name="LBF" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" dataKey="share" name="Share %" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly detail */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Detalle Mensual</h3>
          <ExportButton
            data={visibleTrend.map((t: any) => ({ ...t, mes_nombre: MESES_FULL[t.mes - 1] }))}
            columns={[
              { key: "mes_nombre", label: "Mes" },
              { key: "mercado", label: `Mercado ${ano}` },
              { key: "lbf", label: `LBF ${ano}` },
              { key: "share", label: "Share %" },
              { key: "mercado_prev", label: `Mercado ${ano - 1}` },
              { key: "lbf_prev", label: `LBF ${ano - 1}` },
              { key: "growth_mercado", label: "Crec. Mercado" },
              { key: "growth_lbf", label: "Crec. LBF" },
            ]}
            filename={`mp_detalle_mensual_ag_${ano}`}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Mes</th>
                <th style={thR}>Mercado {ano}</th>
                <th style={thR}>LBF {ano}</th>
                <th style={thR}>Share</th>
                <th style={thR}>Mercado {ano - 1}</th>
                <th style={thR}>LBF {ano - 1}</th>
                <th style={thR}>Crec. Mercado</th>
                <th style={thR}>Crec. LBF</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrend.map((t: any, i: number) => (
                <tr key={t.mes} style={{ background: rowBg(i) }}>
                  <td style={td}>{MESES_FULL[t.mes - 1]}</td>
                  <td style={tdR}>{fmt(t.mercado)}</td>
                  <td style={{ ...tdR, color: "#3B82F6", fontWeight: 600 }}>{fmt(t.lbf)}</td>
                  <td style={{ ...tdR, color: "#8B5CF6", fontWeight: 600 }}>{t.share}%</td>
                  <td style={tdR}>{fmt(t.mercado_prev)}</td>
                  <td style={tdR}>{fmt(t.lbf_prev)}</td>
                  <td style={tdR}><GrowthBadge value={t.growth_mercado} /></td>
                  <td style={tdR}><GrowthBadge value={t.growth_lbf} /></td>
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
   Licitacion Analisis — 2239-21-LR23
   ════════════════════════════════════════════════════════ */
const PROV_COLORS = ["#EF4444","#F59E0B","#8B5CF6","#10B981","#EC4899","#06B6D4","#84CC16","#F97316","#6366F1","#14B8A6"];
const LBF_COLOR = "#3B82F6";

function MsBar({ pct, isLbf, width = 80 }: { pct: number; isLbf?: boolean; width?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width, background: "#F1F5F9", borderRadius: 4, height: 12, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: isLbf ? LBF_COLOR : "#94A3B8", borderRadius: 4 }} />
      </div>
      <span style={{ color: isLbf ? LBF_COLOR : "#374151", fontWeight: 600, fontSize: 12 }}>{pct}%</span>
    </div>
  );
}

function LicitacionAnalisis({ codigo }: { codigo: string }) {
  const [base, setBase] = useState<any>(null);           // datos sin filtrar (meses disponibles, proveedores)
  const [data, setData] = useState<any>(null);           // datos con filtros aplicados
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);

  // Filtros
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [provFiltro, setProvFiltro] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [searchComp, setSearchComp] = useState("");

  // Carga inicial (sin filtros)
  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/mercado-publico/licitacion-analisis?codigo=${encodeURIComponent(codigo)}`, { noCache: true })
      .then(r => { setBase(r); setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [codigo]);

  // Aplicar filtros
  const applyFilters = useCallback(() => {
    let url = `/api/mercado-publico/licitacion-analisis?codigo=${encodeURIComponent(codigo)}`;
    if (desde) url += `&desde=${desde}`;
    if (hasta) url += `&hasta=${hasta}`;
    if (provFiltro) url += `&proveedor=${encodeURIComponent(provFiltro)}`;
    setFiltering(true);
    api.get<any>(url, { noCache: true })
      .then(r => { setData(r); setFiltering(false); })
      .catch(() => setFiltering(false));
  }, [codigo, desde, hasta, provFiltro]);

  const resetFilters = useCallback(() => {
    setDesde(""); setHasta(""); setProvFiltro("");
    setData(base);
  }, [base]);

  const filteredComp = useMemo(() => {
    const list = data?.compradores || [];
    if (!searchComp.trim()) return list;
    const q = searchComp.toLowerCase();
    return list.filter((c: any) => (c.organismo || "").toLowerCase().includes(q) || (c.unidad || "").toLowerCase().includes(q));
  }, [data, searchComp]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando analisis licitacion...</div>;
  if (!data || data.error) return <div style={{ ...card, padding: 20, color: "#EF4444" }}>Error cargando analisis: {data?.error || "sin datos"}</div>;

  const k = data.kpis || {};
  const categorias: any[] = data.categorias || [];
  const ranking: any[] = data.ranking || [];
  const tendencia: any[] = data.tendencia || [];
  const top5: string[] = data.proveedores_top5 || [];
  const mesesDisp: string[] = base?.meses_disponibles || [];
  const proveedoresDisp: string[] = (base?.ranking || []).map((r: any) => r.proveedor);

  // Color map por proveedor
  const colorMap: Record<string, string> = {};
  let ci = 0;
  for (const r of ranking) {
    colorMap[r.proveedor] = r.es_lbf ? LBF_COLOR : PROV_COLORS[ci++ % PROV_COLORS.length];
  }
  const hasOtros = tendencia.some((d: any) => (d["Otros"] || 0) > 0);

  const hayFiltros = desde || hasta || provFiltro;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Licitacion</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "white", background: "#6366F1", borderRadius: 6, padding: "3px 12px" }}>{codigo}</span>
            {hayFiltros && <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>FILTROS ACTIVOS</span>}
          </div>
          <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
            Convenio Marco — {k.fecha_inicio} a {k.fecha_ultimo} · {k.n_ocs} OCs · {k.n_proveedores} proveedores · {k.n_compradores} instituciones
          </p>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────── */}
      <div style={{ ...card, background: "#F8FAFC", padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Desde</div>
            <select
              value={desde}
              onChange={e => setDesde(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13, background: "white", minWidth: 120 }}
            >
              <option value="">Todo</option>
              {mesesDisp.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Hasta</div>
            <select
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13, background: "white", minWidth: 120 }}
            >
              <option value="">Todo</option>
              {mesesDisp.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Proveedor</div>
            <select
              value={provFiltro}
              onChange={e => setProvFiltro(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 13, background: "white", minWidth: 180 }}
            >
              <option value="">Todos</option>
              {proveedoresDisp.map(p => <option key={p} value={p}>{p.length > 35 ? p.slice(0, 33) + "…" : p}</option>)}
            </select>
          </div>
          <button
            onClick={applyFilters}
            disabled={filtering}
            style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "#3B82F6", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {filtering ? "Filtrando…" : "Aplicar"}
          </button>
          {hayFiltros && (
            <button
              onClick={resetFilters}
              style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #CBD5E1", background: "white", color: "#64748B", fontSize: 13, cursor: "pointer" }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Mercado Total" value={fmt(k.monto_total)} sub={`${(k.n_ocs || 0).toLocaleString()} OCs`} />
        <KpiCard title="Venta LBF" value={fmt(k.lbf_monto)} color={LBF_COLOR} />
        <KpiCard title="Market Share LBF" value={`${k.ms_lbf ?? "--"}%`} color="#8B5CF6" />
        <KpiCard title="Proveedores" value={`${k.n_proveedores || 0}`} color="#F59E0B" />
        <KpiCard title="Compradores" value={`${k.n_compradores || 0}`} color="#10B981" sub="instituciones" />
      </div>

      {/* ── Por Categoría (acordeón) ──────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Categorias del Contrato Marco</h3>
          <ExportButton
            data={categorias.map(c => ({ categoria: c.categoria, monto: c.monto, lbf_monto: c.lbf_monto, ms_lbf: c.ms_lbf, n_ocs: c.n_ocs, n_proveedores: c.n_proveedores }))}
            columns={[
              { key: "categoria", label: "Categoria" },
              { key: "monto", label: "Mercado" },
              { key: "lbf_monto", label: "LBF" },
              { key: "ms_lbf", label: "MS LBF %" },
              { key: "n_ocs", label: "OCs" },
              { key: "n_proveedores", label: "Proveedores" },
            ]}
            filename={`lic_${codigo}_categorias`}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>Categoria</th>
              <th style={thR}>Mercado</th>
              <th style={thR}>LBF</th>
              <th style={thR}>MS LBF</th>
              <th style={thR}>OCs</th>
              <th style={thR}>Proveedores</th>
              <th style={{ ...thS, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((cat: any, i: number) => {
              const isOpen = expandedCat === cat.categoria_full;
              return (
                <>
                  <tr
                    key={cat.categoria_full}
                    style={{ background: cat.tiene_lbf ? "#EFF6FF" : rowBg(i), cursor: "pointer", borderLeft: cat.tiene_lbf ? `3px solid ${LBF_COLOR}` : "3px solid transparent" }}
                    onClick={() => setExpandedCat(isOpen ? null : cat.categoria_full)}
                  >
                    <td style={{ ...td, fontWeight: cat.tiene_lbf ? 700 : 400 }}>
                      {cat.categoria}
                      {cat.tiene_lbf && <span style={{ fontSize: 10, background: "#DBEAFE", color: "#1D4ED8", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>LBF</span>}
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400 }}>{cat.categoria_grupo}</div>
                    </td>
                    <td style={tdR}>{fmt(cat.monto)}</td>
                    <td style={{ ...tdR, color: LBF_COLOR, fontWeight: cat.tiene_lbf ? 700 : 400 }}>{cat.tiene_lbf ? fmt(cat.lbf_monto) : "—"}</td>
                    <td style={tdR}><MsBar pct={cat.ms_lbf} isLbf={cat.tiene_lbf} width={60} /></td>
                    <td style={tdR}>{cat.n_ocs}</td>
                    <td style={tdR}>{cat.n_proveedores}</td>
                    <td style={{ ...td, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                      {isOpen ? "▲ Cerrar" : "▼ Ver productos"}
                    </td>
                  </tr>
                  {isOpen && cat.productos.length > 0 && (
                    <tr key={`prod-${cat.categoria_full}`}>
                      <td colSpan={7} style={{ padding: 0, background: "#F8FAFC" }}>
                        <div style={{ padding: "10px 16px 14px 32px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Productos × Proveedor
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={{ ...thS, fontSize: 11, padding: "5px 10px" }}>Producto</th>
                                <th style={{ ...thS, fontSize: 11, padding: "5px 10px" }}>Proveedor</th>
                                <th style={{ ...thR, fontSize: 11, padding: "5px 10px" }}>Monto</th>
                                <th style={{ ...thR, fontSize: 11, padding: "5px 10px" }}>OCs</th>
                                <th style={{ ...thR, fontSize: 11, padding: "5px 10px" }}>Precio Prom</th>
                                <th style={{ ...thR, fontSize: 11, padding: "5px 10px" }}>Cantidad</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cat.productos.map((p: any, pi: number) => (
                                <tr key={pi} style={{ background: p.es_lbf ? "#EFF6FF" : rowBg(pi) }}>
                                  <td style={{ ...td, fontSize: 12, padding: "5px 10px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{p.producto}</td>
                                  <td style={{ ...td, fontSize: 12, padding: "5px 10px", color: p.es_lbf ? LBF_COLOR : "#374151", fontWeight: p.es_lbf ? 700 : 400, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.proveedor}</td>
                                  <td style={{ ...tdR, fontSize: 12, padding: "5px 10px", fontWeight: 600 }}>{fmt(p.monto)}</td>
                                  <td style={{ ...tdR, fontSize: 12, padding: "5px 10px" }}>{p.n_ocs}</td>
                                  <td style={{ ...tdR, fontSize: 12, padding: "5px 10px" }}>{p.precio_prom.toLocaleString("es-CL")}</td>
                                  <td style={{ ...tdR, fontSize: 12, padding: "5px 10px" }}>{p.cantidad.toLocaleString("es-CL")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Ranking proveedores ────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Ranking Proveedores</h3>
          <ExportButton
            data={ranking}
            columns={[{ key: "rank", label: "#" }, { key: "proveedor", label: "Proveedor" }, { key: "n_ocs", label: "OCs" }, { key: "monto", label: "Monto" }, { key: "ms_pct", label: "MS %" }, { key: "n_compradores", label: "Compradores" }]}
            filename={`lic_${codigo}_ranking`}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: 40 }}>#</th>
              <th style={thS}>Proveedor</th>
              <th style={thR}>Monto</th>
              <th style={thR}>MS %</th>
              <th style={thR}>OCs</th>
              <th style={thR}>Instituciones</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r: any, i: number) => (
              <tr key={i} style={{ background: r.es_lbf ? "#EFF6FF" : rowBg(i), fontWeight: r.es_lbf ? 700 : 400 }}>
                <td style={{ ...td, fontWeight: 800, color: i === 0 ? "#F59E0B" : "#64748B" }}>{r.rank}</td>
                <td style={{ ...td, color: r.es_lbf ? LBF_COLOR : "#1F2937", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.proveedor}
                  {r.es_lbf && <span style={{ fontSize: 10, background: "#DBEAFE", color: "#1D4ED8", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>LBF</span>}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>{fmt(r.monto)}</td>
                <td style={tdR}><MsBar pct={r.ms_pct} isLbf={r.es_lbf} width={70} /></td>
                <td style={tdR}>{r.n_ocs}</td>
                <td style={tdR}>{r.n_compradores}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tendencia mensual ──────────────────────────────── */}
      {tendencia.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Tendencia Mensual por Proveedor</h3>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes" tick={{ fill: "#64748B", fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: any) => [fmt(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => v.length > 28 ? v.slice(0, 26) + "…" : v} />
              {top5.map((p, idx) => (
                <Bar key={p} dataKey={p} stackId="a" fill={colorMap[p] || PROV_COLORS[idx % PROV_COLORS.length]} radius={idx === top5.length - 1 && !hasOtros ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
              {hasOtros && <Bar dataKey="Otros" stackId="a" fill="#CBD5E1" radius={[4, 4, 0, 0]} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Instituciones compradoras ──────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>Instituciones Compradoras</h3>
          <ExportButton
            data={filteredComp}
            columns={[{ key: "organismo", label: "Organismo" }, { key: "unidad", label: "Unidad" }, { key: "n_ocs", label: "OCs" }, { key: "monto", label: "Monto" }, { key: "ms_lbf", label: "MS LBF %" }, { key: "n_proveedores", label: "Proveedores" }]}
            filename={`lic_${codigo}_compradores`}
          />
        </div>
        <TableToolbar>
          <SearchInput value={searchComp} onChange={setSearchComp} placeholder="Buscar organismo..." width={240} />
          {searchComp && <span style={{ fontSize: 12, color: "#64748B" }}>{filteredComp.length} de {(data.compradores || []).length}</span>}
        </TableToolbar>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>Organismo</th>
              <th style={thS}>Unidad</th>
              <th style={thR}>Monto Total</th>
              <th style={thR}>Venta LBF</th>
              <th style={thR}>MS LBF</th>
              <th style={thR}>OCs</th>
              <th style={thR}>Proveedores</th>
            </tr>
          </thead>
          <tbody>
            {filteredComp.map((c: any, i: number) => (
              <tr key={i} style={{ background: c.lbf_monto > 0 ? "#EFF6FF" : rowBg(i) }}>
                <td style={{ ...td, fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{c.organismo}</td>
                <td style={{ ...td, color: "#475569", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.unidad || "—"}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmt(c.monto)}</td>
                <td style={{ ...tdR, color: LBF_COLOR, fontWeight: c.lbf_monto > 0 ? 700 : 400 }}>{c.lbf_monto > 0 ? fmt(c.lbf_monto) : "—"}</td>
                <td style={tdR}><MsBar pct={c.ms_lbf} isLbf={c.lbf_monto > 0} width={60} /></td>
                <td style={tdR}>{c.n_ocs}</td>
                <td style={tdR}>{c.n_proveedores}</td>
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
export default function MercadoPublicoPage() {
  const [tab, setTab] = useState("se");
  const [ano, setAno] = useState(2026);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Mercado Publico</h1>
            <HelpButton module="mercado-publico" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>Posicion de LBF en insumos medicos — competencia directa</p>
        </div>
        <select
          value={ano}
          onChange={e => setAno(Number(e.target.value))}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid #CBD5E1",
            fontSize: 13, color: "#374151", background: "white", cursor: "pointer",
          }}
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Channel tabs */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 4, width: "fit-content" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
              background: tab === t.id ? "white" : "transparent",
              color: tab === t.id ? "#0F172A" : "#64748B",
              boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "ag" ? (
        <CompraAgilTab ano={ano} />
      ) : tab === "cm" ? (
        <LicitacionAnalisis codigo="2239-21-LR23" />
      ) : (
        <ChannelOverview canal={tab} ano={ano} />
      )}
    </div>
  );
}
