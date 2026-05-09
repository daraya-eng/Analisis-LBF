"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

/* ─── Estilos compartidos ─────────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "16px 20px",
};
const thS: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  fontSize: 12,
  borderBottom: "2px solid #E2E8F0",
  whiteSpace: "nowrap",
  background: "#F8FAFC",
};
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const tdS: React.CSSProperties = {
  padding: "7px 12px",
  color: "#1F2937",
  fontSize: 13,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #F1F5F9",
};
const tdR: React.CSSProperties = {
  ...tdS,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const rowBg = (i: number): React.CSSProperties => ({
  background: i % 2 === 0 ? "white" : "#FAFBFC",
});

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const YEARS = [2026, 2025, 2024, 2023];
const TIPOS = [
  { id: "ALL", label: "Todos (con CM)" },
  { id: "",    label: "Sin CM" },
  { id: "CM",  label: "Convenio Marco" },
  { id: "SE",  label: "SE" },
  { id: "LE",  label: "LE" },
  { id: "LP",  label: "LP" },
  { id: "LQ",  label: "LQ" },
  { id: "LR",  label: "LR" },
  { id: "TD",  label: "TD" },
  { id: "AG",  label: "AG" },
];

/* ─── Formateadores ───────────────────────────────────────────────────────── */
function fmtCLP(n: number): string {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function fmtN(n: number): string {
  return n != null ? n.toLocaleString("es-CL") : "0";
}
function pct(n: number): string {
  return n != null ? `${n.toFixed(1)}%` : "—";
}

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface Lbf {
  ids_participadas: number;
  ids_adjudicadas: number;
  ofertas_realizadas: number;
  ofertas_con_precio: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  efectividad_items: number;
  efectividad_lics: number;
  part_ids: number;
  part_valor: number;
}
interface Mercado {
  ids_total: number;
  items_total: number;
  valor_total: number;
}
interface Comp {
  competidor: string;
  ids_part: number;
  ofertas: number;
  ofertas_adj: number;
  ids_adj: number;
  total_adj: number;
  total_ofertado: number;
  efectividad: number;
  part_valor: number;
}
interface Data {
  ano: number;
  tipo: string;
  lbf: Lbf;
  mercado: Mercado;
  top20: Comp[];
}
interface Cliente {
  organismo: string;
  ids_part: number;
  ids_adj: number;
  ofertas: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  total_no_adj: number;
  pct_adj: number;
  pct_ef: number;
}
interface RegionData {
  region: string;
  ids_part: number;
  ids_adj: number;
  ofertas: number;
  ofertas_adj: number;
  total_adj: number;
  total_participado: number;
  pct_adj: number;
  pct_of: number;
}

/* ─── Componentes auxiliares ─────────────────────────────────────────────── */
function PartBar({ pct: p }: { pct: number }) {
  const color = p >= 10 ? "#2563EB" : p >= 3 ? "#60A5FA" : "#BFDBFE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 80,
          height: 6,
          background: "#E2E8F0",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(p, 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "#374151",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p.toFixed(1)}%
      </span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 155 }}>
      <div
        style={{
          fontSize: 11,
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: color ?? "#0F172A",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}
      >
        Cargando...
      </td>
    </tr>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg?: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ ...tdS, textAlign: "center", color: "#94A3B8", padding: "20px 12px" }}
      >
        {msg ?? "Sin datos"}
      </td>
    </tr>
  );
}

/* ─── Sub-tab Competencia ────────────────────────────────────────────────── */
function TabCompetencia({ data }: { data: Data }) {
  const lbf = data.lbf;

  // Porcentajes calculados en frontend
  const lbfPct =
    lbf.total_participado > 0
      ? (lbf.total_adj / lbf.total_participado) * 100
      : 0;
  const lbfEf =
    lbf.ofertas_realizadas > 0
      ? (lbf.ofertas_adj / lbf.ofertas_realizadas) * 100
      : 0;

  return (
    <>
      {/* KPIs superiores */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard
          title="Licitaciones participadas"
          value={fmtN(lbf.ids_participadas)}
          sub={`de ${fmtN(data.mercado.ids_total)} en el mercado`}
          color="#2563EB"
        />
        <KpiCard
          title="Licitaciones adjudicadas"
          value={fmtN(lbf.ids_adjudicadas)}
          sub={`efectividad: ${pct(lbf.efectividad_lics)}`}
          color="#2563EB"
        />
        <KpiCard
          title="% Participación (valor)"
          value={pct(lbf.part_valor)}
          sub="LBF adj / mercado adj"
          color="#7C3AED"
        />
        <KpiCard
          title="% Efectividad (ítems)"
          value={pct(lbfEf)}
          sub="ítems adj / ítems ofertados"
          color="#059669"
        />
        <KpiCard
          title="Valor adjudicado LBF"
          value={fmtCLP(lbf.total_adj)}
          sub={`mercado: ${fmtCLP(data.mercado.valor_total)}`}
          color="#0F172A"
        />
      </div>

      {/* Tabla competidores */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Competidores
          </span>
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
            top 20 en licitaciones donde LBF participó · {data.ano}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 32 }}>#</th>
                <th style={thS}>Proveedor</th>
                <th style={thR}>% S.Part.</th>
                <th style={thR}>% Efect.</th>
                <th style={thR}>Total Participado</th>
                <th style={thR}>Total Adjudicado</th>
                <th style={thR}>Ofertas Real.</th>
                <th style={thR}>Ofertas Adj.</th>
                <th style={thR}>Ids Part.</th>
                <th style={thR}>Ids Adj.</th>
              </tr>
            </thead>
            <tbody>
              {/* Fila LBF destacada — siempre primera */}
              <tr
                style={{
                  background: "#EFF6FF",
                  borderBottom: "2px solid #BFDBFE",
                }}
              >
                <td style={{ ...tdS, color: "#2563EB", fontWeight: 700 }}>★</td>
                <td style={{ ...tdS, fontWeight: 700, color: "#2563EB" }}>
                  LBF (tú)
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  <PartBar pct={lbfPct} />
                </td>
                <td style={{ ...tdR, fontWeight: 700, color: "#059669" }}>
                  {pct(lbfEf)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtCLP(lbf.total_participado)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtCLP(lbf.total_adj)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ofertas_realizadas)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ofertas_adj)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ids_participadas)}
                </td>
                <td style={{ ...tdR, fontWeight: 700 }}>
                  {fmtN(lbf.ids_adjudicadas)}
                </td>
              </tr>

              {data.top20.map((c, i) => {
                const cPct =
                  c.total_ofertado > 0
                    ? (c.total_adj / c.total_ofertado) * 100
                    : 0;
                const cEf =
                  c.ofertas > 0 ? (c.ofertas_adj / c.ofertas) * 100 : 0;
                return (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={tdS}>{c.competidor}</td>
                    <td style={tdR}>
                      <PartBar pct={cPct} />
                    </td>
                    <td
                      style={{
                        ...tdR,
                        color:
                          cEf >= 20
                            ? "#059669"
                            : cEf >= 10
                            ? "#D97706"
                            : "#374151",
                      }}
                    >
                      {pct(cEf)}
                    </td>
                    <td style={tdR}>{fmtCLP(c.total_ofertado)}</td>
                    <td style={tdR}>{fmtCLP(c.total_adj)}</td>
                    <td style={tdR}>{fmtN(c.ofertas)}</td>
                    <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ─── Sub-tab Clientes ───────────────────────────────────────────────────── */
function TabClientes({
  clientes,
  loading,
  error,
}: {
  clientes: Cliente[] | null;
  loading: boolean;
  error: string | null;
}) {
  // Totales para barra de referencia
  const maxAdj = clientes
    ? Math.max(...clientes.map((c) => c.total_adj), 1)
    : 1;

  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
          Top 30 Organismos
        </span>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
          por valor adjudicado a LBF
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: 32 }}>#</th>
              <th style={thS}>Organismo</th>
              <th style={thR}>% S.Part.</th>
              <th style={thR}>% Efect.</th>
              <th style={thR}>Total Part.</th>
              <th style={thR}>Total Adj.</th>
              <th style={thR}>No Adj. $</th>
              <th style={thR}>Ofertas Real.</th>
              <th style={thR}>Ofertas Adj.</th>
              <th style={thR}>Ids Part.</th>
              <th style={thR}>Ids Adj.</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={11} />}
            {!loading && error && (
              <tr>
                <td
                  colSpan={11}
                  style={{ ...tdS, color: "#EF4444", textAlign: "center" }}
                >
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && clientes && clientes.length === 0 && (
              <EmptyRow cols={11} msg="Sin datos para los filtros seleccionados" />
            )}
            {!loading &&
              !error &&
              clientes &&
              clientes.map((c, i) => {
                const barW = maxAdj > 0 ? (c.total_adj / maxAdj) * 100 : 0;
                return (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.organismo}
                    </td>
                    <td style={tdR}>
                      <PartBar pct={c.pct_adj} />
                    </td>
                    <td
                      style={{
                        ...tdR,
                        color:
                          c.pct_ef >= 20
                            ? "#059669"
                            : c.pct_ef >= 10
                            ? "#D97706"
                            : "#374151",
                      }}
                    >
                      {pct(c.pct_ef)}
                    </td>
                    <td style={tdR}>{fmtCLP(c.total_participado)}</td>
                    <td style={tdR}>
                      {/* mini bar inline */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <div
                          style={{
                            width: 60,
                            height: 4,
                            background: "#E2E8F0",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${barW}%`,
                              height: "100%",
                              background: "#2563EB",
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtCLP(c.total_adj)}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdR, color: "#EF4444" }}>
                      {fmtCLP(c.total_no_adj)}
                    </td>
                    <td style={tdR}>{fmtN(c.ofertas)}</td>
                    <td style={tdR}>{fmtN(c.ofertas_adj)}</td>
                    <td style={tdR}>{fmtN(c.ids_part)}</td>
                    <td style={tdR}>{fmtN(c.ids_adj)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Sub-tab Región ─────────────────────────────────────────────────────── */
function TabRegion({
  regiones,
  loading,
  error,
}: {
  regiones: RegionData[] | null;
  loading: boolean;
  error: string | null;
}) {
  const maxAdj = regiones
    ? Math.max(...regiones.map((r) => r.total_adj), 1)
    : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Gráfico de barras horizontales */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Adjudicado por Región
          </span>
        </div>

        {loading && (
          <div style={{ color: "#94A3B8", fontSize: 13, padding: "12px 0" }}>
            Cargando...
          </div>
        )}
        {!loading && error && (
          <div style={{ color: "#EF4444", fontSize: 13 }}>{error}</div>
        )}
        {!loading && !error && regiones && regiones.length === 0 && (
          <div style={{ color: "#94A3B8", fontSize: 13 }}>Sin datos</div>
        )}
        {!loading &&
          !error &&
          regiones &&
          regiones.map((r, i) => {
            const barW = maxAdj > 0 ? (r.total_adj / maxAdj) * 100 : 0;
            const color =
              i === 0
                ? "#1D4ED8"
                : i < 3
                ? "#2563EB"
                : i < 6
                ? "#3B82F6"
                : "#93C5FD";
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      fontWeight: i === 0 ? 700 : 500,
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.region}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      fontVariantNumeric: "tabular-nums",
                      marginLeft: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtCLP(r.total_adj)}{" "}
                    <span style={{ color: "#94A3B8" }}>({pct(r.pct_adj)} s.part.)</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 20,
                    background: "#F1F5F9",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${barW}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${color}, ${color}CC)`,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {/* Tabla resumen */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
            Detalle por Región
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 32 }}>#</th>
                <th style={thS}>Región</th>
                <th style={thR}>Ids Part.</th>
                <th style={thR}>Ids Adj.</th>
                <th style={thR}>Total Part.</th>
                <th style={thR}>Total Adj.</th>
                <th style={thR}>% S.Part.</th>
                <th style={thR}>% Efect. Items</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow cols={8} />}
              {!loading && error && (
                <tr>
                  <td
                    colSpan={8}
                    style={{ ...tdS, color: "#EF4444", textAlign: "center" }}
                  >
                    {error}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                regiones &&
                regiones.map((r, i) => (
                  <tr key={i} style={rowBg(i)}>
                    <td style={{ ...tdS, color: "#94A3B8", fontWeight: 600 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...tdS, fontWeight: i === 0 ? 700 : 400 }}>
                      {r.region}
                    </td>
                    <td style={tdR}>{fmtN(r.ids_part)}</td>
                    <td style={tdR}>{fmtN(r.ids_adj)}</td>
                    <td style={tdR}>{fmtCLP(r.total_participado)}</td>
                    <td
                      style={{
                        ...tdR,
                        fontWeight: i === 0 ? 700 : 400,
                        color: i === 0 ? "#2563EB" : "#1F2937",
                      }}
                    >
                      {fmtCLP(r.total_adj)}
                    </td>
                    <td style={tdR}>{pct(r.pct_adj)}</td>
                    <td
                      style={{
                        ...tdR,
                        color:
                          r.pct_of >= 20
                            ? "#059669"
                            : r.pct_of >= 10
                            ? "#D97706"
                            : "#374151",
                      }}
                    >
                      {pct(r.pct_of)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Página principal ───────────────────────────────────────────────────── */
type TabId = "competencia" | "clientes" | "region";

export default function MercadoPublicoPage() {
  const [ano, setAno]   = useState(2026);
  const [tipo, setTipo] = useState("");
  const [tab, setTab]   = useState<TabId>("competencia");

  // Datos por tab
  const [data, setData]         = useState<Data | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [regiones, setRegiones] = useState<RegionData[] | null>(null);

  // Estados de carga independientes
  const [loadingComp, setLoadingComp] = useState(false);
  const [loadingCli,  setLoadingCli]  = useState(false);
  const [loadingReg,  setLoadingReg]  = useState(false);

  const [errorComp, setErrorComp] = useState<string | null>(null);
  const [errorCli,  setErrorCli]  = useState<string | null>(null);
  const [errorReg,  setErrorReg]  = useState<string | null>(null);

  // Registrar qué tabs ya se cargaron con los filtros actuales
  const [loadedComp, setLoadedComp] = useState(false);
  const [loadedCli,  setLoadedCli]  = useState(false);
  const [loadedReg,  setLoadedReg]  = useState(false);

  // Reset al cambiar filtros
  useEffect(() => {
    setData(null);
    setClientes(null);
    setRegiones(null);
    setLoadedComp(false);
    setLoadedCli(false);
    setLoadedReg(false);
    setErrorComp(null);
    setErrorCli(null);
    setErrorReg(null);
  }, [ano, tipo]);

  // Carga tab Competencia
  const loadComp = useCallback(async () => {
    if (loadedComp) return;
    setLoadingComp(true);
    setErrorComp(null);
    try {
      const params = new URLSearchParams({ ano: String(ano), tipo });
      const res = await api.get(`/api/mercado-publico/participacion?${params}`);
      setData(res);
      setLoadedComp(true);
    } catch (e: unknown) {
      setErrorComp(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoadingComp(false);
    }
  }, [ano, tipo, loadedComp]);

  // Carga tab Clientes (lazy)
  const loadCli = useCallback(async () => {
    if (loadedCli) return;
    setLoadingCli(true);
    setErrorCli(null);
    try {
      const params = new URLSearchParams({ ano: String(ano), tipo });
      const res = await api.get(`/api/mercado-publico/clientes?${params}`);
      setClientes(res);
      setLoadedCli(true);
    } catch (e: unknown) {
      setErrorCli(e instanceof Error ? e.message : "Error al cargar clientes");
    } finally {
      setLoadingCli(false);
    }
  }, [ano, tipo, loadedCli]);

  // Carga tab Región (lazy)
  const loadReg = useCallback(async () => {
    if (loadedReg) return;
    setLoadingReg(true);
    setErrorReg(null);
    try {
      const params = new URLSearchParams({ ano: String(ano), tipo });
      const res = await api.get(`/api/mercado-publico/region?${params}`);
      setRegiones(res);
      setLoadedReg(true);
    } catch (e: unknown) {
      setErrorReg(e instanceof Error ? e.message : "Error al cargar regiones");
    } finally {
      setLoadingReg(false);
    }
  }, [ano, tipo, loadedReg]);

  // Disparar carga según tab activo
  useEffect(() => {
    if (tab === "competencia") loadComp();
    else if (tab === "clientes") loadCli();
    else if (tab === "region") loadReg();
  }, [tab, loadComp, loadCli, loadReg]);

  // Siempre cargar competencia primero al montar o cambiar filtros
  useEffect(() => {
    loadComp();
  }, [loadComp]);

  const loading = tab === "competencia" ? loadingComp
    : tab === "clientes" ? loadingCli
    : loadingReg;

  return (
    <div
      style={{ padding: "24px 28px", background: "#F1F5F9", minHeight: "100vh" }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0 }}>
          Mercado Público
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          Participación LBF en insumos médicos (equipamiento)
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Año */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}
          >
            AÑO
          </span>
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setAno(y)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: ano === y ? "#2563EB" : "#CBD5E1",
                background: ano === y ? "#2563EB" : "white",
                color: ano === y ? "white" : "#374151",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Tipo */}
        <div
          style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
        >
          <span
            style={{ fontSize: 12, color: "#64748B", fontWeight: 600, marginRight: 2 }}
          >
            TIPO
          </span>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: tipo === t.id ? "#7C3AED" : "#CBD5E1",
                background: tipo === t.id ? "#7C3AED" : "white",
                color: tipo === t.id ? "white" : "#374151",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <span style={{ fontSize: 12, color: "#94A3B8" }}>Cargando...</span>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          borderBottom: "2px solid #E2E8F0",
        }}
      >
        {(
          [
            { id: "competencia", label: "Competencia" },
            { id: "clientes",    label: "Clientes" },
            { id: "region",      label: "Región" },
          ] as { id: TabId; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 22px",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent",
              background: "transparent",
              color: tab === t.id ? "#2563EB" : "#64748B",
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              marginBottom: -2,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error Competencia */}
      {tab === "competencia" && errorComp && (
        <div style={{ ...card, color: "#EF4444", marginBottom: 16 }}>
          Error: {errorComp}
        </div>
      )}

      {/* Contenido del tab activo */}
      {tab === "competencia" && (
        <>
          {loadingComp && !data && (
            <div style={{ ...card, color: "#94A3B8", textAlign: "center", padding: 32 }}>
              Cargando datos de competencia...
            </div>
          )}
          {data && <TabCompetencia data={data} />}
        </>
      )}

      {tab === "clientes" && (
        <TabClientes
          clientes={clientes}
          loading={loadingCli}
          error={errorCli}
        />
      )}

      {tab === "region" && (
        <TabRegion
          regiones={regiones}
          loading={loadingReg}
          error={errorReg}
        />
      )}
    </div>
  );
}
