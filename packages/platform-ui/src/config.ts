// Centralized environment configuration for platform-ui.
// Test-friendly API base resolution to avoid throws during Vitest.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TRACING_SERVER_URL?: string;
  VITEST?: unknown;
};

function readViteEnv(): ViteEnv | undefined {
  try {
    const fromGlobal = (globalThis as Record<string, unknown> | undefined)?.importMeta;
    const im = (typeof import.meta !== 'undefined' ? import.meta : undefined) ?? fromGlobal;
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

const ve = readViteEnv();
const ne = readNodeEnv();

function resolveApiBase(): string {
  // Precedence:
  // 1) VITE_API_BASE_URL if defined (including '')
  // 2) Vitest detected => '' (use relative URLs in tests)
  // 3) API_BASE_URL from Node env
  // 4) Fallback 'http://localhost:3010'
  const viteBase = ve?.VITE_API_BASE_URL;
  if (typeof viteBase === 'string') return viteBase;
  const vitestFlag = (ve as Record<string, unknown> | undefined)?.VITEST;
  const isVitest = vitestFlag === true || vitestFlag === 'true' || ne?.VITEST === 'true';
  if (isVitest) return '';
  const nodeBase = ne?.API_BASE_URL;
  if (typeof nodeBase === 'string' && nodeBase.length > 0) return nodeBase;
  return 'http://localhost:3010';
}

export const config = {
  apiBaseUrl: resolveApiBase(),
  tracingApiBaseUrl: (ve?.VITE_TRACING_SERVER_URL ?? ne?.VITE_TRACING_SERVER_URL) || '',
};
