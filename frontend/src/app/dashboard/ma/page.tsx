"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import { ExportButton } from "@/components/table-tools";
import HelpButton from "@/components/help-button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line, LabelList,
} from "recharts";

/* ─── Shared styles ────────────────────────────────────────── */

const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";

const CHANNEL_COLORS: Record<string, string> = {
  SE: "#3B82F6", CM: "#10B981", AG: "#F59E0B", TD: "#8B5CF6",
};
const CHANNEL_LABELS: Record<string, string> = {
  SE: "Licitaciones", CM: "Convenio Marco", AG: "Compra Agil", TD: "Trato Directo",
};

const PERIODOS = [
  { id: "total", label: "2025 + 2026", desc: "Ambos anos combinados" },
  { id: "2025", label: "2025 (Cerrado)", desc: "Ano completo" },
  { id: "2026", label: "2026 (YTD)", desc: "Enero a hoy" },
];

const MONTO_FILTERS = [
  { label: "Todos", min: 0, max: 1_900_000_000 },
  { label: "$100M-$350M", min: 100_000_000, max: 350_000_000 },
  { label: "$350M-$700M", min: 350_000_000, max: 700_000_000 },
  { label: "$700M-$1.000M", min: 700_000_000, max: 1_000_000_000 },
  { label: "$1.000M-$1.500M", min: 1_000_000_000, max: 1_500_000_000 },
  { label: "$1.500M-$1.900M", min: 1_500_000_000, max: 1_900_000_000 },
];

/* ─── Shared Components ───────────────────────────────────── */

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 150, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span style={{ color: "#94A3B8" }}>--</span>;
  const color = value > 0 ? "#10B981" : value < 0 ? "#EF4444" : "#64748B";
  return <span style={{ color, fontWeight: 600 }}>{value > 0 ? "+" : ""}{value.toFixed(1)}%</span>;
}

function InfoBanner({ info }: { info: any }) {
  if (!info) return null;
  return (
    <div style={{
      ...card, padding: "10px 18px", background: "#F0F9FF", borderColor: "#BAE6FD",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <div style={{ fontSize: 16 }}>📊</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0369A1" }}>{info.label}</div>
        <div style={{ fontSize: 11, color: "#0C4A6E" }}>{info.detalle}</div>
      </div>
    </div>
  );
}

function PeriodSelector({ selected, onChange }: { selected: string; onChange: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
      {PERIODOS.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          title={p.desc}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: selected === p.id ? 700 : 400,
            background: selected === p.id ? "white" : "transparent",
            color: selected === p.id ? "#0F172A" : "#64748B",
            boxShadow: selected === p.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 1: Market Overview
   ═══════════════════════════════════════════════════════════ */

function OverviewSection({ data }: { data: any }) {
  if (!data || data.error) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {data?.error || "Sin datos"}</div>;

  const pinfo = data.periodo_info || {};

  // Market size based on period
  const mercadoTotal = data.mercado_ytd + data.mercado_cerrado;
  const lbfTotal = data.lbf_ytd + data.lbf_cerrado;
  const lbfShare = mercadoTotal > 0 ? (lbfTotal / mercadoTotal * 100).toFixed(1) : "0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <InfoBanner info={pinfo} />

      {/* Explanatory card */}
      <div style={{ ...card, padding: "12px 18px", background: "#FFFBEB", borderColor: "#FCD34D" }}>
        <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
          <strong>Que analiza este modulo:</strong> Identifica empresas distribuidoras de insumos medicos en Mercado Publico
          en las mismas subcategorias donde LBF compite, con ventas entre $100M y $1.900M CLP (~$100K a $2M USD).
          Se excluyen multinacionales (Bayer, Roche, Medtronic, etc.), clinicas, hospitales y farmacias.
          Solo muestra distribuidores/comercializadores adquiribles. Datos de ordenes de compra en mercadopublico.cl.
        </div>
      </div>

      {/* KPIs — show both years always for context */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Mercado 2025 (Cerrado)" value={fmt(data.mercado_cerrado)} color="#64748B"
          sub={<>{data.n_providers_cerrado.toLocaleString()} proveedores</>} />
        <KpiCard title="Mercado 2026 (YTD)" value={fmt(data.mercado_ytd)} color="#3B82F6"
          sub={<>{data.n_providers_ytd.toLocaleString()} proveedores</>} />
        <KpiCard title="Targets (periodo)" value={data.n_targets.toLocaleString()} color="#F59E0B"
          sub={`Venta hasta ${fmt(1_900_000_000)}`} />
        <KpiCard title="LBF Market Share" value={`${lbfShare}%`} color="#10B981"
          sub={<>2025: {fmt(data.lbf_cerrado)} | 2026 YTD: {fmt(data.lbf_ytd)}</>} />
        <KpiCard title="Subcategorias LBF" value={String(data.lbf_n_subcats)} color="#8B5CF6" />
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Brackets bar chart */}
        <div style={{ ...card, flex: "2 1 400px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
            Proveedores por tramo de venta
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>
            Periodo: {pinfo.label || "Total"} — Solo categorias donde LBF compite
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.brackets} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
              <YAxis type="category" dataKey="bracket" width={130} tick={{ fill: "#374151", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                formatter={(value: any, name: any) => [fmtAbs(value), name]}
              />
              <Bar dataKey="total" name="Venta Total" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="n" position="right" style={{ fill: "#64748B", fontSize: 11, fontWeight: 700 }}
                  formatter={(v: any) => `${v} emp.`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Channel distribution */}
        <div style={{ ...card, flex: "1 1 250px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
            Canales de venta
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>Empresas target — {pinfo.corto || "Total"}</div>
          {data.canales && data.canales.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.canales.map((c: any) => {
                const total = data.canales.reduce((s: number, x: any) => s + x.total, 0);
                const pct = total > 0 ? (c.total / total * 100).toFixed(0) : "0";
                return (
                  <div key={c.canal}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: "#374151" }}>{CHANNEL_LABELS[c.canal] || c.canal}</span>
                      <span style={{ color: "#64748B" }}>{pct}% — {fmt(c.total)}</span>
                    </div>
                    <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: CHANNEL_COLORS[c.canal] || "#94A3B8", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Subcategory table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>
          Venta por subcategoria — Empresas target
        </div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>
          Periodo: {pinfo.label || "Total"} — Subcategorias medicas donde LBF tiene presencia
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 35 }}>#</th>
                <th style={thS}>Subcategoria</th>
                <th style={thR}>Venta Total</th>
                <th style={thR}>Proveedores</th>
                <th style={thR}>% del Total</th>
              </tr>
            </thead>
            <tbody>
              {(data.subcategorias || []).map((s: any, i: number) => {
                const grandTotal = (data.subcategorias || []).reduce((acc: number, x: any) => acc + x.total, 0);
                return (
                  <tr key={i} style={{ background: rowBg(i) }}>
                    <td style={{ ...td, fontWeight: 700, color: "#64748B" }}>{i + 1}</td>
                    <td style={{ ...td, fontSize: 12 }}>{s.subcategoria}</td>
                    <td style={{ ...tdR, fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>{fmt(s.total)}</td>
                    <td style={{ ...tdR, fontSize: 12 }}>{s.n_providers}</td>
                    <td style={{ ...tdR, fontSize: 12, color: "#64748B" }}>{grandTotal > 0 ? (s.total / grandTotal * 100).toFixed(1) : 0}%</td>
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


/* ═══════════════════════════════════════════════════════════
   SECTION 2: Target Companies
   ═══════════════════════════════════════════════════════════ */

function TargetsSection({ data, onSelect }: { data: any; onSelect: (rut: string) => void }) {
  const [searchText, setSearchText] = useState("");
  const [montoFilter, setMontoFilter] = useState(0);
  const [minOverlap, setMinOverlap] = useState(0);
  const [sortField, setSortField] = useState<string>("rev_total");
  const [sortAsc, setSortAsc] = useState(false);

  const targets = data?.targets || [];
  const pinfo = data?.periodo_info || {};

  const mf = MONTO_FILTERS[montoFilter];
  const filtered = targets.filter((t: any) => {
    if (t.rev_total < mf.min || t.rev_total > mf.max) return false;
    if (t.overlap_pct < minOverlap) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!t.nombre.toLowerCase().includes(q) && !t.rut.includes(q) && !(t.actividad || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a: any, b: any) => {
    let va = a[sortField], vb = b[sortField];
    if (va === null || va === undefined) va = -Infinity;
    if (vb === null || vb === undefined) vb = -Infinity;
    return sortAsc ? va - vb : vb - va;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };
  const sortIcon = (field: string) => sortField === field ? (sortAsc ? " ▲" : " ▼") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <InfoBanner info={pinfo} />

      {/* Explanatory note */}
      <div style={{ ...card, padding: "10px 18px", background: "#F8FAFC" }}>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
          <strong>Empresas objetivo:</strong> Distribuidores/comercializadores de insumos medicos con venta entre $100M y $1.900M CLP.
          Excluye multinacionales, clinicas, hospitales y farmacias.
          <strong>Overlap</strong> = subcategorias en comun con LBF (mayor = mas sinergia).
          <strong>YoY</strong> = crecimiento 2026 vs 2025. Haz clic en fila para ver perfil completo.
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar empresa o RUT..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, width: 220, outline: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Venta:</span>
          {MONTO_FILTERS.map((f, i) => (
            <button key={i} onClick={() => setMontoFilter(i)}
              style={{
                padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11,
                fontWeight: montoFilter === i ? 700 : 400,
                background: montoFilter === i ? "#DBEAFE" : "#F1F5F9",
                color: montoFilter === i ? "#1E40AF" : "#64748B",
              }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Overlap min:</span>
          {[0, 25, 50, 75].map(v => (
            <button key={v} onClick={() => setMinOverlap(v)}
              style={{
                padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11,
                fontWeight: minOverlap === v ? 700 : 400,
                background: minOverlap === v ? "#DCFCE7" : "#F1F5F9",
                color: minOverlap === v ? "#166534" : "#64748B",
              }}>{v === 0 ? "Todos" : `${v}%+`}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>
          {sorted.length} de {targets.length} empresas
        </div>
        <ExportButton
          data={sorted}
          columns={[
            { key: "rut", label: "RUT" },
            { key: "nombre", label: "Empresa" },
            { key: "actividad", label: "Actividad" },
            { key: "rev_total", label: "Venta Total" },
            { key: "rev_current", label: "2026 YTD" },
            { key: "rev_prev", label: "2025" },
            { key: "yoy", label: "YoY %" },
            { key: "n_clients", label: "Clientes" },
            { key: "overlap_pct", label: "Overlap %" },
            { key: "n_overlap", label: "Overlap Subcats" },
            { key: "n_regions", label: "Regiones" },
          ]}
          filename="ma_targets"
        />
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: 650, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <tr>
                <th style={{ ...thS, width: 35 }}>#</th>
                <th style={{ ...thS, minWidth: 200 }}>Empresa</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("rev_total")}>
                  Venta ({pinfo.corto || "Total"}){sortIcon("rev_total")}
                </th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("rev_current")}>2026 YTD{sortIcon("rev_current")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("rev_prev")}>2025{sortIcon("rev_prev")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("yoy")}>YoY{sortIcon("yoy")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("n_clients")}>Clientes{sortIcon("n_clients")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("overlap_pct")}>Overlap{sortIcon("overlap_pct")}</th>
                <th style={{ ...thR, cursor: "pointer" }} onClick={() => handleSort("n_regions")}>Regiones{sortIcon("n_regions")}</th>
                <th style={{ ...thS, width: 90 }}>Canales</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 300).map((t: any, i: number) => {
                const revCh = t.rev_se + t.rev_cm + t.rev_ag + t.rev_otro;
                return (
                  <tr
                    key={t.rut}
                    onClick={() => onSelect(t.rut)}
                    style={{ background: rowBg(i), cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#EFF6FF")}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg(i))}
                  >
                    <td style={{ ...td, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, maxWidth: 250 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.nombre}
                      </div>
                      {t.actividad && (
                        <div style={{ fontSize: 10, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                          {t.actividad}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdR, fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{fmt(t.rev_total)}</td>
                    <td style={{ ...tdR, fontSize: 12, color: "#3B82F6" }}>{fmt(t.rev_current)}</td>
                    <td style={{ ...tdR, fontSize: 12, color: "#64748B" }}>{fmt(t.rev_prev)}</td>
                    <td style={{ ...tdR, fontSize: 12 }}><GrowthBadge value={t.yoy} /></td>
                    <td style={{ ...tdR, fontSize: 12 }}>{t.n_clients}</td>
                    <td style={{ ...tdR, fontSize: 12 }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: t.overlap_pct >= 75 ? "#DCFCE7" : t.overlap_pct >= 50 ? "#FEF3C7" : t.overlap_pct >= 25 ? "#FEE2E2" : "#F1F5F9",
                        color: t.overlap_pct >= 75 ? "#166534" : t.overlap_pct >= 50 ? "#92400E" : t.overlap_pct >= 25 ? "#991B1B" : "#64748B",
                      }}>
                        {t.overlap_pct}% ({t.n_overlap})
                      </span>
                    </td>
                    <td style={{ ...tdR, fontSize: 12 }}>{t.n_regions}</td>
                    <td style={{ ...td, padding: "7px 8px" }}>
                      {revCh > 0 && (
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", width: 70 }}>
                          {t.rev_se > 0 && <div style={{ width: `${t.rev_se / revCh * 100}%`, background: CHANNEL_COLORS.SE }} title={`SE: ${fmt(t.rev_se)}`} />}
                          {t.rev_cm > 0 && <div style={{ width: `${t.rev_cm / revCh * 100}%`, background: CHANNEL_COLORS.CM }} title={`CM: ${fmt(t.rev_cm)}`} />}
                          {t.rev_ag > 0 && <div style={{ width: `${t.rev_ag / revCh * 100}%`, background: CHANNEL_COLORS.AG }} title={`AG: ${fmt(t.rev_ag)}`} />}
                          {t.rev_otro > 0 && <div style={{ width: `${t.rev_otro / revCh * 100}%`, background: "#CBD5E1" }} title={`Otro: ${fmt(t.rev_otro)}`} />}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Sin resultados con estos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
        {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: CHANNEL_COLORS[k] || "#CBD5E1" }} />
            {v}
          </div>
        ))}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 3: Company Profile
   ═══════════════════════════════════════════════════════════ */

function EmpresaProfile({ rut, periodo, onBack }: { rut: string; periodo: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/ma/empresa/${encodeURIComponent(rut)}?ano=2026&periodo=${periodo}`, { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rut, periodo]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando perfil...</div>;
  if (!data || data.error) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {data?.error || "Sin datos"}</div>;

  const info = data.info || {};
  const co = data.client_overlap || {};
  const pinfo = data.periodo_info || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Back + period info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{
          padding: "6px 16px", borderRadius: 6, border: "1px solid #E2E8F0",
          background: "white", cursor: "pointer", fontSize: 12, color: "#64748B", fontWeight: 600,
        }}>
          ← Volver a lista
        </button>
        <div style={{ fontSize: 12, color: "#64748B" }}>Periodo: <strong>{pinfo.label}</strong></div>
      </div>

      {/* Header */}
      <div style={{ ...card, background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)", color: "white", borderColor: "#334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{info.nombre}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>RUT: {info.rut}</div>
            {info.actividad && <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>{info.actividad}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#60A5FA" }}>{fmt(info.rev_total)}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Venta total 2025+2026</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          {[
            { label: "2026 (YTD)", value: fmt(info.rev_current), color: "#3B82F6" },
            { label: "2025 (Cerrado)", value: fmt(info.rev_prev), color: "#94A3B8" },
            { label: "Crecimiento YoY", value: info.yoy !== null ? `${info.yoy > 0 ? "+" : ""}${info.yoy}%` : "--", color: info.yoy > 0 ? "#10B981" : "#EF4444" },
            { label: "Clientes", value: String(info.n_clients), color: "#F59E0B" },
            { label: "Ordenes de Compra", value: info.n_ocs.toLocaleString(), color: "#8B5CF6" },
            { label: "Clientes en comun con LBF", value: `${co.shared_with_lbf} de ${co.total_target} (${co.pct}%)`, color: "#10B981" },
          ].map((k, i) => (
            <div key={i} style={{ flex: "1 1 120px", padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color, marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content grid */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Subcategorias */}
        <div style={{ ...card, flex: "1 1 400px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Subcategorias</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
            Filas verdes = subcategorias donde LBF tambien vende (sinergia directa)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Subcategoria</th>
                <th style={thR}>2026</th>
                <th style={thR}>2025</th>
                <th style={thR}>OCs</th>
                <th style={{ ...thS, width: 50 }}>LBF</th>
              </tr>
            </thead>
            <tbody>
              {(data.subcategorias || []).map((s: any, i: number) => (
                <tr key={i} style={{ background: s.overlap ? "#F0FDF4" : rowBg(i) }}>
                  <td style={{ ...td, fontSize: 12 }}>{s.subcategoria}</td>
                  <td style={{ ...tdR, fontSize: 12, fontWeight: 600 }}>{fmt(s.rev_current)}</td>
                  <td style={{ ...tdR, fontSize: 12, color: "#64748B" }}>{fmt(s.rev_prev)}</td>
                  <td style={{ ...tdR, fontSize: 12 }}>{s.n_ocs}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {s.overlap && <span style={{ background: "#DCFCE7", color: "#166534", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>SI</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Canales */}
        <div style={{ ...card, flex: "0 1 300px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Mix de Canales</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Periodo: {pinfo.corto}</div>
          {(data.canales || []).map((c: any) => {
            const total = (data.canales || []).reduce((s: number, x: any) => s + x.total, 0);
            const pct = total > 0 ? (c.total / total * 100).toFixed(0) : "0";
            return (
              <div key={c.canal} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{CHANNEL_LABELS[c.canal] || c.canal}</span>
                  <span style={{ color: "#64748B" }}>{pct}% — {fmt(c.total)}</span>
                </div>
                <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: CHANNEL_COLORS[c.canal] || "#94A3B8", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tendencia mensual — always both years */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Tendencia Mensual</div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>
          Barras azules = 2026 YTD | Linea gris = 2025 (referencia)
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.tendencia || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="mes_nombre" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
              formatter={(value: any, name: any) => [fmtAbs(value), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="rev_current" name="2026 YTD" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Line dataKey="rev_prev" name="2025" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Products + Clients */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: "1 1 400px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Top Productos</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Periodo: {pinfo.label}</div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "white" }}>
                <tr>
                  <th style={{ ...thS, width: 35 }}>#</th>
                  <th style={thS}>Producto</th>
                  <th style={thR}>Total</th>
                  <th style={thR}>Cant.</th>
                  <th style={thR}>OCs</th>
                </tr>
              </thead>
              <tbody>
                {(data.productos || []).map((p: any, i: number) => (
                  <tr key={i} style={{ background: rowBg(i) }}>
                    <td style={{ ...td, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, fontSize: 11, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>{p.producto}</td>
                    <td style={{ ...tdR, fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>{fmt(p.total)}</td>
                    <td style={{ ...tdR, fontSize: 12 }}>{p.cantidad.toLocaleString()}</td>
                    <td style={{ ...tdR, fontSize: 12 }}>{p.n_ocs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ ...card, flex: "1 1 400px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Clientes Institucionales</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Periodo: {pinfo.label}</div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "white" }}>
                <tr>
                  <th style={{ ...thS, width: 35 }}>#</th>
                  <th style={thS}>Institucion</th>
                  <th style={thR}>Total</th>
                  <th style={thR}>OCs</th>
                  <th style={thS}>Region</th>
                </tr>
              </thead>
              <tbody>
                {(data.clientes || []).map((c: any, i: number) => (
                  <tr key={i} style={{ background: rowBg(i) }}>
                    <td style={{ ...td, fontWeight: 700, color: "#64748B", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.nombre}</td>
                    <td style={{ ...tdR, fontSize: 12, fontWeight: 600, color: "#10B981" }}>{fmt(c.total)}</td>
                    <td style={{ ...tdR, fontSize: 12 }}>{c.n_ocs}</td>
                    <td style={{ ...td, fontSize: 10, color: "#64748B" }}>{c.region || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Regional coverage */}
      {(data.regiones || []).length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Cobertura Regional</div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>
            Regiones donde la empresa vende, segun ubicacion del comprador — {pinfo.corto}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(data.regiones || []).map((r: any, i: number) => {
              const maxTotal = Math.max(...(data.regiones || []).map((x: any) => x.total));
              const pct = maxTotal > 0 ? (r.total / maxTotal * 100) : 0;
              return (
                <div key={i} style={{
                  flex: "1 1 200px", padding: "10px 14px",
                  background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>{r.region}</div>
                  <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "#3B82F6", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>{fmt(r.total)} | {r.n_clients} clientes | {r.n_ocs} OCs</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

const TABS = [
  { id: "overview", label: "Vision de Mercado" },
  { id: "targets", label: "Empresas Objetivo" },
];

export default function MAPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [periodo, setPeriodo] = useState("total");
  const [overviewData, setOverviewData] = useState<any>(null);
  const [targetsData, setTargetsData] = useState<any>(null);
  const [loadingOv, setLoadingOv] = useState(true);
  const [loadingTgt, setLoadingTgt] = useState(true);
  const [selectedRut, setSelectedRut] = useState<string | null>(null);

  // Reload when period changes
  useEffect(() => {
    setLoadingOv(true);
    setLoadingTgt(true);
    api.get<any>(`/api/ma/overview?ano=2026&periodo=${periodo}`, { noCache: true })
      .then(r => { setOverviewData(r); setLoadingOv(false); })
      .catch(() => setLoadingOv(false));

    api.get<any>(`/api/ma/targets?ano=2026&periodo=${periodo}`, { noCache: true })
      .then(r => { setTargetsData(r); setLoadingTgt(false); })
      .catch(() => setLoadingTgt(false));
  }, [periodo]);

  const handleSelect = (rut: string) => {
    setSelectedRut(rut);
    setActiveTab("detail");
  };

  const handleBack = () => {
    setSelectedRut(null);
    setActiveTab("targets");
  };

  const showingDetail = activeTab === "detail" && selectedRut;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>M&A Targets</h1>
            <HelpButton module="ma" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Empresas objetivo para adquisicion — Insumos medicos en Mercado Publico (hasta ~$2M USD)
          </p>
        </div>
        <PeriodSelector selected={periodo} onChange={(p) => { setPeriodo(p); setSelectedRut(null); if (activeTab === "detail") setActiveTab("targets"); }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 4, width: "fit-content", marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); if (t.id !== "detail") setSelectedRut(null); }}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
              background: activeTab === t.id && !showingDetail ? "white" : "transparent",
              color: activeTab === t.id && !showingDetail ? "#0F172A" : "#64748B",
              boxShadow: activeTab === t.id && !showingDetail ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
        {showingDetail && (
          <button style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "default",
            fontSize: 13, fontWeight: 700, background: "white", color: "#0F172A",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            Perfil Empresa
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === "overview" && (
        loadingOv ? <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando vision de mercado...</div>
          : <OverviewSection data={overviewData} />
      )}
      {activeTab === "targets" && (
        loadingTgt ? <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>Cargando empresas objetivo...</div>
          : <TargetsSection data={targetsData} onSelect={handleSelect} />
      )}
      {showingDetail && <EmpresaProfile rut={selectedRut!} periodo={periodo} onBack={handleBack} />}
    </div>
  );
}
