"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import * as XLSX from "xlsx";

/* ─── Styles ──────────────────────────────────────────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const thC: React.CSSProperties = { ...thS, textAlign: "center" };
const td: React.CSSProperties = { padding: "8px 12px", color: "#1F2937", fontSize: 13, whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdC: React.CSSProperties = { ...td, textAlign: "center" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const MESES_NOMBRE = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const Q_LABEL = ["Q1 Ene-Mar","Q2 Abr-Jun","Q3 Jul-Sep","Q4 Oct-Dic"];

function pctColor(pct: number | null) {
  if (pct === null) return "#94A3B8";
  if (pct >= 100) return "#10B981";
  if (pct >= 80)  return "#F59E0B";
  return "#EF4444";
}

function semaforo(pct: number | null) {
  if (pct === null) return "⬜";
  if (pct >= 100) return "🟢";
  if (pct >= 80)  return "🟡";
  return "🔴";
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

function PctBadge({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span style={{ color: "#94A3B8" }}>—</span>;
  const color = pctColor(pct);
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
      fontWeight: 700, color, background: color + "18",
    }}>
      {label ?? `${pct.toFixed(1)}%`}
    </span>
  );
}

function BonoMargenTag({ factor, aplica }: { factor: number | null | undefined; aplica: boolean }) {
  if (!aplica) return <span style={{ color: "#CBD5E1", fontSize: 12 }}>—</span>;
  const is50 = factor === 0.5;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: is50 ? "#FEF3C7" : "#DCFCE7",
      color: is50 ? "#B45309" : "#15803D",
    }}>
      ✓ {is50 ? "50%" : "100%"}
    </span>
  );
}

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 140, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function IncentivosPage() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState<number | null>(null);
  const [ano]                 = useState(2026);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback((trimestre: number) => {
    setLoading(true);
    api.get<any>(`/api/incentivos/trimestre?q=${trimestre}&ano=${ano}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ano]);

  useEffect(() => {
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

  // ── Excel export (solo % — sin montos) ─────────────────────────────────
  const handleExcel = () => {
    if (!data) return;
    const vendedores: any[] = data.vendedores || [];
    const qLabel = Q_LABEL[(q || 1) - 1];

    // Hoja 1 — Resumen por vendedor
    const resumenRows = vendedores
      .filter((v: any) => v.tipo === "VENDEDOR")
      .map((v: any) => ({
        "Vendedor":          v.vendedor,
        "Nombre":            v.nombre,
        "Cumpl. Venta %":    v.cumpl_venta ?? "",
        "Cumpl. Margen %":   v.cumpl_margen ?? "",
        "Bono Margen":       v.bono_margen > 0
                               ? (v.bono_margen_factor === 0.5 ? "Aplica 50%" : "Aplica 100%")
                               : "No aplica",
        "Estado":            v.cumpl_venta === null ? "Sin datos"
                               : v.cumpl_venta >= 100 ? "Meta cumplida"
                               : v.cumpl_venta >= 80  ? "En riesgo"
                               : "Bajo meta",
      }));

    const subg = vendedores.find((v: any) => v.tipo === "SUBGERENTE");
    if (subg) {
      resumenRows.push({
        "Vendedor":         subg.vendedor,
        "Nombre":           subg.nombre + " (Subgerencia)",
        "Cumpl. Venta %":   subg.cumpl_venta ?? "",
        "Cumpl. Margen %":  subg.cumpl_margen ?? "",
        "Bono Margen":      subg.bono_margen > 0 ? "Aplica" : "No aplica",
        "Estado":           subg.cumpl_venta >= 100 ? "Meta cumplida"
                              : subg.cumpl_venta >= 80 ? "En riesgo" : "Bajo meta",
      });
    }

    // Hoja 2 — Detalle mensual por vendedor
    const detalleRows: any[] = [];
    vendedores
      .filter((v: any) => v.tipo === "VENDEDOR")
      .forEach((v: any) => {
        (v.detalle || []).forEach((d: any) => {
          detalleRows.push({
            "Vendedor":        v.vendedor,
            "Nombre":          v.nombre,
            "Mes":             MESES_NOMBRE[d.mes - 1],
            "Cumpl. Venta %":  d.cumpl_venta ?? "",
          });
        });
      });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows),  "Resumen Q");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleRows),  "Detalle Mensual");
    XLSX.writeFile(wb, `Incentivos_${ano}_${qLabel.replace(/ /g,"_")}.xlsx`);
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando incentivos...</div>;
  if (!data) return (
    <div style={{ ...card, padding: 32, color: "#64748B", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Tablas no encontradas</div>
      <div style={{ fontSize: 13 }}>Conecta la VPN y ejecuta en el backend: <code>python setup_incentivos.py</code></div>
    </div>
  );
  if (data?.error) return (
    <div style={{ ...card, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>Error al cargar datos</div>
      <div style={{ fontSize: 12, color: "#64748B" }}>{data.error}</div>
    </div>
  );

  const vendedores: any[] = data?.vendedores || [];
  const totales  = data?.totales  || {};
  const estado   = data?.estado   || "—";
  const mesesQ: number[] = data?.meses_q || [];

  const vendNormales  = vendedores.filter((v: any) => v.tipo === "VENDEDOR");
  const subgerente    = vendedores.find((v: any)   => v.tipo === "SUBGERENTE");
  const conBonoMargen = vendNormales.filter((v: any) => v.bono_margen > 0).length;

  const estadoBadge = estado === "liquidado"
    ? { label: "Liquidado",  bg: "#DCFCE7", color: "#15803D" }
    : estado === "en_curso"
    ? { label: "En Curso",   bg: "#FEF9C3", color: "#A16207" }
    : { label: "Pendiente",  bg: "#F1F5F9", color: "#64748B" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>Incentivos {ano}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, color: estadoBadge.color, background: estadoBadge.bg, padding: "3px 10px", borderRadius: 20 }}>
              {estadoBadge.label}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Bonos trimestrales — cumplimiento por vendedor
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Q Tabs */}
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 4 }}>
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => handleQChange(n)} style={{
                padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: q === n ? 700 : 400,
                background: q === n ? "white" : "transparent",
                color: q === n ? "#0F172A" : "#64748B",
                boxShadow: q === n ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>Q{n}</button>
            ))}
          </div>
          {/* Excel export */}
          <button onClick={handleExcel} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
            background: "white", fontSize: 13, fontWeight: 600,
            color: "#374151", cursor: "pointer",
          }}>
            ↓ Excel
          </button>
        </div>
      </div>

      {/* Periodo */}
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

      {/* KPI cards — solo % y conteos */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard
          title="Cumpl. Global"
          value={totales.cumpl_global != null ? `${totales.cumpl_global}%` : "—"}
          sub={`Q${q} ${ano}`}
          color={pctColor(totales.cumpl_global)}
        />
        <KpiCard
          title="En Riesgo"
          value={`${data?.en_riesgo || 0}`}
          sub="vendedores bajo anticipo"
          color={data?.en_riesgo > 0 ? "#EF4444" : "#10B981"}
        />
        <KpiCard
          title="Con Bono Margen"
          value={`${conBonoMargen}`}
          sub={`de ${vendNormales.length} vendedores`}
          color={conBonoMargen > 0 ? "#10B981" : "#94A3B8"}
        />
        {subgerente && (
          <KpiCard
            title={`Cumpl. ${subgerente.nombre.split(" ")[0]}`}
            value={subgerente.cumpl_venta != null ? `${subgerente.cumpl_venta}%` : "—"}
            sub="Subgerencia de Ventas"
            color={pctColor(subgerente.cumpl_venta)}
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
                <th style={thC}>Estado</th>
                <th style={thR}>Cumpl. Venta %</th>
                <th style={thR}>Cumpl. Margen %</th>
                <th style={thC}>Bono Margen</th>
                <th style={{ ...thS, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {vendNormales.map((v: any, i: number) => {
                const isOpen = expanded === v.vendedor;
                const rowColor = v.cumpl_venta === null ? rowBg(i)
                  : v.cumpl_venta >= 100 ? "#F0FDF4"
                  : v.cumpl_venta >= 80  ? "#FFFBEB"
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
                      <td style={tdC}>
                        <span style={{ fontSize: 18 }}>{semaforo(v.cumpl_venta)}</span>
                      </td>
                      <td style={tdR}>
                        <CumplBar pct={v.cumpl_venta} />
                      </td>
                      <td style={tdR}>
                        {v.cumpl_margen !== null
                          ? <PctBadge pct={v.cumpl_margen} />
                          : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={tdC}>
                        <BonoMargenTag factor={v.bono_margen_factor} aplica={v.bono_margen > 0} />
                      </td>
                      <td style={{ ...tdC, color: "#94A3B8", fontSize: 11 }}>
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>

                    {/* Drill-down — solo % */}
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: "#F8FAFC" }}>
                          <div style={{ padding: "12px 20px 16px 40px", display: "flex", gap: 32, flexWrap: "wrap" }}>

                            {/* Resumen cumplimiento */}
                            <div style={{ fontSize: 12, color: "#475569", lineHeight: 2 }}>
                              <div>
                                <strong>Cumpl. venta: </strong>
                                <span style={{ color: pctColor(v.cumpl_venta), fontWeight: 700 }}>
                                  {v.cumpl_venta != null ? `${v.cumpl_venta}%` : "—"}
                                </span>
                              </div>
                              {v.cumpl_margen !== null && (
                                <div>
                                  <strong>Cumpl. margen: </strong>
                                  <span style={{ color: pctColor(v.cumpl_margen), fontWeight: 700 }}>
                                    {v.cumpl_margen}%
                                  </span>
                                </div>
                              )}
                              <div>
                                <strong>Bono margen: </strong>
                                {v.bono_margen > 0 ? (
                                  <span style={{ color: v.bono_margen_factor === 0.5 ? "#F59E0B" : "#10B981", fontWeight: 700 }}>
                                    ✓ Aplica {v.bono_margen_factor === 0.5 ? "(50% — cumpl. venta 95–99.9%)" : "(100%)"}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94A3B8" }}>No aplica</span>
                                )}
                              </div>
                            </div>

                            {/* Detalle mensual — solo cumpl % */}
                            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th style={{ ...thS, fontSize: 11, padding: "4px 10px" }}>Mes</th>
                                  <th style={{ ...thR, fontSize: 11, padding: "4px 10px" }}>Cumpl. Venta %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(v.detalle || []).map((d: any) => (
                                  <tr key={d.mes} style={{ background: "white" }}>
                                    <td style={{ ...td, fontSize: 12, padding: "4px 10px", fontWeight: 600 }}>
                                      {MESES_NOMBRE[d.mes - 1]}
                                    </td>
                                    <td style={{ ...tdR, fontSize: 12, padding: "4px 10px" }}>
                                      <CumplBar pct={d.cumpl_venta} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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

      {/* Subgerente — solo % */}
      {subgerente && (
        <div style={{ ...card, borderLeft: "4px solid #8B5CF6" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#6D28D9", margin: "0 0 10px" }}>
            Subgerencia de Ventas — {subgerente.nombre}
          </h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: "#374151", alignItems: "center" }}>
            <div>
              <span style={{ color: "#64748B" }}>Cumplimiento Q{q}: </span>
              <strong style={{ color: pctColor(subgerente.cumpl_venta), fontSize: 18 }}>
                {subgerente.cumpl_venta ?? "—"}%
              </strong>
            </div>
            <div>{semaforo(subgerente.cumpl_venta)}</div>
            {subgerente.cumpl_margen !== null && (
              <div>
                <span style={{ color: "#64748B" }}>Cumpl. margen: </span>
                <strong style={{ color: pctColor(subgerente.cumpl_margen) }}>
                  {subgerente.cumpl_margen}%
                </strong>
              </div>
            )}
            {subgerente.bono_margen > 0 && (
              <BonoMargenTag factor={subgerente.bono_margen_factor} aplica={true} />
            )}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
            Evaluado sobre venta total empresa
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ ...card, padding: "12px 18px", background: "#F8FAFC", fontSize: 12, color: "#475569" }}>
        <strong>Lógica de cumplimiento:</strong>{" "}
        🟢 ≥ 100% meta · 🟡 80–99.9% · 🔴 &lt; 80% ·{" "}
        Bono margen: Cumpl. venta ≥ 100% → aplica 100% · Cumpl. venta 95–99.9% → aplica 50% · &lt; 95% → no aplica · Requiere Cumpl. margen ≥ 100%
      </div>
    </div>
  );
}
