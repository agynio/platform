import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import { graphSocket } from '../src/lib/graph/socket';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads queue realtime updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const THREAD_ID = '00000000-0000-0000-0000-000000000001';

  async function waitForListenerSet<T>(
    key: 'agentQueueEnqueuedListeners' | 'agentQueueDrainedListeners',
  ): Promise<Set<T>> {
    await waitFor(() =>
      expect(((graphSocket as any)[key] as Set<T> | undefined)?.size ?? 0).toBeGreaterThan(0),
    );
    return (graphSocket as any)[key] as Set<T>;
  }

  function setupBaseMocks() {
    const thread = { id: THREAD_ID, alias: 'th-a', summary: 'Thread A', status: 'open', createdAt: t(0) };
    const queueItems: Array<{ id: string; kind: 'user' | 'assistant' | 'system'; text: string; enqueuedAt: string }> = [];
    const queueHandler = vi.fn(() => HttpResponse.json({ items: queueItems }));

    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [thread] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [thread] })),
      http.get(`/api/agents/threads/${THREAD_ID}`, () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 } })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}`), () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 } })),
      http.get(`/api/agents/threads/${THREAD_ID}/children`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/children`), () => HttpResponse.json({ items: [] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
      http.get(`/api/agents/threads/${THREAD_ID}/queue`, queueHandler),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/queue`), queueHandler),
    );

    return { queueItems, queueHandler };
  }

  it('reflects enqueued and drained queue events without manual refresh', async () => {
    const { queueItems, queueHandler } = setupBaseMocks();
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
    expect(within(conversation).queryByText('PENDING')).toBeNull();

    queueItems.push({ id: 'queued-1', kind: 'assistant', text: 'Needs processing', enqueuedAt: t(5) });
    await waitFor(() => expect(queueHandler).toHaveBeenCalled());
    const initialCalls = queueHandler.mock.calls.length;
    const enqueueListeners = await waitForListenerSet<(payload: { threadId: string; at: string }) => void>(
      'agentQueueEnqueuedListeners',
    );

    await act(async () => {
      for (const listener of enqueueListeners) {
        listener({ threadId: THREAD_ID, at: t(5) });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const pendingLabel = await within(conversation).findByText('PENDING');
    const pendingRoot = pendingLabel.parentElement?.parentElement as HTMLElement | null;
    expect(pendingRoot).not.toBeNull();
    if (!pendingRoot) throw new Error('Pending section missing');
    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(initialCalls + 1));
    await waitFor(() => expect(within(pendingRoot).getByText('Needs processing')).toBeInTheDocument());

    queueItems.splice(0);
    const drainedListeners = await waitForListenerSet<(payload: { threadId: string; at: string }) => void>(
      'agentQueueDrainedListeners',
    );
    const beforeDrainCalls = queueHandler.mock.calls.length;
    await act(async () => {
      for (const listener of drainedListeners) {
        listener({ threadId: THREAD_ID, at: t(10) });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitFor(() => expect(queueHandler).toHaveBeenCalledTimes(beforeDrainCalls + 1));
    await waitFor(() => expect(within(conversation).queryByText('PENDING')).toBeNull());
  });
});
