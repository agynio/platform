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

let socketServer: TestSocketServer;

describe('ThreadTree conditional insertion on thread_created', () => {
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

  it('does not insert closed thread in open filter view', async () => {
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('rootsOnly') !== 'true') return new HttpResponse(null, { status: 400 });
      if ((url.searchParams.get('status') || '') !== 'open') return new HttpResponse(null, { status: 400 });
      return HttpResponse.json({ items: [] });
    };

    server.use(
      http.get('/api/agents/threads', handler),
      http.get(abs('/api/agents/threads'), handler),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    expect(await screen.findByText('No threads')).toBeInTheDocument();
    await socketServer.waitForRoom('threads');

    socketServer.emitThreadCreated({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      alias: 'a1',
      summary: null,
      status: 'closed',
      parentId: null,
      createdAt: new Date().toISOString(),
    });

    expect(await screen.findByText('No threads')).toBeInTheDocument();
  });

  it('prepends new root thread when it matches the current filter', async () => {
    const handler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('rootsOnly') !== 'true') return new HttpResponse(null, { status: 400 });
      if ((url.searchParams.get('status') || '') !== 'open') return new HttpResponse(null, { status: 400 });
      return HttpResponse.json({ items: [] });
    };

    server.use(
      http.get('/api/agents/threads', handler),
      http.get(abs('/api/agents/threads'), handler),
    );

    render(
      <TestProviders>
        <ThreadTree status="open" onSelect={() => {}} />
      </TestProviders>,
    );

    expect(await screen.findByText('No threads')).toBeInTheDocument();
    await socketServer.waitForRoom('threads');

    socketServer.emitThreadCreated({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      alias: 'a2',
      summary: 'Fresh root thread',
      status: 'open',
      parentId: null,
      createdAt: new Date().toISOString(),
    });

    await waitFor(() => expect(screen.getByText('Fresh root thread')).toBeInTheDocument());
  });
});
