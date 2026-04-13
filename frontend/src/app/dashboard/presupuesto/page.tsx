"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtAbs, fmtPct, semaforo } from "@/lib/format";
import DataTable from "@/components/data-table";
import SectionHeader from "@/components/section-header";
import { RefreshCw } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ResumenKpis {
  ppto_total: number;
  ppto_trazable: number;
  ppto_sin_cliente: number;
  ppto_incr_sin_pn: number;
  ppto_incr_con_pn: number;
  venta_ytd: number;
  venta_ytd_25: number;
  meta_ytd: number;
  alcance_ytd: number;   // 0-1 ratio
  cumpl_ppto: number;    // 0-1 ratio
  cumpl_trazable: number;
  gap_meta: number;
  gap_ppto: number;
  var_abs_25: number;
  mes_nombre: string;
  error?: string;
}

interface CatRow {
  categoria: string;
  ppto_2026: number;
  ppto_trazable: number;
  ppto_prod_nuevo: number;
  ppto_incremental: number;
  ppto_sin_cliente: number;
}

interface ZonaRow {
  zona: string;
  ppto_2026: number;
  ppto_trazable: number;
  ppto_incr_con_pn: number;
  ppto_incr_sin_pn: number;
  ppto_sin_cliente: number;
}

/* ─── Compact format for large numbers (millions with dots) ─────────── */
function fmtMill(n: number): string {
  if (!isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${Math.round(abs / 1_000_000).toLocaleString("es-CL")} mill.`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${Math.round(abs / 1_000_000).toLocaleString("es-CL")} mill.`;
  }
  return `${sign}${Math.round(abs).toLocaleString("es-CL")}`;
}

/* ─── KPI Card matching Power BI style ──────────────────────────────── */
function PBIKpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 160,
        background: "white",
        borderRadius: 8,
        border: `2px solid ${color}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: color,
          color: "white",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: "16px 12px",
          textAlign: "center",
          fontSize: 24,
          fontWeight: 800,
          color: "#0F172A",
          fontFamily: "var(--font-sans)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ─── Section title bar matching Power BI ────────────────────────────── */
function SectionBar({ title }: { title: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #4472C4, #2E5A9E)",
        color: "white",
        padding: "10px 20px",
        borderRadius: "8px 8px 0 0",
        fontSize: 15,
        fontWeight: 700,
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      {title}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function PresupuestoPage() {
  const [kpis, setKpis] = useState<ResumenKpis | null>(null);
  const [catData, setCatData] = useState<CatRow[]>([]);
  const [zonaData, setZonaData] = useState<ZonaRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      // Single endpoint — loads PPTO_VS_VENTA once (avoids 3 slow DB calls)
      const res = await api.get<{
        kpis: ResumenKpis;
        categoria: CatRow[];
        zona: ZonaRow[];
      }>("/api/resumen/all");
      setKpis(res.kpis);
      setCatData(res.categoria);
      setZonaData(res.zona);
    } catch (e) {
      console.error("Failed to load resumen data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  const alcancePct = (kpis?.alcance_ytd ?? 0) * 100;
  const cumplPptoPct = (kpis?.cumpl_ppto ?? 0) * 100;
  const mesNombre = kpis?.mes_nombre ?? "—";

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Budget 2026</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            PPTO vs Venta — Data from VW_RESUMEN_KPIS_DASHBOARD & PPTO_VS_VENTA
          </p>
        </div>
        <button
          onClick={loadAll}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
            background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ═══ TOP KPIs — matches Power BI "PPto TT 2026 | Meta Ytd | Venta Ytd | Cumplimiento..." ═══ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <PBIKpiCard label="PPto TT 2026" value={fmtMill(kpis?.ppto_total ?? 0)} color="#C0504D" />
        <PBIKpiCard label={`Meta YTD ${mesNombre}`} value={fmtMill(kpis?.meta_ytd ?? 0)} color="#C0504D" />
        <PBIKpiCard label={`Venta YTD ${mesNombre}`} value={fmtMill(kpis?.venta_ytd ?? 0)} color="#C0504D" />
        <PBIKpiCard
          label="Cumplimiento YTD"
          value={`${alcancePct.toFixed(1)} %`}
          color="#C0504D"
        />
        <PBIKpiCard
          label="Diff Meta vs Venta"
          value={fmtMill(kpis?.gap_meta ?? 0)}
          color="#C0504D"
        />
        <PBIKpiCard
          label="Cumplimiento PPTo 2026"
          value={`${cumplPptoPct.toFixed(1)}%`}
          color="#C0504D"
        />
      </div>

      {/* ═══ CATEGORY TABLE — "Detalle de Presupuesto 2026" ═══ */}
      <div style={{ background: "white", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 24, overflow: "hidden" }}>
        <SectionBar title="Detalle de Presupuesto 2026" />
        <div style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F1F3F8" }}>
                <th style={thStyle}>Categoria</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto 2026</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Trazable</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Prod Nuevo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Incremental</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Sin Cliente</th>
              </tr>
            </thead>
            <tbody>
              {catData.map((row, i) => {
                const isTotal = row.categoria === "Total";
                return (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #E8ECF3",
                      fontWeight: isTotal ? 700 : 400,
                      background: isTotal ? "#E8EDF7" : i % 2 === 0 ? "white" : "#FAFBFD",
                    }}
                  >
                    <td style={tdStyle}>{row.categoria}</td>
                    <td style={tdRight}>{fmtAbs(row.ppto_2026)}</td>
                    <td style={tdRight}>{fmtAbs(row.ppto_trazable)}</td>
                    <td style={tdRight}>{row.ppto_prod_nuevo ? fmtAbs(row.ppto_prod_nuevo) : ""}</td>
                    <td style={{ ...tdRight, color: "#10B981" }}>{row.ppto_incremental ? fmtAbs(row.ppto_incremental) : ""}</td>
                    <td style={tdRight}>{row.ppto_sin_cliente ? fmtAbs(row.ppto_sin_cliente) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ ZONE TABLE — "Presupuesto 2026 por Zonas" ═══ */}
      <div style={{ background: "white", borderRadius: 8, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <SectionBar title="Presupuesto 2026 por Zonas" />
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F1F3F8", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={thStyle}>Zona</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto 2026</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Trazable</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Incremental Con PN</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Incremental Sin PN</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ppto Sin Cliente</th>
              </tr>
            </thead>
            <tbody>
              {zonaData.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid #E8ECF3",
                    background: i % 2 === 0 ? "white" : "#FAFBFD",
                  }}
                >
                  <td style={tdStyle}>{row.zona}</td>
                  <td style={tdRight}>{fmtAbs(row.ppto_2026)}</td>
                  <td style={tdRight}>{row.ppto_trazable ? fmtAbs(row.ppto_trazable) : ""}</td>
                  <td style={tdRight}>{row.ppto_incr_con_pn ? fmtAbs(row.ppto_incr_con_pn) : ""}</td>
                  <td style={tdRight}>{row.ppto_incr_sin_pn ? fmtAbs(row.ppto_incr_sin_pn) : ""}</td>
                  <td style={tdRight}>{row.ppto_sin_cliente ? fmtAbs(row.ppto_sin_cliente) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared table styles ────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  fontSize: 12,
  borderBottom: "2px solid #D1D5DB",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 14px",
  color: "#1F2937",
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
