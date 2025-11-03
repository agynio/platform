// Centralized API client utilities (moved from src/lib/apiClient.ts)
// - getApiBase(): resolve API base URL with precedence
// - buildUrl(path, base?): join base with normalized path
// - httpJson<T>(path, init?, base?): fetch JSON with sane defaults

type ViteEnv = {
  VITE_API_BASE_URL?: string;
};

function readViteEnv(): ViteEnv | undefined {
  try {
    // Prefer globalThis.importMeta (used in tests), fallback to import.meta when present
    const fromGlobal = (globalThis as Record<string, unknown> | undefined)?.importMeta;
    const im = fromGlobal ?? (typeof import.meta !== 'undefined' ? import.meta : undefined);
    if (im && typeof im === 'object' && 'env' in (im as Record<string, unknown>)) {
      const env = (im as { env?: unknown }).env;
      if (env && typeof env === 'object') return env as ViteEnv;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function readNodeEnv(): Record<string, string | undefined> | undefined {
  try {
    if (typeof process === 'undefined') return undefined;
    const p: unknown = process;
    if (!p || typeof p !== 'object' || !('env' in p)) return undefined;
    const env = (p as { env?: unknown }).env;
    return env && typeof env === 'object' ? (env as Record<string, string | undefined>) : undefined;
  } catch {
    return undefined;
  }
}

export function getApiBase(override?: string): string {
  // Precedence:
  // 1) explicit override
  // 2) import.meta.env.VITE_API_BASE_URL
  // 3) process.env.API_BASE_URL
  // 4) otherwise throw (no hardcoded defaults)
  if (override !== undefined) return override;
  const ve = readViteEnv();
  const ne = readNodeEnv();

  const viteApi = ve?.VITE_API_BASE_URL;
  // If defined (including empty string), return value as-is. Empty string means relative base for tests.
  if (viteApi !== undefined) return viteApi as string;

  const nodeBase = ne?.API_BASE_URL;
  if (nodeBase) return nodeBase;
  throw new Error('API base not configured. Set VITE_API_BASE_URL or pass override.');
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
