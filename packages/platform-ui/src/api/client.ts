// Centralized API client utilities
// - getApiBase(override?): resolve API base URL from envs or override
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults
import { config } from '@/config';
// Minimal API base resolver for client utilities
export function getApiBase(override?: string): string {
  if (typeof override === 'string') return override;
  // Use centralized config resolution (returns '' in Vitest)
  const base = config.apiBaseUrl;
  return typeof base === 'string' ? base : '';
}

export function buildUrl(path: string, base?: string): string {
  const b = getApiBase(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  // If base override is an empty string, return relative path for tests
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
