/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as ConfigModule from '@/config';
import { useReminderCount } from '../hooks';
import { createSocketTestServer, type TestSocketServer } from '../../../../__tests__/socketServer.helper';

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

function Badge({ nodeId }: { nodeId: string }) {
  const q = useReminderCount(nodeId, true);
  const n = q.data?.count || 0;
  return n > 0 ? (
    <span title={`Active reminders: ${n}`}>{n}</span>
  ) : (
    <span>no reminders</span>
  );
}

let socketServer: TestSocketServer;

describe('useReminderCount badge', () => {
  const g: any = globalThis as any;
  const origFetch = g.fetch;

  beforeAll(async () => {
    socketServer = await createSocketTestServer();
    socketBaseUrl = socketServer.baseUrl;
  });

  afterAll(async () => {
    await socketServer.close();
  });

  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/reminders')) return new Response(JSON.stringify({ items: [] }));
      return new Response('', { status: 204 });
    }) as any;
  });

  afterEach(() => {
    g.fetch = origFetch;
  });

  it('updates on node_reminder_count socket event', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <Badge nodeId="n1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('no reminders')).toBeInTheDocument();

    await socketServer.waitForRoom('node:n1');

    socketServer.emitReminderCount({
      nodeId: 'n1',
      count: 2,
      updatedAt: new Date().toISOString(),
    });

    expect(await screen.findByTitle('Active reminders: 2')).toBeInTheDocument();
  });
});
