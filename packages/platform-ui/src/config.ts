// Centralized environment configuration for platform-ui.
// Provides two env-resolved values and throws if missing.

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TRACING_SERVER_URL?: string;
};

function requireEnv(name: keyof ViteEnv): string {
  const val = import.meta.env?.[name];
  if (typeof val === 'string' && val.trim()) return val;
  throw new Error(`platform-ui config: required env ${String(name)} is missing`);
}

export const config = {
  apiBaseUrl: requireEnv('VITE_API_BASE_URL'),
  tracingApiBaseUrl: requireEnv('VITE_TRACING_SERVER_URL'),
};
