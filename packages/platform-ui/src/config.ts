// Centralized environment configuration for platform-ui
// Minimal configuration: only the API base URL.

function resolveApiBase(): string {
  if (!import.meta.env.VITE_API_BASE_URL) {
    throw new Error('API base URL is not defined. Please set VITE_API_BASE_URL environment variable.');
  }
  return import.meta.env.VITE_API_BASE_URL;
}

export const config = {
  apiBaseUrl: resolveApiBase(),
};
