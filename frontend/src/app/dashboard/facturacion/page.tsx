"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api, apiFetch } from "@/lib/api";
import { fmt, fmtAbs, fmtPct } from "@/lib/format";
import { ChevronDown, ChevronRight, MessageSquare, Mail } from "lucide-react";
import HelpButton from "@/components/help-button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, LabelList,
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
function LicDetalle({ licId, notaInicial }: { licId: string; notaInicial?: any }) {
  const [det, setDet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notaText, setNotaText] = useState("");
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState<any>(notaInicial || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/api/facturacion/detalle?licitacion=${encodeURIComponent(licId)}`, { noCache: true })
      .then(r => {
        setDet(r);
        if (r.nota) { setNota(r.nota); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  const adj = det.adjudicados || [];
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
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Productos Adjudicados ({adj.length})</h4>
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
}

/* ─── Tabla de licitaciones con filas expandibles ──────── */
function LicTable({ rows, colCount }: { rows: any[]; colCount: number }) {
  const [sel, setSel] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setSel(prev => prev === id ? null : id), []);

  return (
    <>
      {rows.map((l: any, i: number) => {
        const isOpen = sel === l.licitacion;
        const gap = l.adjudicado - l.facturado;
        return (
          <Fragment key={l.licitacion}>
            <tr
              onClick={() => toggle(l.licitacion)}
              style={{ borderBottom: "1px solid #F1F5F9", background: isOpen ? "#EFF6FF" : rowBg(i), cursor: "pointer" }}
            >
              <td style={tdC}>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {l.nota && <MessageSquare size={11} style={{ color: "#D97706" }} />}
                </div>
              </td>
              <td style={{ ...td, fontSize: 12, fontWeight: 600, color: "#4338CA" }}>{l.kam}</td>
              <td style={{ ...td, fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={l.licitacion}>{l.licitacion}</td>
              <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={l.nombre}>{l.nombre}</td>
              <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(l.adjudicado)}</td>
              <td style={{ ...tdR, color: "#10B981" }}>{fmtAbs(l.facturado)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: "#EF4444" }}>{fmtAbs(gap)}</td>
              <td style={td}><CumplimientoBar pct={l.cumplimiento} w={60} /></td>
              <td style={{ ...tdC, fontSize: 11, fontWeight: l.semaforo === "red" ? 700 : 400, color: l.semaforo === "red" ? "#EF4444" : "#1F2937" }}>{l.fecha_termino}</td>
              <td style={{ ...tdC, fontWeight: 700, color: semColor(l.semaforo) }}>{l.dias_restantes}</td>
            </tr>
            {isOpen && (
              <tr><td colSpan={colCount} style={{ padding: 0 }}>
                <LicDetalle licId={l.licitacion} notaInicial={l.nota} />
              </td></tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

type TabId = "urgentes" | "licitaciones" | "clientes";

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

function buildMailtoLic(kam: string, lics: any[], tab: "urgentes" | "licitaciones") {
  const email = kamToEmail(kam);
  if (!email) return "";

  const hoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
  const esUrgente = tab === "urgentes";
  const subject = esUrgente
    ? `Seguimiento Licitaciones Urgentes - ${kam}`
    : `Seguimiento Licitaciones - ${kam}`;

  // Ordenar por cumplimiento ascendente (más críticas primero)
  const sorted = [...lics].sort((a, b) => a.cumplimiento - b.cumplimiento);

  let body = `Hola ${kam.split(" ")[0]},\n\n`;
  body += esUrgente
    ? `Te comparto el estado de tus licitaciones que vencen este mes y requieren atención:\n\n`
    : `Te comparto el estado actualizado de tus licitaciones al ${hoy}:\n\n`;

  // Resumen
  const totalAdj = sorted.reduce((s, l) => s + (l.adjudicado || 0), 0);
  const totalFac = sorted.reduce((s, l) => s + (l.facturado || 0), 0);
  const totalGap = totalAdj - totalFac;
  const pctGlobal = totalAdj > 0 ? Math.round(totalFac / totalAdj * 100) : 0;
  body += `RESUMEN: ${sorted.length} licitaciones | Adjudicado: $${totalAdj.toLocaleString("es-CL")} | Facturado: $${totalFac.toLocaleString("es-CL")} | Gap: $${totalGap.toLocaleString("es-CL")} | Cumpl: ${pctGlobal}%\n\n`;
  body += `─────────────────────────────────────\n`;

  for (const l of sorted) {
    const gap = (l.adjudicado || 0) - (l.facturado || 0);
    body += `• ${l.licitacion} — ${l.cliente}\n`;
    body += `  Adjudicado: $${(l.adjudicado || 0).toLocaleString("es-CL")} | Facturado: $${(l.facturado || 0).toLocaleString("es-CL")} | Gap: $${gap.toLocaleString("es-CL")} | Cumpl: ${l.cumplimiento}%`;
    if (l.fecha_termino) body += ` | Término: ${l.fecha_termino}`;
    if (l.dias != null) body += ` (${l.dias} días)`;
    body += `\n\n`;
  }

  body += `─────────────────────────────────────\n`;
  body += `Saludos,\nAnálisis Comercial LBF`;

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

  useEffect(() => {
    setLoading(true);
    api.get<any>("/api/facturacion/", { noCache: true })
      .then(r => { setData(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Cargando datos de facturación...</div>;
  if (!data || data.error) return <div style={{ padding: 40, color: "#EF4444" }}>Error: {data?.error || "sin datos"}</div>;

  const k = data.kpis;
  const licitaciones: any[] = data.licitaciones || [];
  const clientes = data.clientes || [];
  const canales = data.canales || [];
  const urgentes = data.urgentes_reales || [];
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

  // Filtrar licitaciones
  const licFiltradas = licitaciones.filter(l => {
    if (filtroKam !== "todos" && l.kam !== filtroKam) return false;
    const p = parseFechaTermino(l.fecha_termino);
    if (!p) return true;
    if (filtroAno !== "todos" && p.year !== parseInt(filtroAno)) return false;
    if (filtroMes !== "todos" && p.month !== parseInt(filtroMes)) return false;
    return true;
  });

  // Filtrar urgentes por KAM
  const urgentesFiltradas = filtroKam !== "todos" ? urgentes.filter((u: any) => u.kam === filtroKam) : urgentes;

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

  const tabs: { id: TabId; label: string; count: number; alert?: boolean }[] = [
    { id: "urgentes", label: `Urgentes ${mesNombre}`, count: urgentes.length, alert: urgentes.length > 0 },
    { id: "licitaciones", label: "Todas las Licitaciones", count: licitaciones.length },
    { id: "clientes", label: "Por Cliente", count: clientes.length },
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
            <button onClick={() => setTab("urgentes")} style={{
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E2E8F0" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, background: "transparent",
            color: tab === t.id ? "#3B82F6" : "#64748B", fontWeight: tab === t.id ? 600 : 400,
            borderBottom: tab === t.id ? "2px solid #3B82F6" : "2px solid transparent", marginBottom: -2,
          }}>
            {t.alert && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />}
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ═══ Tab: Urgentes mes ═══ */}
      {tab === "urgentes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Filtro KAM */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>Filtrar:</span>
            <select value={filtroKam} onChange={e => setFiltroKam(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los KAM</option>
              {kamsDisponibles.map(k2 => <option key={k2} value={k2}>{k2}</option>)}
            </select>
            {filtroKam !== "todos" && (
              <>
                <button onClick={() => setFiltroKam("todos")}
                  style={{ ...selectStyle, color: "#EF4444", borderColor: "#FECACA", cursor: "pointer" }}>
                  Limpiar
                </button>
                {kamToEmail(filtroKam) && (
                  <a href={buildMailtoLic(filtroKam, urgentesFiltradas, "urgentes")}
                    style={{ ...selectStyle, display: "inline-flex", alignItems: "center", gap: 5,
                      color: "#2563EB", borderColor: "#BFDBFE", textDecoration: "none", cursor: "pointer" }}>
                    <Mail size={14} /> Enviar a {filtroKam.split(" ")[0]}
                  </a>
                )}
              </>
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ ...thC, width: 30 }}></th>
                  <th style={thS}>KAM</th>
                  <th style={thS}>Licitación</th>
                  <th style={thS}>Cliente</th>
                  <th style={thR}>Adjudicado</th>
                  <th style={thR}>Facturado</th>
                  <th style={thR}>Gap</th>
                  <th style={thS}>Cumpl.</th>
                  <th style={thC}>Término</th>
                  <th style={thC}>Días</th>
                </tr>
              </thead>
              <tbody>
                <LicTable rows={urgentesFiltradas} colCount={LIC_COLS} />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Tab: Todas las Licitaciones ═══ */}
      {tab === "licitaciones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>Filtrar:</span>
            <select value={filtroKam} onChange={e => setFiltroKam(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los KAM</option>
              {kamsDisponibles.map(k2 => <option key={k2} value={k2}>{k2}</option>)}
            </select>
            <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los años</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los meses</option>
              {meses.map(m => <option key={m} value={m}>{MESES_NOMBRE[m]}</option>)}
            </select>
            {(filtroAno !== "todos" || filtroMes !== "todos" || filtroKam !== "todos") && (
              <button onClick={() => { setFiltroAno("todos"); setFiltroMes("todos"); setFiltroKam("todos"); }}
                style={{ ...selectStyle, color: "#EF4444", borderColor: "#FECACA", cursor: "pointer" }}>
                Limpiar
              </button>
            )}
            {filtroKam !== "todos" && kamToEmail(filtroKam) && (
              <a href={buildMailtoLic(filtroKam, licFiltradas, "licitaciones")}
                style={{ ...selectStyle, display: "inline-flex", alignItems: "center", gap: 5,
                  color: "#2563EB", borderColor: "#BFDBFE", textDecoration: "none", cursor: "pointer" }}>
                <Mail size={14} /> Enviar a {filtroKam.split(" ")[0]}
              </a>
            )}
            <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>
              {licFiltradas.length} de {licitaciones.length} licitaciones
            </span>
          </div>

          <div style={{ ...card, padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ ...thC, width: 30 }}></th>
                  <th style={thS}>KAM</th>
                  <th style={thS}>Licitación</th>
                  <th style={thS}>Cliente</th>
                  <th style={thR}>Adjudicado</th>
                  <th style={thR}>Facturado</th>
                  <th style={thR}>Gap</th>
                  <th style={thS}>Cumpl.</th>
                  <th style={thC}>Término</th>
                  <th style={thC}>Días</th>
                </tr>
              </thead>
              <tbody>
                <LicTable rows={licFiltradas} colCount={LIC_COLS} />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Tab: Por Cliente ═══ */}
      {tab === "clientes" && (
        <div style={{ ...card, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
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
              {clientes.map((c: any, i: number) => (
                <tr key={c.rut} style={{ borderBottom: "1px solid #F1F5F9", background: rowBg(i) }}>
                  <td style={tdC}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 700,
                      color: semColor(c.semaforo), background: semBg(c.semaforo),
                    }}>{c.cumplimiento < 50 ? "Bajo" : c.cumplimiento < 80 ? "Medio" : "Alto"}</span>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: "#4338CA" }}>{c.kam}</td>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={`${c.rut} — ${c.nombre}`}>{c.nombre}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.adjudicado)}</td>
                  <td style={{ ...tdR, color: "#10B981" }}>{fmtAbs(c.facturado)}</td>
                  <td style={td}><CumplimientoBar pct={c.cumplimiento} w={70} /></td>
                  <td style={tdC}>{c.n_licitaciones}</td>
                  <td style={{ ...tdC, fontWeight: 700, color: c.dias_mas_pronto <= 30 ? "#EF4444" : c.dias_mas_pronto <= 90 ? "#F59E0B" : "#10B981" }}>{c.dias_mas_pronto}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
