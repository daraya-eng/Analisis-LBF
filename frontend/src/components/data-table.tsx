"use client";

import { useState, useMemo } from "react";

interface Column {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  format?: (value: unknown, row: Record<string, unknown>) => string | React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps {
  columns: Column[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowClick?: (row: any, index: number) => void;
  maxHeight?: string;
  emptyMessage?: string;
}

export default function DataTable({
  columns,
  data,
  onRowClick,
  maxHeight = "500px",
  emptyMessage = "No data available",
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
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
  }, [data, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (!data.length) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        overflow: "hidden",
        background: "white",
      }}
    >
      <div style={{ maxHeight, overflowY: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: "#F8FAFC", position: "sticky", top: 0, zIndex: 1 }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{
                    padding: "12px 16px",
                    textAlign: col.align ?? "left",
                    fontWeight: 600,
                    color: "#374151",
                    borderBottom: "1px solid #E2E8F0",
                    cursor: col.sortable !== false ? "pointer" : "default",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    width: col.width,
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: 4, opacity: 0.6 }}>
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row, i)}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  borderBottom: i < sorted.length - 1 ? "1px solid #F1F5F9" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "10px 16px",
                      textAlign: col.align ?? "left",
                      color: "#374151",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.format
                      ? col.format(row[col.key], row)
                      : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
