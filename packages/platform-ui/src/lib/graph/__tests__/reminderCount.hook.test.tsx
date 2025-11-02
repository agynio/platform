/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useReminderCount } from '../hooks';
import { graphSocket } from '../socket';

describe('useReminderCount', () => {
  const g: any = globalThis as any;
  const origFetch = g.fetch;
  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/reminders')) return new Response(JSON.stringify({ items: [] }));
      return new Response('', { status: 204 });
    }) as any;
  });
  afterEach(() => { g.fetch = origFetch; });

  it('subscribes to node_reminder_count and updates count', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useReminderCount('n1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.count).toBe(0);

    // simulate socket event
    const anySock: any = graphSocket as any;
    const listeners: Map<string, Set<(ev: any) => void>> = anySock.reminderListeners;
    let fired = false;
    for (const [nodeId, set] of listeners) {
      if (nodeId === 'n1') {
        for (const fn of set) { fn({ nodeId: 'n1', count: 2, updatedAt: new Date().toISOString() }); fired = true; }
      }
    }
    if (!fired) {
      const off = graphSocket.onReminderCount('n1', () => {});
      const set = (graphSocket as any).reminderListeners.get('n1') as Set<(ev: any) => void>;
      for (const fn of set) fn({ nodeId: 'n1', count: 2, updatedAt: new Date().toISOString() });
      off();
    }

    await waitFor(() => expect(result.current.data?.count).toBe(2));
  });
});

