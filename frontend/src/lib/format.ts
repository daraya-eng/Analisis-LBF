/**
 * Chilean peso (CLP) formatting utilities.
 * Mirrors the Python helpers in ppto_analisis_app.py.
 */

/**
 * Compact currency format:
 *   ≥ 1,000,000,000 → "$3.2MM" (billions as MM)
 *   ≥ 1,000,000     → "$450M"  (millions as M)
 *   otherwise       → "$12,345"
 */
export function fmt(n: number): string {
  if (!isFinite(n)) return "$—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}MM`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return `${sign}$${Math.round(abs).toLocaleString("es-CL")}`;
}

/**
 * Full absolute currency format: "$3,034,174,835"
 */
export function fmtAbs(n: number): string {
  if (!isFinite(n)) return "$—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("es-CL")}`;
}

/**
 * Percentage with one decimal: "88.2%"
 */
export function fmtPct(n: number): string {
  if (!isFinite(n)) return "—%";
  return `${n.toFixed(1)}%`;
}

/**
 * Traffic-light emoji based on budget achievement:
 *   ≥ 80%  → 🟢
 *   ≥ 50%  → 🟡
 *   < 80%  → 🔴
 */
export function semaforo(v: number): string {
  if (v >= 100) return "🟢";
  if (v >= 80) return "🟡";
  return "🔴";
}

/**
 * Returns the traffic-light color class for Tailwind usage.
 */
export function semaforoColor(v: number): "success" | "warning" | "error" {
  if (v >= 100) return "success";
  if (v >= 80) return "warning";
  return "error";
}
