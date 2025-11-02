/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useReminderCount } from '../hooks';
import { graphSocket } from '../socket';

function Badge({ nodeId }: { nodeId: string }) {
  const q = useReminderCount(nodeId, true);
  const n = q.data?.count || 0;
  return n > 0 ? (
    <span title={`Active reminders: ${n}`}>{n}</span>
  ) : (
    <span>no reminders</span>
  );
}

describe('useReminderCount badge', () => {
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

  it('updates on node_reminder_count socket event', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <Badge nodeId="n1" />
      </QueryClientProvider>,
    );

    // Initially no reminders
    expect(await screen.findByText('no reminders')).toBeInTheDocument();

    // Wait for hook to register listener
    const anySock: any = graphSocket as any;
    let tries = 0;
    while (tries < 20 && !(anySock.reminderListeners && anySock.reminderListeners.get('n1'))) {
      await new Promise((r) => setTimeout(r, 10));
      tries += 1;
    }
    const set = (anySock.reminderListeners.get('n1') as Set<(ev: any) => void>) || new Set();
    for (const fn of set) fn({ nodeId: 'n1', count: 2, updatedAt: new Date().toISOString() });

    // Expect badge now shows count
    expect(await screen.findByTitle('Active reminders: 2')).toBeInTheDocument();
  });
});

