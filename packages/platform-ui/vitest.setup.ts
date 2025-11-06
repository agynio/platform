// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl and tracing server
// - Stub tracing spans fetches to avoid network in CI
//
// Note: Do NOT start a global MSW server here because some tests manage their
// own msw server instance via TestProviders. Instead, keep fetch deterministic
// by stubbing tracing endpoints and using relative API base ('').
//
// Polyfill ResizeObserver for Radix UI components in tests
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Provide ResizeObserver if missing (jsdom)
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverPolyfill,
    configurable: true,
    writable: false,
  });
}

// Avoid triggering jsdom navigation. Tests should set origins as needed.

// Provide required envs to avoid import-time throws in tests
vi.stubEnv('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL ?? 'http://localhost:3010');
vi.stubEnv('VITE_TRACING_SERVER_URL', process.env.VITE_TRACING_SERVER_URL ?? 'http://localhost:4319');
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:3010';
  process.env.VITE_TRACING_SERVER_URL = process.env.VITE_TRACING_SERVER_URL ?? 'http://localhost:4319';
}

// Minimal polyfills for UI libraries (Radix/Floating-UI)
if (typeof window !== 'undefined') {
  // matchMedia required by some CSS-in-JS and Radix internals
  // Provide a basic stub with event methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    dispatchEvent: vi.fn(),
  }));
}

// createRange for Floating-UI contextual fragment creation
if (typeof document !== 'undefined' && !document.createRange) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).createRange = () => ({
    setStart: () => {},
    setEnd: () => {},
    commonAncestorContainer: document.documentElement,
    createContextualFragment: (html: string) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      return template.content;
    },
  });
}

// Avoid mutating config.apiBaseUrl globally to not affect unit tests that
// validate env resolution. Individual pages pass base '' explicitly where needed.

// Stub tracing span fetches to avoid external network in CI.
// Tests that need specific spans should mock '@/api/modules/tracing' themselves.
vi.mock('@/api/modules/tracing', async () => {
  return {
    fetchSpansInRange: async () => [],
    fetchRunningSpansFromTo: async () => [],
  };
});
