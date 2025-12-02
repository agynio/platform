import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import { graphSocket } from '../src/lib/graph/socket';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => navigateMock,
  };
});

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads conversation view', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
  });
  afterAll(() => server.close());

  const THREAD_ID = '00000000-0000-0000-0000-000000000001';

  async function waitForListenerSet<T>(
    key:
      | 'messageCreatedListeners'
      | 'agentQueueEnqueuedListeners'
      | 'agentQueueDrainedListeners'
      | 'runStatusListeners',
  ): Promise<Set<T>> {
    await waitFor(() =>
      expect(((graphSocket as any)[key] as Set<T> | undefined)?.size ?? 0).toBeGreaterThan(0),
    );
    return (graphSocket as any)[key] as Set<T>;
  }

  function setupThreadData() {
    const thread = {
      id: THREAD_ID,
      alias: 'th-a',
      summary: 'Thread A',
      status: 'open',
      createdAt: t(0),
      parentId: null,
      metrics: { remindersCount: 1, containersCount: 1, activity: 'working', runsCount: 1 },
    };

    const runMeta = { id: 'run1', threadId: THREAD_ID, status: 'finished', createdAt: t(1), updatedAt: t(2) };

    const reminders = [{ id: 'rem1', threadId: THREAD_ID, note: 'Follow up', at: t(50) }];
    const containers = [
      {
        containerId: 'cont-1',
        threadId: THREAD_ID,
        image: 'ai:latest',
        name: 'cont-1-name',
        status: 'running',
        startedAt: t(0),
        lastUsedAt: t(1),
        killAfterAt: null,
        role: 'workspace',
      },
    ];

    const runsHandler = () => HttpResponse.json({ items: [runMeta] });
    const threadsHandler = () => HttpResponse.json({ items: [thread] });
    const threadHandler = () => HttpResponse.json(thread);
    const queueItems: Array<{ id: string; kind: 'user' | 'assistant' | 'system'; text: string; enqueuedAt: string }> = [];
    const queueHandler = vi.fn(() => HttpResponse.json({ items: queueItems }));

    const messagesHandler = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      if (type === 'input') {
        return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi there', createdAt: t(10) }] });
      }
      if (type === 'injected') {
        return HttpResponse.json({ items: [{ id: 'm2', kind: 'system', text: 'Injected context', createdAt: t(15) }] });
      }
      if (type === 'output') {
        return HttpResponse.json({ items: [{ id: 'm3', kind: 'assistant', text: 'Hello from agent', createdAt: t(20) }] });
      }
      return HttpResponse.json({ items: [] });
    };

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get(`/api/agents/threads/${THREAD_ID}`, threadHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}`), threadHandler),
      http.get(`/api/agents/threads/${THREAD_ID}/children`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/children`), () => HttpResponse.json({ items: [] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, runsHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), runsHandler),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: reminders })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: reminders })),
      http.get('/api/containers', () => HttpResponse.json({ items: containers })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: containers })),
      http.get('/api/agents/runs/run1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run1/messages'), messagesHandler),
      http.get(`/api/agents/threads/${THREAD_ID}/queue`, queueHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/queue`), queueHandler),
    );

    return { queueItems, queueHandler };
  }

  it('renders conversation messages and run info, and navigates to run timeline', async () => {
    setupThreadData();

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadRow = await screen.findByText('Thread A');
    await user.click(threadRow);

    const conversation = await screen.findByTestId('conversation');
    const messages = await within(conversation).findAllByTestId('conversation-message');
    expect(messages).toHaveLength(3);
    expect(messages[0]).toHaveTextContent('Hi there');
    expect(messages[0]).toHaveAttribute('data-role', 'user');
    expect(messages[1]).toHaveAttribute('data-role', 'system');
    expect(messages[2]).toHaveAttribute('data-role', 'assistant');

    const runInfo = await within(conversation).findByTestId('run-info');
    expect(runInfo).toHaveTextContent('Finished');
    const viewRunButton = within(runInfo).getByRole('button', { name: /View Run/i });
    await user.click(viewRunButton);
    expect(navigateMock).toHaveBeenCalledWith(`/agents/threads/${THREAD_ID}/runs/run1/timeline`);
  });

  it('shows reminders and queued messages under pending, then moves queued items into runs when the run starts', async () => {
    const { queueItems, queueHandler } = setupThreadData();

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadRow = await screen.findByText('Thread A');
    await user.click(threadRow);

    const conversation = await screen.findByTestId('conversation');
    await within(conversation).findByText('Follow up');
    const pendingLabel = within(conversation).getByText('PENDING');
    const pendingRoot = pendingLabel.parentElement?.parentElement as HTMLElement | null;
    expect(pendingRoot).not.toBeNull();
    if (!pendingRoot) throw new Error('Pending section not rendered');

    expect(within(pendingRoot).getByText('Follow up')).toBeInTheDocument();
    expect(within(pendingRoot).queryByText('Pending reply')).toBeNull();

    const bufferedPayload = {
      threadId: THREAD_ID,
      message: {
        id: 'msg-buffer',
        kind: 'assistant' as const,
        text: 'Pending reply',
        source: {},
        createdAt: t(55),
        runId: 'run-late',
      },
    };

    const messageListeners = await waitForListenerSet<(payload: typeof bufferedPayload) => void>('messageCreatedListeners');
    const queueEnqueuedListeners = await waitForListenerSet<(payload: { threadId: string; at: string }) => void>(
      'agentQueueEnqueuedListeners',
    );
    queueItems.push({ id: 'queued-run-late', kind: 'assistant', text: 'Pending reply', enqueuedAt: t(55) });

    await waitFor(() => expect(queueHandler).toHaveBeenCalled());
    const initialQueueCalls = queueHandler.mock.calls.length;

    await act(async () => {
      for (const listener of queueEnqueuedListeners) {
        listener({ threadId: THREAD_ID, at: t(55) });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await act(async () => {
      for (const listener of messageListeners) {
        listener(bufferedPayload);
      }
    });

    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(initialQueueCalls + 1));
    await waitFor(() => {
      expect(within(pendingRoot).getByText('Pending reply')).toBeInTheDocument();
    });
    expect(
      within(conversation)
        .queryAllByTestId('conversation-message')
        .some((node) => within(node).queryByText('Pending reply')),
    ).toBe(false);

    queueItems.splice(0);

    const runPayload = {
      threadId: THREAD_ID,
      run: { id: 'run-late', status: 'running' as const, createdAt: t(56), updatedAt: t(57) },
    };
    const runListeners = await waitForListenerSet<(payload: typeof runPayload) => void>('runStatusListeners');
    const queueDrainedListeners = await waitForListenerSet<(payload: { threadId: string; at: string }) => void>(
      'agentQueueDrainedListeners',
    );
    const beforeDrainCalls = queueHandler.mock.calls.length;
    await act(async () => {
      for (const listener of runListeners) {
        listener(runPayload);
      }
    });
    await act(async () => {
      for (const listener of queueDrainedListeners) {
        listener({ threadId: THREAD_ID, at: t(56) });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(beforeDrainCalls + 1));
    await waitFor(() => expect(within(pendingRoot).queryByText('Pending reply')).toBeNull());

    await waitFor(() => {
      const nodes = within(conversation).queryAllByTestId('conversation-message');
      const found = nodes.some((node) => within(node).queryByText('Pending reply'));
      expect(found).toBe(true);
    });

  });

  it('loads subthreads when expanding a thread', async () => {
    setupThreadData();

    const childThread = {
      id: '00000000-0000-0000-0000-000000000002',
      alias: 'th-child',
      summary: 'Child thread',
      status: 'open',
      parentId: THREAD_ID,
      createdAt: t(3),
      metrics: { remindersCount: 0, containersCount: 0, activity: 'waiting', runsCount: 0 },
      agentTitle: 'Agent Junior',
    };

    const childrenHandler = vi.fn(() => HttpResponse.json({ items: [childThread] }));

    server.use(
      http.get(`/api/agents/threads/${THREAD_ID}/children`, () => childrenHandler()),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/children`), () => childrenHandler()),
    );

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const expandButton = await screen.findByRole('button', { name: /Show subthreads/i });
    expect(expandButton).toBeInTheDocument();

    await user.click(expandButton);

    const childRow = await screen.findByText('Child thread');
    expect(childRow).toBeInTheDocument();
    expect(childrenHandler).toHaveBeenCalled();
  });
});
