// Centralized environment configuration for platform-ui.
// Provides two env-resolved values and throws if missing.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TRACING_SERVER_URL?: string;
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

function requireEnv(name: keyof ViteEnv): string {
  const val = ve?.[name] ?? ne?.[name as string];
  if (typeof val === 'string' && val.trim()) return val;
  throw new Error(`platform-ui config: required env ${String(name)} is missing`);
}

export const config = {
  apiBaseUrl: requireEnv('VITE_API_BASE_URL'),
  tracingApiBaseUrl: requireEnv('VITE_TRACING_SERVER_URL'),
};
