import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

  function setupBaseMocks(withRuns: boolean) {
    const thread = { id: 'th1', alias: 'th-a', summary: 'Thread A', status: 'open', createdAt: t(0) };
    const runs = withRuns
      ? [{ id: 'run-1', threadId: 'th1', status: 'running', createdAt: t(1), updatedAt: t(1) }]
      : [];

    const threadsHandler = () => HttpResponse.json({ items: [thread] });
    const runsHandler = () => HttpResponse.json({ items: runs });
    const messagesHandler = () => HttpResponse.json({ items: [] });

    server.use(
      http.get('/api/agents/threads', threadsHandler),
      http.get(abs('/api/agents/threads'), threadsHandler),
      http.get('/api/agents/threads/th1', () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: runs.length } })),
      http.get(abs('/api/agents/threads/th1'), () => HttpResponse.json({ ...thread, parentId: null, metrics: { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: runs.length } })),
      http.get('/api/agents/threads/th1/runs', runsHandler),
      http.get(abs('/api/agents/threads/th1/runs'), runsHandler),
      http.get('/api/agents/threads/th1/children', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/children'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/runs/run-1/messages', messagesHandler),
      http.get(abs('/api/agents/runs/run-1/messages'), messagesHandler),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
      http.get('/api/containers', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    );
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
      threadId: 'th1',
      message: { id: 'msg-1', kind: 'assistant', text: 'Streamed', source: {}, createdAt: t(5), runId: 'run-1' },
    } as const;

    const listeners = (graphSocket as any).messageCreatedListeners as Set<(p: typeof payload) => void>;
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
    setupBaseMocks(false);

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
      threadId: 'th1',
      message: { id: 'msg-buffer', kind: 'assistant', text: 'Buffered message', source: {}, createdAt: t(5), runId: 'run-late' },
    } as const;

    const messageListeners = (graphSocket as any).messageCreatedListeners as Set<(p: typeof bufferedPayload) => void>;
    await act(async () => {
      for (const listener of messageListeners) {
        listener(bufferedPayload);
      }
    });

    const pendingLabel = await within(conversation).findByText('PENDING');
    const pendingRoot = pendingLabel.parentElement?.parentElement as HTMLElement | null;
    expect(pendingRoot).not.toBeNull();
    if (!pendingRoot) throw new Error('Missing pending section');
    expect(within(pendingRoot).getByText('Buffered message')).toBeInTheDocument();

    const runPayload = {
      threadId: 'th1',
      run: { id: 'run-late', status: 'running', createdAt: t(1), updatedAt: t(1) },
    } as const;
    const runListeners = (graphSocket as any).runStatusListeners as Set<(p: typeof runPayload) => void>;
    await act(async () => {
      for (const listener of runListeners) {
        listener(runPayload);
      }
    });

    await waitFor(() => expect(within(conversation).queryByText('PENDING')).toBeNull());
    await waitFor(() => expect(within(conversation).getByText('Buffered message')).toBeInTheDocument());
  });
});
