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
const g = globalThis as unknown as G;
if (typeof g.ResizeObserver === 'undefined') {
	g.ResizeObserver = RO;
}
