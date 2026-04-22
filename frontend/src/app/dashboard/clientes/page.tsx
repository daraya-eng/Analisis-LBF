"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { api, clearClientCache } from "@/lib/api";
import { fmtAbs, fmtPct, fmt } from "@/lib/format";
import { RefreshCw, ChevronDown, ChevronRight, TrendingDown, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SearchInput, AmountFilter, ExportButton, TableToolbar } from "@/components/table-tools";
import HelpButton from "@/components/help-button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";

/* ─── Types ──────────────────────────────────────────── */

interface SegKpi {
  venta_26: number;
  venta_25: number;
  crec: number;
  n_clientes: number;
  efecto_precio: number;
  efecto_volumen: number;
  diff: number;
}

interface CatRow {
  categoria: string;
  venta_26: number;
  contrib_26: number;
  margen: number;
  pct: number;
}

interface ClienteRow {
  rut: string;
  nombre: string;
  segmento: string;
  venta_26: number;
  venta_25: number;
  diff: number;
  crec: number;
  precio_25: number;
  precio_26: number;
  cant_25: number;
  cant_26: number;
}

interface DetalleData {
  efecto_precio: number;
  efecto_volumen: number;
  vol_ambos: number;
  vol_perdidos: number;
  vol_nuevos: number;
  productos: ProdDetail[];
  productos_perdidos: ProdLost[];
  productos_nuevos: ProdNew[];
}

interface ProdDetail {
  codigo: string;
  descripcion: string;
  venta_26: number;
  venta_25: number;
  precio_26: number;
  precio_25: number;
  efecto_precio: number;
  efecto_volumen: number;
}

interface ProdLost {
  codigo: string;
  descripcion: string;
  venta_25: number;
}

interface ProdNew {
  codigo: string;
  descripcion: string;
  venta_26: number;
}

interface ClientesData {
  kpis_segmento: Record<string, SegKpi>;
  categorias: CatRow[];
  perdedores: ClienteRow[];
  ganadores: ClienteRow[];
  label: string;
  error?: string;
}

/* ─── Options ────────────────────────────────────────── */

const PERIOD_OPTIONS = [
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "mes-1", label: "Ene" },
  { value: "mes-2", label: "Feb" },
  { value: "mes-3", label: "Mar" },
  { value: "mes-4", label: "Abr" },
  { value: "mes-5", label: "May" },
  { value: "mes-6", label: "Jun" },
  { value: "mes-7", label: "Jul" },
  { value: "mes-8", label: "Ago" },
  { value: "mes-9", label: "Sep" },
  { value: "mes-10", label: "Oct" },
  { value: "mes-11", label: "Nov" },
  { value: "mes-12", label: "Dic" },
];

const SEG_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PUBLICO", label: "Publico" },
  { value: "PRIVADO", label: "Privado" },
  { value: "Sin Segmento", label: "Sin Segmento" },
];

const CAT_COLORS: Record<string, string> = {
  SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6",
};

/* ─── Styles ─────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  color: "#374151", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap",
};
const thR: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", color: "#1F2937", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/* ─── SegCard ────────────────────────────────────────── */

function SegCard({ title, data, color, icon }: { title: string; data: SegKpi; color: string; icon: string }) {
  const crecColor = data.crec >= 0 ? "#10B981" : "#EF4444";
  return (
    <div style={{ flex: "1 1 280px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div style={{ height: 4, background: color }} />
      <div style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>{icon} {title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Venta 2026</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{fmtAbs(data.venta_26)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Venta 2025</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>{fmtAbs(data.venta_25)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>Crec.</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: crecColor }}>{data.crec >= 0 ? "+" : ""}{fmtPct(data.crec)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>{data.n_clientes} clientes activos</div>
      </div>
    </div>
  );
}

/* ─── Bar label ──────────────────────────────────────── */

// Colors per series: positive green shades, negative red shades
const CHART_COLORS = {
  efecto_precio:    { pos: "#10B981", neg: "#EF4444" },
  efecto_volumen:   { pos: "#059669", neg: "#DC2626" },
  sin_comparacion:  { pos: "#34D399", neg: "#F87171" },
};

function ValLabel(props: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (value == null || value === 0) return null;
  const isNeg = value < 0;
  const absH = Math.abs(height);
  const cx = x + width / 2;
  const label = `${isNeg ? "" : "+"}${fmt(value)}`;

  // Inside bar — white text centered. y + height/2 works for both pos/neg height sign.
  if (absH > 38) {
    const cy = y + height / 2;
    return (
      <text x={cx} y={cy} fill="white" textAnchor="middle"
        fontSize={10} fontWeight={800} dominantBaseline="middle">
        {label}
      </text>
    );
  }

  // Outside bar — pill with colored background so it's visible over white
  const bgColor = isNeg ? "#EF4444" : "#059669";
  // For negative bars: recharts may give height<0 (y=bottom) or height>0 (y=top of downward bar)
  // Place label below the bar bottom in either case
  const labelY = isNeg
    ? (height < 0 ? y + 18 : y + absH + 18)
    : y - 8;
  const charW = 7;
  const pillW = label.length * charW + 8;
  const pillH = 16;
  return (
    <g>
      <rect
        x={cx - pillW / 2} y={labelY - pillH + 4}
        width={pillW} height={pillH}
        rx={4} fill={bgColor} opacity={0.9}
      />
      <text x={cx} y={labelY - 2} fill="white" textAnchor="middle"
        fontSize={10} fontWeight={700} dominantBaseline="middle">
        {label}
      </text>
    </g>
  );
}

/* ─── ClientDetail (expandable) ──────────────────────── */

function ClientDetail({ rut, period }: { rut: string; period: string }) {
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let q = `rut=${encodeURIComponent(rut)}&periodo=${period}`;
    if (period.startsWith("mes-")) {
      q = `rut=${encodeURIComponent(rut)}&periodo=mes&mes=${period.split("-")[1]}`;
    }
    api.get<DetalleData>(`/api/clientes/detalle?${q}`)
      .then(res => setDetalle(res))
      .catch(() => setDetalle(null))
      .finally(() => setLoading(false));
  }, [rut, period]);

  if (loading) return <div style={{ padding: 16, textAlign: "center", color: "#64748B", fontSize: 12 }}>Cargando analisis...</div>;
  if (!detalle) return <div style={{ padding: 12, color: "#94A3B8", fontSize: 12 }}>Sin datos</div>;

  const cc = (v: number) => v >= 0 ? "#10B981" : "#EF4444";
  const sign = (v: number) => v >= 0 ? "+" : "";

  // Compute portfolio totals directly from arrays (robust, no cache issue)
  const totalPerdidos = detalle.productos_perdidos.reduce((s, p) => s + p.venta_25, 0);
  const totalNuevos   = detalle.productos_nuevos.reduce((s, p) => s + p.venta_26, 0);

  // vol_ambos = total volume effect minus portfolio effects
  const volAmbos = detalle.efecto_volumen + totalPerdidos - totalNuevos;

  const total = detalle.efecto_precio + detalle.efecto_volumen;

  // Sort ambos by biggest combined impact
  const prodSorted = [...detalle.productos].sort(
    (a, b) => Math.abs(b.efecto_precio + b.efecto_volumen) - Math.abs(a.efecto_precio + a.efecto_volumen)
  );

  const thU  = { ...thStyle, fontSize: 10, padding: "4px 8px" } as React.CSSProperties;
  const thUR = { ...thR,     fontSize: 10, padding: "4px 8px" } as React.CSSProperties;
  const tdP  = { padding: "3px 8px" } as React.CSSProperties;
  const tdPR = { ...tdR, padding: "3px 8px" } as React.CSSProperties;

  const KpiCard = ({ label, value, sub, accent }: { label: string; value: number; sub: string; accent?: string }) => {
    const col = accent ?? cc(value);
    const bg  = value >= 0 ? (accent ? "#FFF7ED" : "#ECFDF5") : "#FEF2F2";
    return (
      <div style={{ padding: "8px 14px", background: bg, borderRadius: 8, flex: "1 1 0", minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: col }}>{sign(value)}{fmtAbs(value)}</div>
        <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>{sub}</div>
      </div>
    );
  };

  return (
    <div style={{ padding: "12px 0" }}>

      {/* ── 4 KPI cards ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <KpiCard label="Ef. Precio"   value={detalle.efecto_precio} sub={`${detalle.productos.length} prods. en ambos años`} />
        <KpiCard label="Ef. Volumen"  value={volAmbos}              sub={`${detalle.productos.length} prods. en ambos años`} />
        {totalPerdidos > 0 && (
          <div style={{ padding: "8px 14px", background: "#FEF2F2", borderRadius: 8, flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>
              Dejados ({detalle.productos_perdidos.length})
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#DC2626" }}>-{fmtAbs(totalPerdidos)}</div>
            <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>sin venta en 2026</div>
          </div>
        )}
        {totalNuevos > 0 && (
          <div style={{ padding: "8px 14px", background: "#ECFDF5", borderRadius: 8, flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>
              Nuevos ({detalle.productos_nuevos.length})
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>+{fmtAbs(totalNuevos)}</div>
            <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>sin historial en 2025</div>
          </div>
        )}
        <div style={{ padding: "8px 14px", background: total >= 0 ? "#EFF6FF" : "#FEF2F2", borderRadius: 8, flex: "1 1 0", minWidth: 0, borderLeft: `3px solid ${total >= 0 ? "#3B82F6" : "#EF4444"}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Variación Total</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: cc(total) }}>{sign(total)}{fmtAbs(total)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>precio + volumen</div>
        </div>
      </div>

      {/* ── Tabla limpia: solo productos en ambos periodos ── */}
      {prodSorted.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, paddingLeft: 2 }}>
            Análisis Precio / Volumen — {prodSorted.length} productos en ambos años
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={thU}>Producto</th>
                  <th style={thUR}>Venta 25</th>
                  <th style={thUR}>Venta 26</th>
                  <th style={thUR}>P.Unit 25</th>
                  <th style={thUR}>P.Unit 26</th>
                  <th style={thUR}>Ef. Precio</th>
                  <th style={thUR}>Ef. Volumen</th>
                </tr>
              </thead>
              <tbody>
                {prodSorted.map((p, i) => (
                  <tr key={p.codigo} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                    <td style={{ ...tdP, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, marginRight: 4, fontSize: 10, color: "#94A3B8" }}>{p.codigo}</span>
                      {p.descripcion}
                    </td>
                    <td style={tdPR}>{fmtAbs(p.venta_25)}</td>
                    <td style={{ ...tdPR, fontWeight: 600 }}>{fmtAbs(p.venta_26)}</td>
                    <td style={tdPR}>{fmtAbs(p.precio_25)}</td>
                    <td style={tdPR}>{fmtAbs(p.precio_26)}</td>
                    <td style={{ ...tdPR, fontWeight: 700, color: cc(p.efecto_precio) }}>{sign(p.efecto_precio)}{fmtAbs(p.efecto_precio)}</td>
                    <td style={{ ...tdPR, fontWeight: 700, color: cc(p.efecto_volumen) }}>{sign(p.efecto_volumen)}{fmtAbs(p.efecto_volumen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Paneles de portafolio: dejados | nuevos ── */}
      {(detalle.productos_perdidos.length > 0 || detalle.productos_nuevos.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: detalle.productos_perdidos.length > 0 && detalle.productos_nuevos.length > 0 ? "1fr 1fr" : "1fr", gap: 10 }}>

          {/* Panel dejados */}
          {detalle.productos_perdidos.length > 0 && (
            <div style={{ border: "1px solid #FCA5A5", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#FEF2F2", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>
                  Dejados de vender ({detalle.productos_perdidos.length})
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#DC2626" }}>-{fmtAbs(totalPerdidos)}</span>
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {detalle.productos_perdidos.map((p, i) => (
                  <div key={p.codigo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 10px", borderTop: i > 0 ? "1px solid #FEE2E2" : undefined, background: i % 2 === 0 ? "white" : "#FFFBFB", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {p.descripcion}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", whiteSpace: "nowrap" }}>-{fmtAbs(p.venta_25)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Panel nuevos */}
          {detalle.productos_nuevos.length > 0 && (
            <div style={{ border: "1px solid #6EE7B7", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#ECFDF5", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669" }}>
                  Productos nuevos ({detalle.productos_nuevos.length})
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#059669" }}>+{fmtAbs(totalNuevos)}</span>
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {detalle.productos_nuevos.map((p, i) => (
                  <div key={p.codigo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 10px", borderTop: i > 0 ? "1px solid #D1FAE5" : undefined, background: i % 2 === 0 ? "white" : "#F0FDF4", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {p.descripcion}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>+{fmtAbs(p.venta_26)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/* ─── Client Table ───────────────────────────────────── */

function ClientTable({ title, icon, clientes, period, expandedRut, onToggle, segFilter }: {
  title: string;
  icon: React.ReactNode;
  clientes: ClienteRow[];
  period: string;
  expandedRut: string | null;
  onToggle: (rut: string) => void;
  segFilter: string;
}) {
  const segFiltered = segFilter ? clientes.filter(c => c.segmento === segFilter) : clientes;

  // Search + sort + amount filter
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>("diff");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }, [sortKey]);

  const filtered = useMemo(() => {
    let result = segFiltered;

    // Text search
    if (search.trim()) {
      const lower = search.toLowerCase().trim();
      result = result.filter(c =>
        (c.nombre || "").toLowerCase().includes(lower) ||
        c.rut.toLowerCase().includes(lower)
      );
    }

    // Amount filter on venta_26
    if (amtMin || amtMax) {
      const min = amtMin ? Number(amtMin) : -Infinity;
      const max = amtMax ? Number(amtMax) : Infinity;
      result = result.filter(c => c.venta_26 >= min && c.venta_26 <= max);
    }

    // Sort
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortKey];
        const vb = (b as unknown as Record<string, unknown>)[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [segFiltered, search, sortKey, sortDir, amtMin, amtMax]);

  const totalDiff = filtered.reduce((s, c) => s + c.diff, 0);

  const exportCols = [
    { key: "rut", label: "RUT" }, { key: "nombre", label: "Cliente" }, { key: "segmento", label: "Segmento" },
    { key: "venta_25", label: "Venta 2025" }, { key: "venta_26", label: "Venta 2026" },
    { key: "diff", label: "Diferencia" }, { key: "crec", label: "Crec %" },
    { key: "precio_25", label: "Precio 25" }, { key: "precio_26", label: "Precio 26" },
    { key: "cant_25", label: "Cant 25" }, { key: "cant_26", label: "Cant 26" },
  ];

  // Sortable header helper
  const SH = ({ col, label, align }: { col: string; label: string; align?: "left" | "right" }) => {
    const isActive = sortKey === col;
    return (
      <th onClick={() => handleSort(col)} style={{
        ...align === "right" ? thR : thStyle, fontSize: 11,
        cursor: "pointer", userSelect: "none",
        color: isActive ? "#1E40AF" : "#374151",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {label}
          {isActive ? (sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={9} style={{ opacity: 0.3 }} />}
        </span>
      </th>
    );
  };

  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            {title}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginLeft: 8 }}>
              {filtered.length}{filtered.length !== segFiltered.length ? ` de ${segFiltered.length}` : ""} clientes
            </span>
          </h3>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: totalDiff >= 0 ? "#10B981" : "#EF4444" }}>
          Total: {totalDiff >= 0 ? "+" : ""}{fmtAbs(totalDiff)}
        </span>
      </div>

      {/* Toolbar: search + amount filter + export */}
      <TableToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o RUT..." width={220} />
        <AmountFilter
          label="Venta 2026"
          minValue={amtMin}
          maxValue={amtMax}
          onMinChange={setAmtMin}
          onMaxChange={setAmtMax}
          onClear={() => { setAmtMin(""); setAmtMax(""); }}
        />
        <div style={{ flex: 1 }} />
        <ExportButton data={filtered} columns={exportCols} filename={`clientes_${title.includes("Perdida") ? "perdida" : "ganancia"}`} />
      </TableToolbar>

      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, width: 28, fontSize: 11 }}></th>
              <SH col="nombre" label="Cliente" />
              <th style={{ ...thStyle, fontSize: 11 }}>Seg.</th>
              <SH col="venta_25" label="Venta 2025" align="right" />
              <SH col="venta_26" label="Venta 2026" align="right" />
              <SH col="diff" label="Diferencia" align="right" />
              <SH col="crec" label="Crec." align="right" />
              <SH col="precio_25" label="Precio 25" align="right" />
              <SH col="precio_26" label="Precio 26" align="right" />
              <SH col="cant_25" label="Cant 25" align="right" />
              <SH col="cant_26" label="Cant 26" align="right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const isExpanded = expandedRut === c.rut;
              const crecCol = c.crec >= 0 ? "#10B981" : "#EF4444";
              const diffCol = c.diff >= 0 ? "#10B981" : "#EF4444";
              const segColor = c.segmento === "PUBLICO" ? "#3B82F6" : c.segmento === "PRIVADO" ? "#10B981" : "#94A3B8";
              const rows = [];
              rows.push(
                <tr
                  key={c.rut}
                  onClick={() => onToggle(c.rut)}
                  style={{
                    borderBottom: "1px solid #F1F5F9",
                    background: isExpanded ? "#F0F9FF" : i % 2 === 0 ? "white" : "#FAFBFD",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                >
                  <td style={{ ...tdStyle, width: 28, paddingRight: 0, color: "#94A3B8" }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.nombre || c.rut}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: segColor, padding: "2px 6px", borderRadius: 4, background: segColor + "15" }}>
                      {c.segmento === "Sin Segmento" ? "—" : c.segmento.slice(0, 4)}
                    </span>
                  </td>
                  <td style={tdR}>{fmtAbs(c.venta_25)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtAbs(c.venta_26)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: diffCol }}>{c.diff >= 0 ? "+" : ""}{fmtAbs(c.diff)}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: crecCol }}>{c.crec >= 0 ? "+" : ""}{fmtPct(c.crec)}</td>
                  <td style={tdR}>{fmtAbs(c.precio_25)}</td>
                  <td style={tdR}>{fmtAbs(c.precio_26)}</td>
                  <td style={tdR}>{c.cant_25.toLocaleString()}</td>
                  <td style={tdR}>{c.cant_26.toLocaleString()}</td>
                </tr>
              );
              if (isExpanded) {
                rows.push(
                  <tr key={`${c.rut}-detail`}>
                    <td colSpan={11} style={{ padding: "0 20px 8px 48px", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                      <ClientDetail rut={c.rut} period={period} />
                    </td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function ClientesPage() {
  const [data, setData] = useState<ClientesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(`mes-${new Date().getMonth() + 1}`);
  const [segFilter, setSegFilter] = useState("");
  const [expandedLoss, setExpandedLoss] = useState<string | null>(null);
  const [expandedGain, setExpandedGain] = useState<string | null>(null);

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    try {
      let q = `?periodo=${p}`;
      if (p.startsWith("mes-")) q = `?periodo=mes&mes=${p.split("-")[1]}`;
      const res = await api.get<ClientesData>(`/api/clientes/${q}`);
      setData(res);
    } catch (e) {
      console.error("Failed to load clientes", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period); }, [fetchData, period]);

  const handlePeriod = useCallback((val: string) => {
    setPeriod(val);
    setExpandedLoss(null);
    setExpandedGain(null);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  if (!data || data.error) {
    return <div style={{ padding: 40, color: "#EF4444" }}>Error al cargar datos{data?.error ? `: ${data.error}` : ""}</div>;
  }

  const pub = data.kpis_segmento?.PUBLICO ?? { venta_26: 0, venta_25: 0, crec: 0, n_clientes: 0, efecto_precio: 0, efecto_volumen: 0, diff: 0 };
  const priv = data.kpis_segmento?.PRIVADO ?? { venta_26: 0, venta_25: 0, crec: 0, n_clientes: 0, efecto_precio: 0, efecto_volumen: 0, diff: 0 };

  // Chart data: 3 additive components that sum to diff
  // cartera = net effect of clients that entered or left (not in P/V decomposition)
  const chartData = [
    {
      segmento: "Publico",
      efecto_precio: pub.efecto_precio,
      efecto_volumen: pub.efecto_volumen,
      sin_comparacion: pub.diff - pub.efecto_precio - pub.efecto_volumen,
    },
    {
      segmento: "Privado",
      efecto_precio: priv.efecto_precio,
      efecto_volumen: priv.efecto_volumen,
      sin_comparacion: priv.diff - priv.efecto_precio - priv.efecto_volumen,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Analisis de Clientes y Precios</h1>
            <HelpButton module="clientes" />
          </div>
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            Venta 2026 (SQ/MAH/EQM/EVA) vs Venta total 2025 — Impacto precio/volumen
          </p>
        </div>
        <button onClick={() => { clearClientCache(); api.post("/api/refresh").catch(() => {}); fetchData(period); }} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0",
          background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
        }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Filters: Period + Segment */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, marginBottom: 16,
        padding: "12px 20px", background: "white", borderRadius: 10, border: "1px solid #E2E8F0",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Periodo:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PERIOD_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => handlePeriod(opt.value)} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: period === opt.value ? "2px solid #3B82F6" : "1px solid #E2E8F0",
                background: period === opt.value ? "#EFF6FF" : "white",
                color: period === opt.value ? "#2563EB" : "#64748B",
                cursor: "pointer",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Segmento:</span>
          <div style={{ display: "flex", gap: 4 }}>
            {SEG_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setSegFilter(opt.value)} style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: segFilter === opt.value ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
                background: segFilter === opt.value ? "#F5F3FF" : "white",
                color: segFilter === opt.value ? "#7C3AED" : "#64748B",
                cursor: "pointer",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>{data.label}</span>
      </div>

      {/* Segment KPIs + Category + Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <SegCard title="Clientes Publicos" data={pub} color="#3B82F6" icon="🏛" />
        <SegCard title="Clientes Privados" data={priv} color="#10B981" icon="🏢" />

        {/* Category distribution 2026 */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ height: 4, background: "#8B5CF6" }} />
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>Venta 2026 por Categoria</div>
            {(data.categorias ?? []).map((c) => (
              <div key={c.categoria} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[c.categoria] || "#94A3B8" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{c.categoria}</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{fmtAbs(c.venta_26)}</span>
                  <span style={{ fontSize: 11, color: "#64748B", minWidth: 36, textAlign: "right" }}>{c.pct}%</span>
                  <span style={{ fontSize: 11, color: c.margen >= 40 ? "#059669" : c.margen >= 30 ? "#D97706" : "#DC2626", fontWeight: 600, minWidth: 40, textAlign: "right" }}>
                    M:{c.margen}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Chart: Efecto Precio vs Volumen by Segment ═══ */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Variación de Venta — Descomposición por Segmento
          </h3>
          <div style={{ display: "flex", gap: 16 }}>
            {(["PUBLICO", "PRIVADO"] as const).map(seg => {
              const d = seg === "PUBLICO" ? pub : priv;
              return (
                <div key={seg} style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 11, color: "#64748B" }}>{seg === "PUBLICO" ? "Público" : "Privado"} total: </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: d.diff >= 0 ? "#059669" : "#DC2626" }}>
                    {d.diff >= 0 ? "+" : ""}{fmt(d.diff)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Explicación */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: "#475569", margin: 0, lineHeight: 1.6 }}>
            <strong>Ef. Precio:</strong> cuánto subió o bajó la venta por cambios en el precio unitario (mismos productos, mismo volumen).<br />
            <strong>Ef. Volumen:</strong> cuánto cambió la venta por vender más o menos unidades (a precio constante 2025).<br />
            <strong>Sin comparación:</strong> clientes que compraron solo en 2025 o solo en 2026 — no tienen año base para calcular precio/volumen. Su venta se suma o resta directamente a la variación total.
          </p>
        </div>
        {/* Custom legend */}
        <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
          {([
            { key: "efecto_precio",   label: "Ef. Precio" },
            { key: "efecto_volumen",  label: "Ef. Volumen" },
            { key: "sin_comparacion", label: "Sin comparación" },
          ] as const).map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 3 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: CHART_COLORS[key].pos }} />
                <div style={{ width: 14, height: 14, borderRadius: 3, background: CHART_COLORS[key].neg }} />
              </div>
              <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: "#94A3B8", alignSelf: "center" }}>Verde = positivo · Rojo = negativo</span>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="segmento" tick={{ fontSize: 13, fontWeight: 600 }} />
            <YAxis
              tickFormatter={(v) => {
                const abs = Math.abs(Number(v));
                if (abs >= 1e9) return `${(Number(v) / 1e9).toFixed(1)}MM`;
                if (abs >= 1e6) return `${(Number(v) / 1e6).toFixed(0)}M`;
                return String(v);
              }}
              tick={{ fontSize: 11 }}
              width={70}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => {
                const n = Number(v);
                const sign = n >= 0 ? "+" : "-";
                return [`${sign}${fmtAbs(Math.abs(n))}`, name];
              }}
              contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid #E2E8F0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            />
            <Bar dataKey="efecto_precio" name="Ef. Precio" fill={CHART_COLORS.efecto_precio.pos} radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.efecto_precio >= 0 ? CHART_COLORS.efecto_precio.pos : CHART_COLORS.efecto_precio.neg} />
              ))}
              <LabelList dataKey="efecto_precio" content={<ValLabel />} />
            </Bar>
            <Bar dataKey="efecto_volumen" name="Ef. Volumen" fill={CHART_COLORS.efecto_volumen.pos} radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.efecto_volumen >= 0 ? CHART_COLORS.efecto_volumen.pos : CHART_COLORS.efecto_volumen.neg} />
              ))}
              <LabelList dataKey="efecto_volumen" content={<ValLabel />} />
            </Bar>
            <Bar dataKey="sin_comparacion" name="Sin comparación" fill={CHART_COLORS.sin_comparacion.pos} radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.sin_comparacion >= 0 ? CHART_COLORS.sin_comparacion.pos : CHART_COLORS.sin_comparacion.neg} />
              ))}
              <LabelList dataKey="sin_comparacion" content={<ValLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ Clientes con Perdida ═══ */}
      <ClientTable
        title="Clientes con Perdida de Venta"
        icon={<TrendingDown size={18} color="#EF4444" />}
        clientes={data.perdedores}
        period={period}
        expandedRut={expandedLoss}
        onToggle={(rut) => setExpandedLoss(expandedLoss === rut ? null : rut)}
        segFilter={segFilter}
      />

      {/* ═══ Clientes con Ganancia ═══ */}
      <ClientTable
        title="Clientes con Ganancia de Venta"
        icon={<TrendingUp size={18} color="#10B981" />}
        clientes={data.ganadores}
        period={period}
        expandedRut={expandedGain}
        onToggle={(rut) => setExpandedGain(expandedGain === rut ? null : rut)}
        segFilter={segFilter}
      />
    </div>
  );
}
