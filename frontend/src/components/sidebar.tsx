"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  Building2,
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
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Panel Principal", icon: LayoutDashboard, module: "dashboard" },
  { href: "/dashboard/televentas", label: "Televentas", icon: Phone, module: "televentas" },
  { href: "/dashboard/zona", label: "KAM", icon: Building2, module: "zona" },
  { href: "/dashboard/oportunidades", label: "Oportunidades", icon: Target, module: "zona" },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/dashboard/categoria", label: "Compra Agil", icon: Package, module: "categoria" },
  { href: "/dashboard/facturacion", label: "Adj. vs Facturado", icon: Receipt, module: "facturacion" },
  { href: "/dashboard/mercado-publico", label: "Mercado Publico", icon: TrendingUp, module: "mercado_publico" },
  { href: "/dashboard/stock", label: "Inventario", icon: Warehouse, module: "stock" },
  { href: "/dashboard/ma", label: "M&A Targets", icon: Target, module: "ma" },
  { href: "/dashboard/glosario", label: "Glosario", icon: BookOpen, module: "dashboard" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

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
          padding: collapsed ? "24px 12px 20px" : "24px 20px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #3B82F6, #4F46E5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 14,
            color: "white",
            flexShrink: 0,
          }}
        >
          LBF
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
              Inteligencia Comercial
            </div>
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.8)", whiteSpace: "nowrap" }}>
              Comercial LBF Ltda.
            </div>
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
          return (
            <Link
              key={item.href}
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
                  ? "rgba(59,130,246,0.15)"
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
                    background: "#3B82F6",
                  }}
                />
              )}
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
            </Link>
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
