"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { loginRequest, ApiError } from "@/lib/api";

/* ─── Particle data (deterministic — no Math.random() during render) ─────── */
interface ParticleDef {
  id: number;
  top: string;
  left: string;
  size: string;
  duration: string;
  delay: string;
  opacity: string;
}

const PARTICLES: ParticleDef[] = [
  { id:  1, top:  "8%",  left: "12%", size: "2px",  duration: "2.8s", delay: "0s",    opacity: "0.4"  },
  { id:  2, top: "15%",  left: "55%", size: "3px",  duration: "3.4s", delay: "0.6s",  opacity: "0.3"  },
  { id:  3, top: "30%",  left: "33%", size: "2px",  duration: "3.8s", delay: "0.3s",  opacity: "0.3"  },
  { id:  4, top: "38%",  left: "88%", size: "2px",  duration: "2.9s", delay: "1.8s",  opacity: "0.35" },
  { id:  5, top: "52%",  left: "68%", size: "2px",  duration: "2.6s", delay: "2.1s",  opacity: "0.3"  },
  { id:  6, top: "60%",  left: "44%", size: "3px",  duration: "4.0s", delay: "0.5s",  opacity: "0.25" },
  { id:  7, top: "75%",  left: "25%", size: "2px",  duration: "2.7s", delay: "0.2s",  opacity: "0.35" },
  { id:  8, top: "82%",  left: "60%", size: "2px",  duration: "3.5s", delay: "2.4s",  opacity: "0.3"  },
  { id:  9, top:  "5%",  left: "92%", size: "2px",  duration: "3.7s", delay: "0.8s",  opacity: "0.3"  },
  { id: 10, top: "70%",  left: "50%", size: "2px",  duration: "3.3s", delay: "0.4s",  opacity: "0.35" },
];

/* ─── Floating analytics card configs (deterministic positions) ──────────── */
interface FloatingCard {
  id: string;
  top: string;
  left?: string;
  right?: string;
  animDuration: string;
  animDelay: string;
  type: "bar" | "counter" | "line" | "metric";
}

const FLOATING_CARDS: FloatingCard[] = [
  { id: "bar",     top: "10%",  left: "4%",   animDuration: "6s",   animDelay: "0s",    type: "bar"     },
  { id: "counter", top: "18%",  right: "3%",  animDuration: "7s",   animDelay: "1.2s",  type: "counter" },
  { id: "line",    top: "58%",  left: "3%",   animDuration: "8s",   animDelay: "0.6s",  type: "line"    },
  { id: "metric",  top: "65%",  right: "4%",  animDuration: "6.5s", animDelay: "2s",    type: "metric"  },
];

/* ─── KPI badge configs (deterministic — rendered as static HTML) ─────────── */
interface KpiBadge {
  id: string;
  top: string;
  left?: string;
  right?: string;
  label: string;
  value: string;
  color: string;
  animDelay: string;
}

const KPI_BADGES: KpiBadge[] = [
  { id: "k1", top: "44%",  left:  "5%",  label: "KAMs activos",  value: "32",    color: "#06B6D4", animDelay: "0.8s"  },
  { id: "k2", top: "36%",  right: "4%",  label: "Clientes",      value: "847",   color: "#34D399", animDelay: "1.4s"  },
  { id: "k3", top: "51%",  right: "5%",  label: "Zonas",         value: "5",     color: "#60A5FA", animDelay: "2.0s"  },
  { id: "k5", top: "85%",  right: "5%",  label: "Cumplimiento",  value: "94.2%", color: "#34D399", animDelay: "1.6s"  },
];

/* ─── Data stream tokens (matrix-style, fixed positions) ─────────────────── */
interface StreamToken {
  id: number;
  top: string;
  left: string;
  value: string;
  duration: string;
  delay: string;
  opacity: string;
}

const STREAM_TOKENS: StreamToken[] = [
  { id:  1, top:  "6%",  left: "16%", value: "$2.4MM",  duration: "4.2s", delay: "0s",    opacity: "0.22" },
  { id:  2, top: "14%",  left: "70%", value: "94.2%",   duration: "3.8s", delay: "0.7s",  opacity: "0.18" },
  { id:  3, top: "26%",  left: "24%", value: "+12%",    duration: "5.0s", delay: "1.5s",  opacity: "0.20" },
  { id:  4, top: "54%",  left: "12%", value: "$847K",   duration: "3.6s", delay: "2.1s",  opacity: "0.18" },
  { id:  5, top: "72%",  left: "37%", value: "+8.3%",   duration: "4.1s", delay: "0.5s",  opacity: "0.18" },
  { id:  6, top: "92%",  left: "63%", value: "$1.9MM",  duration: "3.9s", delay: "2.5s",  opacity: "0.16" },
];

/* ─── Status indicators (mission control style) ──────────────────────────── */
const STATUS_ITEMS = [
  { label: "SISTEMA OPERATIVO", color: "#34D399" },
  { label: "BD CONECTADA",      color: "#34D399" },
  { label: "DATOS SINCRONIZADOS",color: "#34D399" },
];

/* ─── SVG Icons ──────────────────────────────────────────────────────────── */

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEye({ off = false }: { off?: boolean }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconAlertCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/* ─── LBF Logo SVG ───────────────────────────────────────────────────────── */
function LBFLogo() {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="LBF Analytics logo"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="55%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="logo-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.1" />
        </linearGradient>
        <filter id="logo-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#3B82F6" floodOpacity="0.5" />
        </filter>
      </defs>
      <rect x="1" y="1" width="50" height="50" rx="13" fill="url(#logo-glow)" stroke="rgba(59,130,246,0.35)" strokeWidth="1" />
      <path d="M10 13 L10 36 L20 36 L20 32 L14 32 L14 13 Z" fill="url(#logo-grad)" filter="url(#logo-shadow)" />
      <path d="M22 13 L22 36 L30 36 C33.5 36 36 33.8 36 30.5 C36 28.4 34.9 26.8 33.2 26 C34.5 25.2 35.2 23.8 35.2 22 C35.2 18.8 33 13 29 13 Z M26 17 L28.5 17 C30.2 17 31.2 18.2 31.2 20 C31.2 21.8 30.2 23 28.5 23 L26 23 Z M26 27 L29 27 C30.8 27 32 28.3 32 30.2 C32 32.1 30.8 33 29 33 L26 33 Z" fill="url(#logo-grad)" filter="url(#logo-shadow)" />
      <path d="M38 13 L38 36 L42 36 L42 27 L47 27 L47 23 L42 23 L42 17 L48 17 L48 13 Z" fill="url(#logo-grad)" filter="url(#logo-shadow)" />
      <rect x="35" y="40" width="3" height="5"  rx="1" fill="rgba(96,165,250,0.55)" />
      <rect x="39" y="37" width="3" height="8"  rx="1" fill="rgba(59,130,246,0.75)" />
      <rect x="43" y="34" width="3" height="11" rx="1" fill="rgba(79,70,229,0.85)" />
    </svg>
  );
}

/* ─── Feature pill SVG icons ─────────────────────────────────────────────── */
function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconTrendUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const FEATURES = [
  { icon: <IconChart />,   label: "Análisis de ventas en tiempo real"   },
  { icon: <IconTarget />,  label: "Presupuesto vs. ejecución real"       },
  { icon: <IconTrendUp />, label: "Métricas de desempeño KAM"            },
  { icon: <IconDollar />,  label: "Inteligencia de precios"              },
  { icon: <IconUsers />,   label: "Seguimiento de clientes"              },
];

/* ─── Floating analytics mini-cards ──────────────────────────────────────── */

function CardBarChart() {
  const bars = [55, 72, 48, 88, 65];
  return (
    <div style={{ width: 120, padding: "10px 12px 8px" }}>
      <div style={{ fontSize: 9, color: "rgba(147,197,253,0.7)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
        Ventas Mes
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 36 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: "2px 2px 0 0",
              background: i === 3
                ? "linear-gradient(180deg, #60A5FA, #3B82F6)"
                : "rgba(59,130,246,0.35)",
              animation: `bar-grow 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms both`,
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        </svg>
        <span style={{ fontSize: 9, color: "#34D399", fontWeight: 600 }}>+8.3% vs mes ant.</span>
      </div>
    </div>
  );
}

function CardCounter() {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const target = 94.2;
    const duration = 1800;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(parseFloat((target * eased).toFixed(1)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 600);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div style={{ width: 120, padding: "10px 12px 8px" }}>
      <div style={{ fontSize: 9, color: "rgba(147,197,253,0.7)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
        Cumplimiento
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: "#ffffff", letterSpacing: "-0.02em" }}>
        {val.toFixed(1)}
        <span style={{ fontSize: 14, fontWeight: 600, color: "#60A5FA", marginLeft: 1 }}>%</span>
      </div>
      <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "rgba(59,130,246,0.18)" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 4,
            background: "linear-gradient(90deg, #3B82F6, #6366F1)",
            width: `${val}%`,
            transition: "width 0.05s linear",
          }}
        />
      </div>
      <div style={{ marginTop: 5, fontSize: 9, color: "rgba(147,197,253,0.55)" }}>
        Meta PPTO 2026
      </div>
    </div>
  );
}

function CardLineChart() {
  return (
    <div style={{ width: 130, padding: "10px 12px 8px" }}>
      <div style={{ fontSize: 9, color: "rgba(147,197,253,0.7)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
        Tendencia
      </div>
      <svg width="106" height="32" viewBox="0 0 106 32" fill="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="line-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <path
          d="M0 28 C18 28 20 22 26 18 C32 14 36 20 44 14 C52 8 56 16 64 10 C72 4 78 12 86 8 C94 4 100 6 106 4 L106 32 L0 32 Z"
          fill="url(#line-fill)"
        />
        <path
          d="M0 28 C18 28 20 22 26 18 C32 14 36 20 44 14 C52 8 56 16 64 10 C72 4 78 12 86 8 C94 4 100 6 106 4"
          stroke="url(#line-stroke)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            strokeDasharray: 220,
            strokeDashoffset: 220,
            animation: "draw-line 1.4s cubic-bezier(0.16,1,0.3,1) 0.8s forwards",
          }}
        />
        <circle cx="106" cy="4" r="3" fill="#6366F1" style={{ opacity: 0, animation: "fade-dot 0.3s ease 2.1s forwards" }} />
      </svg>
      <div style={{ marginTop: 4, fontSize: 9, color: "rgba(147,197,253,0.55)" }}>
        Ene → Abr 2026
      </div>
    </div>
  );
}

function CardMetric() {
  return (
    <div style={{ width: 120, padding: "10px 12px 8px" }}>
      <div style={{ fontSize: 9, color: "rgba(147,197,253,0.7)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
        Crecimiento
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#34D399", letterSpacing: "-0.02em", lineHeight: 1 }}>
          +12.5
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>%</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 9, color: "rgba(147,197,253,0.55)", lineHeight: 1.4 }}>
        vs. mismo período<br />año anterior
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 3 }}>
        {[40, 55, 48, 70, 62, 80].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: h * 0.3,
              borderRadius: 2,
              background: "rgba(52,211,153,0.4)",
              animation: `bar-grow 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FloatingCardContent({ type }: { type: FloatingCard["type"] }) {
  switch (type) {
    case "bar":     return <CardBarChart />;
    case "counter": return <CardCounter />;
    case "line":    return <CardLineChart />;
    case "metric":  return <CardMetric />;
  }
}

/* ─── Sonar / radar canvas overlay ──────────────────────────────────────── */
function useSonarCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    let raf: number;
    let sweepAngle = 0;

    function draw(ts: number) {
      if (!ctx || !canvas) return;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      ctx.clearRect(0, 0, W, H);

      /* Centre of sonar — lower-left quadrant so it doesn't compete with hero content */
      const cx = W * 0.22;
      const cy = H * 0.78;
      const maxR = Math.min(W, H) * 0.38;

      /* Concentric rings */
      for (let ring = 1; ring <= 4; ring++) {
        const r = (maxR / 4) * ring;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.10 - ring * 0.015})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      /* Crosshair lines through center */
      ctx.beginPath();
      ctx.moveTo(cx - maxR - 8, cy);
      ctx.lineTo(cx + maxR + 8, cy);
      ctx.strokeStyle = "rgba(6,182,212,0.09)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - maxR - 8);
      ctx.lineTo(cx, cy + maxR + 8);
      ctx.strokeStyle = "rgba(6,182,212,0.09)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      /* Rotating sweep */
      sweepAngle = (ts / 1000) * 0.5; // full rotation every ~12.5s
      const sweepLen = Math.PI * 0.55; // ~100 deg sweep arc fading out

      /* Draw sweep as a filled arc with gradient opacity — use multiple thin arcs */
      const STEPS = 32;
      for (let s = 0; s < STEPS; s++) {
        const fraction = s / STEPS;
        const alpha = (1 - fraction) * 0.18;
        const startA = sweepAngle - sweepLen * fraction;
        const endA   = sweepAngle - sweepLen * (fraction - 1 / STEPS);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, startA, endA);
        ctx.closePath();
        ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`;
        ctx.fill();
      }

      /* Leading edge bright line */
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(sweepAngle) * (maxR + 4),
        cy + Math.sin(sweepAngle) * (maxR + 4),
      );
      ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      /* Blip dots — fixed positions relative to center */
      const blips = [
        { dx: 0.45, dy: -0.30, r: 2.2 },
        { dx: -0.20, dy: 0.55, r: 1.8 },
        { dx: 0.68, dy: 0.20,  r: 1.5 },
        { dx: -0.55, dy: -0.15, r: 2.0 },
      ];
      for (const b of blips) {
        const bx = cx + b.dx * maxR;
        const by = cy + b.dy * maxR;
        /* Fade blip in when sweep passes over it */
        const blipAngle = Math.atan2(b.dy, b.dx);
        const diff = ((sweepAngle - blipAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const blipAlpha = diff < sweepLen ? (1 - diff / sweepLen) * 0.85 : 0.12;
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6, 182, 212, ${blipAlpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [canvasRef]);
}

/* ─── Neural Network Canvas ──────────────────────────────────────────────── */
function useNeuralCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvas);

    const NODE_COUNT = 26;

    interface Node {
      x: number; y: number;
      vx: number; vy: number;
      radius: number;
      pulsePhase: number;
      pulseSpeed: number;
    }

    interface DataParticle {
      fromIdx: number;
      toIdx: number;
      progress: number;
      speed: number;
      trailLength: number;
    }

    function logicalW() { return canvas ? canvas.offsetWidth  : 0; }
    function logicalH() { return canvas ? canvas.offsetHeight : 0; }

    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * logicalW(),
      y: Math.random() * logicalH(),
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      radius: 2.5 + Math.random() * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.6 + Math.random() * 0.8,
    }));

    const CONNECT_DIST = 160;

    function getEdges(): Array<[number, number]> {
      const edges: Array<[number, number]> = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < CONNECT_DIST) {
            edges.push([i, j]);
          }
        }
      }
      return edges;
    }

    const MAX_PARTICLES = 14;
    const particles: DataParticle[] = [];

    function spawnParticle() {
      const edges = getEdges();
      if (edges.length === 0) return;
      const [fromIdx, toIdx] = edges[Math.floor(Math.random() * edges.length)];
      particles.push({
        fromIdx: Math.random() > 0.5 ? fromIdx : toIdx,
        toIdx:   Math.random() > 0.5 ? toIdx   : fromIdx,
        progress: 0,
        speed: 0.004 + Math.random() * 0.006,
        trailLength: 0.12 + Math.random() * 0.1,
      });
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      spawnParticle();
      particles[i].progress = Math.random();
    }

    let raf: number;
    let lastTime = 0;

    function draw(timestamp: number) {
      if (!ctx || !canvas) return;
      const dt = Math.min(timestamp - lastTime, 50);
      lastTime = timestamp;

      const W = logicalW();
      const H = logicalH();

      ctx.clearRect(0, 0, W, H);

      for (const n of nodes) {
        n.x += n.vx * (dt / 16);
        n.y += n.vy * (dt / 16);
        if (n.x < 0)  { n.x = 0;  n.vx *= -1; }
        if (n.x > W)  { n.x = W;  n.vx *= -1; }
        if (n.y < 0)  { n.y = 0;  n.vy *= -1; }
        if (n.y > H)  { n.y = H;  n.vy *= -1; }
        n.pulsePhase += n.pulseSpeed * (dt / 1000);
      }

      const t = timestamp / 1000;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.22;
            const shimmer = 0.85 + 0.15 * Math.sin(t * 1.2 + i * 0.7 + j * 0.5);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${alpha * shimmer})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        p.progress += p.speed * (dt / 16);
        if (p.progress >= 1) {
          p.progress = 0;
          const edges = getEdges();
          if (edges.length > 0) {
            const [fi, ti] = edges[Math.floor(Math.random() * edges.length)];
            p.fromIdx = Math.random() > 0.5 ? fi : ti;
            p.toIdx   = Math.random() > 0.5 ? ti : fi;
          }
        }

        const from = nodes[p.fromIdx];
        const to   = nodes[p.toIdx];
        if (!from || !to) continue;

        const px = from.x + (to.x - from.x) * p.progress;
        const py = from.y + (to.y - from.y) * p.progress;

        const TRAIL_STEPS = 8;
        for (let s = TRAIL_STEPS; s >= 0; s--) {
          const trailProgress = Math.max(0, p.progress - (p.trailLength * s / TRAIL_STEPS));
          const tx = from.x + (to.x - from.x) * trailProgress;
          const ty = from.y + (to.y - from.y) * trailProgress;
          const trailAlpha = (1 - s / TRAIL_STEPS) * 0.5;
          const trailR = 1.2 * (1 - s / TRAIL_STEPS);

          ctx.beginPath();
          ctx.arc(tx, ty, trailR, 0, Math.PI * 2);
          const useIndigo = (p.fromIdx + p.toIdx) % 2 === 0;
          ctx.fillStyle = useIndigo
            ? `rgba(99, 102, 241, ${trailAlpha})`
            : `rgba(96, 165, 250, ${trailAlpha})`;
          ctx.fill();
        }

        const grad = ctx.createRadialGradient(px, py, 0, px, py, 5);
        grad.addColorStop(0, "rgba(147, 197, 253, 0.9)");
        grad.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fill();
      }

      for (const n of nodes) {
        const pulse = 0.55 + 0.45 * Math.sin(n.pulsePhase);

        const glowGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 5);
        glowGrad.addColorStop(0, `rgba(59, 130, 246, ${0.18 * pulse})`);
        glowGrad.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 5, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        const bodyGrad = ctx.createRadialGradient(n.x - n.radius * 0.3, n.y - n.radius * 0.3, 0, n.x, n.y, n.radius);
        bodyGrad.addColorStop(0, `rgba(147, 197, 253, ${0.85 * pulse})`);
        bodyGrad.addColorStop(1, `rgba(59, 130, 246, ${0.65 * pulse})`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * pulse})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
    };
  }, [canvasRef]);
}

/* ─── Corner bracket decorative element ─────────────────────────────────── */
function CornerBracket({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const size = 20;
  const strokeW = 1.5;
  const color = "rgba(6,182,212,0.45)";

  const paths: Record<string, string> = {
    tl: `M${size} 0 L0 0 L0 ${size}`,
    tr: `M0 0 L${size} 0 L${size} ${size}`,
    bl: `M0 0 L0 ${size} L${size} ${size}`,
    br: `M0 0 L${size} 0 L${size} ${size}`,  // mirror via transform
  };

  const styles: Record<string, React.CSSProperties> = {
    tl: { top: 20, left: 20 },
    tr: { top: 20, right: 20 },
    bl: { bottom: 20, left: 20 },
    br: { bottom: 20, right: 20 },
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      style={{ position: "absolute", zIndex: 12, ...styles[position] }}
    >
      <path
        d={position === "br" ? `M${size} 0 L${size} ${size} L0 ${size}` : paths[position]}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="square"
      />
    </svg>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const router = useRouter();

  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [shakeKey,   setShakeKey]   = useState(0);

  const usernameRef = useRef<HTMLInputElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const sonarRef    = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  useNeuralCanvas(canvasRef);
  useSonarCanvas(sonarRef);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await loginRequest({ username: username.trim(), password });
      login(response);
    } catch (err) {
      let message = "Usuario o contraseña incorrectos.";
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          message = "Usuario o contraseña incorrectos.";
        } else if (err.status >= 500) {
          message = "Error del servidor. Intenta nuevamente.";
        } else {
          message = err.message || message;
        }
      } else if (err instanceof TypeError) {
        message = "No se puede conectar al servidor. Verifica tu conexión.";
      }
      setError(message);
      setShakeKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div
      className="login-page-wrapper"
      style={{ minHeight: "100dvh", display: "flex", fontFamily: "var(--font-inter, var(--font-sans))" }}
    >
      {/* ── Left hero panel (60%) ────────────────────────────────────────── */}
      <div
        className="hero-panel"
        style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "64px 56px", position: "relative" }}
        aria-hidden="true"
      >
        {/* Layer 0: Neural network canvas */}
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, opacity: 0.85 }}
        />

        {/* Layer 0b: Sonar canvas (renders on top of neural but below HUD overlays) */}
        <canvas
          ref={sonarRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, opacity: 0.6, pointerEvents: "none" }}
        />

        {/* Layer 1: Existing ambient layers */}
        <div className="hero-grid"     style={{ zIndex: 2, opacity: 0.28 }} />
        <div className="hero-vignette" style={{ zIndex: 3 }} />
        <div className="orb orb-1"    style={{ zIndex: 1 }} />
        <div className="orb orb-2"    style={{ zIndex: 1 }} />
        <div className="orb orb-3"    style={{ zIndex: 1 }} />
        <div className="scan-line"    style={{ zIndex: 4 }} />

        {/* Hexagonal grid overlay (CSS, subtle HUD feel) */}
        <div className="hex-overlay" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }} />

        {/* Corner bracket decorations */}
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />

        {/* Monospace readout — top-right corner */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 44,
            zIndex: 12,
            textAlign: "right",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            fontSize: "0.62rem",
            lineHeight: 1.7,
            color: "rgba(6,182,212,0.5)",
            letterSpacing: "0.06em",
            animation: "fade-in-slow 2s ease 1s both",
          }}
        >
          <div>SYS:LBF-BI-CORE</div>
          <div>REL:v2.0-ARTEMIS</div>
          <div>LAT:33°27&apos;S</div>
          <div>LON:70°40&apos;W</div>
        </div>

        {/* Monospace readout — bottom-right corner */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 44,
            zIndex: 12,
            textAlign: "right",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            fontSize: "0.60rem",
            lineHeight: 1.7,
            color: "rgba(6,182,212,0.38)",
            letterSpacing: "0.06em",
            animation: "fade-in-slow 2s ease 1.4s both",
          }}
        >
          <div>NODE:847</div>
          <div>PKT:14/14</div>
          <div>SIG:STRONG</div>
        </div>

        {/* Particles */}
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              opacity: 0,
              zIndex: 5,
              ["--duration" as string]: p.duration,
              ["--delay"    as string]: p.delay,
              animationDelay: p.delay,
            }}
          />
        ))}

        {/* Data stream tokens (matrix numbers, subtle) */}
        {STREAM_TOKENS.map((tok) => (
          <div
            key={tok.id}
            style={{
              position: "absolute",
              top: tok.top,
              left: tok.left,
              zIndex: 5,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "0.58rem",
              fontWeight: 600,
              color: `rgba(96,165,250,${tok.opacity})`,
              letterSpacing: "0.04em",
              pointerEvents: "none",
              animation: `stream-fade ${tok.duration} ease-in-out ${tok.delay} infinite`,
              whiteSpace: "nowrap",
            }}
          >
            {tok.value}
          </div>
        ))}

        {/* Layer 2: Floating analytics cards */}
        {FLOATING_CARDS.map((card) => (
          <div
            key={card.id}
            style={{
              position: "absolute",
              top: card.top,
              ...(card.left  ? { left:  card.left  } : {}),
              ...(card.right ? { right: card.right } : {}),
              zIndex: 8,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(59,130,246,0.08) inset",
              animation: `float-card ${card.animDuration} ease-in-out ${card.animDelay} infinite`,
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            <FloatingCardContent type={card.type} />
          </div>
        ))}

        {/* KPI mini-badges */}
        {KPI_BADGES.map((badge) => (
          <div
            key={badge.id}
            style={{
              position: "absolute",
              top: badge.top,
              ...(badge.left  ? { left:  badge.left  } : {}),
              ...(badge.right ? { right: badge.right } : {}),
              zIndex: 9,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              background: "rgba(15,23,42,0.72)",
              border: `1px solid ${badge.color}33`,
              borderRadius: 8,
              padding: "5px 10px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              boxShadow: `0 0 12px ${badge.color}18`,
              opacity: 0,
              animation: `badge-appear 0.5s ease ${badge.animDelay} forwards`,
              pointerEvents: "none",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: badge.color, flexShrink: 0, boxShadow: `0 0 6px ${badge.color}` }} />
            <span style={{ fontFamily: "var(--font-inter, var(--font-sans))", fontSize: "0.65rem", color: "rgba(203,213,225,0.85)", fontWeight: 500, letterSpacing: "0.02em" }}>
              {badge.label}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: badge.color, fontWeight: 700 }}>
              {badge.value}
            </span>
          </div>
        ))}

        {/* Layer 3: Main hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            maxWidth: 400,
            width: "100%",
          }}
        >
          {/* Status badge */}
          <div className="hero-badge animate-badge-pop">
            <span className="hero-badge-dot" />
            <span>Sistema Activo — Plataforma BI</span>
          </div>

          {/* Logo + title block */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div className="animate-fade-in-up" style={{ filter: "drop-shadow(0 0 16px rgba(59,130,246,0.45))" }}>
              <LBFLogo />
            </div>

            <div className="hero-divider" style={{ margin: "4px auto 0", maxWidth: 120 }} />

            {/* Main title — large and prominent */}
            <div
              className="animate-fade-in-up delay-100"
              style={{
                fontSize: "clamp(1.4rem, 2.8vw, 1.85rem)",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.97)",
                marginTop: 8,
                textAlign: "center",
                lineHeight: 1.15,
              }}
            >
              Análisis<br />Comercial LBF
            </div>

            <div className="hero-divider" style={{ margin: "4px auto 0", maxWidth: 180 }} />

            <div
              className="animate-fade-in-up delay-200"
              style={{
                fontSize: "0.82rem",
                fontWeight: 400,
                color: "rgba(147, 197, 253, 0.65)",
                letterSpacing: "0.05em",
              }}
            >
              Plataforma de Inteligencia de Negocios
            </div>
          </div>

          {/* Status indicators — mission control style */}
          <div
            className="animate-fade-in-up delay-300"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              width: "100%",
              maxWidth: 280,
              padding: "14px 16px",
              background: "rgba(6,182,212,0.05)",
              border: "1px solid rgba(6,182,212,0.15)",
              borderRadius: 8,
              backdropFilter: "blur(8px)",
            }}
          >
            {STATUS_ITEMS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: s.color,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${s.color}`,
                    animation: `pulse-dot 2s ease-in-out ${i * 0.3}s infinite`,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: "0.60rem",
                    color: "rgba(203,213,225,0.75)",
                    letterSpacing: "0.08em",
                    fontWeight: 500,
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.label}
                className={`hero-feature animate-fade-in-up delay-${(i + 4) * 100}`}
              >
                <div className="hero-feature-icon" style={{ color: "#60A5FA" }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: "0.845rem", fontWeight: 500, color: "rgba(203, 213, 225, 0.88)" }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-left brand + version */}
        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: 40,
            zIndex: 12,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "rgba(100,116,139,0.85)", fontWeight: 500 }}>
            Comercial LBF Limitada
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "0.58rem",
              color: "rgba(6,182,212,0.45)",
              letterSpacing: "0.06em",
            }}
          >
            v2.0 | ARTEMIS
          </div>
        </div>
      </div>

      {/* ── Right login card (40%) ────────────────────────────────────────── */}
      <div
        className="login-card"
        style={{
          flex: "0 0 40%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "48px 40px",
          background: "#ffffff",
        }}
      >
        <div className="animate-slide-in-right" style={{ width: "100%", maxWidth: 380 }}>
          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            {/* Mobile brand (hidden on desktop via CSS) */}
            <div className="mobile-brand" style={{ display: "none", marginBottom: 24 }}>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #0F172A 0%, #3B82F6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "-0.02em",
                }}
              >
                LBF
              </div>
            </div>

            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#0F172A",
                letterSpacing: "-0.02em",
                margin: "0 0 6px",
              }}
            >
              Iniciar Sesión
            </h1>
            <p style={{ fontSize: "0.925rem", color: "#64748B", margin: 0, fontWeight: 400 }}>
              Ingresa tus credenciales para acceder.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#374151", marginBottom: 6 }}
                >
                  Usuario
                </label>
                <div className="input-wrapper">
                  <span className="input-icon"><IconUser /></span>
                  <input
                    ref={usernameRef}
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    disabled={submitting}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="tu.usuario"
                    className="login-input"
                    aria-label="Usuario"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#374151", marginBottom: 6 }}
                >
                  Contraseña
                </label>
                <div className="input-wrapper">
                  <span className="input-icon"><IconLock /></span>
                  <input
                    id="password"
                    name="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="login-input login-input-password"
                    aria-label="Contraseña"
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    tabIndex={0}
                  >
                    <IconEye off={showPwd} />
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  key={shakeKey}
                  className="error-alert animate-shake"
                  role="alert"
                  aria-live="polite"
                >
                  <IconAlertCircle />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                className="btn-signin"
                style={{ marginTop: 4 }}
              >
                <span className="btn-signin-inner">
                  {submitting && <span className="spinner-ring animate-spin-ring" />}
                  {submitting ? "Iniciando sesión\u2026" : "Iniciar Sesión"}
                </span>
              </button>

            </div>
          </form>

          {/* Brand marquee */}
          <div
            style={{
              marginTop: 36,
              paddingTop: 20,
              borderTop: "1px solid #F1F5F9",
            }}
          >
            <p style={{ fontSize: "0.68rem", color: "#94A3B8", margin: "0 0 12px", textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Nuestras Marcas
            </p>
            <div
              style={{
                overflow: "hidden",
                position: "relative",
                width: "100%",
                maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
                WebkitMaskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
              }}
            >
              <div className="brand-marquee" style={{ display: "flex", alignItems: "center", gap: 28, whiteSpace: "nowrap", width: "max-content" }}>
                {/* Duplicate set for seamless loop */}
                {[0, 1].map((set) => (
                  <div key={set} style={{ display: "flex", alignItems: "center", gap: 28, flexShrink: 0 }}>
                    {[
                      { name: "Smith+Nephew", weight: 700, color: "#005EB8" },
                      { name: "Vernacare", weight: 600, color: "#2E7D32" },
                      { name: "Serres", weight: 600, color: "#E53935", style: "italic" as const },
                      { name: "CathSafe", weight: 700, color: "#0097A7" },
                      { name: "MATSUI", weight: 800, color: "#37474F", spacing: "0.12em" },
                      { name: "smartmed", weight: 600, color: "#00838F" },
                      { name: "ABENA", weight: 800, color: "#1565C0", spacing: "0.15em" },
                      { name: "R5", weight: 900, color: "#4CAF50" },
                      { name: "HALYARD", weight: 800, color: "#283593", spacing: "0.14em" },
                    ].map((brand) => (
                      <span
                        key={`${set}-${brand.name}`}
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: brand.weight,
                          color: brand.color,
                          letterSpacing: brand.spacing ?? "0.01em",
                          fontStyle: brand.style ?? "normal",
                          opacity: 0.7,
                          flexShrink: 0,
                          userSelect: "none",
                        }}
                      >
                        {brand.name}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #F1F5F9",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "0.8rem", color: "#94A3B8", margin: 0 }}>
              Comercial LBF Limitada &copy; {new Date().getFullYear()}
            </p>
            <p style={{ fontSize: "0.75rem", color: "#CBD5E1", margin: "4px 0 0" }}>
              Acceso interno — personal autorizado
            </p>
          </div>
        </div>
      </div>

      {/* ── Animation keyframes + responsive styles ───────────────────────── */}
      <style>{`
        /* ── Floating card drift ── */
        @keyframes float-card {
          0%   { transform: translateY(0px);   opacity: 1; }
          50%  { transform: translateY(-10px); opacity: 1; }
          100% { transform: translateY(0px);   opacity: 1; }
        }

        /* ── Mini bar chart grow ── */
        @keyframes bar-grow {
          from { transform: scaleY(0); transform-origin: bottom; }
          to   { transform: scaleY(1); transform-origin: bottom; }
        }

        /* ── SVG line draw ── */
        @keyframes draw-line {
          to { stroke-dashoffset: 0; }
        }

        /* ── Endpoint dot fade ── */
        @keyframes fade-dot {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── KPI badge appear ── */
        @keyframes badge-appear {
          from { opacity: 0; transform: scale(0.88) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }

        /* ── Data stream token pulse ── */
        @keyframes stream-fade {
          0%   { opacity: 0;    transform: translateY(0);  }
          15%  { opacity: 1;    transform: translateY(0);  }
          75%  { opacity: 1;    transform: translateY(-6px); }
          100% { opacity: 0;    transform: translateY(-10px); }
        }

        /* ── Status dot pulse ── */
        @keyframes pulse-dot {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.6; transform: scale(0.85); }
        }

        /* ── Slow fade-in for corner readouts ── */
        @keyframes fade-in-slow {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Hexagonal HUD overlay — SVG data URI ── */
        .hex-overlay {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 52,14 52,34 28,46 4,34 4,14' fill='none' stroke='rgba(6%2C182%2C212%2C0.06)' stroke-width='0.8'/%3E%3C/svg%3E");
          background-size: 56px 48px;
          opacity: 0.9;
        }

        /* ── Responsive: mobile stacks vertically ── */
        @media (max-width: 768px) {
          .login-page-wrapper {
            flex-direction: column;
          }
          div[style*="flex: 0 0 60%"] {
            flex: 0 0 auto !important;
            width: 100% !important;
            min-height: 280px;
            padding: 40px 24px !important;
          }
          div[style*="flex: 0 0 40%"] {
            flex: 1 !important;
            width: 100% !important;
            padding: 40px 24px !important;
          }
          .hero-lbf {
            font-size: 3.5rem !important;
          }
          .mobile-brand {
            display: block !important;
          }
          /* Hide floating cards and badges on small screens */
          div[style*="float-card"],
          div[style*="badge-appear"],
          div[style*="stream-fade"] {
            display: none !important;
          }
        }

        /* ── Brand marquee scroll ── */
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .brand-marquee {
          animation: marquee-scroll 25s linear infinite;
        }
        .brand-marquee:hover {
          animation-play-state: paused;
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
