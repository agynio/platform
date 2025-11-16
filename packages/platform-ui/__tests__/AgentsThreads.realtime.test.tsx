import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpyInstance } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import * as socketModule from '../src/lib/graph/socket';
import { MemoryRouter } from 'react-router-dom';
import * as threadsModule from '../src/api/modules/threads';

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

const THREAD_A_ID = '11111111-1111-1111-1111-111111111111';
const THREAD_A_ALIAS = 'thread-alias-a';
const THREAD_B_ID = '22222222-2222-2222-2222-222222222222';
const THREAD_B_ALIAS = 'thread-alias-b';

describe('AgentsThreads realtime updates', () => {
  beforeAll(() => server.listen());
  let resolveIdentifierSpy: SpyInstance;
  beforeEach(() => {
    resolveIdentifierSpy = vi.spyOn(threadsModule.threads, 'resolveIdentifier').mockImplementation(async (identifier: string) => ({
      id: identifier,
      alias: identifier,
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  it('adds a new run when run_status_changed signals running', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () => HttpResponse.json({ items: [] })),
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
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run-st-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () =>
        HttpResponse.json({ items: [{ id: 'run-st-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get('/api/agents/runs/run-st-1/messages', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/runs/run-st-1/messages'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await expectRunHeaderVisible('run-st-1');
    const header = screen.getAllByTestId('run-header')[0];
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
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run-msg-1', status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () =>
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
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await expectRunHeaderVisible('run-msg-1');
    const list = await screen.findByTestId('message-list');
    await within(list).findByText('Initial');

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
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () => HttpResponse.json({ items: [] })),
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

  it('reconciles thread_created and thread_updated events in the threads list', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', status: 'open', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', status: 'open', createdAt: t(0) }] }),
      ),
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    await screen.findByRole('button', { name: /Thread A/i });

    const createdListeners = (socketModule.graphSocket as any).threadCreatedListeners as Set<
      (payload: { thread: { id: string; alias: string; summary: string | null; status: 'open' | 'closed'; parentId?: string | null; createdAt: string } }) => void
    >;
    for (const fn of createdListeners)
      fn({
        thread: {
          id: THREAD_B_ID,
          alias: THREAD_B_ALIAS,
          summary: 'Thread B',
          status: 'open',
          parentId: null,
          createdAt: t(1),
        },
      });

    await screen.findByRole('button', { name: /Thread B/i });

    const updatedListeners = (socketModule.graphSocket as any).threadUpdatedListeners as Set<
      (payload: { thread: { id: string; alias: string; summary: string | null; status: 'open' | 'closed'; parentId?: string | null; createdAt: string } }) => void
    >;
    for (const fn of updatedListeners)
      fn({
        thread: {
          id: THREAD_B_ID,
          alias: THREAD_B_ALIAS,
          summary: 'Thread B Updated',
          status: 'open',
          parentId: null,
          createdAt: t(1),
        },
      });

    await screen.findByRole('button', { name: /Thread B Updated/i });

    for (const fn of updatedListeners)
      fn({
        thread: {
          id: THREAD_B_ID,
          alias: THREAD_B_ALIAS,
          summary: 'Thread B Updated',
          status: 'closed',
          parentId: null,
          createdAt: t(1),
        },
      });

    await waitFor(() => expect(screen.queryByRole('button', { name: /Thread B Updated/i })).toBeNull());
  });

  it('resolves thread alias from query param before subscribing to thread rooms', async () => {
    resolveIdentifierSpy.mockResolvedValue({ id: 'th-real-uuid', alias: 'alias-1' });
    const subscribeSpy = vi.spyOn(socketModule.graphSocket, 'subscribe');

    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: 'th-real-uuid', alias: 'alias-1', summary: 'Thread Alias', status: 'open', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: 'th-real-uuid', alias: 'alias-1', summary: 'Thread Alias', status: 'open', createdAt: t(0) }] }),
      ),
      http.get('/api/agents/threads/th-real-uuid/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th-real-uuid/runs'), () => HttpResponse.json({ items: [] })),
    );

    render(
      <TestProviders>
        <MemoryRouter initialEntries={["/agents/threads?thread=alias-1"]}>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    await screen.findByRole('button', { name: /Thread Alias/i });

    await waitFor(() => {
      expect(
        subscribeSpy.mock.calls.some((call) => Array.isArray(call[0]) && call[0].includes('thread:th-real-uuid')),
      ).toBe(true);
    });

    expect(
      subscribeSpy.mock.calls.some((call) => Array.isArray(call[0]) && call[0].includes('thread:alias-1')),
    ).toBe(false);
  });

  it('re-subscribes on reconnect and reconciles via refetch', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_A_ID, alias: THREAD_A_ALIAS, summary: 'Thread A', createdAt: t(0) }] }),
      ),
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () =>
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
    );

    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thread A/i }));
    await expectRunHeaderVisible('run-base');

    server.use(
      http.get(`/api/agents/threads/${THREAD_A_ID}/runs`, () =>
        HttpResponse.json({
          items: [
            { id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run-new', status: 'running', createdAt: t(4), updatedAt: t(4) },
          ],
        }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_A_ID}/runs`), () =>
        HttpResponse.json({
          items: [
            { id: 'run-base', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run-new', status: 'running', createdAt: t(4), updatedAt: t(4) },
          ],
        }),
      ),
      http.get('/api/agents/runs/run-new/messages', () => HttpResponse.json({ items: [{ id: 'msg-new', kind: 'assistant', text: 'New', source: {}, createdAt: t(5) }] })),
      http.get(abs('/api/agents/runs/run-new/messages'), () => HttpResponse.json({ items: [{ id: 'msg-new', kind: 'assistant', text: 'New', source: {}, createdAt: t(5) }] })),
    );

    const reconnectListeners = (socketModule.graphSocket as any).reconnectCallbacks as Set<() => void>;
    for (const fn of reconnectListeners) fn();

    await expectRunHeaderVisible('run-new');
    const list = await screen.findByTestId('message-list');
    await expectMessageBubbleText(list, 'New');
  });
});
