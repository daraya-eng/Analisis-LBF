"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs } from "@/lib/format";

/* ─── Styles ──────────────────────────────────────────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 12px", color: "#1F2937", fontSize: 13, whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const MESES_NOMBRE = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const Q_LABEL = ["Q1 Ene-Mar","Q2 Abr-Jun","Q3 Jul-Sep","Q4 Oct-Dic"];

function pctColor(pct: number | null) {
  if (pct === null) return "#94A3B8";
  if (pct >= 100) return "#10B981";
  if (pct >= 80) return "#F59E0B";
  return "#EF4444";
}

function semaforo(pct: number | null) {
  if (pct === null) return "⬜";
  if (pct >= 100) return "🟢";
  if (pct >= 80) return "🟡";
  return "🔴";
}

function KpiCard({ title, value, sub, color, small }: { title: string; value: string; sub?: React.ReactNode; color?: string; small?: boolean }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 140, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: small ? 18 : 22, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CumplBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: "#94A3B8" }}>—</span>;
  const color = pctColor(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, background: "#F1F5F9", borderRadius: 4, height: 12, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 120) / 1.2}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

function MontoSaldo({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "#94A3B8" }}>—</span>;
  const color = value >= 0 ? "#10B981" : "#EF4444";
  const sign = value >= 0 ? "+" : "";
  return <span style={{ color, fontWeight: 700 }}>{sign}{fmtAbs(value)}</span>;
}

export default function IncentivosPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState<number | null>(null);
  const [ano] = useState(2026);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback((trimestre: number) => {
    setLoading(true);
    api.get<any>(`/api/incentivos/trimestre?q=${trimestre}&ano=${ano}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ano]);

  useEffect(() => {
    // Detectar Q actual
    const mes = new Date().getMonth() + 1;
    const qActual = Math.ceil(mes / 3);
    setQ(qActual);
    load(qActual);
  }, [load]);

  const handleQChange = (newQ: number) => {
    setQ(newQ);
    setExpanded(null);
    load(newQ);
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando incentivos...</div>;
  if (!data) return (
    <div style={{ ...card, padding: 32, color: "#64748B", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Tablas no encontradas</div>
      <div style={{ fontSize: 13 }}>Conecta la VPN y ejecuta en el backend:</div>
      <pre style={{ background: "#F1F5F9", padding: "10px 16px", borderRadius: 6, display: "inline-block", marginTop: 10, fontSize: 13 }}>
        python setup_incentivos.py
      </pre>
    </div>
  );
  if (data?.error) return (
    <div style={{ ...card, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>Error al cargar datos</div>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>{data.error}</div>
      <div style={{ fontSize: 12, color: "#94A3B8" }}>Si la tabla no existe, conecta la VPN y ejecuta: <code>python setup_incentivos.py</code></div>
    </div>
  );

  const vendedores: any[] = data?.vendedores || [];
  const totales = data?.totales || {};
  const estado = data?.estado || "—";
  const mesesQ: number[] = data?.meses_q || [];

  // Solo vendedores normales para la tabla principal
  const vendNormales = vendedores.filter((v: any) => v.tipo === "VENDEDOR");
  const subgerente = vendedores.find((v: any) => v.tipo === "SUBGERENTE");

  const estadoBadge = estado === "liquidado"
    ? { label: "Liquidado", bg: "#DCFCE7", color: "#15803D" }
    : estado === "en_curso"
    ? { label: "En Curso", bg: "#FEF9C3", color: "#A16207" }
    : { label: "Pendiente", bg: "#F1F5F9", color: "#64748B" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Incentivos {ano}</h1>
            {estado && (
              <span style={{ fontSize: 12, fontWeight: 700, color: estadoBadge.color, background: estadoBadge.bg, padding: "3px 10px", borderRadius: 20 }}>
                {estadoBadge.label}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Bonos trimestrales — anticipo 80% + liquidación al cierre
          </p>
        </div>
        {/* Q Tabs */}
        <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 4 }}>
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => handleQChange(n)}
              style={{
                padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: q === n ? 700 : 400,
                background: q === n ? "white" : "transparent",
                color: q === n ? "#0F172A" : "#64748B",
                boxShadow: q === n ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              Q{n}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando trimestre...</div>
      ) : (
        <>
          {/* Periodo del Q */}
          <div style={{ ...card, padding: "10px 18px", background: "#F8FAFC" }}>
            <div style={{ fontSize: 12, color: "#475569" }}>
              <strong>{Q_LABEL[(q || 1) - 1]}</strong> · Meses: {mesesQ.map(m => MESES_NOMBRE[m - 1]).join(", ")}
              {data?.meses_cerrados < 3 && estado === "en_curso" && (
                <span style={{ marginLeft: 12, color: "#F59E0B" }}>
                  Mes {data.meses_cerrados} de 3 cerrado — proyección parcial
                </span>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KpiCard
              title="Anticipo Estimado"
              value={fmt(totales.anticipo)}
              sub="80% del bono_100 — mes 1 del Q"
              color="#6366F1"
            />
            <KpiCard
              title="Bono Proyectado"
              value={fmt(totales.bono_proyectado)}
              sub={`Cumpl. global: ${totales.cumpl_global ?? "—"}%`}
              color={pctColor(totales.cumpl_global)}
            />
            <KpiCard
              title="Diferencia Neta"
              value={(totales.diferencia_neta >= 0 ? "+" : "") + fmt(totales.diferencia_neta)}
              sub={totales.diferencia_neta >= 0 ? "empresa paga adicional" : "empresa recupera"}
              color={totales.diferencia_neta >= 0 ? "#10B981" : "#EF4444"}
            />
            <KpiCard
              title="En Riesgo"
              value={`${data?.en_riesgo || 0}`}
              sub="vendedores bajo anticipo"
              color={data?.en_riesgo > 0 ? "#EF4444" : "#10B981"}
            />
            {subgerente && (
              <KpiCard
                title={`Bono ${subgerente.nombre.split(" ")[0]}`}
                value={fmt(subgerente.bono_total)}
                sub={`Cumpl: ${subgerente.cumpl_venta ?? "—"}%`}
                color="#8B5CF6"
                small
              />
            )}
          </div>

          {/* Tabla vendedores */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>
              Detalle por Vendedor — Q{q} {ano}
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thS}>Vendedor</th>
                    <th style={thR}>Meta Venta Q</th>
                    <th style={thR}>Venta Real</th>
                    <th style={thR}>Cumpl %</th>
                    <th style={thR}>Anticipo (80%)</th>
                    <th style={thR}>Bono Venta</th>
                    <th style={thR}>Bono Margen</th>
                    <th style={thR}>Bono Total</th>
                    <th style={thR}>Liquidación</th>
                    <th style={{ ...thS, width: 70 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {vendNormales.map((v: any, i: number) => {
                    const isOpen = expanded === v.vendedor;
                    const saldo = v.bono_total - v.anticipo_calc;
                    const rowColor = v.cumpl_venta === null
                      ? rowBg(i)
                      : v.cumpl_venta >= 100 ? "#F0FDF4"
                      : v.cumpl_venta >= 80 ? "#FFFBEB"
                      : "#FEF2F2";

                    return (
                      <Fragment key={v.vendedor}>
                        <tr
                          style={{ background: rowColor, cursor: "pointer" }}
                          onClick={() => setExpanded(isOpen ? null : v.vendedor)}
                        >
                          <td style={td}>
                            <div style={{ fontWeight: 600 }}>{v.nombre}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{v.vendedor}</div>
                          </td>
                          <td style={tdR}>{v.meta_venta_q ? fmtAbs(v.meta_venta_q) : "—"}</td>
                          <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(v.venta_real_q)}</td>
                          <td style={tdR}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                              <span style={{ marginRight: 6 }}>{semaforo(v.cumpl_venta)}</span>
                              <CumplBar pct={v.cumpl_venta} />
                            </div>
                          </td>
                          <td style={{ ...tdR, color: "#6366F1" }}>{fmtAbs(v.anticipo_calc)}</td>
                          <td style={tdR}>{fmtAbs(v.bono_venta)}</td>
                          <td style={{ ...tdR, color: v.bono_margen > 0 ? "#10B981" : "#94A3B8" }}>
                            {v.bono_margen > 0 ? fmtAbs(v.bono_margen) : "—"}
                          </td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{fmtAbs(v.bono_total)}</td>
                          <td style={tdR}><MontoSaldo value={saldo} /></td>
                          <td style={{ ...td, textAlign: "center", color: "#94A3B8", fontSize: 11 }}>
                            {isOpen ? "▲" : "▼"}
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, background: "#F8FAFC" }}>
                              <div style={{ padding: "12px 20px 16px 40px" }}>
                                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
                                  {/* Resumen bono */}
                                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
                                    <strong>Bono venta 100%:</strong> {fmt(v.bono_venta_100)}<br />
                                    <strong>Anticipo (80%):</strong> {fmt(v.anticipo_calc)}<br />
                                    <strong>Bono venta real:</strong> {fmt(v.bono_venta)}<br />
                                    {v.bono_margen_100 && (
                                      <><strong>Bono margen 100%:</strong> {fmt(v.bono_margen_100)}<br /></>
                                    )}
                                    {v.cumpl_margen !== null && (
                                      <><strong>Cumpl. margen:</strong> {v.cumpl_margen}%
                                        {v.bono_margen > 0
                                          ? <span style={{ color: "#10B981", marginLeft: 6 }}>✓ Aplica bono margen</span>
                                          : <span style={{ color: "#94A3B8", marginLeft: 6 }}>— No aplica</span>}
                                        <br /></>
                                    )}
                                    <strong>Liquidación estimada:</strong>{" "}
                                    <span style={{ color: saldo >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                                      {saldo >= 0 ? "+" : ""}{fmt(saldo)}
                                      {saldo < 0 ? " (descuento)" : " (pago adicional)"}
                                    </span>
                                  </div>

                                  {/* Detalle mensual */}
                                  <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ ...thS, fontSize: 11, padding: "4px 10px" }}>Mes</th>
                                        <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Meta</th>
                                        <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Venta Real</th>
                                        <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Margen Real</th>
                                        <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Cumpl %</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {v.detalle.map((d: any) => (
                                        <tr key={d.mes} style={{ background: "white" }}>
                                          <td style={{ ...td, fontSize: 12, padding: "4px 10px", fontWeight: 600 }}>
                                            {MESES_NOMBRE[d.mes - 1]}
                                          </td>
                                          <td style={{ ...tdR, fontSize: 12, padding: "4px 10px" }}>
                                            {d.meta_venta ? fmtAbs(d.meta_venta) : "—"}
                                          </td>
                                          <td style={{ ...tdR, fontSize: 12, padding: "4px 10px", fontWeight: 600 }}>
                                            {fmtAbs(d.venta_real)}
                                          </td>
                                          <td style={{ ...tdR, fontSize: 12, padding: "4px 10px", color: "#10B981" }}>
                                            {fmtAbs(d.contrib_real)}
                                          </td>
                                          <td style={{ ...tdR, fontSize: 12, padding: "4px 10px" }}>
                                            <CumplBar pct={d.cumpl_venta} />
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subgerente */}
          {subgerente && (
            <div style={{ ...card, borderLeft: "4px solid #8B5CF6" }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#6D28D9", margin: "0 0 10px" }}>
                Subgerencia de Ventas — {subgerente.nombre}
              </h3>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: "#374151" }}>
                <div><span style={{ color: "#64748B" }}>Meta empresa Q{q}:</span> <strong>{subgerente.meta_venta_q ? fmtAbs(subgerente.meta_venta_q) : "—"}</strong></div>
                <div><span style={{ color: "#64748B" }}>Venta real:</span> <strong>{fmtAbs(subgerente.venta_real_q)}</strong></div>
                <div><span style={{ color: "#64748B" }}>Cumplimiento:</span> <strong style={{ color: pctColor(subgerente.cumpl_venta) }}>{subgerente.cumpl_venta ?? "—"}%</strong></div>
                <div><span style={{ color: "#64748B" }}>Bono 100%:</span> <strong>{fmtAbs(subgerente.bono_venta_100)}</strong></div>
                <div><span style={{ color: "#64748B" }}>Anticipo (80%):</span> <strong style={{ color: "#6366F1" }}>{fmtAbs(subgerente.anticipo_calc)}</strong></div>
                <div><span style={{ color: "#64748B" }}>Bono proyectado:</span> <strong style={{ color: "#8B5CF6" }}>{fmtAbs(subgerente.bono_total)}</strong></div>
                <div>
                  <span style={{ color: "#64748B" }}>Saldo:</span>{" "}
                  <MontoSaldo value={subgerente.bono_total - subgerente.anticipo_calc} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                Bono real = Cumpl% × Bono_100% — evaluado sobre venta total empresa · Saldo = Bono real − Anticipo
              </div>
            </div>
          )}

          {/* Leyenda */}
          <div style={{ ...card, padding: "12px 18px", background: "#F8FAFC", fontSize: 12, color: "#475569" }}>
            <strong>Lógica de cálculo:</strong>{" "}
            Bono real = Cumpl% × Bono_100% · Anticipo = Bono_100% × 80% pagado mes 1 del trimestre ·
            Saldo = Bono real − Anticipo (positivo = pago adicional · negativo = descuento en remuneración) ·
            Bono margen aplica solo si Cumpl. venta ≥ 100% Y Cumpl. margen &gt; 100%
          </div>
        </>
      )}
    </div>
  );
}
