"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { LoginResponse } from "./api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface AuthUser {
  username: string;
  display_name: string;
  role: string;
  modules: string[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  /** Store token + user after a successful login API call */
  login: (response: LoginResponse) => void;
  /** Clear credentials and redirect to /login */
  logout: () => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const TOKEN_KEY = "lbf_token";
const USER_KEY  = "lbf_user";

function readStorage(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw   = localStorage.getItem(USER_KEY);
    if (!raw) return { token, user: null };
    const parsed = JSON.parse(raw);
    // Ensure modules array exists (backwards compat with old localStorage)
    const user: AuthUser = { ...parsed, modules: parsed.modules ?? [] };
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

/* ─── Context ────────────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [state, setState] = useState<AuthState>({
    user:            null,
    token:           null,
    isLoading:       true,  // true until we've checked localStorage
    isAuthenticated: false,
  });

  /* Hydrate from localStorage on first mount (client-only) */
  useEffect(() => {
    const { token, user } = readStorage();
    setState({
      token,
      user,
      isLoading:       false,
      isAuthenticated: !!token,
    });
  }, []);

  const login = useCallback((response: LoginResponse) => {
    const { access_token, user } = response;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({
      token:           access_token,
      user,
      isLoading:       false,
      isAuthenticated: true,
    });
    router.replace("/dashboard");
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({
      token:           null,
      user:            null,
      isLoading:       false,
      isAuthenticated: false,
    });
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
