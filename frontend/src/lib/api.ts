import { storage } from "@/src/utils/storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const SESSION_KEY = "auth.session_token";

if (!BACKEND_URL) {
  throw new Error("EXPO_PUBLIC_BACKEND_URL belum diset");
}

export const API_BASE = `${BACKEND_URL}/api`;

export async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(SESSION_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(SESSION_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(SESSION_KEY);
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
};

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let url = `${API_BASE}${path}`;
  if (opts.query) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function buildExportUrl(
  kind: "excel" | "pdf",
  from: { year: number; month: number },
  to: { year: number; month: number },
  token: string,
): string {
  const q = new URLSearchParams({
    from_year: String(from.year),
    from_month: String(from.month),
    to_year: String(to.year),
    to_month: String(to.month),
  }).toString();
  return `${API_BASE}/reports/export/${kind}?${q}`;
}
