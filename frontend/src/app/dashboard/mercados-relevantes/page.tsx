"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface LbfAno {
  ano: number;
  total_lics: number;
  lics_adj: number;
  tasa_adj_lics: number;
  total_items: number;
  items_adj: number;
  tasa_adj_items: number;
  monto_ofertado: number;
  monto_adjudicado: number;
  pct_ganado_ofertado: number;
}

interface TipoFila {
  ano: number;
  tipo: string;
  total_lics: number;
  lics_adj: number;
  tasa_adj_lics: number;
  monto_ofertado: number;
  monto_adjudicado: number;
  pct_ganado: number;
}

const TIPO_LABEL: Record<string, string> = {
  LR: "LR — Licitación > 2.000 UTM",
  LP: "LP — Licitación 1.000–2.000 UTM",
  LQ: "LQ — Licitación 500–1.000 UTM",
  LE: "LE — Licitación 100–1.000 UTM",
  L1: "L1 — Licitación < 100 UTM",
  CO: "CO — Convenio de Suministro",
};

const fmtN = (n: number) => n.toLocaleString("es-CL");
const fmtM = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const fmtP = (n: number) => `${n.toFixed(1)}%`;

const thBase: React.CSSProperties = {
  padding: "8px 14px", background: "#F8FAFC",
  fontWeight: 700, fontSize: 12, color: "#374151",
  border: "1px solid #E2E8F0", whiteSpace: "nowrap",
};
const thGroup: React.CSSProperties = {
  ...thBase, textAlign: "center", background: "#EFF6FF",
  color: "#1D4ED8", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em",
};
const tdBase: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, color: "#1F2937",
  border: "1px solid #F1F5F9", whiteSpace: "nowrap",
};
const tdNum: React.CSSProperties = { ...tdBase, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdYear: React.CSSProperties = { ...tdBase, fontWeight: 700, background: "#F8FAFC", textAlign: "center" };
const tdTipo: React.CSSProperties = { ...tdBase, fontWeight: 600, fontSize: 12 };
const tdAno: React.CSSProperties = { ...tdBase, fontWeight: 700, color: "#64748B", fontSize: 11, background: "#F8FAFC", textAlign: "center" };
const trSep: React.CSSProperties = { borderTop: "2px solid #CBD5E1" };

export default function MercadosRelevantesPage() {
  const [data, setData] = useState<LbfAno[]>([]);
  const [tipos, setTipos] = useState<TipoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingT, setLoadingT] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorT, setErrorT] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ anos: LbfAno[]; error?: string; detail?: string }>(
      "/api/mercados-relevantes/licitaciones-lbf", { noCache: true }
    ).then(r => {
      if (r.error) setError(`${r.error}\n${r.detail || ""}`);
      else setData(r.anos);
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });

    api.get<{ filas: TipoFila[]; error?: string; detail?: string }>(
      "/api/mercados-relevantes/licitaciones-lbf-tipo", { noCache: true }
    ).then(r => {
      if (r.error) setErrorT(`${r.error}\n${r.detail || ""}`);
      else setTipos(r.filas);
      setLoadingT(false);
    }).catch(e => { setErrorT(String(e)); setLoadingT(false); });
  }, []);

  const ANOS = [2025, 2026];

  return (
    <div style={{ fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
        Mercados Relevantes — Licitaciones
      </h1>
      <p style={{ fontSize: 12, color: "#64748B", marginBottom: 24 }}>
        Fuente: DWLBF.dbo.dw_datos_abiertos_licitaciones &nbsp;·&nbsp;
        Rubros: Equipamiento y Suministros Médicos + Equipamiento para Laboratorios &nbsp;·&nbsp;
        Participación LBF · Año según FechaCierre
      </p>

      {/* Tabla resumen general */}
      {loading && <div style={{ color: "#94A3B8", padding: 20 }}>Cargando...</div>}
      {error && <pre style={{ color: "#EF4444", fontSize: 11, background: "#FEF2F2", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap" }}>{error}</pre>}

      {!loading && !error && data.length > 0 && (
        <table style={{ borderCollapse: "collapse", marginBottom: 36 }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: "center" }}>Año</th>
              <th style={thGroup} colSpan={3}>Montos</th>
              <th style={{ ...thGroup, background: "#F0FDF4", color: "#166534" }} colSpan={3}>Licitaciones</th>
              <th style={{ ...thGroup, background: "#FFF7ED", color: "#9A3412" }} colSpan={3}>Ítems</th>
            </tr>
            <tr>
              <th style={{ ...thBase, textAlign: "center" }}></th>
              <th style={{ ...thBase, textAlign: "right" }}>Monto Ofertado</th>
              <th style={{ ...thBase, textAlign: "right" }}>Monto Adjudicado</th>
              <th style={{ ...thBase, textAlign: "right" }}>% Ganado</th>
              <th style={{ ...thBase, textAlign: "right" }}>Total</th>
              <th style={{ ...thBase, textAlign: "right" }}>Adjudicadas</th>
              <th style={{ ...thBase, textAlign: "right" }}>% Adj.</th>
              <th style={{ ...thBase, textAlign: "right" }}>Total</th>
              <th style={{ ...thBase, textAlign: "right" }}>Adjudicados</th>
              <th style={{ ...thBase, textAlign: "right" }}>% Adj.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.ano} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                <td style={tdYear}>{d.ano}</td>
                <td style={tdNum}>{fmtM(d.monto_ofertado)}</td>
                <td style={tdNum}>{fmtM(d.monto_adjudicado)}</td>
                <td style={tdNum}>{fmtP(d.pct_ganado_ofertado)}</td>
                <td style={tdNum}>{fmtN(d.total_lics)}</td>
                <td style={tdNum}>{fmtN(d.lics_adj)}</td>
                <td style={tdNum}>{fmtP(d.tasa_adj_lics)}</td>
                <td style={tdNum}>{fmtN(d.total_items)}</td>
                <td style={tdNum}>{fmtN(d.items_adj)}</td>
                <td style={tdNum}>{fmtP(d.tasa_adj_items)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tabla desglose por tipo */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
        Desglose por Tipo de Licitación
      </h2>

      {loadingT && <div style={{ color: "#94A3B8", padding: 20 }}>Cargando...</div>}
      {errorT && <pre style={{ color: "#EF4444", fontSize: 11, background: "#FEF2F2", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap" }}>{errorT}</pre>}

      {!loadingT && !errorT && tipos.length > 0 && (
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thBase, minWidth: 260 }}>Tipo</th>
              {ANOS.map(a => (
                <React.Fragment key={a}>
                  <th style={{ ...thGroup, minWidth: 160 }} colSpan={2}>{a}</th>
                  <th style={{ ...thGroup, background: "#F0FDF4", color: "#166534", minWidth: 80 }}>% Gan.</th>
                  <th style={{ ...thGroup, background: "#FFF7ED", color: "#9A3412", minWidth: 80 }}>Lics Adj.</th>
                </React.Fragment>
              ))}
            </tr>
            <tr>
              <th style={thBase}></th>
              {ANOS.map(a => (
                <React.Fragment key={a}>
                  <th style={{ ...thBase, textAlign: "right" }}>Ofertado</th>
                  <th style={{ ...thBase, textAlign: "right" }}>Adjudicado</th>
                  <th style={{ ...thBase, textAlign: "right" }}>%</th>
                  <th style={{ ...thBase, textAlign: "right" }}>Adj / Total</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const tiposUnicos = [...new Set(tipos.map(f => f.tipo))];
              const byAnoTipo = Object.fromEntries(
                tipos.map(f => [`${f.ano}-${f.tipo}`, f])
              ) as Record<string, TipoFila>;

              return tiposUnicos.map((tipo, i) => (
                <tr key={tipo} style={{ background: i % 2 === 1 ? "#FAFBFC" : undefined }}>
                  <td style={tdTipo}>{TIPO_LABEL[tipo] ?? tipo}</td>
                  {ANOS.map(a => {
                    const f = byAnoTipo[`${a}-${tipo}`];
                    return (
                      <React.Fragment key={a}>
                        <td style={tdNum}>{f ? fmtM(f.monto_ofertado) : "—"}</td>
                        <td style={tdNum}>{f ? fmtM(f.monto_adjudicado) : "—"}</td>
                        <td style={tdNum}>{f ? fmtP(f.pct_ganado) : "—"}</td>
                        <td style={tdNum}>{f ? `${fmtN(f.lics_adj)} / ${fmtN(f.total_lics)}` : "—"}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      )}
    </div>
  );
}
