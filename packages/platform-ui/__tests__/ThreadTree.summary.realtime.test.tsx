import React from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('ThreadTree realtime summary updates', () => {
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

  it('updates an existing root summary in place when thread_updated arrives', async () => {
    const handler: Parameters<typeof http.get>[1] = () =>
      HttpResponse.json({
        items: [
          {
            id: THREAD_ID,
            alias: 'thread-one',
            summary: 'Original summary',
            status: 'open',
            parentId: null,
            createdAt: t(0),
            metrics: { remindersCount: 0, runsCount: 0, containersCount: 0, activity: 'idle' },
            agentTitle: 'Agent Uno',
          },
        ],
      });

    server.use(
      http.get('/api/agents/threads', handler),
      http.get(abs('/api/agents/threads'), handler),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    await screen.findByText('Original summary');
    await socketServer.waitForRoom('threads');

    socketServer.emitThreadUpdated({
      id: THREAD_ID,
      alias: 'thread-one',
      summary: 'Updated summary',
      status: 'open',
      parentId: null,
      createdAt: t(1),
    });

    await waitFor(() => expect(screen.getByText('Updated summary')).toBeInTheDocument());
  });
});
