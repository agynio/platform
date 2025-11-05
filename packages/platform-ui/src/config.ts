// Centralized environment configuration for platform-ui
// Provides resolved bases for API and Tracing services without side effects.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TRACING_SERVER_URL?: string;
  VITE_TRACING_UI_BASE?: string;
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
  if (!import.meta.env.VITE_API_BASE_URL) {
    throw new Error('API base URL is not defined. Please set VITE_API_BASE_URL environment variable.');
  }
  return import.meta.env.VITE_API_BASE_URL;
}

function resolveTracingServer(): string | undefined {
  // Precedence: VITE_TRACING_SERVER_URL -> TRACING_SERVER_URL -> undefined
  return ve?.VITE_TRACING_SERVER_URL || ne?.TRACING_SERVER_URL;
}

function resolveTracingUiBase(): string | undefined {
  // Precedence: VITE_TRACING_UI_BASE -> TRACING_UI_BASE -> undefined
  return ve?.VITE_TRACING_UI_BASE || ne?.TRACING_UI_BASE;
}

export const config = {
  apiBaseUrl: resolveApiBase(),
  tracing: {
    serverUrl: resolveTracingServer(),
    uiBase: resolveTracingUiBase(),
  },
};
