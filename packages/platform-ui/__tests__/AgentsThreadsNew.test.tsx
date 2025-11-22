import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { TestProviders, abs, server } from './integration/testUtils';
import { AgentsThreads } from '../src/pages/AgentsThreads';

const renderSpy = vi.fn();

vi.mock('@agyn/ui-new', async () => {
  const actual = await vi.importActual<any>('@agyn/ui-new');
  return {
    ...actual,
    ThreadsScreen: (props: Parameters<typeof actual.ThreadsScreen>[0]) => {
      renderSpy(props);
      return <div data-testid="threads-screen" />;
    },
  };
});

const listeners = {
  threadCreated: new Set<(payload: { thread: any }) => void>(),
  threadUpdated: new Set<(payload: { thread: any }) => void>(),
  threadActivityChanged: new Set<(payload: { threadId: string; activity: any }) => void>(),
  threadRemindersCount: new Set<(payload: { threadId: string; remindersCount: number }) => void>(),
  messageCreated: new Set<(payload: { runId: string; message: any }) => void>(),
  runStatusChanged: new Set<(payload: { threadId: string; run: any }) => void>(),
  runEvent: new Set<(payload: { runId: string; event: any }) => void>(),
  reconnected: new Set<() => void>(),
};

vi.mock('@/lib/graph/socket', () => {
  return {
    graphSocket: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      setRunCursor: vi.fn(),
      getRunCursor: vi.fn(() => null),
      dispose: vi.fn(),
      onThreadCreated: (cb: (payload: { thread: any }) => void) => {
        listeners.threadCreated.add(cb);
        return () => listeners.threadCreated.delete(cb);
      },
      onThreadUpdated: (cb: (payload: { thread: any }) => void) => {
        listeners.threadUpdated.add(cb);
        return () => listeners.threadUpdated.delete(cb);
      },
      onThreadActivityChanged: (cb: (payload: { threadId: string; activity: any }) => void) => {
        listeners.threadActivityChanged.add(cb);
        return () => listeners.threadActivityChanged.delete(cb);
      },
      onThreadRemindersCount: (cb: (payload: { threadId: string; remindersCount: number }) => void) => {
        listeners.threadRemindersCount.add(cb);
        return () => listeners.threadRemindersCount.delete(cb);
      },
      onMessageCreated: (cb: (payload: { runId: string; message: any }) => void) => {
        listeners.messageCreated.add(cb);
        return () => listeners.messageCreated.delete(cb);
      },
      onRunStatusChanged: (cb: (payload: { threadId: string; run: any }) => void) => {
        listeners.runStatusChanged.add(cb);
        return () => listeners.runStatusChanged.delete(cb);
      },
      onRunEvent: (cb: (payload: { runId: string; event: any }) => void) => {
        listeners.runEvent.add(cb);
        return () => listeners.runEvent.delete(cb);
      },
      onReconnected: (cb: () => void) => {
        listeners.reconnected.add(cb);
        return () => listeners.reconnected.delete(cb);
      },
    },
  };
});

function setupThreadsApi(options?: { includeSecondThread?: boolean }) {
  const threadId = '00000000-0000-0000-0000-000000000001';
  const runId = 'run-1';
  const threadIdB = '00000000-0000-0000-0000-000000000002';

  const threadItems = [
    {
      id: threadId,
      alias: 'Primary Thread',
      summary: 'Thread summary',
      status: 'open',
      parentId: null,
      createdAt: new Date(1700000000000).toISOString(),
      metrics: {
        remindersCount: 1,
        containersCount: 0,
        activity: 'working',
        runsCount: 1,
      },
      agentTitle: 'Agent Alpha',
    },
  ];
  if (options?.includeSecondThread) {
    threadItems.push({
      id: threadIdB,
      alias: 'Secondary Thread',
      summary: 'Another summary',
      status: 'open',
      parentId: null,
      createdAt: new Date(1700000005000).toISOString(),
      metrics: {
        remindersCount: 0,
        containersCount: 0,
        activity: 'waiting',
        runsCount: 0,
      },
      agentTitle: 'Agent Beta',
    });
  }

  const containersHandler = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('threadId');
    if (id === threadId || id === threadIdB) {
      return HttpResponse.json({ items: [] });
    }
    return HttpResponse.json({ items: [] });
  };

  server.use(
    http.get('/api/agents/threads', () => HttpResponse.json({ items: threadItems })),
    http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: threadItems })),
    http.get(`/api/agents/threads/${threadId}/runs`, () =>
      HttpResponse.json({
        items: [
          { id: runId, status: 'finished', createdAt: new Date(1700000001000).toISOString(), updatedAt: new Date(1700000005000).toISOString() },
        ],
      }),
    ),
    http.get(abs(`/api/agents/threads/${threadId}/runs`), () =>
      HttpResponse.json({
        items: [
          { id: runId, status: 'finished', createdAt: new Date(1700000001000).toISOString(), updatedAt: new Date(1700000005000).toISOString() },
        ],
      }),
    ),
    http.get(`/api/agents/threads/${threadId}/metrics`, () =>
      HttpResponse.json({ remindersCount: 1, containersCount: 0, activity: 'working', runsCount: 1 }),
    ),
    http.get(abs(`/api/agents/threads/${threadId}/metrics`), () =>
      HttpResponse.json({ remindersCount: 1, containersCount: 0, activity: 'working', runsCount: 1 }),
    ),
    http.get(`/api/agents/threads/${threadId}/containers`, containersHandler),
    http.get(abs(`/api/agents/threads/${threadId}/containers`), containersHandler),
    http.get('/api/containers', containersHandler),
    http.get(abs('/api/containers'), containersHandler),
    http.options('/api/containers', () => new HttpResponse(null, { status: 200 })),
    http.options(abs('/api/containers'), () => new HttpResponse(null, { status: 200 })),
    http.get('/api/agents/reminders', ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('threadId') === threadId) {
        return HttpResponse.json({ items: [
          { id: 'rem-1', threadId, note: 'Follow up', at: new Date(1700000010000).toISOString(), createdAt: new Date(1700000009000).toISOString(), completedAt: null },
        ] });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get(abs('/api/agents/reminders'), ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('threadId') === threadId) {
        return HttpResponse.json({ items: [
          { id: 'rem-1', threadId, note: 'Follow up', at: new Date(1700000010000).toISOString(), createdAt: new Date(1700000009000).toISOString(), completedAt: null },
        ] });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get(`/api/agents/runs/${runId}/messages`, ({ request }) => {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      if (type === 'input') {
        return HttpResponse.json({ items: [ { id: 'msg-in', kind: 'user', text: 'Hello', createdAt: new Date(1700000002000).toISOString() } ] });
      }
      if (type === 'injected') {
        return HttpResponse.json({ items: [ { id: 'msg-injected', kind: 'system', text: 'System note', createdAt: new Date(1700000002500).toISOString() } ] });
      }
      if (type === 'output') {
        return HttpResponse.json({ items: [ { id: 'msg-out', kind: 'assistant', text: 'Response', createdAt: new Date(1700000003000).toISOString() } ] });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get(abs(`/api/agents/runs/${runId}/messages`), ({ request }) => {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      if (type === 'input') {
        return HttpResponse.json({ items: [ { id: 'msg-in', kind: 'user', text: 'Hello', createdAt: new Date(1700000002000).toISOString() } ] });
      }
      if (type === 'injected') {
        return HttpResponse.json({ items: [ { id: 'msg-injected', kind: 'system', text: 'System note', createdAt: new Date(1700000002500).toISOString() } ] });
      }
      if (type === 'output') {
        return HttpResponse.json({ items: [ { id: 'msg-out', kind: 'assistant', text: 'Response', createdAt: new Date(1700000003000).toISOString() } ] });
      }
      return HttpResponse.json({ items: [] });
    }),
    http.get(`/api/agents/threads/${threadIdB}/runs`, () => HttpResponse.json({ items: [] })),
    http.get(abs(`/api/agents/threads/${threadIdB}/runs`), () => HttpResponse.json({ items: [] })),
    http.get(`/api/agents/threads/${threadIdB}/metrics`, () =>
      HttpResponse.json({ remindersCount: 0, containersCount: 0, activity: 'waiting', runsCount: 0 }),
    ),
    http.get(abs(`/api/agents/threads/${threadIdB}/metrics`), () =>
      HttpResponse.json({ remindersCount: 0, containersCount: 0, activity: 'waiting', runsCount: 0 }),
    ),
  );

  return { threadId, runId, secondThreadId: threadIdB };
}

describe('AgentsThreadsNew', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    renderSpy.mockReset();
  });
  afterAll(() => server.close());

  it('maps threads, runs, reminders, and containers for ThreadsScreen', async () => {
    const { threadId, runId } = setupThreadsApi();

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsThreads />
        </TestProviders>
      </MemoryRouter>,
    );

    await screen.findByTestId('threads-screen');
    await waitFor(() => {
      const props = renderSpy.mock.calls.at(-1)?.[0];
      expect(props?.threads).toHaveLength(1);
      expect(props?.runs).toHaveLength(1);
      expect(props?.reminders).toHaveLength(1);
    });
    const props = renderSpy.mock.calls.at(-1)?.[0];
    expect(props).toBeTruthy();
    expect(props?.threads?.[0]).toMatchObject({ id: threadId, agentName: 'Agent Alpha', status: 'running', isOpen: true });
    expect(props?.runs?.[0]).toMatchObject({ id: runId, status: 'finished' });
    expect(props?.runs?.[0]?.messages?.map((m: any) => m.id)).toEqual(['msg-in', 'msg-injected', 'msg-out']);
    expect(props?.containers).toEqual([]);
  });

  it('updates selectedThreadId when ThreadsScreen invokes onSelectThread', async () => {
    const { threadId, secondThreadId } = setupThreadsApi({ includeSecondThread: true });

    render(
      <MemoryRouter>
        <TestProviders>
          <AgentsThreads />
        </TestProviders>
      </MemoryRouter>,
    );

    await screen.findByTestId('threads-screen');
    await waitFor(() => {
      const props = renderSpy.mock.calls.at(-1)?.[0];
      expect(props?.threads).toHaveLength(2);
      expect(props?.selectedThreadId).toBe(threadId);
    });

    const initialProps = renderSpy.mock.calls.at(-1)?.[0];
    initialProps?.onSelectThread?.(secondThreadId);

    await waitFor(() => {
      const nextProps = renderSpy.mock.calls.at(-1)?.[0];
      expect(nextProps?.selectedThreadId).toBe(secondThreadId);
    });
  });
});
