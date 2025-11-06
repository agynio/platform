// Centralized environment configuration for platform-ui
// Minimal configuration: API base URL and tracing server URL.

function resolveApiBase(): string {
  if (!import.meta.env.VITE_API_BASE_URL) {
    throw new Error('API base URL is not defined. Please set VITE_API_BASE_URL environment variable.');
  }
  return import.meta.env.VITE_API_BASE_URL;
}

export const config = {
  apiBaseUrl: resolveApiBase(),
  tracingServerUrl: (function resolveTracingServer(): string {
    const ve = (import.meta as { env?: Record<string, unknown> } | undefined)?.env || {};
    const tracing = ve?.VITE_TRACING_SERVER_URL as string | undefined;
    const base = tracing && typeof tracing === 'string' && tracing.length > 0
      ? tracing
      : `${resolveApiBase()}/tracing`;
    // Normalize to avoid double slashes
    return base.endsWith('/') ? base.slice(0, -1) : base;
  })(),
};
