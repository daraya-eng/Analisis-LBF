"use client";

import { Package } from "lucide-react";

export default function MultiproductoPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Multiproducto</h1>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 28px" }}>Multi-product channel analysis: trends, families, and category breakdown</p>

      <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Package size={24} color="#3B82F6" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", margin: "0 0 8px" }}>Multiproducto Module</h3>
        <p style={{ fontSize: 14, color: "#64748B", maxWidth: 400, margin: "0 auto" }}>
          Monthly KPIs, family trend charts, weekly breakdown, and category analysis.
          Data endpoints are being connected.
        </p>
      </div>
    </div>
  );
}
