import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import * as socketModule from '../src/lib/graph/socket';
import { MemoryRouter } from 'react-router-dom';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

async function expectRunHeaderVisible(runId: string) {
  await waitFor(() => {
    const headers = screen.queryAllByTestId('run-header');
    const shortId = runId.slice(0, 8).toLowerCase();
    const match = headers.some((el) => el.textContent?.toLowerCase().includes(`run ${shortId}`));
    expect(match).toBe(true);
  });
}

async function expectMessageBubbleText(container: HTMLElement, text: string) {
  await waitFor(() => {
    const bubbles = within(container).queryAllByTestId('message-bubble');
    const match = bubbles.some((bubble) => bubble.textContent?.includes(text));
    expect(match).toBe(true);
  });
}

describe('AgentsThreads realtime updates', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('adds a new run when run_status_changed signals running', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    const threadBtn = await screen.findByRole('button', { name: /Thread A/i });
    fireEvent.click(threadBtn);
    await screen.findByTestId('message-list');

    const runListeners = (socketModule.graphSocket as any).runStatusListeners as Set<
      (payload: { run: { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string } }) => void
    >;
    for (const fn of runListeners) fn({ run: { id: 'run-new-1', status: 'running', createdAt: t(1), updatedAt: t(1) } });

    await expectRunHeaderVisible('run-new-1');
  });

  it('updates run status in place on run_status_changed', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-st-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-st-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get('/api/agents/runs/run-st-1/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-st-1/messages'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    const header = (await screen.findAllByTestId('run-header'))[0];
    expect(within(header).getByText('running')).toBeInTheDocument();

    const runListeners = (socketModule.graphSocket as any).runStatusListeners as Set<
      (payload: { run: { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string } }) => void
    >;
    for (const fn of runListeners) fn({ run: { id: 'run-st-1', status: 'finished', createdAt: t(1), updatedAt: t(2) } });

    await waitFor(() => expect(within(header).getByText('finished')).toBeInTheDocument());
  });

  it('appends streamed messages once and dedupes duplicates', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-msg-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-msg-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get('/api/agents/runs/run-msg-1/messages', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'msg-initial', kind: 'assistant', text: 'Initial', source: {}, createdAt: t(5) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run-msg-1/messages'), ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'msg-initial', kind: 'assistant', text: 'Initial', source: {}, createdAt: t(5) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    const list = await screen.findByTestId('message-list');
    await waitFor(async () => expect((await within(list).findAllByTestId('message-bubble')).length).toBe(1));

    const messageListeners = (socketModule.graphSocket as any).messageCreatedListeners as Set<
      (payload: { message: { id: string; kind: 'assistant' | 'user' | 'system' | 'tool'; text: string | null; source: unknown; createdAt: string; runId?: string } }) => void
    >;
    const payload = { message: { id: 'msg-stream', kind: 'assistant', text: 'Streamed', source: {}, createdAt: t(6), runId: 'run-msg-1' } };
    for (const fn of messageListeners) fn(payload);
    await waitFor(async () => expect((await within(list).findAllByTestId('message-bubble')).length).toBe(2));

    for (const fn of messageListeners) fn(payload);
    await waitFor(async () => expect((await within(list).findAllByTestId('message-bubble')).length).toBe(2));
  });

  it('buffers messages for unknown runs until the run is created', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/runs'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByTestId('message-list');

    const messageListeners = (socketModule.graphSocket as any).messageCreatedListeners as Set<
      (payload: { message: { id: string; kind: 'assistant' | 'user' | 'system' | 'tool'; text: string | null; source: unknown; createdAt: string; runId?: string } }) => void
    >;
    for (const fn of messageListeners)
      fn({ message: { id: 'msg-buffer', kind: 'assistant', text: 'Buffered', source: {}, createdAt: t(2), runId: 'run-late' } });

    expect(screen.queryByText('Buffered')).toBeNull();

    const runListeners = (socketModule.graphSocket as any).runStatusListeners as Set<
      (payload: { run: { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string } }) => void
    >;
    for (const fn of runListeners) fn({ run: { id: 'run-late', status: 'running', createdAt: t(1), updatedAt: t(1) } });

    await expectRunHeaderVisible('run-late');
    const list = await screen.findByTestId('message-list');
    await expectMessageBubbleText(list, 'Buffered');
  });

  it('re-subscribes on reconnect and reconciles via refetch', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run-base/messages', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('type') === 'output') {
          return HttpResponse.json({ items: [{ id: 'msg-base', kind: 'assistant', text: 'Base', source: {}, createdAt: t(3) }] });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run-base/messages'), ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('type') === 'output') {
          return HttpResponse.json({ items: [{ id: 'msg-base', kind: 'assistant', text: 'Base', source: {}, createdAt: t(3) }] });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByText(/run run-base/i);

    server.use(
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({
          items: [
            { id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run-new', status: 'running', createdAt: t(4), updatedAt: t(4) },
          ],
        }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({
          items: [
            { id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run-new', status: 'running', createdAt: t(4), updatedAt: t(4) },
          ],
        }),
      ),
      http.get('/api/agents/runs/run-new/messages', () => HttpResponse.json({ items: [{ id: 'msg-new', kind: 'assistant', text: 'New', source: {}, createdAt: t(5) }] })),
      http.get(abs('/api/agents/runs/run-new/messages'), () => HttpResponse.json({ items: [{ id: 'msg-new', kind: 'assistant', text: 'New', source: {}, createdAt: t(5) }] })),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    const reconnectListeners = (socketModule.graphSocket as any).reconnectCallbacks as Set<() => void>;
    for (const fn of reconnectListeners) fn();

    await expectRunHeaderVisible('run-new');
    const list = await screen.findByTestId('message-list');
    await expectMessageBubbleText(list, 'New');
  });

  it('shows reminder countdown for finished run threads', async () => {
    const now = Date.now();
    const reminderAt = new Date(now + 15000).toISOString();
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run-finished/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-finished/messages'), () => HttpResponse.json({ items: [] })),
      http.get('/api/agents/reminders', () =>
        HttpResponse.json({ items: [{ id: 'rem-1', threadId: 'th1', note: 'Check back soon', at: reminderAt, createdAt: t(3), completedAt: null }] }),
      ),
      http.get(abs('/api/agents/reminders'), () =>
        HttpResponse.json({ items: [{ id: 'rem-1', threadId: 'th1', note: 'Check back soon', at: reminderAt, createdAt: t(3), completedAt: null }] }),
      ),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByTestId('reminder-countdown-row');
    expect(screen.getByText('Check back soon')).toBeInTheDocument();
    expect(screen.getByText(/Due in/i)).toBeInTheDocument();
  });

  it('does not show countdown when reminders belong to another thread', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run-finished/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-finished/messages'), () => HttpResponse.json({ items: [] })),
    );
    const foreignReminder = {
      items: [
        {
          id: 'rem-foreign',
          threadId: 'th2',
          note: 'Other thread reminder',
          at: new Date(Date.now() + 30000).toISOString(),
          createdAt: t(3),
          completedAt: null,
        },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json(foreignReminder)),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(foreignReminder)),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByTestId('run-header');

    await waitFor(() => {
      expect(screen.queryByTestId('reminder-countdown-row')).toBeNull();
    });
  });

  it('clears countdown when thread_reminders_count reports zero', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run-finished/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-finished/messages'), () => HttpResponse.json({ items: [] })),
    );
    const reminderItems = {
      items: [
        {
          id: 'rem-1',
          threadId: 'th1',
          note: 'Follow up',
          at: new Date(Date.now() + 30000).toISOString(),
          createdAt: t(3),
          completedAt: null,
        },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json(reminderItems)),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(reminderItems)),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByTestId('reminder-countdown-row');

    const reminderListeners = (socketModule.graphSocket as any).threadRemindersListeners as Set<
      (payload: { threadId: string; remindersCount: number }) => void
    >;
    for (const fn of reminderListeners) fn({ threadId: 'th1', remindersCount: 0 });

    await waitFor(() => {
      expect(screen.queryByTestId('reminder-countdown-row')).toBeNull();
    });
  });

  it('refetches reminders when a run finishes', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run-finished/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-finished/messages'), () => HttpResponse.json({ items: [] })),
    );
    let reminderItems = {
      items: [
        {
          id: 'rem-1',
          threadId: 'th1',
          note: 'Follow up',
          at: new Date(Date.now() + 60000).toISOString(),
          createdAt: t(3),
          completedAt: null,
        },
      ],
    };
    server.use(
      http.get('/api/agents/reminders', () => HttpResponse.json(reminderItems)),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json(reminderItems)),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await screen.findByTestId('reminder-countdown-row');

    reminderItems = { items: [] };
    const runListeners = (socketModule.graphSocket as any).runStatusListeners as Set<
      (payload: { run: { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string } }) => void
    >;
    for (const fn of runListeners) fn({ run: { id: 'run-finished', status: 'finished', createdAt: t(1), updatedAt: t(4) } });

    await waitFor(() => {
      expect(screen.queryByTestId('reminder-countdown-row')).toBeNull();
    });
  });
});
