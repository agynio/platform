import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ThreadTree } from '../src/components/agents/ThreadTree';
import type * as ConfigModule from '@/config';
import { server, TestProviders, abs } from './integration/testUtils';
import { createSocketTestServer, type TestSocketServer } from './socketServer.helper';

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

const THREAD_ID = '11111111-1111-1111-1111-111111111111';

let socketServer: TestSocketServer;

describe('ThreadTree metrics badges and socket updates', () => {
  beforeAll(async () => {
    socketServer = await createSocketTestServer();
    socketBaseUrl = socketServer.baseUrl;
    server.listen();
  });

  afterEach(() => server.resetHandlers());

  afterAll(async () => {
    server.close();
    await socketServer.close();
  });

  it('renders activity dot and hidden-zero reminders; updates on socket', async () => {
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const rootsOnly = url.searchParams.get('rootsOnly');
      const status = url.searchParams.get('status') || '';
      const includeMetrics = url.searchParams.get('includeMetrics');
      const includeAgentTitles = url.searchParams.get('includeAgentTitles');
      if (!(rootsOnly === 'true' || rootsOnly === '1')) return new HttpResponse(null, { status: 400 });
      if (status !== 'open') return new HttpResponse(null, { status: 400 });
      if (includeMetrics && includeMetrics !== 'true') return new HttpResponse(null, { status: 400 });
      if (includeAgentTitles && includeAgentTitles !== 'true') return new HttpResponse(null, { status: 400 });
      return HttpResponse.json({
        items: [
          {
            id: THREAD_ID,
            alias: 'a1',
            summary: 'Root A',
            status: 'open',
            parentId: null,
            createdAt: new Date().toISOString(),
            metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 4 },
            agentTitle: 'Agent 1',
          },
        ],
      });
    };

    server.use(
      http.get('/api/agents/threads', handler as any),
      http.get(abs('/api/agents/threads'), handler as any),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    const summaryEl = await screen.findByText('Root A');
    expect(summaryEl).toHaveAttribute('title', 'Root A');
    expect(summaryEl).toHaveClass('thread-summary');
    expect(summaryEl).toHaveClass('overflow-hidden');
    expect(screen.getByText('Agent 1')).toBeInTheDocument();

    const dotIdle = screen.getByLabelText('Activity: idle');
    expect(dotIdle).toBeInTheDocument();
    expect(dotIdle.textContent).toBe('');
    expect(screen.queryByText(/Runs/)).toBeNull();
    expect(screen.queryByLabelText(/Active reminders:/)).toBeNull();

    await socketServer.waitForRoom('threads');

    socketServer.emitThreadActivity({ threadId: THREAD_ID, activity: 'working' });
    socketServer.emitThreadReminders({ threadId: THREAD_ID, remindersCount: 2 });

    const dotWorking = await screen.findByLabelText('Activity: working');
    expect(dotWorking).toBeInTheDocument();
    expect(dotWorking.textContent).toBe('');
    expect(screen.queryByText(/Runs/)).toBeNull();
    expect(screen.queryByLabelText(/Active reminders:/)).toBeNull();
  });
});
