"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Building2,
  Globe2,
  BarChart3,
  Package,
  Users,
  Phone,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Shield,
  BookOpen,
  Warehouse,
  TrendingUp,
  Target,
  ShieldAlert,
  LineChart,
  BookMarked,
  ArrowLeftRight,
  CalendarDays,
  Bandage,
  MapPin,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavChild { href: string; label: string }
interface NavItem {
  href: string; label: string; icon: React.ElementType;
  module: string; children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Panel Principal", icon: LayoutDashboard, module: "dashboard" },
  { href: "/dashboard/televentas", label: "Televentas", icon: Phone, module: "televentas" },
  { href: "/dashboard/zona", label: "KAM", icon: Building2, module: "zona" },
  { href: "/dashboard/pm", label: "PM", icon: CalendarDays, module: "pm" },
  { href: "/dashboard/oportunidades", label: "Oportunidades", icon: Target, module: "zona" },
  {
    href: "/dashboard/clientes", label: "Clientes", icon: Users, module: "clientes",
    children: [
      { href: "/dashboard/clientes/efecto-pv", label: "Efecto P/V" },
    ],
  },
  { href: "/dashboard/categoria", label: "Compra Agil", icon: Package, module: "categoria" },
  { href: "/dashboard/facturacion", label: "Adj. vs Facturado", icon: Receipt, module: "facturacion" },
  { href: "/dashboard/mercado-publico", label: "Mercado Publico", icon: TrendingUp, module: "mercado_publico" },
  { href: "/dashboard/maestro-mp", label: "Maestro Productos MP", icon: BookMarked, module: "mercado_publico" },
  { href: "/dashboard/stock", label: "Inventario", icon: Warehouse, module: "stock" },
  { href: "/dashboard/ma", label: "M&A Targets", icon: Target, module: "ma" },
  { href: "/dashboard/guantes", label: "Monitor Guantes", icon: ShieldAlert, module: "guantes" },
  { href: "/dashboard/e1", label: "Plan de Ventas LBE", icon: LineChart, module: "e1" },
  { href: "/dashboard/incentivos", label: "Incentivos", icon: TrendingUp, module: "incentivos" },
  { href: "/dashboard/renasys", label: "Renasys TPN", icon: Bandage, module: "renasys" },
  { href: "/dashboard/kam-maule", label: "KAM Maule Sur", icon: MapPin, module: "kam_maule" },
  { href: "/dashboard/mercados-relevantes", label: "Gestión de Licitaciones", icon: Globe2, module: "mercados_relevantes" },
  { href: "/dashboard/glosario", label: "Glosario", icon: BookOpen, module: "dashboard" },
];

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface InfoData { fecha_sp: string; fecha_datos: string; dia_datos: string; es_lunes: boolean }

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [info, setInfo] = useState<InfoData | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("lbf_token") || "";
    if (!token) return;
    fetch(`${API}/api/info`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {});
  }, []);

  const isSuperAdmin = user?.role === "superadmin";
  const userModules = isSuperAdmin ? NAV_ITEMS.map((i) => i.module) : (user?.modules ?? []);
  const visibleItems = NAV_ITEMS.filter((item) => userModules.includes(item.module));

  const initials = user?.display_name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "U";

  const cargoLabel = user?.cargo || (isSuperAdmin ? "Administrador" : user?.role === "admin" ? "Admin" : user?.role ?? "");

  return (
    <aside
      className="sidebar"
      style={{
        width: collapsed ? 72 : 260,
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: collapsed ? "18px 10px 16px" : "18px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        {/* Badge LBF azul */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "#3B82F6",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ color: "white", fontWeight: 900, fontSize: 13, letterSpacing: "-0.02em" }}>LBF</span>
        </div>

        {/* Títulos (ocultos cuando colapsado) */}
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Inteligencia Comercial</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>Comercial LBF Ltda.</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const hasChildren = item.children && item.children.length > 0;
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: collapsed ? "10px 0" : "10px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "white" : "rgba(148,163,184,0.85)",
                  background: isActive
                    ? "rgba(232,28,46,0.12)"
                    : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 20,
                      borderRadius: 4,
                      background: "#E81C2E",
                    }}
                  />
                )}
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
              </Link>
              {/* Sub-menu children */}
              {hasChildren && isActive && !collapsed && (
                <div style={{ marginLeft: 16, marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  {item.children!.map((child) => {
                    const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 12px 7px 14px",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: childActive ? 600 : 400,
                          color: childActive ? "white" : "rgba(148,163,184,0.75)",
                          background: childActive ? "rgba(232,28,46,0.10)" : "transparent",
                          textDecoration: "none",
                          transition: "all 0.15s ease",
                          borderLeft: "1px solid rgba(232,28,46,0.30)",
                        }}
                      >
                        <ArrowLeftRight size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                        <span style={{ whiteSpace: "nowrap" }}>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Admin link — only for superadmin */}
        {isSuperAdmin && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 4px" }} />
            <Link
              href="/dashboard/admin"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: pathname === "/dashboard/admin" ? 600 : 400,
                color: pathname === "/dashboard/admin" ? "#F59E0B" : "rgba(251,191,36,0.7)",
                background: pathname === "/dashboard/admin" ? "rgba(245,158,11,0.1)" : "transparent",
                textDecoration: "none",
                transition: "all 0.15s ease",
                position: "relative",
              }}
              title={collapsed ? "Gestionar Usuarios" : undefined}
            >
              {pathname === "/dashboard/admin" && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 20,
                    borderRadius: 4,
                    background: "#F59E0B",
                  }}
                />
              )}
              <Shield size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ whiteSpace: "nowrap" }}>Gestionar Usuarios</span>}
            </Link>
          </>
        )}
      </nav>

      {/* Fechas de datos */}
      {info && (
        <div style={{
          padding: collapsed ? "8px 4px" : "10px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.15)",
        }}>
          {collapsed ? (
            <div title={`Datos al ${info.dia_datos} ${info.fecha_datos}\nBD: ${info.fecha_sp}`}
              style={{ display: "flex", justifyContent: "center", fontSize: 14, cursor: "default" }}>
              🗓
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Datos al
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: info.es_lunes ? "#FBBF24" : "#60A5FA",
                  background: info.es_lunes ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.12)",
                  padding: "1px 7px", borderRadius: 4,
                }}>
                  {info.dia_datos} {info.fecha_datos}
                  {info.es_lunes && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>sem. cerrada</span>}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  BD actualizada
                </span>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.8)", fontVariantNumeric: "tabular-nums" }}>
                  {info.fecha_sp}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom: user + collapse toggle */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* User */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "8px 0" : "8px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: isSuperAdmin ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.2)",
              color: isSuperAdmin ? "#FBBF24" : "#60A5FA",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.display_name}
              </div>
              <div style={{ fontSize: 11, color: isSuperAdmin ? "#FBBF24" : "#64748B", textTransform: "capitalize" }}>
                {cargoLabel}
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "8px 0" : "8px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            width: "100%",
            border: "none",
            background: "transparent",
            color: "rgba(148,163,184,0.7)",
            fontSize: 13,
            cursor: "pointer",
            borderRadius: 8,
            transition: "color 0.15s",
          }}
          title="Cerrar Sesion"
        >
          <LogOut size={16} />
          {!collapsed && <span>Cerrar Sesion</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "8px 0",
            border: "none",
            background: "transparent",
            color: "rgba(148,163,184,0.5)",
            cursor: "pointer",
            borderRadius: 8,
            marginTop: 4,
          }}
          title={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
