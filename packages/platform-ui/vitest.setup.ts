// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import {
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from 'undici';

const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
let rafHandleSeed = 1;

const applyBrowserMocks = () => {
  const g = globalThis as typeof globalThis & Partial<Window> & { document?: Document };

  if (!g.fetch) {
    g.fetch = undiciFetch as unknown as typeof fetch;
  }
  if (!g.Headers) {
    g.Headers = UndiciHeaders as unknown as typeof Headers;
  }
  if (!g.Request) {
    g.Request = UndiciRequest as unknown as typeof Request;
  }
  if (!g.Response) {
    g.Response = UndiciResponse as unknown as typeof Response;
  }

  if (typeof window !== 'undefined') {
    if (!window.fetch) {
      window.fetch = undiciFetch as unknown as typeof fetch;
    }
    if (!window.Headers) {
      window.Headers = UndiciHeaders as unknown as typeof Headers;
    }
    if (!window.Request) {
      window.Request = UndiciRequest as unknown as typeof Request;
    }
    if (!window.Response) {
      window.Response = UndiciResponse as unknown as typeof Response;
    }
  }

  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const handle = rafHandleSeed++;
      const timeout = setTimeout(() => {
        rafTimers.delete(handle);
        callback(Date.now());
      }, 16);
      rafTimers.set(handle, timeout);
      return handle;
    };
  }

  if (!g.cancelAnimationFrame) {
    g.cancelAnimationFrame = (handle: number) => {
      const timeout = rafTimers.get(handle);
      if (timeout !== undefined) {
        clearTimeout(timeout);
        rafTimers.delete(handle);
      }
    };
  }

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = window.requestAnimationFrame ?? g.requestAnimationFrame!.bind(window);
    window.cancelAnimationFrame = window.cancelAnimationFrame ?? g.cancelAnimationFrame!.bind(window);
  }

  if (!('ResizeObserver' in g) || g.ResizeObserver === undefined) {
    class ResizeObserverPolyfill {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(g, 'ResizeObserver', {
      value: ResizeObserverPolyfill,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window !== 'undefined' && !window.matchMedia) {
    const createMatchMediaMock = () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const matchMediaMock = vi.fn((query: string) => {
      const result = createMatchMediaMock();
      result.media = query;
      return result;
    });

    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaMock,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window !== 'undefined') {
    window.alert = vi.fn();
  }

  const doc = g.document ?? (typeof window !== 'undefined' ? window.document : undefined);
  if (doc) {
    if (!doc.createRange) {
      Object.defineProperty(doc, 'createRange', {
        configurable: true,
        value: () =>
          ({
            setStart: () => {},
            setEnd: () => {},
            commonAncestorContainer: doc.documentElement ?? doc.body,
            createContextualFragment: (html: string) => {
              const template = doc.createElement('template');
              template.innerHTML = html;
              return template.content;
            },
          } as unknown as Range),
      });
    }

    Object.defineProperty(doc, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
  }
};

applyBrowserMocks();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  applyBrowserMocks();
});
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl
//
// Note: Do NOT start a global MSW server here because some tests manage their
// own msw server instance via TestProviders. Instead, keep fetch deterministic
// by stubbing tracing endpoints and using relative API base ('').
//
// Provide required envs to avoid import-time throws in tests
const workerId = Number.parseInt(process.env.VITEST_WORKER_ID ?? '0', 10);
const basePort = 3010;
const defaultApiBase = `http://127.0.0.1:${basePort + (Number.isFinite(workerId) ? workerId : 0)}`;

vi.stubEnv('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL ?? defaultApiBase);
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? defaultApiBase;
}

// Avoid mutating config.apiBaseUrl globally to not affect unit tests that
// validate env resolution. Individual pages pass base '' explicitly where needed.
