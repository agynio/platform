// Centralized API client utilities
// - getApiBase(): resolve API base URL from config
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults
import { config } from '@/config';

export function getApiBase(override?: string): string {
  // Precedence:
  // 1) explicit override
  // 2) config.apiBaseUrl
  // 3) throw if missing
  if (override !== undefined) return override;
  const base = config.apiBaseUrl;
  if (base) return base;
  throw new Error('API base not configured. Set VITE_API_BASE_URL in config or pass override.');
}

export function buildUrl(path: string, base?: string): string {
  const b = getApiBase(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!b) return p; // relative for vitest or explicit ''
  // Avoid double slashes
  return b.endsWith('/') ? `${b.slice(0, -1)}${p}` : `${b}${p}`;
}

// Returns parsed JSON or undefined (e.g., for 204 or non-JSON bodies)
export async function httpJson<T = unknown>(path: string, init?: RequestInit, base?: string): Promise<T | undefined> {
  const url = buildUrl(path, base);
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}
