"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Search, X, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

/* ─── SearchInput ──────────────────────────────────────────────────── */

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}

export function SearchInput({ value, onChange, placeholder = "Buscar...", width = 260 }: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        position: "relative",
        width,
      }}
    >
      <Search
        size={14}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "#94A3B8",
          pointerEvents: "none",
        }}
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "7px 30px 7px 32px",
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          fontSize: 13,
          color: "#1F2937",
          outline: "none",
          background: "white",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
      />
      {value && (
        <button
          onClick={() => { onChange(""); ref.current?.focus(); }}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            padding: 2,
            cursor: "pointer",
            color: "#94A3B8",
            display: "flex",
            alignItems: "center",
          }}
          title="Limpiar"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ─── AmountFilter ─────────────────────────────────────────────────── */

interface AmountFilterProps {
  label?: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  onClear: () => void;
}

export function AmountFilter({
  label = "Filtrar monto",
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  onClear,
}: AmountFilterProps) {
  const hasFilter = minValue !== "" || maxValue !== "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Filter size={14} style={{ color: hasFilter ? "#3B82F6" : "#94A3B8", flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>{label}:</span>
      <input
        type="text"
        value={minValue}
        onChange={(e) => onMinChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="Mín"
        style={{
          width: 90,
          padding: "5px 8px",
          borderRadius: 6,
          border: "1px solid #E2E8F0",
          fontSize: 12,
          color: "#1F2937",
          outline: "none",
          textAlign: "right",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
      />
      <span style={{ fontSize: 12, color: "#94A3B8" }}>—</span>
      <input
        type="text"
        value={maxValue}
        onChange={(e) => onMaxChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="Máx"
        style={{
          width: 90,
          padding: "5px 8px",
          borderRadius: 6,
          border: "1px solid #E2E8F0",
          fontSize: 12,
          color: "#1F2937",
          outline: "none",
          textAlign: "right",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#93C5FD"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
      />
      {hasFilter && (
        <button
          onClick={onClear}
          style={{
            background: "none",
            border: "none",
            padding: 2,
            cursor: "pointer",
            color: "#94A3B8",
            display: "flex",
            alignItems: "center",
          }}
          title="Limpiar filtro"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ─── ExportButton ─────────────────────────────────────────────────── */

interface ExportColumn {
  key: string;
  label: string;
}

interface ExportButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  columns: ExportColumn[];
  filename?: string;
  label?: string;
}

export function ExportButton({ data, columns, filename = "export", label = "Excel" }: ExportButtonProps) {
  const handleExport = useCallback(() => {
    if (!data.length) return;

    // Build CSV content (tab-separated for Excel compatibility)
    const header = columns.map((c) => c.label).join("\t");
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = row[c.key];
          if (val == null) return "";
          // Strip $ and format symbols for numeric export
          if (typeof val === "number") return String(val);
          return String(val).replace(/\t/g, " ");
        })
        .join("\t")
    );
    const content = [header, ...rows].join("\n");

    // Add BOM for Excel UTF-8 recognition
    const blob = new Blob(["\uFEFF" + content], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, columns, filename]);

  return (
    <button
      onClick={handleExport}
      disabled={!data.length}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 8,
        border: "1px solid #E2E8F0",
        background: "white",
        fontSize: 12,
        fontWeight: 600,
        color: data.length ? "#374151" : "#CBD5E1",
        cursor: data.length ? "pointer" : "not-allowed",
        transition: "all 0.15s",
      }}
      title="Exportar a Excel"
    >
      <Download size={13} />
      {label}
    </button>
  );
}

/* ─── SortIndicator (for inline tables) ────────────────────────────── */

interface SortIndicatorProps {
  column: string;
  currentSort: string | null;
  currentDir: "asc" | "desc";
  onSort: (column: string) => void;
  label: string;
  align?: "left" | "right" | "center";
  style?: React.CSSProperties;
}

export function SortableHeader({ column, currentSort, currentDir, onSort, label, align = "left", style }: SortIndicatorProps) {
  const isActive = currentSort === column;
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: "10px 14px",
        textAlign: align,
        fontWeight: 600,
        color: isActive ? "#1E40AF" : "#374151",
        fontSize: 12,
        borderBottom: "2px solid #E2E8F0",
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        ...style,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {isActive ? (
          currentDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
        )}
      </span>
    </th>
  );
}

/* ─── TableToolbar — combines search + filter + export ─────────────── */

interface TableToolbarProps {
  children?: React.ReactNode;
}

export function TableToolbar({ children }: TableToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid #E2E8F0",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}

/* ─── useTableControls hook — manages search/sort/filter state ─────── */

interface UseTableControlsOptions {
  searchKeys?: string[];
  defaultSortKey?: string | null;
  defaultSortDir?: "asc" | "desc";
  amountKey?: string;
}

export function useTableControls<T extends Record<string, unknown>>(
  data: T[],
  options: UseTableControlsOptions = {}
) {
  const { searchKeys = [], defaultSortKey = null, defaultSortDir = "desc", amountKey } = options;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const clearAmountFilter = useCallback(() => {
    setAmountMin("");
    setAmountMax("");
  }, []);

  const filtered = useMemo(() => {
    let result = data;

    // Text search
    if (search.trim() && searchKeys.length > 0) {
      const lower = search.toLowerCase().trim();
      result = result.filter((row) =>
        searchKeys.some((key) => {
          const val = row[key];
          if (val == null) return false;
          return String(val).toLowerCase().includes(lower);
        })
      );
    }

    // Amount filter
    if (amountKey && (amountMin || amountMax)) {
      const min = amountMin ? Number(amountMin) : -Infinity;
      const max = amountMax ? Number(amountMax) : Infinity;
      result = result.filter((row) => {
        const val = Number(row[amountKey]) || 0;
        return val >= min && val <= max;
      });
    }

    // Sort
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [data, search, searchKeys, sortKey, sortDir, amountKey, amountMin, amountMax]);

  return {
    search, setSearch,
    sortKey, sortDir, handleSort,
    amountMin, setAmountMin, amountMax, setAmountMax, clearAmountFilter,
    filtered,
    resultCount: filtered.length,
    totalCount: data.length,
  };
}
