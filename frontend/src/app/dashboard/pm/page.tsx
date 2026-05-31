"use client";

import { useEffect, useState, useCallback } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmt, fmtAbs } from "@/lib/format";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */
interface PMFiltros { zonas: string[]; familias: string[]; categorias: string[]; }

interface PMKpis {
  venta_mes: number; ppto_mes: number; mg_mes: number; ppto_mg_mes: number;
  venta_trim: number; ppto_trim: number; mg_trim: number; ppto_mg_trim: number;
  venta_ytd: number; ppto_ytd: number; mg_ytd: number; ppto_mg_ytd: number;
  venta_mes_25: number; venta_trim_25: number; venta_ytd_25: number;
  dias_trans: number; dias_rest: number; dias_total: number;
  pct_dias: number; mes: number; ano: number;
}

interface Top5Item { familia: string; venta: number; }

interface PMCategoria {
  categoria: string; venta_mes: number; venta_ytd: number; venta_ant: number;
  ppto_mes: number; ppto_ytd: number; ppto_anual: number;
  cump_ppto: number; cump_sin_gf: number; cump_ytd: number;
  var_ant: number; pct_dias: number;
  contrib: number; margen: number; ppto_margen: number;
  top5_clases: Top5Item[];
}

interface DrillItem {
  codigo: string; descripcion: string;
  venta_mes: number; vta_prom_6m: number; q_stock: number; margen: number;
}

interface PMData { kpis: PMKpis; categorias: PMCategoria[]; zona: string; }

/* ─── Brand colors ───────────────────────────────────────────────────── */
const LBF_RED  = "#E81C2E";
const LBF_BLUE = "#1A4A6B";

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

const MESES: Record<number, string> = {
  1:"Enero",2:"Febrero",3:"Marzo",4:"Abril",5:"Mayo",6:"Junio",
  7:"Julio",8:"Agosto",9:"Septiembre",10:"Octubre",11:"Noviembre",12:"Diciembre",
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function pctColor(pct: number, ref = 100): string {
  if (pct >= ref) return "#10B981";
  if (pct >= ref * 0.8) return "#F59E0B";
  return "#EF4444";
}
function varColor(v: number) { return v >= 0 ? "#10B981" : "#EF4444"; }
function mgColor(v: number)  { return v >= 40 ? "#10B981" : v >= 30 ? "#F59E0B" : "#EF4444"; }

/* ─── KPI Period Card ────────────────────────────────────────────────── */
function PeriodCard({
  label, venta, ppto, margen, pptoMg, venta25, pctDias, isMes,
}: {
  label: string; venta: number; ppto: number; margen: number; pptoMg: number;
  venta25: number; pctDias: number; isMes?: boolean;
}) {
  const cumpl   = ppto > 0 ? (venta / ppto) * 100 : 0;
  const vs25    = venta25 > 0 ? ((venta / venta25) - 1) * 100 : null;
  const barPct  = Math.min(cumpl, 140);
  const cc      = pctColor(cumpl, isMes ? pctDias : 100);
  const timeMrk = isMes ? pctDias : null;
  const gap     = venta - ppto;

  return (
    <div style={{
      background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      padding: "16px 20px", flex: 1, minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <span style={{
          fontSize: 14, fontWeight: 800, color: cc,
          background: cc + "18", padding: "3px 10px", borderRadius: 20,
        }}>{cumpl.toFixed(1)}%</span>
      </div>

      {/* Venta grande */}
      <div style={{ fontSize: 32, fontWeight: 900, color: LBF_BLUE, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: 6 }}>
        {fmtAbs(venta)}
      </div>
      <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
        Meta: <span style={{ fontWeight: 700, color: "#64748B" }}>{fmtAbs(ppto)}</span>
        &nbsp;·&nbsp;Gap: <span style={{ fontWeight: 700, color: gap >= 0 ? "#10B981" : "#EF4444" }}>
          {gap >= 0 ? "+" : ""}{fmtAbs(gap)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", height: 8, background: "#F1F5F9", borderRadius: 4, marginBottom: 8, overflow: "visible" }}>
        <div style={{ height: "100%", width: `${Math.min(barPct / 140 * 100, 100)}%`, background: cc, borderRadius: 4, transition: "width 0.5s ease" }} />
        {timeMrk != null && (
          <div style={{ position: "absolute", top: -3, bottom: -3, left: `${Math.min(timeMrk / 140, 1) * 100}%`, width: 2, background: "#94A3B8", borderRadius: 2 }} />
        )}
        {/* Labels over bar */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>{fmtAbs(venta)}</span>
          <span style={{ fontSize: 10, color: "#94A3B8" }}>meta {fmtAbs(ppto)}</span>
        </div>
      </div>

      <div style={{ marginTop: 22, marginBottom: 8 }}>
        {timeMrk != null && (
          <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "right" }}>
            {timeMrk.toFixed(1)}% del mes transcurrido
          </div>
        )}
      </div>

      {/* Margen + vs25 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#F8FAFC", borderRadius: 6, padding: "5px 12px" }}>
          <span style={{ fontSize: 11, color: "#64748B" }}>Margen</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: mgColor(margen) }}>{margen.toFixed(1)}%</span>
          {pptoMg > 0 && <span style={{ fontSize: 11, color: "#94A3B8" }}>/ {pptoMg.toFixed(1)}%</span>}
        </div>
        {vs25 !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F8FAFC", borderRadius: 6, padding: "5px 12px" }}>
            {vs25 >= 0
              ? <TrendingUp size={13} color="#10B981" />
              : <TrendingDown size={13} color="#EF4444" />}
            <span style={{ fontSize: 15, fontWeight: 700, color: varColor(vs25) }}>
              {vs25 >= 0 ? "+" : ""}{vs25.toFixed(1)}%
            </span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>vs 2025</span>
          </div>
        )}
      </div>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PLAT_H  = [100, 70, 50]; // gold, silver, bronze platform px


/* ─── Podium ─────────────────────────────────────────────────────────── */
function Podium({ cats, mode }: { cats: PMCategoria[]; mode: "mes" | "ytd" }) {
  if (cats.length < 2) return null;
  const getCump  = (c: PMCategoria) => mode === "mes" ? c.cump_ppto : c.cump_ytd;
  const getVenta = (c: PMCategoria) => mode === "mes" ? c.venta_mes : c.venta_ytd;
  const getPpto  = (c: PMCategoria) => mode === "mes" ? c.ppto_mes  : c.ppto_ytd;

  const sorted  = [...cats].sort((a, b) => getCump(b) - getCump(a));
  const order   = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  const rankIdx = [1, 0, 2];
  const maxPlat = PLAT_H[0]; // 100px — altura del backdrop

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 16, width: "100%" }}>

      {order.map((cat, pos) => {
        const rank   = rankIdx[pos];
        const color  = CAT_COLORS[cat.categoria] ?? LBF_BLUE;
        const platH  = PLAT_H[rank];
        const cump   = getCump(cat);
        const cc     = pctColor(cump, 100);
        const isGold = rank === 0;

        return (
          <div key={cat.categoria} style={{
            position: "relative", zIndex: 1,
            display: "flex", flexDirection: "column", alignItems: "center",
            flex: 1, minWidth: 0,
          }}>
            {/* Info sobre la plataforma */}
            <div style={{ textAlign: "center", marginBottom: 8, width: "100%" }}>
              <div style={{ fontSize: isGold ? 36 : 28, lineHeight: 1 }}>{MEDALS[rank]}</div>
              <div style={{ fontSize: isGold ? 18 : 15, fontWeight: 900, color, marginTop: 4 }}>
                {cat.categoria}
              </div>
              <div style={{
                fontSize: isGold ? 20 : 16, fontWeight: 900, color: cc,
                background: cc + "18", borderRadius: 12, padding: "2px 14px", marginTop: 4,
                display: "inline-block",
              }}>
                {cump.toFixed(1)}%
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>
                {fmtAbs(getVenta(cat))}
                <span style={{ color: "#CBD5E1", margin: "0 4px" }}>·</span>
                meta {fmtAbs(getPpto(cat))}
              </div>
            </div>

            {/* Plataforma del podio */}
            <div style={{
              width: "100%", height: platH,
              background: `linear-gradient(180deg, ${color}ee, ${color}99)`,
              borderRadius: "8px 8px 0 0",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isGold ? `0 -6px 24px ${color}55` : `0 -2px 8px ${color}33`,
              border: `1px solid ${color}66`, borderBottom: "none",
              backdropFilter: "blur(2px)",
            }}>
              <span style={{ fontSize: isGold ? 24 : 20, fontWeight: 900, color: "white", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                {rank + 1}°
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Category Card ──────────────────────────────────────────────────── */
function CatCard({ c, pctDias, medal, activeClase, onClaseClick }: {
  c: PMCategoria; pctDias: number; medal?: string;
  activeClase?: string;
  onClaseClick?: (familia: string) => void;
}) {
  const color    = CAT_COLORS[c.categoria] ?? LBF_BLUE;
  const cumpl    = c.cump_ppto;
  const cc       = pctColor(cumpl, pctDias);
  const barPct   = Math.min(cumpl / 140 * 100, 100);
  const top5     = c.top5_clases ?? [];
  const totalTop = top5.reduce((s, t) => s + t.venta, 0);

  return (
    <div style={{
      background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
      borderTop: `3px solid ${color}`, padding: "16px 18px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {medal && <span style={{ fontSize: 20, lineHeight: 1 }}>{medal}</span>}
          <span style={{ fontSize: 16, fontWeight: 800, color }}>{c.categoria}</span>
        </div>
        <span style={{
          fontSize: 14, fontWeight: 800, color: cc,
          background: cc + "18", padding: "3px 10px", borderRadius: 20,
        }}>{cumpl.toFixed(1)}%</span>
      </div>

      {/* Venta */}
      <div style={{ fontSize: 28, fontWeight: 900, color: LBF_BLUE, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: 3 }}>
        {fmtAbs(c.venta_mes)}
      </div>
      <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
        PPTO: <span style={{ fontWeight: 700, color: "#64748B" }}>{fmtAbs(c.ppto_mes)}</span>
        &nbsp;·&nbsp;Gap: <span style={{ fontWeight: 700, color: c.venta_mes >= c.ppto_mes ? "#10B981" : "#EF4444" }}>
          {c.venta_mes >= c.ppto_mes ? "+" : ""}{fmtAbs(c.venta_mes - c.ppto_mes)}
        </span>
      </div>

      {/* Progress bar with % labels */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 3, opacity: 0.85 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>{fmtAbs(c.venta_mes)}</span>
          <span style={{ fontSize: 10, color: "#94A3B8" }}>meta {fmtAbs(c.ppto_mes)}</span>
        </div>
      </div>

      {/* Pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <Pill label="Margen" val={`${c.margen.toFixed(1)}%`} color={mgColor(c.margen)} />
        {c.ppto_margen > 0 && <Pill label="Mg meta" val={`${c.ppto_margen.toFixed(1)}%`} color="#64748B" />}
      </div>

      {/* Top 5 clases */}
      {top5.length > 0 && (
        <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Top clases
          </div>
          {top5.map((item, i) => {
            const pct      = totalTop > 0 ? item.venta / totalTop : 0;
            const isActive = activeClase === item.familia;
            return (
              <div
                key={i}
                onClick={() => onClaseClick?.(item.familia)}
                style={{
                  marginBottom: 5, borderRadius: 6, padding: "3px 4px",
                  cursor: onClaseClick ? "pointer" : "default",
                  background: isActive ? color + "14" : "transparent",
                  outline: isActive ? `1px solid ${color}40` : "none",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? color : "#CBD5E1", width: 14, flexShrink: 0, textAlign: "right" }}>{i + 1}</span>
                    <span style={{ fontSize: 11, color: isActive ? color : "#475569", fontWeight: isActive ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.familia}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>
                    {fmtAbs(item.venta)}
                  </span>
                </div>
                <div style={{ height: 3, background: "#F1F5F9", borderRadius: 2, marginLeft: 19 }}>
                  <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 2, opacity: isActive ? 0.9 : 0.5 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Pill({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: color + "14", borderRadius: 5, padding: "4px 10px" }}>
      <span style={{ fontSize: 10, color: "#64748B" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{val}</span>
    </div>
  );
}

/* ─── Table styles ───────────────────────────────────────────────────── */
const TH: React.CSSProperties  = { background: LBF_BLUE, color: "white", padding: "7px 10px", fontSize: 10, fontWeight: 700, textAlign: "left",  textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const THR: React.CSSProperties = { ...TH, textAlign: "right" };
const TD: React.CSSProperties  = { padding: "6px 10px", fontSize: 11, color: "#1E293B", borderBottom: "1px solid #F1F5F9" };
const TDR: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function PlanDeMesPage() {
  const [filtros,          setFiltros]         = useState<PMFiltros | null>(null);
  const [selectedZona,  setSelectedZona]  = useState("");
  const [selectedCat,   setSelectedCat]   = useState<string | null>(null);
  const [podiumMode,     setPodiumMode]     = useState<"mes" | "ytd">("mes");
  const [selectedClase,  setSelectedClase]  = useState<{ categoria: string; familia: string } | null>(null);
  const [drillData,      setDrillData]      = useState<DrillItem[]>([]);
  const [drillLoading,   setDrillLoading]   = useState(false);
  const [drillError,     setDrillError]     = useState<string | null>(null);
  const [data,           setData]           = useState<PMData | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(true);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    api.get<PMFiltros>("/api/pm/filtros")
      .then((f) => setFiltros(f))
      .catch(() => setFiltros({ zonas: [], familias: [], categorias: ["SQ","MAH","EQM","EVA"] }))
      .finally(() => setLoadingFiltros(false));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedZona) params.set("zona",      selectedZona);
      if (selectedCat)  params.set("categorias", selectedCat);
      const res = await api.get<PMData>(`/api/pm/resumen?${params.toString()}`, { noCache: true });
      setData(res);
      setSelectedClase(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [selectedZona, selectedCat]);

  useEffect(() => { if (!loadingFiltros) loadData(); }, [loadingFiltros, loadData]);

  const loadDrillData = useCallback(async (categoria: string, familia: string) => {
    setDrillLoading(true);
    setDrillError(null);
    try {
      const params = new URLSearchParams({ categoria, familia });
      if (selectedZona) params.set("zona", selectedZona);
      const res = await api.get<{ productos: DrillItem[] }>(`/api/pm/detalle_clase?${params.toString()}`);
      setDrillData(res.productos ?? []);
    } catch (e: unknown) {
      setDrillError(e instanceof Error ? e.message : "Error al cargar detalle");
      setDrillData([]);
    } finally {
      setDrillLoading(false);
    }
  }, [selectedZona]);

  const kpis     = data?.kpis;
  const mesLabel = kpis ? `${MESES[kpis.mes]} ${kpis.ano}` : "";
  const pctDias  = kpis?.pct_dias ?? 0;

  const cats       = filtros?.categorias ?? ["SQ","MAH","EQM","EVA"];
  const zonaLabel  = (z: string) => { const p = z.split("-"); return p.length > 1 ? p.slice(1).join("-").trim() : z; };
  const activeCats = data?.categorias?.filter(c => c.venta_mes > 0 || c.ppto_mes > 0) ?? [];

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: activeCats.length >= 2 ? 8 : 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: LBF_BLUE, margin: 0 }}>Plan de Mes</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>{mesLabel || "—"}</p>
        </div>
        <button
          onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); loadData(); }}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8, border: `1px solid ${LBF_BLUE}`,
            background: loading ? "#F1F5F9" : LBF_BLUE, fontSize: 12, fontWeight: 700,
            color: loading ? "#94A3B8" : "white", cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 0.9s linear infinite" : "none" }} />
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {/* ── Podium ancho completo ──────────────────────────────────── */}
      {activeCats.length >= 2 && (
        <div style={{
          background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
          padding: "16px 24px 0", marginBottom: 12,
        }}>
          {/* Toggle Mes / YTD */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            {(["mes", "ytd"] as const).map(m => (
              <button key={m} onClick={() => setPodiumMode(m)} style={{
                padding: "4px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${podiumMode === m ? LBF_BLUE : "#E2E8F0"}`,
                background: podiumMode === m ? LBF_BLUE : "white",
                color: podiumMode === m ? "white" : "#64748B",
                borderRadius: m === "mes" ? "6px 0 0 6px" : "0 6px 6px 0",
              }}>
                {m === "mes" ? "Mes" : "YTD"}
              </button>
            ))}
          </div>
          <Podium cats={activeCats} mode={podiumMode} />
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────── */}
      <div style={{
        background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
        padding: "10px 16px", display: "flex", alignItems: "center", gap: 20,
        flexWrap: "wrap", marginBottom: 16,
      }}>
        <FilterSelect label="Zona" value={selectedZona} onChange={setSelectedZona}>
          <option value="">Todas las zonas</option>
          {(filtros?.zonas ?? []).map(z => <option key={z} value={z}>{zonaLabel(z)}</option>)}
        </FilterSelect>

        <div style={{ width: 1, height: 24, background: "#E2E8F0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Categoría</span>
          <div style={{ display: "flex", gap: 4 }}>
            <CatChip label="Todas" active={selectedCat === null} color={LBF_BLUE} onClick={() => setSelectedCat(null)} />
            {cats.map(cat => (
              <CatChip key={cat} label={cat} active={selectedCat === cat}
                color={CAT_COLORS[cat] ?? "#3B82F6"}
                onClick={() => setSelectedCat(selectedCat === cat ? null : cat)} />
            ))}
          </div>
        </div>

      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#991B1B", fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Avance del mes (barra con números) ────────────────────── */}
      {kpis && (
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: LBF_BLUE }}>
              Avance del mes — {mesLabel}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(pctDias, 100) }}>
              {pctDias.toFixed(1)}%
            </span>
          </div>

          {/* Números de días */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: LBF_RED, fontVariantNumeric: "tabular-nums" }}>
                {kpis.dias_trans}
              </div>
              <div style={{ fontSize: 11, color: "#64748B" }}>días hábiles transcurridos</div>
            </div>
            <div style={{ textAlign: "right", lineHeight: 1.2 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>
                {kpis.dias_rest}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>restantes de {kpis.dias_total}</div>
            </div>
          </div>

          {/* Barra */}
          <div style={{ position: "relative", height: 10, background: "#F1F5F9", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(pctDias, 100)}%`,
              background: `linear-gradient(90deg, ${LBF_RED}, #f87171)`,
              borderRadius: 5,
              transition: "width 0.5s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>Inicio</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>Fin del mes</span>
          </div>
        </div>
      )}

      {/* ── KPI Period Cards (3 columnas) ─────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8", fontSize: 14 }}>Cargando datos...</div>
      ) : kpis ? (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <PeriodCard
              label="Mes actual"
              venta={kpis.venta_mes} ppto={kpis.ppto_mes}
              margen={kpis.mg_mes}   pptoMg={kpis.ppto_mg_mes}
              venta25={kpis.venta_mes_25} pctDias={pctDias} isMes
            />
            <PeriodCard
              label="Trimestre"
              venta={kpis.venta_trim} ppto={kpis.ppto_trim}
              margen={kpis.mg_trim}   pptoMg={kpis.ppto_mg_trim}
              venta25={kpis.venta_trim_25} pctDias={pctDias}
            />
            <PeriodCard
              label="YTD (acumulado)"
              venta={kpis.venta_ytd} ppto={kpis.ppto_ytd}
              margen={kpis.mg_ytd}   pptoMg={kpis.ppto_mg_ytd}
              venta25={kpis.venta_ytd_25} pctDias={pctDias}
            />
          </div>

          {/* ── Category Cards — grid 2×2 ─────────────────────────── */}
          {activeCats.length > 0 && (() => {
            const ranked = [...activeCats].sort((a, b) => b.cump_ppto - a.cump_ppto);
            const medalMap = Object.fromEntries(
              ranked.slice(0, 3).map((c, i) => [c.categoria, MEDALS[i]])
            );
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {activeCats.map(c => (
                  <CatCard
                    key={c.categoria} c={c} pctDias={pctDias} medal={medalMap[c.categoria]}
                    activeClase={selectedClase?.categoria === c.categoria ? selectedClase.familia : undefined}
                    onClaseClick={(familia) => {
                      const isSame = selectedClase?.categoria === c.categoria && selectedClase.familia === familia;
                      if (isSame) {
                        setSelectedClase(null);
                        setDrillData([]);
                        setDrillError(null);
                      } else {
                        setSelectedClase({ categoria: c.categoria, familia });
                        loadDrillData(c.categoria, familia);
                      }
                    }}
                  />
                ))}
              </div>
            );
          })()}

          {/* ── Drill-down panel ──────────────────────────────────── */}
          {selectedClase && (() => {
            const color = CAT_COLORS[selectedClase.categoria] ?? LBF_BLUE;
            const prods = drillData;
            return (
              <div style={{ background: "white", borderRadius: 10, border: `1px solid ${color}50`, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${color}20`, background: color + "08" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 16, background: color, borderRadius: 2 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: LBF_BLUE }}>
                      {selectedClase.categoria}
                      <span style={{ color: "#94A3B8", fontWeight: 400, margin: "0 6px" }}>›</span>
                      {selectedClase.familia}
                    </span>
                    {drillLoading
                      ? <span style={{ fontSize: 11, color: "#94A3B8" }}>Cargando...</span>
                      : <span style={{ fontSize: 11, color: "#94A3B8" }}>{prods.length} productos</span>
                    }
                  </div>
                  <button
                    onClick={() => { setSelectedClase(null); setDrillData([]); setDrillError(null); }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", fontSize: 20, padding: "0 4px", lineHeight: 1, borderRadius: 4 }}
                  >×</button>
                </div>
                {drillLoading && (
                  <div style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>
                    Cargando productos...
                  </div>
                )}
                {drillError && (
                  <div style={{ padding: "12px 16px", color: "#991B1B", fontSize: 12, background: "#FEF2F2" }}>
                    {drillError}
                  </div>
                )}
                {!drillLoading && <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ ...TH, width: 90 }}>Código</th>
                        <th style={TH}>Descripción</th>
                        <th style={THR}>Venta Mes</th>
                        <th style={THR}>Prom 6M</th>
                        <th style={{ ...THR, width: 60 }}>Stock</th>
                        <th style={THR}>Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prods.map((p, i) => (
                        <tr key={p.codigo} style={{ background: i % 2 === 0 ? "white" : "#F8FAFC" }}>
                          <td style={{ ...TD, fontWeight: 700, color: LBF_BLUE, fontSize: 10 }}>{p.codigo}</td>
                          <td style={{ ...TD, fontSize: 10 }}>
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400 }} title={p.descripcion}>
                              {p.descripcion}
                            </div>
                          </td>
                          <td style={{ ...TDR, fontSize: 11, color: p.venta_mes > 0 ? "#1E293B" : "#CBD5E1", fontWeight: p.venta_mes > 0 ? 600 : 400 }}>
                            {p.venta_mes > 0 ? fmtAbs(p.venta_mes) : "—"}
                          </td>
                          <td style={{ ...TDR, fontSize: 11, color: "#64748B" }}>
                            {p.vta_prom_6m > 0 ? fmtAbs(p.vta_prom_6m) : "—"}
                          </td>
                          <td style={{ ...TDR, fontSize: 11, fontWeight: p.q_stock <= 0 ? 700 : 400,
                            color: p.q_stock <= 0 ? "#EF4444" : p.q_stock < 5 ? "#F59E0B" : "#1E293B" }}>
                            {Math.round(p.q_stock)}
                          </td>
                          <td style={{ ...TDR, fontSize: 11, fontWeight: 700, color: mgColor(p.margen) }}>
                            {p.margen > 0 ? `${p.margen.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                      {prods.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ ...TD, textAlign: "center", color: "#94A3B8", padding: 28 }}>
                            Sin productos para esta clase
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {prods.length > 0 && (
                      <tfoot>
                        <tr style={{ background: color, position: "sticky", bottom: 0 }}>
                          <td colSpan={2} style={{ ...TD, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                            TOTAL — {prods.length} productos
                          </td>
                          <td style={{ ...TDR, color: "white", fontWeight: 800, fontSize: 11, borderBottom: "none" }}>
                            {fmtAbs(prods.reduce((s, p) => s + p.venta_mes, 0))}
                          </td>
                          <td style={{ ...TDR, color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                            {fmtAbs(prods.reduce((s, p) => s + p.vta_prom_6m, 0))}
                          </td>
                          <td style={{ ...TDR, color: "white", fontWeight: 700, fontSize: 11, borderBottom: "none" }}>
                            {Math.round(prods.reduce((s, p) => s + p.q_stock, 0))}
                          </td>
                          <td style={{ ...TDR, color: "rgba(255,255,255,0.7)", fontSize: 11, borderBottom: "none" }}>—</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>}
              </div>
            );
          })()}
        </>
      ) : null}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Filter helpers ─────────────────────────────────────────────────── */
function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: "white", color: "#1E293B", fontSize: 12, cursor: "pointer", outline: "none" }}>
        {children}
      </select>
    </div>
  );
}

function CatChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
      border: active ? `1px solid ${color}` : "1px solid #E2E8F0",
      background: active ? color : "white",
      color: active ? "white" : "#64748B",
    }}>
      {label}
    </button>
  );
}
