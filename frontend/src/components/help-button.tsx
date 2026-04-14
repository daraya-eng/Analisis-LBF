"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";
import { HELP } from "@/lib/help-content";

interface HelpButtonProps {
  module: string;
}

export default function HelpButton({ module }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const help = HELP[module];
  if (!help) return null;

  // Close on click outside
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen(!open)}
        title="Ayuda"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: "50%",
          border: "1px solid #E2E8F0", background: open ? "#EFF6FF" : "white",
          cursor: "pointer", color: open ? "#3B82F6" : "#94A3B8",
          transition: "all 0.15s",
        }}
      >
        <HelpCircle size={15} />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "absolute", top: 36, left: 0, zIndex: 50,
            width: 380, maxHeight: 480, overflowY: "auto",
            background: "white", borderRadius: 12,
            border: "1px solid #E2E8F0",
            boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
            padding: "20px 24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>{help.title}</h3>
              <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 0", lineHeight: 1.5 }}>{help.description}</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2 }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
            {help.entries.map((entry, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF" }}>{entry.term}</span>
                <p style={{ fontSize: 12, color: "#475569", margin: "2px 0 0", lineHeight: 1.5 }}>{entry.definition}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
