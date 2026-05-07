"use client";

import { useEffect, useState, useCallback, useRef, Fragment, memo } from "react";
import { api, apiFetch } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import { ChevronDown, ChevronRight, MessageSquare, Mail } from "lucide-react";
import { ExportButton } from "@/components/table-tools";
import HelpButton from "@/components/help-button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, LabelList, PieChart, Pie, Legend,
} from "recharts";

/* ─── Shared styles (light theme) ──────────────────────── */
const card: React.CSSProperties = { background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20 };
const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" };
const thR: React.CSSProperties = { ...thS, textAlign: "right" };
const thC: React.CSSProperties = { ...thS, textAlign: "center" };
const td: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap", fontSize: 13 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdC: React.CSSProperties = { ...td, textAlign: "center" };
const rowBg = (i: number) => i % 2 === 0 ? "white" : "#FAFBFC";
const semColor = (s: string) => s === "red" ? "#EF4444" : s === "yellow" ? "#F59E0B" : "#10B981";
const semBg = (s: string) => s === "red" ? "#FEF2F2" : s === "yellow" ? "#FFFBEB" : "#F0FDF4";
const tt = { background: "white", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 };
const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13,
  color: "#374151", background: "white", cursor: "pointer", outline: "none",
};

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 150, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CumplimientoBar({ pct, w }: { pct: number; w?: number }) {
  const color = pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: w || 80, background: "#F1F5F9", borderRadius: 4, height: 16, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
    </div>
  );
}

/* ─── Detalle expandido de una licitación ──────────────── */
const LicDetalle = memo(function LicDetalle({ licId, notaInicial, catFilter }: { licId: string; notaInicial?: any; catFilter?: string }) {
  const [det, setDet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notaText, setNotaText] = useState("");
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState<any>(notaInicial || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<any>(`/api/facturacion/detalle?licitacion=${encodeURIComponent(licId)}`)
      .then(r => {
        if (cancelled) return;
        setDet(r);
        if (r.nota) { setNota(r.nota); }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [licId]);

  const guardarNota = async () => {
    if (!notaText.trim()) return;
    setSaving(true);
    await api.post("/api/facturacion/nota", { licitacion: licId, nota: notaText.trim() });
    setNota({ texto: notaText.trim(), fecha: new Date().toISOString().slice(0, 10), autor: "" });
    setEditando(false);
    setNotaText("");
    setSaving(false);
  };

  const borrarNota = async () => {
    setSaving(true);
    await apiFetch(`/api/facturacion/nota?licitacion=${encodeURIComponent(licId)}`, { method: "DELETE" });
    setNota(null);
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 16, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Cargando detalle...</div>;
  if (!det || det.error) return <div style={{ padding: 16, color: "#EF4444", fontSize: 12 }}>Error: {det?.error || "sin datos"}</div>;

  const adjAll = det.adjudicados || [];
  const adj = catFilter && catFilter !== "todas"
    ? adjAll.filter((a: any) => a.categoria === catFilter)
    : adjAll;
  const fac = det.facturados || [];

  return (
    <div style={{ padding: "16px 24px", background: "#F8FAFC", borderTop: "2px solid #E2E8F0" }}>
      {/* Nota */}
      <div style={{ marginBottom: 16 }}>
        {nota && !editando ? (
          <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A", padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <MessageSquare size={14} style={{ color: "#D97706", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#92400E" }}>{nota.texto}</div>
              <div style={{ fontSize: 10, color: "#B45309", marginTop: 4 }}>
                {nota.autor && <span>{nota.autor} — </span>}{nota.fecha}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => { setNotaText(nota.texto); setEditando(true); }}
                style={{ border: "none", background: "transparent", color: "#D97706", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Editar</button>
              <button onClick={borrarNota} disabled={saving}
                style={{ border: "none", background: "transparent", color: "#EF4444", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Borrar</button>
            </div>
          </div>
        ) : editando || !nota ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <MessageSquare size={14} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <input
              value={notaText}
              onChange={e => setNotaText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") guardarNota(); }}
              placeholder="Agregar nota o comentario..."
              style={{ flex: 1, padding: "6px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, color: "#1F2937", outline: "none" }}
            />
            <button onClick={guardarNota} disabled={saving || !notaText.trim()}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#3B82F6", color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: notaText.trim() ? 1 : 0.5 }}>
              Guardar
            </button>
            {editando && (
              <button onClick={() => { setEditando(false); setNotaText(""); }}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #E2E8F0", background: "white", color: "#64748B", fontSize: 11, cursor: "pointer" }}>
                Cancelar
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: fac.length > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>
        {/* Productos adjudicados */}
        <div style={card}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
            Productos Adjudicados ({adj.length}{catFilter && catFilter !== "todas" ? ` de ${adjAll.length} — filtrado por ${catFilter}` : ""})
          </h4>
          {adj.length === 0 ? <div style={{ color: "#94A3B8", fontSize: 12 }}>Sin detalle de productos</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thS}>Producto Licitación</th>
                  <th style={thS}>Producto LBF</th>
                  <th style={thS}>Cat.</th>
                  <th style={thR}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {adj.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ ...td, fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", lineHeight: 1.3 }} title={p.producto_licitacion}>{p.producto_licitacion}</td>
                    <td style={{ ...td, fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", lineHeight: 1.3 }} title={p.producto_lbf}>{p.producto_lbf || "—"}</td>
                    <td style={{ ...td, fontSize: 11 }}>{p.categoria}</td>
                    <td style={tdR}>{fmtAbs(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Productos facturados */}
        {fac.length > 0 && (
          <div style={card}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 8 }}>Movimientos por Producto ({fac.length})</h4>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thS}>Tipo</th>
                  <th style={thS}>Código</th>
                  <th style={thS}>Descripción</th>
                  <th style={thR}>Monto</th>
                  <th style={thR}>Docs</th>
                  <th style={thC}>Últ. Fecha</th>
                </tr>
              </thead>
              <tbody>
                {fac.map((p: any, i: number) => {
                  const isNC = p.tipo === "Nota Crédito";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: isNC ? "#FEF2F2" : undefined }}>
                      <td style={td}>
                        <span style={{
                          display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                          color: isNC ? "#EF4444" : p.tipo === "Guía" ? "#F59E0B" : "#10B981",
                          background: isNC ? "#FEE2E2" : p.tipo === "Guía" ? "#FEF3C7" : "#D1FAE5",
                        }}>{p.tipo}</span>
                      </td>
                      <td style={{ ...td, fontSize: 11, fontFamily: "monospace" }}>{p.codigo}</td>
                      <td style={{ ...td, fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", lineHeight: 1.3 }} title={p.descripcion}>{p.descripcion}</td>
                      <td style={{ ...tdR, color: isNC ? "#EF4444" : "#10B981", fontWeight: isNC ? 700 : 400 }}>{fmtAbs(p.venta)}</td>
                      <td style={tdR}>{p.n_docs}</td>
                      <td style={{ ...tdC, fontSize: 11 }}>{p.ultima_fecha}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

/* ─── Fila individual memoizada ──────── */
const LicRow = memo(function LicRow({ l, i, isOpen, onToggle, colCount, catFilter, showCumpl, onToggleExcluir }: {
  l: any; i: number; isOpen: boolean; onToggle: (id: string) => void; colCount: number; catFilter?: string; showCumpl?: boolean;
  onToggleExcluir?: (licId: string, excluir: boolean) => void;
}) {
  const gap = l.adjudicado - l.facturado;
  const excluida = !!l.excluida;
  const rowStyle: React.CSSProperties = {
    borderBottom: "1px solid #F1F5F9",
    background: excluida ? "#F9FAFB" : isOpen ? "#EFF6FF" : rowBg(i),
    cursor: "pointer",
    opacity: excluida ? 0.6 : 1,
  };
  return (
    <Fragment>
      <tr onClick={() => onToggle(l.licitacion)} style={rowStyle}>
        <td style={tdC}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {l.nota && <MessageSquare size={11} style={{ color: "#D97706" }} />}
            {excluida && <span title="Irrecuperable" style={{ fontSize: 9, color: "#94A3B8" }}>✕</span>}
          </div>
        </td>
        <td style={{ ...td, fontSize: 12, fontWeight: 600, color: excluida ? "#94A3B8" : "#4338CA" }}>{l.kam}</td>
        <td style={{ ...td, fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", color: excluida ? "#94A3B8" : undefined }} title={l.licitacion}>{l.licitacion}</td>
        <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", color: excluida ? "#94A3B8" : undefined }} title={l.nombre}>{l.nombre}</td>
        <td style={{ ...tdR, fontWeight: 600, color: excluida ? "#94A3B8" : undefined }}>
          {fmtAbs(l.adjudicado)}
          {l.monto_fuente === "OC" && (
            <span title="Monto obtenido desde Órdenes de Compra (licitación sin monto en ChileCompra)"
              style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", padding: "1px 4px", borderRadius: 3, marginLeft: 4 }}>OC</span>
          )}
        </td>
        <td style={{ ...tdR, color: excluida ? "#94A3B8" : "#10B981" }}>{fmtAbs(l.facturado)}</td>
        <td style={{ ...tdR, fontWeight: 700, color: excluida ? "#94A3B8" : "#EF4444" }}>{fmtAbs(gap)}</td>
        <td style={td}>
          {excluida
            ? <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700 }}>Irrecuperable</span>
            : showCumpl !== false
              ? <CumplimientoBar pct={l.cumplimiento} w={60} />
              : <span style={{ fontSize: 12, fontWeight: 700, color: l.cumplimiento >= 80 ? "#10B981" : l.cumplimiento >= 50 ? "#F59E0B" : "#EF4444" }}>{l.cumplimiento}%</span>
          }
        </td>
        <td style={{ ...tdC, fontSize: 11, fontWeight: l.semaforo === "red" ? 700 : 400, color: excluida ? "#94A3B8" : l.semaforo === "red" ? "#EF4444" : "#1F2937" }}>{l.fecha_termino}</td>
        <td style={{ ...tdC, fontWeight: 700, color: excluida ? "#94A3B8" : semColor(l.semaforo) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>{l.dias_restantes}</span>
            {onToggleExcluir && (
              <button
                onClick={e => { e.stopPropagation(); onToggleExcluir(l.licitacion, !excluida); }}
                title={excluida ? "Reactivar licitación" : "Marcar como irrecuperable"}
                style={{
                  border: "none", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700, cursor: "pointer",
                  background: excluida ? "#D1FAE5" : "#FEE2E2",
                  color: excluida ? "#059669" : "#DC2626",
                }}
              >
                {excluida ? "↩ Reactivar" : "✕ Irrecup."}
              </button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr><td colSpan={colCount} style={{ padding: 0 }}>
          <LicDetalle licId={l.licitacion} notaInicial={l.nota} catFilter={catFilter} />
        </td></tr>
      )}
    </Fragment>
  );
}, (prev, next) =>
  prev.isOpen === next.isOpen && prev.i === next.i && prev.l === next.l &&
  prev.catFilter === next.catFilter && prev.onToggleExcluir === next.onToggleExcluir);

/* ─── Barra de totales (sobre el cuadro, reactiva al filtro) ── */
function TotalsBar({ rows }: { rows: any[] }) {
  const activas = rows.filter(l => !l.excluida);
  const excluidas = rows.filter(l => l.excluida);
  const adj = activas.reduce((s, l) => s + (l.adjudicado || 0), 0);
  const fac = activas.reduce((s, l) => s + (l.facturado || 0), 0);
  const gap = adj - fac;
  const gapExcluido = excluidas.reduce((s, l) => s + ((l.adjudicado || 0) - (l.facturado || 0)), 0);
  const cum = adj > 0 ? Math.round(fac / adj * 100) : 0;
  const cumColor = cum >= 80 ? "#10B981" : cum >= 50 ? "#F59E0B" : "#EF4444";
  const item = (label: string, value: string, color?: string, title?: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }} title={title}>
      <span style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color || "#0F172A" }}>{value}</span>
    </div>
  );
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24,
      padding: "10px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 12, color: "#64748B", marginRight: "auto" }}>
        <strong style={{ color: "#0F172A" }}>{activas.length}</strong> licitaciones
        {excluidas.length > 0 && (
          <span style={{ color: "#94A3B8" }}> · <span style={{ color: "#DC2626" }}>{excluidas.length} irrecuperable{excluidas.length > 1 ? "s" : ""}</span> excluida{excluidas.length > 1 ? "s" : ""}</span>
        )}
      </span>
      {item("Adjudicado", fmtAbs(adj))}
      {item("Facturado", fmtAbs(fac), "#10B981")}
      {item("Gap recuperable", fmtAbs(gap), "#EF4444")}
      {gapExcluido > 0 && item("Gap excluido", fmtAbs(gapExcluido), "#94A3B8", "Gap de licitaciones marcadas como irrecuperables")}
      {item("Cumpl.", `${cum}%`, cumColor)}
    </div>
  );
}

type SortKey = "adjudicado" | "facturado" | "gap" | "cumplimiento" | "dias_restantes" | null;
type SortDir = "asc" | "desc";

/* ─── Tabla de licitaciones con filas expandibles y sorting ──────── */
function LicTable({ rows, colCount, catFilter, showCumpl, onToggleExcluir }: { rows: any[]; colCount: number; catFilter?: string; showCumpl?: boolean; onToggleExcluir?: (licId: string, excluir: boolean) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggle = useCallback((id: string) => setSel(prev => prev === id ? null : id), []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortKey ? [...rows].sort((a, b) => {
    const va = sortKey === "gap" ? (a.adjudicado - a.facturado) : (a[sortKey] ?? 0);
    const vb = sortKey === "gap" ? (b.adjudicado - b.facturado) : (b[sortKey] ?? 0);
    return sortDir === "desc" ? vb - va : va - vb;
  }) : rows;

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "desc" ? " ↓" : " ↑";
  };
  const thSort: React.CSSProperties = { ...thR, cursor: "pointer", userSelect: "none" };
  const thSortC: React.CSSProperties = { ...thC, cursor: "pointer", userSelect: "none" };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
      <thead>
        <tr style={{ background: "#F8FAFC" }}>
          <th style={{ ...thC, width: 30 }}></th>
          <th style={thS}>KAM</th>
          <th style={thS}>Licitación</th>
          <th style={thS}>Cliente</th>
          <th style={thSort} onClick={() => handleSort("adjudicado")}>Adjudicado{sortIcon("adjudicado")}</th>
          <th style={thSort} onClick={() => handleSort("facturado")}>Facturado{sortIcon("facturado")}</th>
          <th style={thSort} onClick={() => handleSort("gap")}>Gap{sortIcon("gap")}</th>
          <th style={{ ...thS, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("cumplimiento")}>Cumpl.{sortIcon("cumplimiento")}</th>
          <th style={thSortC} onClick={() => handleSort("dias_restantes")}>Término{sortIcon("dias_restantes")}</th>
          <th style={thSortC} onClick={() => handleSort("dias_restantes")}>Días{sortIcon("dias_restantes")}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((l: any, i: number) => (
          <LicRow key={l.licitacion} l={l} i={i} isOpen={sel === l.licitacion} onToggle={toggle} colCount={colCount} catFilter={catFilter} showCumpl={showCumpl} onToggleExcluir={onToggleExcluir} />
        ))}
      </tbody>
    </table>
  );
}

type TabId = "urgentes" | "licitaciones" | "clientes" | "historico" | "competitividad";

/* ─── Helper: generar email KAM ──── */
function kamToEmail(kam: string): string {
  if (!kam || kam === "Sin KAM") return "";
  // Normalizar: quitar tildes
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const parts = kam.trim().split(/\s+/);
  if (parts.length < 2) return "";
  const inicial = norm(parts[0])[0];
  const apellido = norm(parts[parts.length - 1]);
  return `${inicial}${apellido}@lbf.cl`;
}

function buildEmailHtml(kam: string, lics: any[], esUrgente: boolean): string {
  const hoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
  const nombre = kam.split(" ")[0];
  const sorted = [...lics].sort((a, b) => a.cumplimiento - b.cumplimiento);
  const totalAdj = sorted.reduce((s, l) => s + (l.adjudicado || 0), 0);
  const totalFac = sorted.reduce((s, l) => s + (l.facturado || 0), 0);
  const totalGap = totalAdj - totalFac;
  const pctGlobal = totalAdj > 0 ? Math.round(totalFac / totalAdj * 100) : 0;
  const f = (n: number) => "$" + n.toLocaleString("es-CL");
  const semColor = (p: number) => p >= 80 ? "#10B981" : p >= 50 ? "#F59E0B" : "#EF4444";

  const tdH = "padding:8px 12px;font-size:13px;";

  let rows = "";
  for (const l of sorted) {
    const gap = (l.adjudicado || 0) - (l.facturado || 0);
    const c = semColor(l.cumplimiento);
    rows += `<tr style="border-bottom:1px solid #E2E8F0;background:#FFFFFF;">
      <td style="${tdH}color:#1F2937;font-weight:600;">${l.licitacion}</td>
      <td style="${tdH}color:#1F2937;">${l.nombre}</td>
      <td style="${tdH}text-align:right;color:#1F2937;">${f(l.adjudicado || 0)}</td>
      <td style="${tdH}text-align:right;color:#10B981;">${f(l.facturado || 0)}</td>
      <td style="${tdH}text-align:right;color:#EF4444;font-weight:600;">${f(gap)}</td>
      <td style="${tdH}text-align:center;"><span style="color:${c};font-weight:700;">&#9679; ${l.cumplimiento}%</span></td>
      <td style="${tdH}text-align:center;color:#64748B;">${l.fecha_termino || ""}</td>
      <td style="${tdH}text-align:center;color:${(l.dias_restantes || 0) <= 30 ? "#EF4444" : "#64748B"};font-weight:${(l.dias_restantes || 0) <= 30 ? "700" : "400"};">${l.dias_restantes ?? ""}</td>
    </tr>`;
  }

  return `<div style="font-family:Arial,sans-serif;max-width:900px;">
  <p style="font-size:14px;color:#1F2937;">Hola ${nombre},</p>
  <p style="font-size:14px;color:#1F2937;">${esUrgente
    ? "Te comparto el estado de tus licitaciones que <b>vencen este mes</b> y requieren atenci&oacute;n:"
    : `Te comparto el estado actualizado de tus licitaciones al <b>${hoy}</b>:`}</p>

  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:16px 0;display:flex;gap:24px;">
    <div style="text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Licitaciones</div><div style="font-size:20px;font-weight:800;color:#0F172A;">${sorted.length}</div></div>
    <div style="text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Adjudicado</div><div style="font-size:20px;font-weight:800;color:#0F172A;">${f(totalAdj)}</div></div>
    <div style="text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Facturado</div><div style="font-size:20px;font-weight:800;color:#10B981;">${f(totalFac)}</div></div>
    <div style="text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Gap</div><div style="font-size:20px;font-weight:800;color:#EF4444;">${f(totalGap)}</div></div>
    <div style="text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Cumpl.</div><div style="font-size:20px;font-weight:800;color:${semColor(pctGlobal)};">${pctGlobal}%</div></div>
  </div>

  <table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1E293B;">
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:left;">Licitaci&oacute;n</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:left;">Cliente</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:right;">Adjudicado</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:right;">Facturado</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:right;">Gap</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:center;">Cumpl.</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:center;">T&eacute;rmino</th>
        <th style="padding:10px 12px;font-size:12px;color:white;text-align:center;">D&iacute;as</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#F1F5F9;border-top:2px solid #CBD5E1;">
        <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#0F172A;" colspan="2">TOTAL</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#0F172A;">${f(totalAdj)}</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#10B981;">${f(totalFac)}</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right;color:#EF4444;">${f(totalGap)}</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:700;text-align:center;color:${semColor(pctGlobal)};">${pctGlobal}%</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  <p style="font-size:13px;color:#64748B;margin-top:16px;padding:12px 16px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:6px;">
    <b>Adjunto:</b> Excel con el detalle de productos adjudicados y facturados por licitaci&oacute;n.
    Por favor revisar y confirmar qu&eacute; montos son recuperables y cu&aacute;les no.
  </p>
  <p style="font-size:14px;color:#1F2937;margin-top:16px;">Saludos</p>
</div>`;
}

function EmailPreviewModal({ kam, lics, esUrgente, onClose }: {
  kam: string; lics: any[]; esUrgente: boolean; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const email = kamToEmail(kam);
  const subject = esUrgente
    ? `Seguimiento Licitaciones Urgentes - ${kam}`
    : `Seguimiento Licitaciones - ${kam}`;

  const html = buildEmailHtml(kam, lics, esUrgente);

  const handleCopy = async () => {
    try {
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([contentRef.current?.innerText || ""], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blob, "text/plain": textBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      if (contentRef.current) {
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("copy");
        sel?.removeAllRanges();
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    }
  };

  const openGmail = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
    window.open(gmailUrl, "_blank");
  };

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("lbf_token") || "";
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const resp = await fetch(`${baseUrl}/api/facturacion/excel-detalle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ licitaciones: lics.map(l => l.licitacion), kam }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Licitaciones_${kam.replace(/ /g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (e) {
      console.error("Error descargando Excel:", e);
    }
    setDownloading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "white", borderRadius: 12, maxWidth: 960, width: "100%",
        maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 25px 50px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #E2E8F0",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Vista previa del correo</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Para: <b>{email}</b> — {subject}
            </div>
          </div>
          <button onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#94A3B8", padding: 4 }}>
            ✕
          </button>
        </div>

        {/* Email preview */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, background: "#F8FAFC" }}>
          <div style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: 24 }}>
            <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0",
          display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B", marginRight: "auto" }}>
            1. Descarga Excel — 2. Copia el resumen — 3. Abre Gmail — 4. Pega y adjunta Excel
          </span>
          <button onClick={handleDownloadExcel} disabled={downloading}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              background: downloaded ? "#10B981" : "#059669", color: "white",
              transition: "background 0.2s", opacity: downloading ? 0.6 : 1 }}>
            {downloading ? "Generando..." : downloaded ? "Excel descargado" : "Descargar Excel"}
          </button>
          <button onClick={handleCopy}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              background: copied ? "#10B981" : "#1E293B", color: "white",
              transition: "background 0.2s" }}>
            {copied ? "Copiado" : "Copiar resumen"}
          </button>
          <button onClick={() => { if (!copied) handleCopy().then(openGmail); else openGmail(); }}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              background: "#2563EB", color: "white" }}>
            <Mail size={14} /> Abrir Gmail
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper: parse dd-mm-yyyy to extract year/month ──── */
function parseFechaTermino(ft: string): { year: number; month: number } | null {
  if (!ft || ft.length < 10) return null;
  const parts = ft.split("-");
  if (parts.length !== 3) return null;
  return { year: parseInt(parts[2], 10), month: parseInt(parts[1], 10) };
}

/* ════════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════════ */
export default function FacturacionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("urgentes");
  const [filtroAno, setFiltroAno] = useState<string>("todos");
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroKam, setFiltroKam] = useState<string>("todos");
  const [filtroCat, setFiltroCat] = useState<string>("todas");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedLicInClient, setExpandedLicInClient] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ kam: string; lics: any[]; urgente: boolean } | null>(null);
  const [showCumpl, setShowCumpl] = useState(true);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [historicoData, setHistoricoData] = useState<any>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [competividadData, setCompetividadData] = useState<any>(null);
  const [competividadLoading, setCompetividadLoading] = useState(false);
  const [competividadAno, setCompetividadAno] = useState<number>(2025);

  useEffect(() => {
    setLoading(true);
    api.get<any>("/api/facturacion/", { noCache: true })
      .then(r => {
        setData(r);
        // Inicializar excluidos desde el estado persistido en backend
        const excl = new Set<string>();
        for (const l of (r.licitaciones || [])) { if (l.excluida) excl.add(l.licitacion); }
        for (const u of (r.urgentes_reales || [])) { if (u.excluida) excl.add(u.licitacion); }
        setExcluidos(excl);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "competitividad") {
      setCompetividadLoading(true);
      setCompetividadData(null);
      api.get<any>(`/api/facturacion/competitividad?ano=${competividadAno}`)
        .then(r => { setCompetividadData(r); setCompetividadLoading(false); })
        .catch(() => setCompetividadLoading(false));
    }
  }, [competividadAno, tab]);

  const handleTabChange = useCallback((newTab: TabId) => {
    setTab(newTab);
    if (newTab === "historico" && !historicoData && !historicoLoading) {
      setHistoricoLoading(true);
      api.get<any>("/api/facturacion/historico?ano=2025")
        .then(r => { setHistoricoData(r); setHistoricoLoading(false); })
        .catch(() => setHistoricoLoading(false));
    }
    if (newTab === "competitividad" && !competividadData && !competividadLoading) {
      setCompetividadLoading(true);
      api.get<any>(`/api/facturacion/competitividad?ano=${competividadAno}`)
        .then(r => { setCompetividadData(r); setCompetividadLoading(false); })
        .catch(() => setCompetividadLoading(false));
    }
  }, [historicoData, historicoLoading, competividadData, competividadLoading, competividadAno]);

  const handleToggleExcluir = useCallback(async (licId: string, excluir: boolean) => {
    setExcluidos(prev => {
      const next = new Set(prev);
      if (excluir) next.add(licId); else next.delete(licId);
      return next;
    });
    if (excluir) {
      await apiFetch("/api/facturacion/excluir", { method: "POST", body: { licitacion: licId } as any });
    } else {
      await apiFetch(`/api/facturacion/excluir?licitacion=${encodeURIComponent(licId)}`, { method: "DELETE" });
    }
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando datos de facturación...</div>;
  if (!data || data.error) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {data?.error || "sin datos"}</div>;

  const k = data.kpis;
  // Sobreescribir excluida con estado local (reactivo a toggles)
  const licitaciones: any[] = (data.licitaciones || []).map((l: any) => ({ ...l, excluida: excluidos.has(l.licitacion) }));
  const clientes = data.clientes || [];
  const canales = data.canales || [];
  const urgentes = (data.urgentes_reales || []).map((u: any) => ({ ...u, excluida: excluidos.has(u.licitacion) }));
  const mesNombre = data.mes_nombre || "Mes";

  // Extraer años y meses disponibles de fecha_termino
  const anosSet = new Set<number>();
  const mesesSet = new Set<number>();
  for (const l of licitaciones) {
    const p = parseFechaTermino(l.fecha_termino);
    if (p) { anosSet.add(p.year); mesesSet.add(p.month); }
  }
  const anos = Array.from(anosSet).sort();
  const meses = Array.from(mesesSet).sort();
  const MESES_NOMBRE: Record<number, string> = {
    1:"Enero",2:"Febrero",3:"Marzo",4:"Abril",5:"Mayo",6:"Junio",
    7:"Julio",8:"Agosto",9:"Septiembre",10:"Octubre",11:"Noviembre",12:"Diciembre"
  };

  // KAMs disponibles
  const kamsDisponibles: string[] = data.kams || [];
  const catsDisponibles: string[] = data.cats_available || [];

  // Filtrar licitaciones
  const licFiltradas = licitaciones.filter((l: any) => {
    if (filtroKam !== "todos" && l.kam !== filtroKam) return false;
    if (filtroCat !== "todas" && !(l.categorias || []).includes(filtroCat)) return false;
    const p = parseFechaTermino(l.fecha_termino);
    if (!p) return true;
    if (filtroAno !== "todos" && p.year !== parseInt(filtroAno)) return false;
    if (filtroMes !== "todos" && p.month !== parseInt(filtroMes)) return false;
    return true;
  });

  // Filtrar urgentes por KAM y categoría
  const urgentesFiltradas = urgentes.filter((u: any) => {
    if (filtroKam !== "todos" && u.kam !== filtroKam) return false;
    if (filtroCat !== "todas" && !(u.categorias || []).includes(filtroCat)) return false;
    return true;
  });

  // Filtrar clientes por RUTs que aparecen en licitaciones filtradas
  const rutsFiltrados = new Set(licFiltradas.map((l: any) => l.rut));
  const clientesFiltrados = filtroCat !== "todas" || filtroKam !== "todos"
    ? clientes.filter((c: any) => rutsFiltrados.has(c.rut))
    : clientes;

  // Agrupar urgentes por KAM
  const kamMap: Record<string, { kam: string; count: number; gap: number; adj: number; fac: number }> = {};
  for (const u of urgentesFiltradas) {
    const k2 = u.kam || "Sin KAM";
    if (!kamMap[k2]) kamMap[k2] = { kam: k2, count: 0, gap: 0, adj: 0, fac: 0 };
    kamMap[k2].count++;
    kamMap[k2].gap += u.adjudicado - u.facturado;
    kamMap[k2].adj += u.adjudicado;
    kamMap[k2].fac += u.facturado;
  }
  const kamResumen = Object.values(kamMap).sort((a, b) => b.gap - a.gap);

  const canalColors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

  const tabs: { id: TabId; label: string; count?: number; alert?: boolean }[] = [
    { id: "urgentes", label: `Urgentes ${mesNombre}`, count: urgentesFiltradas.length, alert: urgentesFiltradas.length > 0 },
    { id: "licitaciones", label: "Todas las Licitaciones", count: licFiltradas.length },
    { id: "clientes", label: "Por Cliente", count: clientesFiltrados.length },
    { id: "historico", label: "Historial 2025" },
    { id: "competitividad", label: "Competitividad" },
  ];

  const LIC_COLS = 10; // number of columns in lic table

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Adjudicado vs Facturado</h1>
          <HelpButton module="facturacion" />
        </div>
        <p style={{ fontSize: 13, color: "#94A3B8" }}>Licitaciones vigentes — seguimiento de facturación contra montos adjudicados (solo facturación tipo Licitación)</p>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard title="Licitaciones Vigentes" value={k.total_vigentes.toString()} />
        <KpiCard title="Total Adjudicado" value={fmt(k.total_adjudicado)} />
        <KpiCard title="Total Facturado" value={fmt(k.total_facturado)} color="#10B981" />
        <KpiCard title="Cumplimiento" value={fmtPct(k.cumplimiento)} color={k.cumplimiento >= 80 ? "#10B981" : k.cumplimiento >= 50 ? "#F59E0B" : "#EF4444"} />
        <KpiCard title="Gap Total" value={fmt(k.gap)} color="#EF4444" />
      </div>

      {/* Alerta urgentes reales */}
      {urgentes.length > 0 && (
        <div style={{ ...card, background: "#FEF2F2", borderColor: "#FECACA", padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>
                {k.urgentes_reales} licitaciones vencen en {mesNombre} sin facturar al 100%
              </span>
              <span style={{ fontSize: 13, color: "#B91C1C", marginLeft: 12 }}>
                Gap recuperable: <strong>{fmt(k.urgentes_reales_gap)}</strong>
              </span>
            </div>
            <button onClick={() => handleTabChange("urgentes")} style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid #FECACA", cursor: "pointer",
              fontSize: 12, fontWeight: 600, background: "#EF4444", color: "white",
            }}>Ver urgentes</button>
          </div>
        </div>
      )}

      {/* Canal de venta chart */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Facturación {new Date().getFullYear()} por Canal de Venta</h3>
        <ResponsiveContainer width="100%" height={Math.max(canales.length * 50, 180)}>
          <BarChart data={canales} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" tickFormatter={(v: number) => fmt(v)} tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis dataKey="canal" type="category" width={140} tick={{ fill: "#374151", fontSize: 12 }} />
            <Tooltip formatter={(v: any) => fmtAbs(v)} contentStyle={tt} />
            <Bar dataKey="venta" radius={[0, 4, 4, 0]}>
              {canales.map((_: any, i: number) => <Cell key={i} fill={canalColors[i % canalColors.length]} />)}
              <LabelList dataKey="venta" position="right" formatter={(v: any) => fmt(v)} style={{ fill: "#374151", fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filtro global: Categoría + KAM (aplica a todos los tabs) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", background: "white", border: "1px solid #E2E8F0", borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>Filtrar:</span>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={selectStyle}>
          <option value="todas">Todas las categorías</option>
          {catsDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroKam} onChange={e => setFiltroKam(e.target.value)} style={selectStyle}>
          <option value="todos">Todos los KAM</option>
          {kamsDisponibles.map(k2 => <option key={k2} value={k2}>{k2}</option>)}
        </select>
        {(filtroCat !== "todas" || filtroKam !== "todos") && (
          <button onClick={() => { setFiltroCat("todas"); setFiltroKam("todos"); }}
            style={{ ...selectStyle, color: "#EF4444", borderColor: "#FECACA", cursor: "pointer" }}>
            Limpiar
          </button>
        )}
        {filtroCat !== "todas" && (
          <span style={{ fontSize: 12, color: "#6D28D9", fontWeight: 600, padding: "4px 10px", background: "#F5F3FF", borderRadius: 6 }}>
            Mostrando: {filtroCat}
          </span>
        )}
        <button onClick={() => setShowCumpl(v => !v)} style={{
          ...selectStyle, marginLeft: "auto",
          color: showCumpl ? "#64748B" : "#94A3B8",
          borderColor: showCumpl ? "#E2E8F0" : "#F1F5F9",
          background: showCumpl ? "white" : "#F8FAFC",
          fontSize: 12,
        }}>
          {showCumpl ? "Ocultar Cumpl." : "Mostrar Cumpl."}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E2E8F0" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, background: "transparent",
            color: tab === t.id ? "#3B82F6" : "#64748B", fontWeight: tab === t.id ? 600 : 400,
            borderBottom: tab === t.id ? "2px solid #3B82F6" : "2px solid transparent", marginBottom: -2,
          }}>
            {t.alert && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />}
            {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* ═══ Tab: Urgentes mes ═══ */}
      {tab === "urgentes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Acciones urgentes */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {filtroKam !== "todos" && kamToEmail(filtroKam) && (
              <button onClick={() => setEmailModal({ kam: filtroKam, lics: urgentesFiltradas, urgente: true })}
                style={{ ...selectStyle, display: "inline-flex", alignItems: "center", gap: 5,
                  color: "#2563EB", borderColor: "#BFDBFE", cursor: "pointer", background: "white" }}>
                <Mail size={14} /> Enviar a {filtroKam.split(" ")[0]}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KpiCard title={`Vencen en ${mesNombre}`} value={urgentesFiltradas.length.toString()} color="#EF4444" sub="Vencen este mes, < 100% facturado" />
            <KpiCard title={`Adjudicado ${mesNombre}`} value={fmt(urgentesFiltradas.reduce((s: number, u: any) => s + u.adjudicado, 0))} />
            <KpiCard title="Facturado" value={fmt(urgentesFiltradas.reduce((s: number, u: any) => s + u.facturado, 0))} color="#10B981" />
            <KpiCard title="Gap Recuperable" value={fmt(urgentesFiltradas.reduce((s: number, u: any) => s + u.adjudicado - u.facturado, 0))} color="#EF4444" sub="Si no se factura, se pierde" />
          </div>

          {/* Resumen por KAM */}
          {kamResumen.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: "auto" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Resumen por KAM — {mesNombre}</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    <th style={thS}>KAM</th>
                    <th style={thC}>Lic.</th>
                    <th style={thR}>Adjudicado</th>
                    <th style={thR}>Facturado</th>
                    <th style={thR}>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {kamResumen.map((k2, i) => (
                    <tr key={k2.kam} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                      <td style={{ ...td, fontWeight: 600 }}>{k2.kam}</td>
                      <td style={tdC}>{k2.count}</td>
                      <td style={tdR}>{fmtAbs(k2.adj)}</td>
                      <td style={{ ...tdR, color: "#10B981" }}>{fmtAbs(k2.fac)}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: "#EF4444" }}>{fmtAbs(k2.gap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabla detalle urgentes — expandible */}
          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#FEF2F2" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Detalle — Licitaciones que vencen en {mesNombre} con facturación pendiente</span>
            </div>
            <TotalsBar rows={urgentesFiltradas} />
            <LicTable rows={urgentesFiltradas} colCount={LIC_COLS} catFilter={filtroCat} showCumpl={showCumpl} onToggleExcluir={handleToggleExcluir} />
          </div>
        </div>
      )}

      {/* ═══ Tab: Todas las Licitaciones ═══ */}
      {tab === "licitaciones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Filtros fecha + email */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los años</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los meses</option>
              {meses.map(m => <option key={m} value={m}>{MESES_NOMBRE[m]}</option>)}
            </select>
            {(filtroAno !== "todos" || filtroMes !== "todos") && (
              <button onClick={() => { setFiltroAno("todos"); setFiltroMes("todos"); }}
                style={{ ...selectStyle, color: "#EF4444", borderColor: "#FECACA", cursor: "pointer" }}>
                Limpiar fechas
              </button>
            )}
            {filtroKam !== "todos" && kamToEmail(filtroKam) && (
              <button onClick={() => setEmailModal({ kam: filtroKam, lics: licFiltradas, urgente: false })}
                style={{ ...selectStyle, display: "inline-flex", alignItems: "center", gap: 5,
                  color: "#2563EB", borderColor: "#BFDBFE", cursor: "pointer", background: "white" }}>
                <Mail size={14} /> Enviar a {filtroKam.split(" ")[0]}
              </button>
            )}
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
              {licFiltradas.length} de {licitaciones.length} licitaciones
            </span>
            <ExportButton
              data={licFiltradas.map((l: any) => ({
                kam: l.kam, licitacion: l.licitacion, cliente: l.cliente_nombre,
                adjudicado: l.adjudicado, facturado: l.facturado,
                gap: l.adjudicado - l.facturado, cumplimiento: l.cumplimiento,
                termino: l.termino, dias_restantes: l.dias_restantes,
              }))}
              columns={[
                { key: "kam", label: "KAM" }, { key: "licitacion", label: "Licitacion" },
                { key: "cliente", label: "Cliente" }, { key: "adjudicado", label: "Adjudicado" },
                { key: "facturado", label: "Facturado" }, { key: "gap", label: "Gap" },
                { key: "cumplimiento", label: "Cumpl %" }, { key: "termino", label: "Termino" },
                { key: "dias_restantes", label: "Dias Restantes" },
              ]}
              filename="licitaciones_facturacion"
            />
          </div>

          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <TotalsBar rows={licFiltradas} />
            <LicTable rows={licFiltradas} colCount={LIC_COLS} catFilter={filtroCat} showCumpl={showCumpl} onToggleExcluir={handleToggleExcluir} />
          </div>
        </div>
      )}

      {/* ═══ Tab: Por Cliente ═══ */}
      {tab === "clientes" && (
        <div style={{ ...card, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ ...thC, width: 30 }}></th>
                <th style={thC}>Estado</th>
                <th style={thS}>KAM</th>
                <th style={thS}>Cliente</th>
                <th style={thR}>Adjudicado</th>
                <th style={thR}>Facturado</th>
                <th style={thS}>Cumpl.</th>
                <th style={thC}>N° Lic.</th>
                <th style={thC}>Días (próx.)</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c: any, i: number) => {
                const isExpanded = expandedClient === c.rut;
                // Licitaciones de este cliente (respetando filtros activos)
                const clienteLics = licitaciones.filter((l: any) => l.rut === c.rut &&
                  (filtroCat === "todas" || (l.categorias || []).includes(filtroCat)) &&
                  (filtroKam === "todos" || l.kam === filtroKam));
                return (
                  <Fragment key={c.rut}>
                    {/* Fila cliente */}
                    <tr
                      onClick={() => { setExpandedClient(isExpanded ? null : c.rut); setExpandedLicInClient(null); }}
                      style={{ borderBottom: "1px solid #F1F5F9", background: isExpanded ? "#EFF6FF" : rowBg(i), cursor: "pointer" }}
                    >
                      <td style={{ ...tdC, color: "#94A3B8" }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={tdC}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 700,
                          color: semColor(c.semaforo), background: semBg(c.semaforo),
                        }}>{c.cumplimiento < 50 ? "Bajo" : c.cumplimiento < 80 ? "Medio" : "Alto"}</span>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: "#4338CA" }}>{c.kam}</td>
                      <td style={{ ...td, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={`${c.rut} — ${c.nombre}`}>{c.nombre}</td>
                      <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.adjudicado)}</td>
                      <td style={{ ...tdR, color: "#10B981" }}>{fmtAbs(c.facturado)}</td>
                      <td style={td}>{showCumpl ? <CumplimientoBar pct={c.cumplimiento} w={70} /> : <span style={{ fontSize: 12, fontWeight: 700, color: c.cumplimiento >= 80 ? "#10B981" : c.cumplimiento >= 50 ? "#F59E0B" : "#EF4444" }}>{c.cumplimiento}%</span>}</td>
                      <td style={tdC}>{c.n_licitaciones}</td>
                      <td style={{ ...tdC, fontWeight: 700, color: c.dias_mas_pronto <= 30 ? "#EF4444" : c.dias_mas_pronto <= 90 ? "#F59E0B" : "#10B981" }}>{c.dias_mas_pronto}</td>
                    </tr>

                    {/* Detalle licitaciones del cliente */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                          <div style={{ padding: "10px 24px 10px 48px" }}>
                            {clienteLics.length === 0 ? (
                              <div style={{ color: "#94A3B8", fontSize: 12, padding: "8px 0" }}>Sin licitaciones para el filtro activo</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "#F1F5F9" }}>
                                    <th style={{ ...thC, width: 24, padding: "6px 8px" }}></th>
                                    <th style={{ ...thS, padding: "6px 8px" }}>Licitación</th>
                                    <th style={{ ...thR, padding: "6px 8px" }}>Adjudicado</th>
                                    <th style={{ ...thR, padding: "6px 8px" }}>Facturado</th>
                                    <th style={{ ...thR, padding: "6px 8px" }}>Gap</th>
                                    <th style={{ ...thS, padding: "6px 8px" }}>Cumpl.</th>
                                    <th style={{ ...thC, padding: "6px 8px" }}>Término</th>
                                    <th style={{ ...thC, padding: "6px 8px" }}>Días</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clienteLics.map((l: any, li: number) => {
                                    const licOpen = expandedLicInClient === l.licitacion;
                                    const gap = l.adjudicado - l.facturado;
                                    return (
                                      <Fragment key={l.licitacion}>
                                        <tr
                                          onClick={(e) => { e.stopPropagation(); setExpandedLicInClient(licOpen ? null : l.licitacion); }}
                                          style={{ borderBottom: "1px solid #E2E8F0", background: licOpen ? "#DBEAFE" : li % 2 === 0 ? "white" : "#F8FAFC", cursor: "pointer" }}
                                        >
                                          <td style={{ ...tdC, padding: "5px 8px", color: "#94A3B8" }}>
                                            {licOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                          </td>
                                          <td style={{ ...td, padding: "5px 8px", fontFamily: "monospace", fontWeight: 700, color: "#1E40AF" }}>{l.licitacion}</td>
                                          <td style={{ ...tdR, padding: "5px 8px", fontWeight: 600 }}>{fmtAbs(l.adjudicado)}</td>
                                          <td style={{ ...tdR, padding: "5px 8px", color: "#10B981" }}>{fmtAbs(l.facturado)}</td>
                                          <td style={{ ...tdR, padding: "5px 8px", fontWeight: 700, color: "#EF4444" }}>{fmtAbs(gap)}</td>
                                          <td style={{ ...td, padding: "5px 8px" }}>{showCumpl ? <CumplimientoBar pct={l.cumplimiento} w={55} /> : <span style={{ fontSize: 12, fontWeight: 700, color: l.cumplimiento >= 80 ? "#10B981" : l.cumplimiento >= 50 ? "#F59E0B" : "#EF4444" }}>{l.cumplimiento}%</span>}</td>
                                          <td style={{ ...tdC, padding: "5px 8px", fontSize: 11 }}>{l.fecha_termino}</td>
                                          <td style={{ ...tdC, padding: "5px 8px", fontWeight: 700, color: semColor(l.semaforo) }}>{l.dias_restantes}</td>
                                        </tr>
                                        {licOpen && (
                                          <tr>
                                            <td colSpan={8} style={{ padding: 0 }}>
                                              <LicDetalle licId={l.licitacion} notaInicial={l.nota} catFilter={filtroCat} />
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
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
      )}

      {/* ═══ Tab: Historial 2025 ═══ */}
      {tab === "historico" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {historicoLoading && (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando historial 2025...</div>
          )}
          {!historicoLoading && historicoData?.error && (
            <div style={{ padding: 20, color: "#EF4444" }}>Error: {historicoData.error}</div>
          )}
          {!historicoLoading && historicoData && !historicoData.error && (() => {
            const hk = historicoData.kpis || {};
            const adjudicadas: any[] = historicoData.adjudicadas || [];
            const perdidas: any[] = historicoData.perdidas || [];
            const topComp: any[] = (historicoData.top_competidores || []).slice(0, 10);
            const totalAdj = adjudicadas.reduce((s: number, a: any) => s + (a.monto || 0), 0);
            return (
              <>
                {/* KPI cards */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <KpiCard title="Adjudicadas 2025" value={hk.n_adjudicadas?.toString() ?? "0"} color="#10B981" />
                  <KpiCard title="Monto Adjudicado" value={fmt(hk.monto_adjudicado ?? 0)} color="#10B981" />
                  <KpiCard title="Tasa Adjudicación" value={`${hk.tasa_adj ?? 0}%`} color={hk.tasa_adj >= 50 ? "#10B981" : hk.tasa_adj >= 30 ? "#F59E0B" : "#EF4444"} sub={`${hk.n_participadas ?? 0} participadas`} />
                  <KpiCard title="Perdidas 2025" value={hk.n_perdidas?.toString() ?? "0"} color="#EF4444" />
                </div>

                {/* Two-column: adjudicadas + top competidores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Adjudicadas */}
                  <div style={{ ...card, padding: 0, overflow: "auto" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F0FDF4" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#065F46" }}>Adjudicadas 2025 ({adjudicadas.length})</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          <th style={thS}>Licitación</th>
                          <th style={thS}>Cliente</th>
                          <th style={thS}>Zona</th>
                          <th style={thR}>Monto</th>
                          <th style={thC}>Término</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjudicadas.map((a: any, i: number) => (
                          <tr key={a.licitacion} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                            <td style={{ ...td, fontSize: 11, fontFamily: "monospace", color: "#1E40AF" }}>{a.licitacion}</td>
                            <td style={{ ...td, fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={a.nombre}>{a.nombre}</td>
                            <td style={{ ...td, fontSize: 11 }}>{a.zona || "—"}</td>
                            <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(a.monto)}</td>
                            <td style={{ ...tdC, fontSize: 11 }}>{a.fecha_termino}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F1F5F9", borderTop: "2px solid #CBD5E1" }}>
                          <td colSpan={3} style={{ ...td, fontWeight: 700, fontSize: 12 }}>TOTAL</td>
                          <td style={{ ...tdR, fontWeight: 700, fontSize: 12, color: "#10B981" }}>{fmtAbs(totalAdj)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Top competidores */}
                  <div style={{ ...card, padding: 0, overflow: "auto" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#FEF2F2" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Top Competidores que Ganaron sobre LBF</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          <th style={thC}>#</th>
                          <th style={thS}>Empresa</th>
                          <th style={thR}>N° Veces Ganó</th>
                          <th style={thR}>Monto Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topComp.map((c: any, i: number) => (
                          <tr key={c.empresa} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                            <td style={{ ...tdC, fontWeight: 700, color: i === 0 ? "#EF4444" : "#64748B" }}>{i + 1}</td>
                            <td style={{ ...td, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={c.empresa}>{c.empresa}</td>
                            <td style={{ ...tdR, fontWeight: 700, color: "#EF4444" }}>{c.n_ganadas}</td>
                            <td style={tdR}>{fmtAbs(c.monto)}</td>
                          </tr>
                        ))}
                        {topComp.length === 0 && (
                          <tr><td colSpan={4} style={{ ...tdC, color: "#94A3B8", padding: 20 }}>Sin datos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Full-width: licitaciones perdidas */}
                <div style={{ ...card, padding: 0, overflow: "auto" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#FEF2F2" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Licitaciones Perdidas 2025 ({perdidas.length})</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        <th style={thS}>Licitación</th>
                        <th style={thS}>Cliente</th>
                        <th style={thS}>Zona</th>
                        <th style={thS}>Competidor Ganador</th>
                        <th style={thR}>Monto Competidor</th>
                        <th style={thC}>Fecha Inicio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perdidas.map((p: any, i: number) => (
                        <tr key={p.licitacion} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                          <td style={{ ...td, fontSize: 11, fontFamily: "monospace", color: "#1E40AF" }}>{p.licitacion}</td>
                          <td style={{ ...td, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={p.nombre}>{p.nombre}</td>
                          <td style={{ ...td, fontSize: 11 }}>{p.zona || "—"}</td>
                          <td style={{ ...td, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: p.comp_ganador ? "#0F172A" : "#94A3B8" }} title={p.comp_ganador || "Sin info"}>
                            {p.comp_ganador || <span style={{ fontStyle: "italic" }}>Sin info</span>}
                          </td>
                          <td style={{ ...tdR, fontWeight: p.monto_comp > 0 ? 600 : 400, color: p.monto_comp > 0 ? "#EF4444" : "#94A3B8" }}>
                            {p.monto_comp > 0 ? fmtAbs(p.monto_comp) : "—"}
                          </td>
                          <td style={{ ...tdC, fontSize: 11 }}>{p.fecha_inicio}</td>
                        </tr>
                      ))}
                      {perdidas.length === 0 && (
                        <tr><td colSpan={6} style={{ ...tdC, color: "#94A3B8", padding: 20 }}>Sin licitaciones perdidas registradas</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
          {!historicoLoading && !historicoData && (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Haga clic en la pestaña para cargar el historial.</div>
          )}
        </div>
      )}

      {/* ═══ Tab: Competitividad ═══ */}
      {tab === "competitividad" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Year selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Año:</span>
            {[2024, 2025, 2026].map(a => (
              <button key={a} onClick={() => setCompetividadAno(a)} style={{
                padding: "6px 16px", borderRadius: 6, border: "1px solid",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                borderColor: competividadAno === a ? "#3B82F6" : "#E2E8F0",
                background: competividadAno === a ? "#EFF6FF" : "white",
                color: competividadAno === a ? "#1D4ED8" : "#374151",
              }}>{a}</button>
            ))}
          </div>

          {competividadLoading && (
            <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando análisis de competitividad...</div>
          )}

          {!competividadLoading && competividadData && !competividadData.error && (() => {
            const lbf = competividadData.lbf || {};
            const empresas: any[] = competividadData.empresas || [];
            const porZona: any[] = competividadData.por_zona || [];
            const topHosp: any[] = (competividadData.top_hospitales || []).slice(0, 15);
            const totalMktAdj: number = competividadData.total_mercado_adj || 0;

            // Pie chart data: top 10 by adj + "Otros"
            const top10 = empresas.slice(0, 10);
            const otros = empresas.slice(10).reduce((s: number, e: any) => s + e.total_adjudicado, 0);
            const PIE_COLORS = [
              "#3B82F6","#EF4444","#10B981","#F59E0B","#8B5CF6",
              "#EC4899","#06B6D4","#84CC16","#F97316","#6366F1","#94A3B8",
            ];
            const pieData = [
              ...top10.map((e: any, i: number) => ({
                name: e.empresa.length > 28 ? e.empresa.slice(0, 28) + "…" : e.empresa,
                value: e.total_adjudicado,
                pct: e.pct_participado,
                fill: e.es_lbf ? "#3B82F6" : PIE_COLORS[i],
                isLbf: e.es_lbf,
              })),
              ...(otros > 0 ? [{ name: "Otros", value: otros, pct: totalMktAdj > 0 ? +(otros / totalMktAdj * 100).toFixed(2) : 0, fill: "#94A3B8", isLbf: false }] : []),
            ];

            return (
              <>
                {/* LBF Summary card */}
                {lbf && (
                  <div style={{ ...card, background: "#EFF6FF", borderColor: "#BFDBFE" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 12 }}>
                      LBF — Resumen {competividadAno}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {[
                        { label: "Market Share Adj.", value: `${lbf.pct_participado ?? 0}%`, color: "#1D4ED8" },
                        { label: "Efectividad", value: `${lbf.pct_efectividad ?? 0}%`, color: lbf.pct_efectividad >= 50 ? "#059669" : lbf.pct_efectividad >= 30 ? "#D97706" : "#DC2626" },
                        { label: "Total Participado", value: fmt(lbf.total_participado ?? 0) },
                        { label: "Total Adjudicado", value: fmt(lbf.total_adjudicado ?? 0), color: "#059669" },
                        { label: "Ofertas Realizadas", value: (lbf.ofertas_realizadas ?? 0).toLocaleString("es-CL") },
                        { label: "Ofertas Adjudicadas", value: (lbf.ofertas_adjudicadas ?? 0).toLocaleString("es-CL"), color: "#059669" },
                        { label: "IDs Participadas", value: (lbf.ids_participadas ?? 0).toLocaleString("es-CL") },
                        { label: "IDs Adjudicadas", value: (lbf.ids_adjudicadas ?? 0).toLocaleString("es-CL"), color: "#059669" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ flex: "1 1 120px", minWidth: 110, padding: "10px 14px", background: "white", border: "1px solid #DBEAFE", borderRadius: 8 }}>
                          <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: color || "#0F172A" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Charts row: Pie + Zona bar */}
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                  {/* Pie chart: market share */}
                  <div style={card}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
                      Participación de Mercado — Top 10 Empresas ({competividadAno})
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          label={({ name, pct }: any) => `${pct}%`}
                          labelLine={true}
                        >
                          {pieData.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.fill}
                              stroke={entry.isLbf ? "#1D4ED8" : "white"}
                              strokeWidth={entry.isLbf ? 2 : 1}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any) => fmtAbs(v)}
                          contentStyle={tt}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Legend */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {pieData.map((e: any, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: e.fill, flexShrink: 0 }} />
                          <span style={{ color: e.isLbf ? "#1D4ED8" : "#374151", fontWeight: e.isLbf ? 700 : 400 }}>
                            {e.name} ({e.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar chart: efectividad por zona */}
                  <div style={card}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
                      Efectividad LBF por Zona ({competividadAno})
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={porZona} layout="vertical" margin={{ right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "#64748B", fontSize: 11 }} />
                        <YAxis dataKey="zona" type="category" width={110} tick={{ fill: "#374151", fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: any) => [`${v}%`, "Efectividad"]}
                          contentStyle={tt}
                        />
                        <Bar dataKey="pct_efectividad" radius={[0, 4, 4, 0]}>
                          {porZona.map((z: any, i: number) => (
                            <Cell key={i} fill={z.pct_efectividad >= 50 ? "#10B981" : z.pct_efectividad >= 30 ? "#F59E0B" : "#EF4444"} />
                          ))}
                          <LabelList dataKey="pct_efectividad" position="right" formatter={(v: any) => `${v}%`} style={{ fill: "#374151", fontSize: 11, fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Stats zona table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 8 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          <th style={{ ...thS, fontSize: 11 }}>Zona</th>
                          <th style={{ ...thC, fontSize: 11 }}>IDs Part.</th>
                          <th style={{ ...thC, fontSize: 11 }}>IDs Adj.</th>
                          <th style={{ ...thR, fontSize: 11 }}>Adj.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porZona.map((z: any, i: number) => (
                          <tr key={z.zona} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                            <td style={{ ...td, fontSize: 11 }}>{z.zona}</td>
                            <td style={{ ...tdC, fontSize: 11 }}>{z.ids_participadas}</td>
                            <td style={{ ...tdC, fontSize: 11 }}>{z.ids_adjudicadas}</td>
                            <td style={{ ...tdR, fontSize: 11, fontWeight: 600 }}>{fmt(z.total_adjudicado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabla empresas mercado */}
                <div style={{ ...card, padding: 0, overflow: "auto" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                      Mercado Completo — Top 20 Empresas ({competividadAno})
                    </span>
                    <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
                      Total mercado adj.: {fmtAbs(totalMktAdj)}
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        <th style={{ ...thC, fontSize: 12 }}>#</th>
                        <th style={{ ...thS, fontSize: 12 }}>Empresa</th>
                        <th style={{ ...thR, fontSize: 12 }}>Adjudicado</th>
                        <th style={{ ...thR, fontSize: 12 }}>Market Share</th>
                        <th style={{ ...thR, fontSize: 12 }}>Participado</th>
                        <th style={{ ...thC, fontSize: 12 }}>Efectividad</th>
                        <th style={{ ...thC, fontSize: 12 }}>IDs Part.</th>
                        <th style={{ ...thC, fontSize: 12 }}>IDs Adj.</th>
                        <th style={{ ...thC, fontSize: 12 }}>Ofertas Real.</th>
                        <th style={{ ...thC, fontSize: 12 }}>Ofertas Adj.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empresas.map((e: any, i: number) => (
                        <tr key={e.empresa} style={{
                          borderBottom: "1px solid #F1F5F9",
                          background: e.es_lbf ? "#EFF6FF" : rowBg(i),
                          fontWeight: e.es_lbf ? 700 : 400,
                        }}>
                          <td style={{ ...tdC, fontSize: 12, color: i === 0 ? "#D97706" : "#64748B" }}>{i + 1}</td>
                          <td style={{ ...td, fontSize: 12, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={e.empresa}>
                            {e.es_lbf && <span style={{ color: "#1D4ED8", marginRight: 4 }}>★</span>}
                            {e.empresa}
                          </td>
                          <td style={{ ...tdR, fontSize: 12, color: e.es_lbf ? "#1D4ED8" : "#0F172A" }}>{fmtAbs(e.total_adjudicado)}</td>
                          <td style={{ ...tdR, fontSize: 12 }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 12,
                              background: e.es_lbf ? "#DBEAFE" : "#F1F5F9",
                              color: e.es_lbf ? "#1D4ED8" : "#374151",
                              fontWeight: 700, fontSize: 11,
                            }}>{e.pct_participado}%</span>
                          </td>
                          <td style={{ ...tdR, fontSize: 12, color: "#64748B" }}>{fmtAbs(e.total_participado)}</td>
                          <td style={{ ...tdC, fontSize: 12 }}>
                            <span style={{
                              color: e.pct_efectividad >= 50 ? "#059669" : e.pct_efectividad >= 30 ? "#D97706" : "#DC2626",
                              fontWeight: 700,
                            }}>{e.pct_efectividad}%</span>
                          </td>
                          <td style={{ ...tdC, fontSize: 12 }}>{e.ids_participadas.toLocaleString("es-CL")}</td>
                          <td style={{ ...tdC, fontSize: 12, color: "#059669" }}>{e.ids_adjudicadas.toLocaleString("es-CL")}</td>
                          <td style={{ ...tdC, fontSize: 12 }}>{e.ofertas_realizadas.toLocaleString("es-CL")}</td>
                          <td style={{ ...tdC, fontSize: 12, color: "#059669" }}>{e.ofertas_adjudicadas.toLocaleString("es-CL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Top hospitales LBF */}
                <div style={{ ...card, padding: 0, overflow: "auto" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#F0FDF4" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#065F46" }}>
                      Top Clientes LBF por Monto Adjudicado ({competividadAno})
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        <th style={{ ...thC, fontSize: 12 }}>#</th>
                        <th style={{ ...thS, fontSize: 12 }}>Cliente</th>
                        <th style={{ ...thR, fontSize: 12 }}>Adjudicado</th>
                        <th style={{ ...thR, fontSize: 12 }}>Participado</th>
                        <th style={{ ...thC, fontSize: 12 }}>Efectividad</th>
                        <th style={{ ...thC, fontSize: 12 }}>IDs Part.</th>
                        <th style={{ ...thC, fontSize: 12 }}>IDs Adj.</th>
                        <th style={{ ...thC, fontSize: 12 }}>Ofertas Real.</th>
                        <th style={{ ...thC, fontSize: 12 }}>Ofertas Adj.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHosp.map((h: any, i: number) => (
                        <tr key={h.rut || h.cliente} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                          <td style={{ ...tdC, fontWeight: 700, color: i === 0 ? "#D97706" : "#64748B", fontSize: 12 }}>{i + 1}</td>
                          <td style={{ ...td, fontSize: 12, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={h.cliente}>{h.cliente}</td>
                          <td style={{ ...tdR, fontWeight: 600, color: "#059669", fontSize: 12 }}>{fmtAbs(h.total_adjudicado)}</td>
                          <td style={{ ...tdR, color: "#64748B", fontSize: 12 }}>{fmtAbs(h.total_participado)}</td>
                          <td style={{ ...tdC, fontSize: 12 }}>
                            <span style={{
                              color: h.pct_efectividad >= 50 ? "#059669" : h.pct_efectividad >= 30 ? "#D97706" : "#DC2626",
                              fontWeight: 700,
                            }}>{h.pct_efectividad}%</span>
                          </td>
                          <td style={{ ...tdC, fontSize: 12 }}>{h.ids_participadas}</td>
                          <td style={{ ...tdC, fontSize: 12, color: "#059669" }}>{h.ids_adjudicadas}</td>
                          <td style={{ ...tdC, fontSize: 12 }}>{h.ofertas_realizadas.toLocaleString("es-CL")}</td>
                          <td style={{ ...tdC, fontSize: 12, color: "#059669" }}>{h.ofertas_adjudicadas.toLocaleString("es-CL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          {!competividadLoading && competividadData?.error && (
            <div style={{ padding: 20, color: "#EF4444" }}>Error: {competividadData.error}</div>
          )}
        </div>
      )}

      {/* Info box */}
      <div style={{ ...card, background: "#F0F9FF", borderColor: "#BAE6FD" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0369A1", marginBottom: 6 }}>Gestión del gap de facturación</div>
        <ul style={{ fontSize: 12, color: "#0C4A6E", margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li><strong>Vencen en {mesNombre}:</strong> Licitaciones que vencen este mes y no se ha facturado el 100% — cada peso no facturado se pierde al vencer</li>
          <li><strong>KAM responsable:</strong> El gap está asignado por KAM para facilitar la gestión directa</li>
          <li><strong>Detalle:</strong> Haga clic en cualquier licitación para ver los productos adjudicados y facturados</li>
          <li><strong>Cumplimiento {">"}100%:</strong> Estas licitaciones ya no requieren gestión y se excluyen de urgentes</li>
        </ul>
      </div>

      {/* Modal email preview */}
      {emailModal && (
        <EmailPreviewModal
          kam={emailModal.kam}
          lics={emailModal.lics}
          esUrgente={emailModal.urgente}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  );
}
