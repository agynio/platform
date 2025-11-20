// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl
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
const workerId = Number.parseInt(process.env.VITEST_WORKER_ID ?? '0', 10);
const basePort = 3010;
const defaultApiBase = `http://127.0.0.1:${basePort + (Number.isFinite(workerId) ? workerId : 0)}`;

vi.stubEnv('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL ?? defaultApiBase);
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? defaultApiBase;
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
