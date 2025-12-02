import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import { graphSocket } from '../src/lib/graph/socket';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads realtime updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
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

  function setupBaseMocks(withRuns: boolean) {
    const thread = { id: THREAD_ID, alias: 'th-a', summary: 'Thread A', status: 'open', createdAt: t(0) };
    const runs = withRuns
      ? [{ id: 'run-1', threadId: THREAD_ID, status: 'running', createdAt: t(1), updatedAt: t(1) }]
      : [];

    const threadsHandler = () => HttpResponse.json({ items: [thread] });
    const runsHandler = () => HttpResponse.json({ items: runs });
    const messagesHandler = () => HttpResponse.json({ items: [] });
    const queueItems: Array<{ id: string; kind: 'user' | 'assistant' | 'system'; text: string; enqueuedAt: string }> = [];
    const queueHandler = vi.fn(() => HttpResponse.json({ items: queueItems }));

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get(`/api/agents/threads/${THREAD_ID}`, () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: runs.length } })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}`), () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: runs.length } })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, runsHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), runsHandler),
      http.get(`/api/agents/threads/${THREAD_ID}/children`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/children`), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/runs/run-1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run-1/messages'), messagesHandler),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      http.get(`/api/agents/threads/${THREAD_ID}/queue`, queueHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/queue`), queueHandler),
    );

    return { queueItems, queueHandler };
  }

  it('appends streamed messages for known runs and deduplicates duplicates', async () => {
    setupBaseMocks(true);

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    await user.click(await screen.findByText('Thread A'));
    const conversation = await screen.findByTestId('conversation');
    await waitFor(() => expect(within(conversation).queryAllByTestId('conversation-message')).toHaveLength(0));

    const payload = {
      threadId: THREAD_ID,
      message: { id: 'msg-1', kind: 'assistant', text: 'Streamed', source: {}, createdAt: t(5), runId: 'run-1' },
    } as const;

    const listeners = await waitForListenerSet<(p: typeof payload) => void>('messageCreatedListeners');
    await act(async () => {
      for (const listener of listeners) {
        listener(payload);
      }
    });

    await waitFor(() => expect(within(conversation).queryAllByTestId('conversation-message')).toHaveLength(1));
    expect(within(conversation).getByText('Streamed')).toBeInTheDocument();

    await act(async () => {
      for (const listener of listeners) {
        listener(payload);
      }
    });
    await waitFor(() => expect(within(conversation).queryAllByTestId('conversation-message')).toHaveLength(1));
  });

  it('buffers streamed messages until the corresponding run appears', async () => {
    const { queueItems, queueHandler } = setupBaseMocks(false);

    const user = userEvent.setup();

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    await user.click(await screen.findByText('Thread A'));
    const conversation = await screen.findByTestId('conversation');

    const bufferedPayload = {
      threadId: THREAD_ID,
      message: { id: 'msg-buffer', kind: 'assistant', text: 'Buffered message', source: {}, createdAt: t(5), runId: 'run-late' },
    } as const;

    queueItems.push({ id: 'queued-buffer', kind: 'assistant', text: 'Buffered message', enqueuedAt: t(5) });

    const queueEnqueuedListeners = await waitForListenerSet<(p: { threadId: string; at: string }) => void>(
      'agentQueueEnqueuedListeners',
    );
    const messageListeners = await waitForListenerSet<(p: typeof bufferedPayload) => void>('messageCreatedListeners');

    await waitFor(() => expect(queueHandler).toHaveBeenCalled());
    const initialQueueCalls = queueHandler.mock.calls.length;

    await act(async () => {
      for (const listener of queueEnqueuedListeners) {
        listener({ threadId: THREAD_ID, at: t(5) });
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

    const pendingLabel = await within(conversation).findByText('PENDING');
    const pendingRoot = pendingLabel.parentElement?.parentElement as HTMLElement | null;
    expect(pendingRoot).not.toBeNull();
    if (!pendingRoot) throw new Error('Missing pending section');
    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(initialQueueCalls + 1));
    await waitFor(() => expect(within(pendingRoot).getByText('Buffered message')).toBeInTheDocument());

    const runPayload = {
      threadId: THREAD_ID,
      run: { id: 'run-late', status: 'running', createdAt: t(1), updatedAt: t(1) },
    } as const;
    const runListeners = await waitForListenerSet<(p: typeof runPayload) => void>('runStatusListeners');
    const queueDrainedListeners = await waitForListenerSet<(p: { threadId: string; at: string }) => void>(
      'agentQueueDrainedListeners',
    );
    const beforeDrainCalls = queueHandler.mock.calls.length;

    queueItems.splice(0);

    await act(async () => {
      for (const listener of runListeners) {
        listener(runPayload);
      }
    });
    await act(async () => {
      for (const listener of queueDrainedListeners) {
        listener({ threadId: THREAD_ID, at: t(6) });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(beforeDrainCalls + 1));
    await waitFor(() => expect(within(conversation).queryByText('PENDING')).toBeNull());
    await waitFor(() => expect(within(conversation).getByText('Buffered message')).toBeInTheDocument());
  });
});
