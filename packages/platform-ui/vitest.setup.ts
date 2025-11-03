// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
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

// Provide a default relative API base for tests so HTTP calls hit MSW handlers
// Simulate Vite's import.meta.env for modules that read it directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).importMeta = { env: { VITE_API_BASE_URL: '' } };
