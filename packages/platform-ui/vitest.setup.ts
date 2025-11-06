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
class RO {
	observe() {}
	unobserve() {}
	disconnect() {}
}
// Provide ResizeObserver if missing (jsdom)
interface G extends Global {
	ResizeObserver?: typeof RO;
}
const g = globalThis as G;
if (typeof g.ResizeObserver === 'undefined') {
	g.ResizeObserver = RO;
}

// Ensure a predictable origin for relative URL resolution and MSW absolute handlers
try {
  if (typeof window !== 'undefined' && window.location) {
    // Using assign avoids redefining the readonly location object
    // Port 3010 is used by tests' MSW handlers (http://localhost:3010/...)
    if (window.location.href !== 'http://localhost:3010/') {
      window.location.assign('http://localhost:3010/');
    }
  }
} catch {
  // best-effort only
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
