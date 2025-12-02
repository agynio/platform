// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import axios from 'axios';
import {
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from 'undici';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('act(...')) {
    return;
  }
  originalConsoleError(...args);
};

const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
let rafHandleSeed = 1;

const forceAxiosFetchAdapter = () => {
  if (typeof globalThis.fetch !== 'function') return;
  try {
    const fetchAdapter = axios.getAdapter('fetch', axios.defaults);
    if (typeof fetchAdapter === 'function') {
      axios.defaults.adapter = fetchAdapter;
    }
  } catch (_err) {
    // ignore: fetch adapter unavailable in this build
  }
};

const applyBrowserMocks = () => {
  const g = globalThis as typeof globalThis &
    Partial<Window> &
    { document?: Document; __AGYN_DISABLE_VIRTUALIZATION__?: boolean };

  if (typeof g.__AGYN_DISABLE_VIRTUALIZATION__ === 'undefined') {
    g.__AGYN_DISABLE_VIRTUALIZATION__ = false;
  }

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
    (window as typeof window & { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__ =
      g.__AGYN_DISABLE_VIRTUALIZATION__;
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

  const elementPrototype = g.HTMLElement?.prototype;
  if (elementPrototype && typeof elementPrototype.scrollBy !== 'function') {
    elementPrototype.scrollBy = function scrollBy(this: HTMLElement, optionsOrX?: number | ScrollToOptions, y?: number) {
      if (typeof optionsOrX === 'object' && optionsOrX !== null) {
        const left = 'left' in optionsOrX && typeof optionsOrX.left === 'number' ? optionsOrX.left : 0;
        const top = 'top' in optionsOrX && typeof optionsOrX.top === 'number' ? optionsOrX.top : 0;
        this.scrollLeft += left;
        this.scrollTop += top;
        return;
      }

      const deltaX = typeof optionsOrX === 'number' ? optionsOrX : 0;
      const deltaY = typeof y === 'number' ? y : 0;
      this.scrollLeft += deltaX;
      this.scrollTop += deltaY;
    } as typeof elementPrototype.scrollBy;
  }

  {
    type BoxSize = { inlineSize: number; blockSize: number };

    const createEntry = (target: Element, width: number, height: number): ResizeObserverEntry => {
      const boxSize: BoxSize = { inlineSize: width, blockSize: height };
      const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width,
        height,
        bottom: height,
        right: width,
        toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, width, height, bottom: height, right: width }),
      } satisfies DOMRectReadOnly;

      return {
        target,
        contentRect: rect,
        borderBoxSize: [boxSize] as unknown as ReadonlyArray<ResizeObserverSize>,
        contentBoxSize: [boxSize] as unknown as ReadonlyArray<ResizeObserverSize>,
        devicePixelContentBoxSize: [boxSize] as unknown as ReadonlyArray<ResizeObserverSize>,
      } as ResizeObserverEntry;
    };

    const measure = (element: Element) => {
      const HTMLElementCtor = typeof globalThis.HTMLElement === 'function' ? globalThis.HTMLElement : undefined;
      if (HTMLElementCtor && element instanceof HTMLElementCtor) {
        const width = element.offsetWidth || element.clientWidth;
        const height = element.offsetHeight || element.clientHeight;
        return { width: width || 1, height: height || 1 };
      }
      const rect = element.getBoundingClientRect();
      return { width: rect.width || 1, height: rect.height || 1 };
    };

    class ResizeObserverPolyfill implements ResizeObserver {
      private callback: ResizeObserverCallback;
      private elements = new Map<Element, { width: number; height: number }>();
      private timeoutId: ReturnType<typeof setTimeout> | null = null;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element, _options?: ResizeObserverOptions) {
        if (this.elements.has(target)) return;
        const size = measure(target);
        this.elements.set(target, size);
        this.dispatch([createEntry(target, size.width, size.height)]);
        this.schedule();
      }

      unobserve(target: Element) {
        this.elements.delete(target);
        if (this.elements.size === 0) {
          this.clearSchedule();
        }
      }

      disconnect() {
        this.elements.clear();
        this.clearSchedule();
      }

      private clearSchedule() {
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
      }

      private schedule() {
        if (this.timeoutId !== null) return;
        this.timeoutId = setTimeout(() => {
          this.timeoutId = null;
          const entries: ResizeObserverEntry[] = [];
          for (const [element, previous] of this.elements.entries()) {
            const next = measure(element);
            if (next.width !== previous.width || next.height !== previous.height) {
              this.elements.set(element, next);
              entries.push(createEntry(element, next.width, next.height));
            }
          }
          this.dispatch(entries);
          if (this.elements.size > 0) {
            this.schedule();
          }
        }, 30);
      }

      private dispatch(entries: ResizeObserverEntry[]) {
        if (entries.length === 0) {
          return;
        }
        setTimeout(() => {
          this.callback(entries, this as unknown as ResizeObserver);
        }, 0);
      }
    }

    Object.defineProperty(g, 'ResizeObserver', {
      value: ResizeObserverPolyfill,
      configurable: true,
      writable: true,
    });
  }

  const parseMatrixInit = (input: unknown) => {
    const defaults = {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    };

    if (!input) {
      return defaults;
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed || trimmed === 'none') {
        return defaults;
      }

      const matrixMatch = trimmed.match(/matrix\(([^)]+)\)/);
      if (matrixMatch) {
        const values = matrixMatch[1]
          .split(/[\s,]+/)
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value));
        if (values.length >= 6) {
          return {
            a: values[0] ?? defaults.a,
            b: values[1] ?? defaults.b,
            c: values[2] ?? defaults.c,
            d: values[3] ?? defaults.d,
            e: values[4] ?? defaults.e,
            f: values[5] ?? defaults.f,
          };
        }
      }

      const matrix3dMatch = trimmed.match(/matrix3d\(([^)]+)\)/);
      if (matrix3dMatch) {
        const values = matrix3dMatch[1]
          .split(/[\s,]+/)
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value));
        if (values.length >= 16) {
          return {
            a: values[0] ?? defaults.a,
            b: values[1] ?? defaults.b,
            c: values[4] ?? defaults.c,
            d: values[5] ?? defaults.d,
            e: values[12] ?? defaults.e,
            f: values[13] ?? defaults.f,
          };
        }
      }

      return defaults;
    }

    if (Array.isArray(input)) {
      const [a, b, c, d, e, f] = input as number[];
      return {
        a: Number.isFinite(a) ? a : defaults.a,
        b: Number.isFinite(b) ? b : defaults.b,
        c: Number.isFinite(c) ? c : defaults.c,
        d: Number.isFinite(d) ? d : defaults.d,
        e: Number.isFinite(e) ? e : defaults.e,
        f: Number.isFinite(f) ? f : defaults.f,
      };
    }

    if (typeof input === 'object') {
      const init = input as Partial<DOMMatrixInit> & Partial<DOMMatrix2DInit>;
      return {
        a: Number.isFinite(init.a ?? init.m11 ?? defaults.a) ? (init.a ?? init.m11 ?? defaults.a) : defaults.a,
        b: Number.isFinite(init.b ?? init.m12 ?? defaults.b) ? (init.b ?? init.m12 ?? defaults.b) : defaults.b,
        c: Number.isFinite(init.c ?? init.m21 ?? defaults.c) ? (init.c ?? init.m21 ?? defaults.c) : defaults.c,
        d: Number.isFinite(init.d ?? init.m22 ?? defaults.d) ? (init.d ?? init.m22 ?? defaults.d) : defaults.d,
        e: Number.isFinite(init.e ?? init.m41 ?? defaults.e) ? (init.e ?? init.m41 ?? defaults.e) : defaults.e,
        f: Number.isFinite(init.f ?? init.m42 ?? defaults.f) ? (init.f ?? init.m42 ?? defaults.f) : defaults.f,
      };
    }

    return defaults;
  };

  if (typeof g.DOMMatrixReadOnly !== 'function') {
    class DOMMatrixReadOnlyPolyfill {
      readonly is2D = true;
      readonly isIdentity: boolean;
      readonly a: number;
      readonly b: number;
      readonly c: number;
      readonly d: number;
      readonly e: number;
      readonly f: number;
      readonly m11: number;
      readonly m12: number;
      readonly m21: number;
      readonly m22: number;
      readonly m41: number;
      readonly m42: number;
      readonly m13 = 0;
      readonly m14 = 0;
      readonly m23 = 0;
      readonly m24 = 0;
      readonly m31 = 0;
      readonly m32 = 0;
      readonly m33 = 1;
      readonly m34 = 0;
      readonly m43 = 0;
      readonly m44 = 1;

      constructor(init?: string | number[] | DOMMatrixInit) {
        const values = parseMatrixInit(init);
        this.a = values.a;
        this.b = values.b;
        this.c = values.c;
        this.d = values.d;
        this.e = values.e;
        this.f = values.f;
        this.m11 = this.a;
        this.m12 = this.b;
        this.m21 = this.c;
        this.m22 = this.d;
        this.m41 = this.e;
        this.m42 = this.f;
        this.isIdentity =
          this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
      }

      static fromMatrix(other?: DOMMatrixInit) {
        return new DOMMatrixReadOnlyPolyfill(other);
      }

      toFloat32Array() {
        return new Float32Array([
          this.m11,
          this.m12,
          this.m13,
          this.m14,
          this.m21,
          this.m22,
          this.m23,
          this.m24,
          this.m31,
          this.m32,
          this.m33,
          this.m34,
          this.m41,
          this.m42,
          this.m43,
          this.m44,
        ]);
      }

      toFloat64Array() {
        return new Float64Array(this.toFloat32Array());
      }

      transformPoint(point: DOMPointInit = { x: 0, y: 0, z: 0, w: 1 }) {
        const x = (point.x ?? 0) * this.m11 + (point.y ?? 0) * this.m21 + this.m41;
        const y = (point.x ?? 0) * this.m12 + (point.y ?? 0) * this.m22 + this.m42;
        const z = point.z ?? 0;
        const w = point.w ?? 1;
        return { x, y, z, w } satisfies DOMPointInit;
      }
    }

    Object.defineProperty(g, 'DOMMatrixReadOnly', {
      value: DOMMatrixReadOnlyPolyfill,
      configurable: true,
      writable: true,
    });

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'DOMMatrixReadOnly', {
        value: DOMMatrixReadOnlyPolyfill,
        configurable: true,
        writable: true,
      });
    }
  }

  if (typeof g.DOMMatrix !== 'function') {
    class DOMMatrixPolyfill extends (g.DOMMatrixReadOnly as unknown as typeof DOMMatrixReadOnly) {
      constructor(init?: string | number[] | DOMMatrixInit) {
        super(init);
      }

      multiplySelf(_: unknown) {
        return this;
      }

      preMultiplySelf(_: unknown) {
        return this;
      }

      translateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      skewXSelf() {
        return this;
      }

      skewYSelf() {
        return this;
      }

      invertSelf() {
        return this;
      }

      static fromMatrix(other?: DOMMatrixInit) {
        return new DOMMatrixPolyfill(other);
      }
    }

    Object.defineProperty(g, 'DOMMatrix', {
      value: DOMMatrixPolyfill,
      configurable: true,
      writable: true,
    });

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'DOMMatrix', {
        value: DOMMatrixPolyfill,
        configurable: true,
        writable: true,
      });
    }
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

  forceAxiosFetchAdapter();
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
