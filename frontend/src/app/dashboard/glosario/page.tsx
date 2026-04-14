"use client";

import { useState } from "react";
import { BookOpen, Search, ChevronDown, ChevronRight } from "lucide-react";
import { HELP, CATEGORIAS_HELP } from "@/lib/help-content";

const MODULE_ORDER = ["dashboard", "televentas", "zona", "clientes", "categoria", "mercado", "facturacion"];

const MODULE_COLORS: Record<string, string> = {
  dashboard: "#3B82F6",
  televentas: "#8B5CF6",
  zona: "#10B981",
  clientes: "#F59E0B",
  categoria: "#06B6D4",
  mercado: "#EF4444",
  facturacion: "#EC4899",
};

export default function GlosarioPage() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_ORDER.map(m => [m, true]))
  );

  const toggle = (mod: string) => setExpanded(prev => ({ ...prev, [mod]: !prev[mod] }));
  const searchLower = search.toLowerCase();

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
        }}>
          <BookOpen size={20} style={{ color: "white" }} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>Glosario y Ayuda</h1>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Definiciones de cada modulo, metricas y categorias</p>
        </div>
      </div>

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 24, marginTop: 16,
        background: "white", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 16px",
      }}>
        <Search size={16} style={{ color: "#94A3B8" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar termino..."
          style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: "#1F2937", background: "transparent" }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 12 }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Categories quick reference */}
      <div style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>Categorias de Producto</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {CATEGORIAS_HELP.map(cat => {
            const colors: Record<string, string> = { SQ: "#3B82F6", MAH: "#10B981", EQM: "#F59E0B", EVA: "#8B5CF6" };
            return (
              <div key={cat.term} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: 12, borderRadius: 8, background: "#F8FAFC",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: `${colors[cat.term] || "#94A3B8"}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 12, color: colors[cat.term] || "#94A3B8",
                }}>
                  {cat.term}
                </div>
                <p style={{ fontSize: 12, color: "#475569", margin: 0, lineHeight: 1.5 }}>{cat.definition}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modules */}
      {MODULE_ORDER.map(mod => {
        const help = HELP[mod];
        if (!help) return null;
        const color = MODULE_COLORS[mod] || "#64748B";
        const isExpanded = expanded[mod];

        // Filter entries by search
        const filtered = search
          ? help.entries.filter(e =>
              e.term.toLowerCase().includes(searchLower) ||
              e.definition.toLowerCase().includes(searchLower)
            )
          : help.entries;

        if (search && filtered.length === 0) return null;

        return (
          <div key={mod} style={{
            background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
            marginBottom: 12, overflow: "hidden",
          }}>
            <button
              onClick={() => toggle(mod)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "16px 20px", border: "none", background: "transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                width: 4, height: 24, borderRadius: 2, background: color, flexShrink: 0,
              }} />
              {isExpanded ? <ChevronDown size={16} style={{ color: "#64748B" }} /> : <ChevronRight size={16} style={{ color: "#64748B" }} />}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>{help.title}</h3>
                <p style={{ fontSize: 12, color: "#64748B", margin: "2px 0 0" }}>{help.description}</p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, color, background: `${color}15`,
                padding: "3px 10px", borderRadius: 12,
              }}>
                {filtered.length} terminos
              </span>
            </button>

            {isExpanded && (
              <div style={{ padding: "0 20px 16px", borderTop: "1px solid #F1F5F9" }}>
                {filtered.map((entry, i) => (
                  <div key={i} style={{
                    padding: "10px 0",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F8FAFC" : "none",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{entry.term}</span>
                    <p style={{ fontSize: 13, color: "#475569", margin: "3px 0 0", lineHeight: 1.6 }}>
                      {entry.definition}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
