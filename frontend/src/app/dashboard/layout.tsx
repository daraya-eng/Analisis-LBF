"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/sidebar";

/** Map URL path segments to module IDs */
const PATH_TO_MODULE: Record<string, string> = {
  televentas: "televentas",
  zona: "zona",
  oportunidades: "zona",
  clientes: "clientes",
  categoria: "categoria",
  mercado: "mercado",
  facturacion: "facturacion",
  stock: "stock",
  "mercado-publico": "mercado_publico",
  ma: "ma",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(260);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Module-based route protection
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    // Superadmin has access to everything
    if (user.role === "superadmin") return;
    // Admin page is superadmin only
    if (pathname === "/dashboard/admin") {
      router.replace("/dashboard");
      return;
    }
    // Check module access for sub-pages
    const segments = pathname.split("/").filter(Boolean);
    // /dashboard/zona → segments = ["dashboard", "zona"]
    const pageSegment = segments[1]; // first segment after "dashboard"
    if (pageSegment && pageSegment !== "admin") {
      const requiredModule = PATH_TO_MODULE[pageSegment];
      if (requiredModule && !user.modules?.includes(requiredModule)) {
        router.replace("/dashboard");
      }
    }
  }, [pathname, user, isLoading, isAuthenticated, router]);

  // Observe sidebar width changes
  useEffect(() => {
    const sidebar = document.querySelector(".sidebar") as HTMLElement | null;
    if (!sidebar) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSidebarWidth(entry.contentRect.width);
      }
    });
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F8FAFC",
        }}
      >
        <div className="spinner-ring animate-spin-ring" style={{ width: 28, height: 28, borderWidth: 3, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }} />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8FAFC" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: sidebarWidth,
          transition: "margin-left 0.2s ease",
          padding: "32px 32px 48px",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {children}
      </main>
    </div>
  );
}
