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

// Test harness: mock socket.io-client to avoid JSDOM network calls
import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
interface SocketStub {
  on: (event: string, cb: Handler) => void;
  emit: (event: string, ...args: unknown[]) => void;
  disconnect: () => void;
}

vi.mock('socket.io-client', () => {
  const sock: SocketStub = {
    on: (_event: string, _cb: Handler) => {},
    emit: (_event: string, ..._args: unknown[]) => {},
    disconnect: () => {},
  };
  return {
    io: (_url?: string, _opts?: unknown) => sock,
  };
});
