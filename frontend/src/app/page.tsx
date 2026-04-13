"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Root page: redirects to /dashboard if authenticated, /login otherwise.
 * Waits for the auth hydration check to complete before redirecting.
 */
export default function RootPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Blank screen while hydrating — avoids flash
  return null;
}
