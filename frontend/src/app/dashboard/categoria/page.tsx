"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import HelpButton from "@/components/help-button";
import { ExportButton, SearchInput, TableToolbar } from "@/components/table-tools";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Line, ComposedChart, LabelList,
} from "recharts";

/* ─── Types ──────────────────────────────────────────────── */

interface Kpis {
  venta_ytd_26: number;
  venta_ytd_25: number;
  crec_ytd: number;
  margen_ytd: number;
  venta_mes_26: number;
  venta_mes_25: number;
  crec_mes: number;
  productos: number;
  mes_nombre: string;
  mes_anterior: string;
}

interface Tendencia {
  mes: number;
  mes_nombre: string;
  venta_25: number;
  venta_26: number;
  crec: number | null;
}

interface Semana {
  semana: string;
  periodo: string;
  venta_actual: number;
  venta_anterior: number;
  acum_actual: number;
  acum_anterior: number;
  crec: number | null;
}

interface CatRow {
  categoria: string;
  venta_26: number;
  venta_25: number;
  crec: number | null;
  margen: number;
  pct: number;
}

interface ProdRow {
  codigo: string;
  descripcion: string;
  venta_26: number;
  venta_25: number;
  crec: number | null;
  margen: number;
  cant: number;
}

interface MPData {
  kpis: Kpis;
  tendencia: Tendencia[];
  avance_semanal: Semana[];
  categorias: CatRow[];
  productos: ProdRow[];
  error?: string;
}

/* ─── Colors ─────────────────────────────────────────────── */

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

/* ─── Shared UI ──────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: "1 1 160px", background: "white", borderRadius: 10,
      border: "1px solid #E2E8F0", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "14px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

const MESES_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const cardAg: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function AgKpiCard({ title, value, sub, color }: { title: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...cardAg, flex: 1, minWidth: 140, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ─── Month Selector ─────────────────────────────────────── */

function MonthSelector({ selected, onChange, includeYtd }: { selected: number; onChange: (m: number) => void; includeYtd?: boolean }) {
  const maxMonth = new Date().getMonth() + 1;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {includeYtd && (
        <button
          onClick={() => onChange(0)}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: selected === 0 ? 700 : 400,
            background: selected === 0 ? "#DBEAFE" : "#F1F5F9",
            color: selected === 0 ? "#1E40AF" : "#64748B",
          }}
        >
          YTD
        </button>
      )}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m <= maxMonth).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: selected === m ? 700 : 400,
            background: selected === m ? "#FEF3C7" : "#F1F5F9",
            color: selected === m ? "#92400E" : "#64748B",
          }}
        >
          {MESES_FULL[m - 1].slice(0, 3)}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 1: Multiproducto — LBF purchases vs AG sales
   ═══════════════════════════════════════════════════════════ */

function MultiproductoTab() {
  const [overview, setOverview] = useState<any>(null);
  const [mesData, setMesData] = useState<any>(null);
  const [selectedMes, setSelectedMes] = useState(() => new Date().getMonth() + 1);
  const [loadingOv, setLoadingOv] = useState(true);
  const [loadingMes, setLoadingMes] = useState(true);
  const ano = 2026;

  useEffect(() => {
    setLoadingOv(true);
    api.get<any>(`/api/mercado-publico/ag-multiproducto?ano=${ano}`, { noCache: true })
      .then(r => { setOverview(r); setLoadingOv(false); })
      .catch(() => setLoadingOv(false));
  }, []);

  useEffect(() => {
    setLoadingMes(true);
    api.get<any>(`/api/mercado-publico/ag-multiproducto-mes?ano=${ano}&mes=${selectedMes}`, { noCache: true })
      .then(r => { setMesData(r); setLoadingMes(false); })
      .catch(() => setLoadingMes(false));
  }, [selectedMes]);

  const ov = overview || {};
  const md = mesData || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Note */}
      <div style={{ ...cardAg, padding: "12px 18px", background: "#FFFBEB", borderColor: "#FCD34D" }}>
        <div style={{ fontSize: 12, color: "#92400E" }}>
          <strong>Multiproducto / Renhet</strong> recibe precios especiales de LBF. Revende productos en Compra Agil (primer llamado). Nos indicaron que marginan un 20%.
          Aqui puedes verificar comparando nuestro precio vs el precio de adjudicacion AG.
        </div>
      </div>

      {/* YTD KPIs */}
      {loadingOv ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando resumen...</div>
      ) : ov.error ? (
        <div style={{ padding: 20, color: "#EF4444" }}>Error: {ov.error}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <AgKpiCard title="Compra a LBF (YTD)" value={fmtAbs(ov.total_compra_lbf || 0)} color="#10B981" />
            <AgKpiCard title="Venta AG medica (YTD)" value={fmtAbs(ov.total_venta_ag || 0)} color="#3B82F6" />
            <AgKpiCard
              title="Ratio AG / LBF"
              value={ov.total_compra_lbf > 0 ? `${(ov.total_venta_ag / ov.total_compra_lbf * 100).toFixed(0)}%` : "--"}
              color="#EF4444"
              sub={ov.total_venta_ag > ov.total_compra_lbf * 1.5 ? "Compra a otros proveedores" : undefined}
            />
          </div>

          {/* Monthly chart */}
          {ov.mensual && ov.mensual.length > 0 && (
            <div style={cardAg}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Compra a LBF vs Venta en AG por mes</div>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={ov.mensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [fmtAbs(value), name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="compra_lbf" name="Compra a LBF" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="venta_ag" name="Venta en AG" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ═══ MONTH SELECTOR + PRODUCT DETAIL ═══ */}
      <div style={{ ...cardAg, borderColor: "#FCD34D", borderWidth: 2 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#92400E", margin: 0 }}>
            Detalle por Producto — {MESES_FULL[selectedMes - 1]} {ano}
          </h3>
          <MonthSelector selected={selectedMes} onChange={setSelectedMes} />
        </div>

        {loadingMes ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando detalle {MESES_FULL[selectedMes - 1]}...</div>
        ) : md.error ? (
          <div style={{ padding: 20, color: "#EF4444" }}>Error: {md.error}</div>
        ) : (
          <>
            {/* Month KPIs */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <AgKpiCard title={`Compra LBF ${MESES_FULL[selectedMes - 1]}`} value={fmtAbs(md.total_compra_lbf || 0)} color="#10B981" sub={`${md.n_productos_lbf || 0} productos`} />
              <AgKpiCard title={`Venta AG ${MESES_FULL[selectedMes - 1]}`} value={fmtAbs(md.total_venta_ag || 0)} color="#3B82F6" sub={`${md.n_productos_ag || 0} productos`} />
            </div>

            {/* LBF products + AG products stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* What they bought from LBF */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>
                    Nos compro en {MESES_FULL[selectedMes - 1]}
                  </div>
                  <ExportButton data={md.compras_lbf || []} filename={`multiproducto_compras_${MESES_FULL[selectedMes - 1]}`} columns={[
                    { key: "codigo", label: "Codigo" }, { key: "descripcion", label: "Descripcion" }, { key: "categoria", label: "Categoria" },
                    { key: "cantidad", label: "Cantidad" }, { key: "precio_unit", label: "Precio Unit." }, { key: "venta", label: "Total" },
                  ]} />
                </div>
                <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "white" }}>
                      <tr>
                        <th style={{ ...thStyle, fontSize: 11 }}>Codigo</th>
                        <th style={{ ...thStyle, fontSize: 11, maxWidth: 200 }}>Descripcion</th>
                        <th style={{ ...thStyle, fontSize: 11 }}>Cat.</th>
                        <th style={{ ...thR, fontSize: 11 }}>Cant.</th>
                        <th style={{ ...thR, fontSize: 11 }}>Precio Unit.</th>
                        <th style={{ ...thR, fontSize: 11 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(md.compras_lbf || []).map((p: any, i: number) => (
                        <tr key={i} style={{ background: rowBg(i) }}>
                          <td style={{ ...tdStyle, fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>{p.codigo}</td>
                          <td style={{ ...tdStyle, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                          <td style={{ ...tdStyle, fontSize: 10 }}>{p.categoria}</td>
                          <td style={{ ...tdR, fontSize: 11 }}>{p.cantidad.toLocaleString()}</td>
                          <td style={{ ...tdR, fontSize: 11, fontWeight: 700, color: "#10B981" }}>{fmtAbs(p.precio_unit)}</td>
                          <td style={{ ...tdR, fontSize: 11 }}>{fmtAbs(p.venta)}</td>
                        </tr>
                      ))}
                      {(md.compras_lbf || []).length === 0 && (
                        <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Sin compras este mes</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT: What they sold in AG */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#3B82F6" }}>
                    Vendio en AG en {MESES_FULL[selectedMes - 1]}
                  </div>
                  <ExportButton data={md.ventas_ag || []} filename={`multiproducto_ventas_ag_${MESES_FULL[selectedMes - 1]}`} columns={[
                    { key: "descripcion", label: "Producto" }, { key: "tipo_producto", label: "Tipo" }, { key: "institucion", label: "Institucion" },
                    { key: "cantidad", label: "Cantidad" }, { key: "precio_unit", label: "Precio Unit." }, { key: "monto", label: "Total" },
                  ]} />
                </div>
                <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "white" }}>
                      <tr>
                        <th style={{ ...thStyle, fontSize: 11, maxWidth: 280 }}>Producto (descripcion comprador)</th>
                        <th style={{ ...thStyle, fontSize: 11 }}>Institucion</th>
                        <th style={{ ...thR, fontSize: 11 }}>Cant.</th>
                        <th style={{ ...thR, fontSize: 11 }}>Precio Unit.</th>
                        <th style={{ ...thR, fontSize: 11 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(md.ventas_ag || []).map((p: any, i: number) => {
                        // Try to detect if margin > 20% by looking for similar LBF product
                        const margenFlag = p.precio_unit > 0 && (md.compras_lbf || []).some((lbf: any) => {
                          if (lbf.precio_unit <= 0) return false;
                          const margen = (p.precio_unit - lbf.precio_unit) / p.precio_unit * 100;
                          return margen > 20 && margen < 90; // plausible markup range
                        });
                        return (
                          <tr key={i} style={{ background: rowBg(i) }}>
                            <td style={{ ...tdStyle, fontSize: 11, maxWidth: 280, whiteSpace: "normal", lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 600 }}>{p.descripcion}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{p.tipo_producto}</div>
                            </td>
                            <td style={{ ...tdStyle, fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", color: "#64748B" }}>{p.institucion}</td>
                            <td style={{ ...tdR, fontSize: 11 }}>{Number(p.cantidad).toLocaleString()}</td>
                            <td style={{ ...tdR, fontSize: 11, fontWeight: 700, color: "#3B82F6" }}>{fmtAbs(p.precio_unit)}</td>
                            <td style={{ ...tdR, fontSize: 11 }}>{fmtAbs(p.monto)}</td>
                          </tr>
                        );
                      })}
                      {(md.ventas_ag || []).length === 0 && (
                        <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Sin ventas AG este mes</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Competitors in same categories */}
      {!loadingOv && ov.competidores && ov.competidores.length > 0 && (
        <div style={cardAg}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", margin: 0 }}>Competidores en mismas categorias AG</h3>
            <ExportButton data={ov.competidores || []} filename="competidores_ag_categorias" columns={[
              { key: "empresa", label: "Proveedor" }, { key: "monto", label: "Monto AG" }, { key: "n_ocs", label: "OCs" },
            ]} />
          </div>
          <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 10px" }}>
            Otros proveedores en las mismas lineas de producto que Multiproducto vende en AG
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 35, fontSize: 11 }}>#</th>
                <th style={{ ...thStyle, fontSize: 11 }}>Proveedor</th>
                <th style={{ ...thR, fontSize: 11 }}>Monto AG</th>
                <th style={{ ...thR, fontSize: 11 }}>OCs</th>
              </tr>
            </thead>
            <tbody>
              {ov.competidores.map((c: any, i: number) => (
                <tr key={i} style={{ background: rowBg(i) }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{c.empresa}</td>
                  <td style={{ ...tdR, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{fmt(c.monto)}</td>
                  <td style={{ ...tdR, fontSize: 12 }}>{c.n_ocs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   TAB 2: Segundo Llamado — LBF direct participation
   ═══════════════════════════════════════════════════════════ */

function SegundoLlamadoTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMes, setSelectedMes] = useState(0); // 0 = YTD
  const [expandedCot, setExpandedCot] = useState<number | null>(null);
  const ano = 2026;

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/mercado-publico/segundo-llamado?ano=${ano}&mes=${selectedMes}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedMes]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando segundo llamado...</div>;
  if (!data || data.error) return <div style={{ ...cardAg, padding: 40, color: "#EF4444" }}>Error: {data?.error || "sin datos"}</div>;

  const k = data.kpis || {};
  const periodLabel = selectedMes === 0 ? `YTD ${ano}` : `${MESES_FULL[selectedMes - 1]} ${ano}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Note */}
      <div style={{ ...cardAg, padding: "12px 18px", background: "#EFF6FF", borderColor: "#93C5FD" }}>
        <div style={{ fontSize: 12, color: "#1E40AF" }}>
          <strong>Segundo Llamado:</strong> LBF puede participar directamente cotizando en compras agiles. Aqui se muestra el estado de nuestras cotizaciones y los principales competidores.
        </div>
      </div>

      {/* Month selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", margin: 0 }}>{periodLabel}</h3>
        <MonthSelector selected={selectedMes} onChange={setSelectedMes} includeYtd />
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <AgKpiCard title="Cotizaciones" value={String(k.total_cotizaciones || 0)} color="#3B82F6"
          sub={`${k.adjudicadas || 0} adj · ${k.desiertas || 0} desiertas`} />
        <AgKpiCard title="Presupuesto total" value={fmt(k.presupuesto || 0)} color="#8B5CF6"
          sub="suma presup. estimados" />
        <AgKpiCard title="Adjudicado LBF" value={fmt(k.adjudicado || 0)} color="#10B981"
          sub={`${k.adjudicadas || 0} cotizaciones ganadas`} />
        <AgKpiCard
          title="Tasa adjudicación"
          value={k.total_cotizaciones > 0 ? `${((k.adjudicadas || 0) / k.total_cotizaciones * 100).toFixed(1)}%` : "—"}
          color={(k.adjudicadas || 0) / Math.max(k.total_cotizaciones || 1, 1) > 0.3 ? "#10B981" : "#F59E0B"}
          sub="adj. / cotizaciones"
        />
      </div>

      {/* Monthly chart (only YTD) */}
      {selectedMes === 0 && data.mensual && data.mensual.length > 0 && (
        <div style={cardAg}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Cotizaciones por mes</div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data.mensual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748B", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" name="Total" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adjudicadas" name="Adjudicadas" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="desiertas" name="Desiertas" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* LBF cotizaciones — card layout */}
      <div style={cardAg}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#3B82F6", marginBottom: 4 }}>
          Cotizaciones LBF — {periodLabel}
        </h3>
        <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 12px" }}>
          Cotizaciones en que LBF ha participado en segundo llamado. Haz clic para ver productos y competidores.
        </p>
        {(data.lbf_cotizaciones || []).length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Sin cotizaciones LBF en este periodo</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data.lbf_cotizaciones || []).map((c: any, i: number) => {
              const won = c.seleccionado;
              const isExpanded = expandedCot === i;
              return (
                <div key={i} style={{
                  border: `1px solid ${won ? "#86EFAC" : "#E2E8F0"}`,
                  borderRadius: 8, overflow: "hidden",
                  background: won ? "#F0FDF4" : "white",
                }}>
                  {/* Header row — clickable */}
                  <div
                    onClick={() => setExpandedCot(isExpanded ? null : i)}
                    style={{
                      padding: "10px 16px", cursor: "pointer",
                      display: "flex", alignItems: "flex-start", gap: 12,
                      borderBottom: isExpanded ? "1px solid #E2E8F0" : "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748B", flexShrink: 0 }}>{c.codigo}</span>
                        <span style={{
                          padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, flexShrink: 0,
                          background: won ? "#DCFCE7" : c.estado === "Desierta" ? "#FEF3C7" : c.estado === "Cerrada" ? "#FEE2E2" : "#F1F5F9",
                          color: won ? "#166534" : c.estado === "Desierta" ? "#92400E" : c.estado === "Cerrada" ? "#991B1B" : "#475569",
                        }}>
                          {won ? "GANADA" : c.estado || "En proceso"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", lineHeight: 1.3 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{c.institucion}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {c.monto_ofertado > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>{fmtAbs(c.monto_ofertado)}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{isExpanded ? "▲" : "▼"} detalle</div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "12px 16px 16px", background: "#F8FAFC" }}>
                      {/* Items solicitados */}
                      {(c.items || []).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>Productos solicitados</div>
                          {(c.items || []).map((item: any, j: number) => (
                            <div key={j} style={{
                              background: "white", border: "1px solid #E2E8F0", borderRadius: 8,
                              padding: "10px 14px", marginBottom: 6,
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF" }}>{item.producto}</div>
                              <div style={{ fontSize: 11, color: "#374151", marginTop: 2 }}>{item.descripcion}</div>
                              <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>
                                Cantidad: <strong>{item.cantidad}</strong> {item.unidad} | Codigo: <span style={{ fontFamily: "monospace" }}>{item.codigo_producto}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Competidores en esta cotizacion */}
                      {(c.cotizantes || []).length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 6 }}>
                            Competidores ({c.cotizantes.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(c.cotizantes || []).map((comp: any, j: number) => (
                              <div key={j} style={{
                                fontSize: 11, padding: "4px 10px", borderRadius: 6,
                                background: comp.seleccionado ? "#DCFCE7" : "white",
                                border: `1px solid ${comp.seleccionado ? "#86EFAC" : "#E2E8F0"}`,
                                color: comp.seleccionado ? "#166534" : "#374151",
                                fontWeight: comp.seleccionado ? 700 : 400,
                              }}>
                                {comp.empresa}
                                {comp.seleccionado && <span style={{ marginLeft: 4, fontSize: 10 }}>GANADOR</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ganador info */}
                      {c.proveedor_ganador && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "#64748B" }}>
                          Ganador: <strong style={{ color: "#166534" }}>{c.proveedor_ganador}</strong>
                          {c.monto_ganador > 0 && <> por {fmtAbs(c.monto_ganador)}</>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Competidores */}
      {(data.competidores || []).length > 0 && (
        <div style={cardAg}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", margin: 0 }}>
              Top Cotizantes — {periodLabel}
            </h3>
            <ExportButton data={(data.competidores || []).map((c: any) => ({
              ...c, tasa_exito: c.participaciones > 0 ? (c.seleccionado / c.participaciones * 100).toFixed(0) + "%" : "0%",
            }))} filename="top_cotizantes_ag" columns={[
              { key: "empresa", label: "Empresa" }, { key: "participaciones", label: "Participaciones" },
              { key: "seleccionado", label: "Seleccionado" }, { key: "tasa_exito", label: "Tasa Exito" },
            ]} />
          </div>
          <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 12px" }}>
            Empresas que mas cotizan en segundo llamado (insumos medicos)
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 35, fontSize: 11 }}>#</th>
                  <th style={{ ...thStyle, fontSize: 11 }}>Empresa</th>
                  <th style={{ ...thR, fontSize: 11 }}>Participaciones</th>
                  <th style={{ ...thR, fontSize: 11 }}>Seleccionado</th>
                  <th style={{ ...thR, fontSize: 11 }}>Tasa Exito</th>
                </tr>
              </thead>
              <tbody>
                {(data.competidores || []).map((c: any, i: number) => {
                  const isLbf = c.empresa.toLowerCase().includes("lbf");
                  const tasa = c.participaciones > 0 ? (c.seleccionado / c.participaciones * 100).toFixed(0) : "0";
                  return (
                    <tr key={i} style={{ background: isLbf ? "#EFF6FF" : rowBg(i), fontWeight: isLbf ? 700 : 400 }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: isLbf ? "#3B82F6" : "#1F2937" }}>{c.empresa}</td>
                      <td style={{ ...tdR, fontSize: 12 }}>{c.participaciones}</td>
                      <td style={{ ...tdR, fontSize: 12, color: "#10B981", fontWeight: 600 }}>{c.seleccionado}</td>
                      <td style={{ ...tdR, fontSize: 12, color: Number(tasa) > 50 ? "#10B981" : "#64748B" }}>{tasa}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   TAB 3: Revendedores — LBF clients selling in AG
   ═══════════════════════════════════════════════════════════ */

const MONTO_OPTIONS = [
  { label: "Todos", value: 0 },
  { label: ">$1M", value: 1_000_000 },
  { label: ">$5M", value: 5_000_000 },
  { label: ">$10M", value: 10_000_000 },
  { label: ">$50M", value: 50_000_000 },
  { label: ">$100M", value: 100_000_000 },
];

function RevendedoresTab() {
  const [ytdData, setYtdData] = useState<any>(null);
  const [mesData, setMesData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMes, setLoadingMes] = useState(false);
  const [selectedMes, setSelectedMes] = useState(0); // 0 = YTD
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [minCompraLbf, setMinCompraLbf] = useState(0);
  const [minVentaAg, setMinVentaAg] = useState(0);
  const [searchText, setSearchText] = useState("");
  const ano = 2026;

  // Load YTD (always)
  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/mercado-publico/ag-resellers?ano=${ano}`, { noCache: true })
      .then(r => { setYtdData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Load month detail when month selected
  useEffect(() => {
    if (selectedMes === 0) {
      setMesData(null);
      return;
    }
    setLoadingMes(true);
    api.get<any>(`/api/mercado-publico/ag-resellers-mes?ano=${ano}&mes=${selectedMes}`, { noCache: true })
      .then(r => { setMesData(r); setLoadingMes(false); })
      .catch(() => setLoadingMes(false));
  }, [selectedMes]);

  const activeData = selectedMes === 0 ? ytdData : mesData;
  const isLoading = selectedMes === 0 ? loading : loadingMes;
  const res = activeData || {};
  const periodLabel = selectedMes === 0 ? `YTD ${ano}` : `${MESES_FULL[selectedMes - 1]} ${ano}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Note */}
      <div style={{ ...cardAg, padding: "12px 18px", background: "#F8FAFC", borderColor: "#E2E8F0" }}>
        <div style={{ fontSize: 12, color: "#475569" }}>
          <strong>Revendedores:</strong> Clientes que nos compran productos y los revenden en Compra Agil (primer llamado). LBF no puede participar directamente en primer llamado.
        </div>
      </div>

      {/* Month selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", margin: 0 }}>{periodLabel}</h3>
        <MonthSelector selected={selectedMes} onChange={(m) => { setSelectedMes(m); setExpandedRow(null); }} includeYtd />
      </div>

      {/* KPIs */}
      {!isLoading && !res.error && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <AgKpiCard title="Revendedores" value={String(res.total_resellers || 0)} color="#F59E0B" />
          <AgKpiCard title="Compra a LBF" value={fmt(res.total_compra_lbf || 0)} color="#10B981" sub={periodLabel} />
          <AgKpiCard title="Venta en AG" value={fmt(res.total_venta_ag || 0)} color="#3B82F6" sub={periodLabel} />
          <AgKpiCard
            title="Ratio AG / LBF"
            value={res.total_compra_lbf > 0 ? `${(res.total_venta_ag / res.total_compra_lbf * 100).toFixed(0)}%` : "--"}
            color={res.total_venta_ag > res.total_compra_lbf * 2 ? "#EF4444" : "#64748B"}
          />
        </div>
      )}

      {/* Table */}
      <div style={cardAg}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
              Clientes LBF que venden en Compra Agil — {periodLabel}
            </h3>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
              Cruce entre facturacion LBF y proveedores AG
              {selectedMes === 0 ? ". Haz clic en fila para ver detalle mensual." : ""}
            </p>
          </div>
          <ExportButton data={(res.resellers || []).map((r: any) => ({
            nombre_lbf: r.nombre_lbf, nombre_mp: r.nombre_mp,
            compra_lbf: r.compra_lbf, venta_ag: r.venta_ag,
            ratio: r.compra_lbf > 0 ? (r.venta_ag / r.compra_lbf * 100).toFixed(0) + "%" : "--",
            n_ocs_ag: r.n_ocs_ag, n_instituciones: r.n_instituciones,
          }))} filename={`revendedores_ag_${periodLabel.replace(/\s/g, "_")}`} columns={[
            { key: "nombre_lbf", label: "Cliente LBF" }, { key: "nombre_mp", label: "Nombre MP" },
            { key: "compra_lbf", label: "Compra LBF" }, { key: "venta_ag", label: "Venta AG" },
            { key: "ratio", label: "Ratio" }, { key: "n_ocs_ag", label: "OCs" }, { key: "n_instituciones", label: "Instituciones" },
          ]} />
        </div>

        {/* Filters */}
        {!isLoading && !res.error && (res.resellers || []).length > 0 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8 }}>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setExpandedRow(null); }}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, width: 180, outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Compra LBF:</span>
              {MONTO_OPTIONS.map(o => (
                <button key={o.value} onClick={() => { setMinCompraLbf(o.value); setExpandedRow(null); }}
                  style={{
                    padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11,
                    fontWeight: minCompraLbf === o.value ? 700 : 400,
                    background: minCompraLbf === o.value ? "#DCFCE7" : "white",
                    color: minCompraLbf === o.value ? "#166534" : "#64748B",
                  }}>{o.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Venta AG:</span>
              {MONTO_OPTIONS.map(o => (
                <button key={o.value} onClick={() => { setMinVentaAg(o.value); setExpandedRow(null); }}
                  style={{
                    padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11,
                    fontWeight: minVentaAg === o.value ? 700 : 400,
                    background: minVentaAg === o.value ? "#DBEAFE" : "white",
                    color: minVentaAg === o.value ? "#1E40AF" : "#64748B",
                  }}>{o.label}</button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cruzando bases de datos...</div>
        ) : res.error ? (
          <div style={{ padding: 20, color: "#EF4444" }}>Error: {res.error}</div>
        ) : (res.resellers || []).length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Sin revendedores en este periodo</div>
        ) : (() => {
          const filtered = (res.resellers || []).filter((r: any) => {
            if (r.compra_lbf < minCompraLbf) return false;
            if (r.venta_ag < minVentaAg) return false;
            if (searchText) {
              const q = searchText.toLowerCase();
              if (!r.nombre_lbf.toLowerCase().includes(q) && !r.nombre_mp.toLowerCase().includes(q)) return false;
            }
            return true;
          });
          return filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Sin resultados con estos filtros</div>
          ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{filtered.length} de {(res.resellers || []).length} revendedores</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 35 }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thStyle, fontSize: 11 }}>#</th>
                  <th style={{ ...thStyle, fontSize: 11 }}>Cliente LBF</th>
                  <th style={{ ...thStyle, fontSize: 11 }}>Nombre en MP</th>
                  <th style={{ ...thR, fontSize: 11 }}>Compra LBF</th>
                  <th style={{ ...thR, fontSize: 11 }}>Venta AG</th>
                  <th style={{ ...thR, fontSize: 11 }}>Ratio</th>
                  <th style={{ ...thR, fontSize: 11 }}>OCs</th>
                  <th style={{ ...thR, fontSize: 11 }}>Inst.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any, i: number) => {
                  const sameName = r.nombre_lbf.toLowerCase().replace(/\s/g, '') === r.nombre_mp.toLowerCase().replace(/\s/g, '');
                  const isMp = r.destacado;
                  const ratio = r.compra_lbf > 0 ? (r.venta_ag / r.compra_lbf * 100).toFixed(0) : "--";
                  const isExpanded = expandedRow === i;
                  const canExpand = selectedMes === 0;
                  return (
                    <React.Fragment key={i}>
                      <tr
                        onClick={() => {
                          if (!canExpand) return;
                          if (isExpanded) {
                            setExpandedRow(null);
                            setDetailData(null);
                          } else {
                            setExpandedRow(i);
                            setDetailData(null);
                            setLoadingDetail(true);
                            api.get<any>(`/api/mercado-publico/ag-reseller-detalle?rut=${encodeURIComponent(r.rut)}&ano=${ano}`, { noCache: true })
                              .then(d => { setDetailData(d); setLoadingDetail(false); })
                              .catch(() => setLoadingDetail(false));
                          }
                        }}
                        style={{
                          background: isMp ? "#FFFBEB" : rowBg(i),
                          cursor: canExpand ? "pointer" : "default",
                          borderLeft: isMp ? "3px solid #F59E0B" : "3px solid transparent",
                        }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", fontWeight: isMp ? 700 : 400, color: isMp ? "#B45309" : "#1F2937" }}>
                          {r.nombre_lbf}
                          {isMp && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>ESPECIAL</span>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", color: sameName ? "#94A3B8" : "#F59E0B", fontStyle: sameName ? "normal" : "italic" }}>
                          {sameName ? "\u2014" : r.nombre_mp}
                        </td>
                        <td style={{ ...tdR, fontSize: 12, color: "#10B981", fontWeight: 600 }}>{fmt(r.compra_lbf)}</td>
                        <td style={{ ...tdR, fontSize: 12, color: "#3B82F6", fontWeight: 700 }}>{fmt(r.venta_ag)}</td>
                        <td style={{ ...tdR, fontSize: 12, color: Number(ratio) > 500 ? "#EF4444" : "#64748B" }}>{ratio}%</td>
                        <td style={{ ...tdR, fontSize: 12 }}>{r.n_ocs_ag.toLocaleString()}</td>
                        <td style={{ ...tdR, fontSize: 12 }}>{r.n_instituciones.toLocaleString()}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, background: "#F8FAFC" }}>
                            <div style={{ padding: "12px 16px 16px 48px" }}>
                              {loadingDetail ? (
                                <div style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Cargando detalle de productos...</div>
                              ) : detailData?.error ? (
                                <div style={{ padding: 12, color: "#EF4444", fontSize: 12 }}>Error: {detailData.error}</div>
                              ) : detailData ? (
                                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                  {/* Product detail table */}
                                  <div style={{ flex: "2 1 400px" }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 6 }}>
                                      Productos que nos compra — YTD {ano}
                                      <span style={{ fontWeight: 400, color: "#64748B", marginLeft: 8 }}>{detailData.n_productos} productos | Total: {fmtAbs(detailData.total)}</span>
                                    </div>
                                    <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead style={{ position: "sticky", top: 0, background: "#F8FAFC" }}>
                                          <tr>
                                            <th style={{ ...thStyle, fontSize: 10, padding: "4px 8px" }}>Codigo</th>
                                            <th style={{ ...thStyle, fontSize: 10, padding: "4px 8px" }}>Descripcion</th>
                                            <th style={{ ...thStyle, fontSize: 10, padding: "4px 8px" }}>Cat.</th>
                                            <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Cant.</th>
                                            <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>P. Unit.</th>
                                            <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Total</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(detailData.resumen || []).map((p: any, j: number) => (
                                            <tr key={j} style={{ background: j % 2 === 0 ? "#F8FAFC" : "white" }}>
                                              <td style={{ ...tdStyle, fontSize: 10, padding: "3px 8px", fontFamily: "monospace", fontWeight: 600 }}>{p.codigo}</td>
                                              <td style={{ ...tdStyle, fontSize: 10, padding: "3px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.descripcion}</td>
                                              <td style={{ ...tdStyle, fontSize: 10, padding: "3px 8px" }}>{p.categoria}</td>
                                              <td style={{ ...tdR, fontSize: 10, padding: "3px 8px" }}>{p.cantidad.toLocaleString()}</td>
                                              <td style={{ ...tdR, fontSize: 10, padding: "3px 8px", color: "#10B981", fontWeight: 600 }}>{fmtAbs(p.precio_unit)}</td>
                                              <td style={{ ...tdR, fontSize: 10, padding: "3px 8px" }}>{fmtAbs(p.venta)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  {/* Monthly summary (compact) */}
                                  {r.meses && r.meses.length > 0 && (
                                    <div style={{ flex: "1 1 200px" }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>Resumen mensual</div>
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead>
                                          <tr>
                                            <th style={{ ...thStyle, fontSize: 10, padding: "4px 8px" }}>Mes</th>
                                            <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Compra LBF</th>
                                            <th style={{ ...thR, fontSize: 10, padding: "4px 8px" }}>Venta AG</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {r.meses.map((m: any) => (
                                            <tr key={m.mes}>
                                              <td style={{ ...tdStyle, fontSize: 11, padding: "3px 8px" }}>{MESES_FULL[m.mes - 1]}</td>
                                              <td style={{ ...tdR, fontSize: 11, padding: "3px 8px", color: "#10B981" }}>{fmt(m.compra_lbf)}</td>
                                              <td style={{ ...tdR, fontSize: 11, padding: "3px 8px", color: "#3B82F6" }}>{fmt(m.venta_ag)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          );
        })()}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   TAB 4: Actividad Diaria — OCs por día primer y segundo llamado
   ═══════════════════════════════════════════════════════════ */

function ActividadDiariaTab() {
  const [selectedMes, setSelectedMes] = useState(0); // 0 = YTD
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const ano = 2026;

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/mercado-publico/ag-diario?ano=${ano}&mes=${selectedMes}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedMes]);

  const dias: any[] = data?.dias ?? [];
  const usuarios: any[] = data?.usuarios ?? [];
  const mesesResumen: any[] = data?.meses_resumen ?? [];
  const totalPrimerPost  = dias.reduce((s: number, d: any) => s + d.primer_postuladas, 0);
  const totalPrimerN     = dias.reduce((s: number, d: any) => s + d.primer_n, 0);
  const totalPrimerMonto = dias.reduce((s: number, d: any) => s + d.primer_monto, 0);
  const totalSegundoN    = dias.reduce((s: number, d: any) => s + d.segundo_n, 0);
  const totalSegundoAdj  = dias.reduce((s: number, d: any) => s + d.segundo_adj, 0);
  const totalSegundoMontoAdj     = dias.reduce((s: number, d: any) => s + d.segundo_monto_adj, 0);
  const totalPresupuesto         = dias.reduce((s: number, d: any) => s + d.segundo_presupuesto, 0);
  const convPrimer  = totalPrimerPost > 0 ? (totalPrimerN / totalPrimerPost * 100) : 0;
  const convSegundo = totalSegundoN   > 0 ? (totalSegundoAdj / totalSegundoN * 100) : 0;

  // Formatear fecha "2026-05-14" → "14"
  const diaLabel = (iso: string) => iso.split("-")[2].replace(/^0/, "");
  const mesLabel = MESES_FULL[selectedMes - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Nota */}
      <div style={{ ...cardAg, padding: "12px 18px", background: "#F0FDF4", borderColor: "#86EFAC" }}>
        <div style={{ fontSize: 12, color: "#166534" }}>
          <strong>Primer llamado (Multiproducto):</strong> OCs adjudicadas a Multiproducto/Renhet en Compra Ágil por día.{" "}
          <strong>Segundo llamado (LBF):</strong> Cotizaciones en que LBF participó, por día de publicación.
        </div>
      </div>

      {/* Selector mes */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          {selectedMes === 0 ? `YTD ${ano}` : `${mesLabel} ${ano}`}
        </h3>
        <MonthSelector selected={selectedMes} onChange={setSelectedMes} includeYtd />
      </div>

      {/* Tablas por usuario y resumen mensual — lado a lado */}
      {(usuarios.length > 0 || mesesResumen.length > 0) && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* Gestores 2° Llamado */}
          {usuarios.length > 0 && (
            <div style={{ ...cardAg, flex: "1 1 320px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>Gestores 2° Llamado (LBF)</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Nombre</th>
                    <th style={thR}>Postuladas</th>
                    <th style={thR}>Adjudicadas</th>
                    <th style={thR}>% Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u: any, i: number) => {
                    const esSinAtribuir = u.sin_atribuir === true;
                    return (
                      <tr key={i} style={{ background: esSinAtribuir ? "#F8FAFC" : rowBg(i), borderTop: esSinAtribuir ? "1px dashed #CBD5E1" : undefined }}>
                        <td style={{ ...tdStyle, color: esSinAtribuir ? "#94A3B8" : "#0F172A" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {!esSinAtribuir && (
                              <span style={{ background: "#E81C2E", color: "#fff", borderRadius: "50%", width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                {u.iniciales}
                              </span>
                            )}
                            <span style={{ fontStyle: esSinAtribuir ? "italic" : "normal" }}>{u.nombre}</span>
                          </span>
                        </td>
                        <td style={{ ...tdR, fontWeight: 600, color: esSinAtribuir ? "#94A3B8" : "#0F172A" }}>{u.postuladas}</td>
                        <td style={{ ...tdR, color: u.adjudicadas > 0 ? "#059669" : "#94A3B8", fontWeight: u.adjudicadas > 0 ? 700 : 400 }}>{u.adjudicadas}</td>
                        <td style={{ ...tdR, color: esSinAtribuir ? "#94A3B8" : u.conv >= 20 ? "#059669" : u.conv >= 10 ? "#D97706" : "#94A3B8" }}>{u.conv.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen mensual */}
          {mesesResumen.length > 0 && (
            <div style={{ ...cardAg, flex: "1 1 360px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>Postulaciones por mes — {ano}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle} rowSpan={2}>Mes</th>
                    <th style={{ ...thR, color: "#10B981", borderBottom: "none", paddingBottom: 2 }} colSpan={2}>1° Llamado</th>
                    <th style={{ ...thR, color: "#E81C2E", borderBottom: "none", paddingBottom: 2 }} colSpan={3}>2° Llamado</th>
                  </tr>
                  <tr>
                    <th style={{ ...thR, color: "#10B981", fontSize: 10 }}>Post.</th>
                    <th style={{ ...thR, color: "#10B981", fontSize: 10 }}>Adj.</th>
                    <th style={{ ...thR, color: "#E81C2E", fontSize: 10 }}>Post.</th>
                    <th style={{ ...thR, color: "#E81C2E", fontSize: 10 }}>Adj.</th>
                    <th style={{ ...thR, color: "#E81C2E", fontSize: 10 }}>Monto Adj.</th>
                  </tr>
                </thead>
                <tbody>
                  {mesesResumen.map((m: any, i: number) => {
                    const activo = selectedMes === m.mes;
                    return (
                      <tr key={i} style={{ background: activo ? "#FFF1F2" : rowBg(i), cursor: "pointer" }} onClick={() => setSelectedMes(m.mes)}>
                        <td style={{ ...tdStyle, fontWeight: activo ? 700 : 400, color: activo ? "#E81C2E" : "#0F172A" }}>
                          {MESES_FULL[m.mes - 1]}
                        </td>
                        <td style={{ ...tdR, color: "#10B981", fontWeight: 600 }}>{m.p1_post}</td>
                        <td style={{ ...tdR, color: m.p1_adj > 0 ? "#059669" : "#94A3B8", fontWeight: m.p1_adj > 0 ? 700 : 400 }}>{m.p1_adj || "—"}</td>
                        <td style={{ ...tdR, color: "#3B82F6", fontWeight: 600 }}>{m.p2_post}</td>
                        <td style={{ ...tdR, color: m.p2_adj > 0 ? "#059669" : "#94A3B8", fontWeight: m.p2_adj > 0 ? 700 : 400 }}>{m.p2_adj || "—"}</td>
                        <td style={{ ...tdR, color: m.p2_monto_adj > 0 ? "#059669" : "#94A3B8", fontSize: 11 }}>{m.p2_monto_adj > 0 ? fmtAbs(m.p2_monto_adj) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* 1° Llamado — Multiproducto */}
        <div style={{ flex: 1, minWidth: 260, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            1° Llamado — Multiproducto
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AgKpiCard title="Postuladas" value={String(totalPrimerPost)} color="#10B981" sub="OCs donde participó" />
            <AgKpiCard title="Adjudicadas" value={String(totalPrimerN)} color="#059669" sub={fmtAbs(totalPrimerMonto)} />
            <AgKpiCard title="% Conversión" value={`${convPrimer.toFixed(0)}%`} color="#047857" sub="adj. / postuladas" />
          </div>
        </div>
        {/* 2° Llamado — LBF */}
        <div style={{ flex: 1, minWidth: 260, background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#E81C2E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            2° Llamado — LBF
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AgKpiCard title="Postuladas" value={String(totalSegundoN)} color="#E81C2E" sub={`Presup. ${fmtAbs(totalPresupuesto)}`} />
            <AgKpiCard title="Adjudicadas" value={String(totalSegundoAdj)} color="#BE123C" sub={totalSegundoMontoAdj > 0 ? fmtAbs(totalSegundoMontoAdj) : "sin monto"} />
            <AgKpiCard title="% Conversión" value={`${convSegundo.toFixed(0)}%`} color="#9F1239" sub="adj. / cotizaciones" />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando...</div>
      ) : data?.error ? (
        <div style={{ ...cardAg, padding: 20, color: "#EF4444" }}>Error: {data.error}</div>
      ) : dias.length === 0 ? (
        <div style={{ ...cardAg, padding: 40, textAlign: "center", color: "#94A3B8" }}>
          Sin actividad {selectedMes === 0 ? `en ${ano}` : `en ${mesLabel}`}
        </div>
      ) : (
        <>
          {/* Gráfico de barras por día */}
          <div style={cardAg}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
              Postulaciones por día — {selectedMes === 0 ? `YTD ${ano}` : `${mesLabel} ${ano}`}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={dias} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="dia" tickFormatter={diaLabel} tick={{ fill: "#94A3B8", fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fill: "#94A3B8", fontSize: 11 }} width={28} />
                <Tooltip
                  contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => `${diaLabel(String(v))} ${mesLabel}`}
                  formatter={(value: any, name: any) => [value, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="primer_n" name="1° Llamado (MP)" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="segundo_n" name="2° Llamado (LBF)" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detalle por día */}
          <div style={cardAg}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
              Detalle por día
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Fecha</th>
                    <th style={{ ...thR, color: "#10B981" }}>1° Llamado — OCs</th>
                    <th style={{ ...thR, color: "#10B981" }}>1° Llamado — Monto adj.</th>
                    <th style={{ ...thR, color: "#3B82F6" }}>2° Llamado — Cotiz.</th>
                    <th style={{ ...thR, color: "#3B82F6" }}>2° Llamado — Presupuesto</th>
                    <th style={{ ...thR, color: "#8B5CF6" }}>2° Llamado — Adj. LBF</th>
                    <th style={{ ...thR, color: "#8B5CF6" }}>2° Llamado — Monto adj.</th>
                    <th style={{ ...thR, color: "#64748B" }}>Gestor</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d: any, i: number) => {
                    const fecha = new Date(d.dia + "T12:00:00");
                    const fechaLabel = fecha.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
                    const esFinDeSemana = [0, 6].includes(fecha.getDay());
                    return (
                      <tr key={i} style={{
                        background: esFinDeSemana ? "#F8FAFC" : rowBg(i),
                        opacity: esFinDeSemana ? 0.65 : 1,
                      }}>
                        <td style={{ ...tdStyle, fontWeight: esFinDeSemana ? 400 : 600, color: esFinDeSemana ? "#94A3B8" : "#0F172A" }}>
                          {fechaLabel}
                        </td>
                        <td style={{ ...tdR, color: d.primer_n > 0 ? "#10B981" : "#CBD5E1", fontWeight: d.primer_n > 0 ? 700 : 400 }}>
                          {d.primer_n > 0 ? d.primer_n : "—"}
                        </td>
                        <td style={{ ...tdR, color: d.primer_monto > 0 ? "#10B981" : "#CBD5E1" }}>
                          {d.primer_monto > 0 ? fmtAbs(d.primer_monto) : "—"}
                        </td>
                        <td style={{ ...tdR, color: d.segundo_n > 0 ? "#3B82F6" : "#CBD5E1", fontWeight: d.segundo_n > 0 ? 700 : 400 }}>
                          {d.segundo_n > 0 ? d.segundo_n : "—"}
                        </td>
                        <td style={{ ...tdR, color: d.segundo_presupuesto > 0 ? "#3B82F6" : "#CBD5E1" }}>
                          {d.segundo_presupuesto > 0 ? fmtAbs(d.segundo_presupuesto) : "—"}
                        </td>
                        <td style={{ ...tdR, color: d.segundo_adj > 0 ? "#8B5CF6" : "#CBD5E1", fontWeight: d.segundo_adj > 0 ? 700 : 400 }}>
                          {d.segundo_adj > 0 ? d.segundo_adj : "—"}
                        </td>
                        <td style={{ ...tdR, color: d.segundo_monto_adj > 0 ? "#8B5CF6" : "#CBD5E1", fontWeight: d.segundo_monto_adj > 0 ? 700 : 400 }}>
                          {d.segundo_monto_adj > 0 ? fmtAbs(d.segundo_monto_adj) : "—"}
                        </td>
                        <td style={{ ...tdR, fontSize: 11, color: "#64748B", letterSpacing: 0.5 }}>
                          {d.iniciales || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


/* ─── Tab config ────────────────────────────────────────── */

const AG_TABS = [
  { id: "multiproducto", label: "Multiproducto" },
  { id: "segundo", label: "Segundo Llamado" },
  { id: "revendedores", label: "Revendedores" },
  { id: "diario", label: "Por Día" },
];

/* ─── Main Page ──────────────────────────────────────────── */

export default function CompraAgilPage() {
  const [activeTab, setActiveTab] = useState("multiproducto");

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Compra Agil</h1>
            <HelpButton module="categoria" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Analisis de Compra Agil — Multiproducto, Segundo Llamado y Revendedores
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 4, width: "fit-content", marginBottom: 20 }}>
        {AG_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
              background: activeTab === t.id ? "white" : "transparent",
              color: activeTab === t.id ? "#0F172A" : "#64748B",
              boxShadow: activeTab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "multiproducto" && <MultiproductoTab />}
      {activeTab === "segundo" && <SegundoLlamadoTab />}
      {activeTab === "revendedores" && <RevendedoresTab />}
      {activeTab === "diario" && <ActividadDiariaTab />}
    </div>
  );
}
