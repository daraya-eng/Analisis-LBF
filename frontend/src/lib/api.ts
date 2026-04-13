/**
 * Typed fetch wrapper for the LBF Analytics API.
 * Base URL: http://localhost:8000
 *
 * - Automatically prepends the API base URL
 * - Attaches Authorization: Bearer <token> header from localStorage
 * - Redirects to /login on 401
 * - Throws a typed ApiError on non-2xx responses
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("lbf_token");
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Skip auth header (e.g. for the login endpoint itself) */
  skipAuth?: boolean;
};

/**
 * Core fetch wrapper.
 * Returns the parsed JSON body typed as T.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extraHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Redirect to login on unauthorized
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("lbf_token");
      localStorage.removeItem("lbf_user");
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized — redirecting to login");
  }

  // Parse body regardless (error body may contain details)
  let data: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

/* ─── Client-side cache (SWR pattern) ─────────────────────────────────────── */

const _cache = new Map<string, { ts: number; data: unknown }>();
const _CACHE_TTL = 300_000; // 5 minutes in ms

/** Clear all client-side cached responses (call after refresh). */
export function clearClientCache() {
  _cache.clear();
}

/* ─── Convenience helpers ──────────────────────────────────────────────────── */

export const api = {
  /**
   * GET with client-side cache.
   * Returns cached data instantly if available and fresh (<5min).
   * Set options.noCache = true to bypass.
   */
  async get<T = unknown>(path: string, options?: RequestOptions & { noCache?: boolean }): Promise<T> {
    const { noCache, ...rest } = options ?? {};
    if (!noCache) {
      const entry = _cache.get(path);
      if (entry && Date.now() - entry.ts < _CACHE_TTL) {
        return entry.data as T;
      }
    }
    const data = await apiFetch<T>(path, { method: "GET", ...rest });
    _cache.set(path, { ts: Date.now(), data });
    return data;
  },

  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return apiFetch<T>(path, { method: "POST", body, ...options });
  },

  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return apiFetch<T>(path, { method: "PUT", body, ...options });
  },

  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return apiFetch<T>(path, { method: "PATCH", body, ...options });
  },

  delete<T = unknown>(path: string, options?: RequestOptions) {
    return apiFetch<T>(path, { method: "DELETE", ...options });
  },
};

/* ─── Auth-specific call ───────────────────────────────────────────────────── */

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    username: string;
    display_name: string;
    role: string;
    modules: string[];
  };
}

export async function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/login/json", {
    method: "POST",
    body: payload,
    skipAuth: true,
  });
}
