import { vi } from 'vitest';
import { spanRealtime } from '../services/socket';

// Flush pending microtasks/macrotasks
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Mock realtime socket listeners to no-op to prevent network/socket usage in tests
export function mockRealtimeNoop() {
  const disposers: Array<() => void> = [];
  const onLogSpy = vi.spyOn(spanRealtime, 'onLog').mockImplementation(() => {
    const off = () => {};
    disposers.push(off);
    return off;
  });
  const onSpanUpsertSpy = vi
    .spyOn(spanRealtime, 'onSpanUpsert')
    .mockImplementation(() => {
      const off = () => {};
      disposers.push(off);
      return off;
    });
  const onConnSpy = vi
    .spyOn(spanRealtime, 'onConnectionState')
    .mockImplementation((listener: any) => {
      try {
        listener({ connected: false, lastPongTs: null });
      } catch {}
      const off = () => {};
      disposers.push(off);
      return off;
    });
  return {
    onLogSpy,
    onSpanUpsertSpy,
    onConnSpy,
    disposeAll: () => disposers.forEach((d) => {
      try {
        d();
      } catch {}
    }),
  };
}

