import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import type * as ConfigModule from '@/config';
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
const THREAD_ALIAS = 'thr-a';
const THREAD_SUMMARY = 'Thread A';
const THREAD_ENDPOINT = `/api/agents/threads/${THREAD_ID}`;
const THREAD_RUNS_ENDPOINT = `${THREAD_ENDPOINT}/runs`;

const EXISTING_RUN_ID = '22222222-2222-2222-2222-222222222222';
const NEW_RUN_ID = '33333333-3333-3333-3333-333333333333';
const STREAM_RUN_ID = '44444444-4444-4444-4444-444444444444';
const STREAM_MESSAGE_ID = '55555555-5555-5555-5555-555555555555';
const BUFFERED_RUN_ID = '66666666-6666-6666-6666-666666666666';

const REMINDERS_ENDPOINT = '/api/agents/reminders';

let socketServer: TestSocketServer;

function runMessagesEndpoint(runId: string) {
  return `/api/agents/runs/${runId}/messages`;
}

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

function threadRoom(threadId: string) {
  return `thread:${threadId}`;
}

async function waitForThreadSubscription(threadId: string) {
  await socketServer.waitForRoom(threadRoom(threadId));
}

describe('AgentsThreads realtime updates', () => {
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

  it('adds a new run when run_status_changed signals running', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(THREAD_RUNS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(THREAD_RUNS_ENDPOINT), () => HttpResponse.json({ items: [] })),
      http.get(REMINDERS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(REMINDERS_ENDPOINT), () => HttpResponse.json({ items: [] })),
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

    await waitForThreadSubscription(THREAD_ID);

    socketServer.emitRunStatusChanged(THREAD_ID, {
      id: NEW_RUN_ID,
      status: 'running',
      createdAt: t(1),
      updatedAt: t(1),
    });

    await expectRunHeaderVisible(NEW_RUN_ID);
  });

  it('updates run status in place on run_status_changed', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(THREAD_RUNS_ENDPOINT, () =>
        HttpResponse.json({ items: [{ id: EXISTING_RUN_ID, status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs(THREAD_RUNS_ENDPOINT), () =>
        HttpResponse.json({ items: [{ id: EXISTING_RUN_ID, status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(runMessagesEndpoint(EXISTING_RUN_ID), () => HttpResponse.json({ items: [] })),
      http.get(abs(runMessagesEndpoint(EXISTING_RUN_ID)), () => HttpResponse.json({ items: [] })),
      http.get(REMINDERS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(REMINDERS_ENDPOINT), () => HttpResponse.json({ items: [] })),
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

    await waitForThreadSubscription(THREAD_ID);

    socketServer.emitRunStatusChanged(THREAD_ID, {
      id: EXISTING_RUN_ID,
      status: 'finished',
      createdAt: t(1),
      updatedAt: t(2),
    });

    await waitFor(() => expect(within(header).getByText('finished')).toBeInTheDocument());
  });

  it('appends streamed messages once and dedupes duplicates', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(THREAD_RUNS_ENDPOINT, () =>
        HttpResponse.json({ items: [{ id: STREAM_RUN_ID, status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(abs(THREAD_RUNS_ENDPOINT), () =>
        HttpResponse.json({ items: [{ id: STREAM_RUN_ID, status: 'running', createdAt: t(1), updatedAt: t(1) }] }),
      ),
      http.get(runMessagesEndpoint(STREAM_RUN_ID), ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('type') === 'output')
          return HttpResponse.json({
            items: [
              {
                id: '11111111-aaaa-bbbb-cccc-111111111111',
                kind: 'assistant',
                text: 'Initial',
                source: {},
                createdAt: t(5),
              },
            ],
          });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs(runMessagesEndpoint(STREAM_RUN_ID)), ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('type') === 'output')
          return HttpResponse.json({
            items: [
              {
                id: '11111111-aaaa-bbbb-cccc-111111111111',
                kind: 'assistant',
                text: 'Initial',
                source: {},
                createdAt: t(5),
              },
            ],
          });
        return HttpResponse.json({ items: [] });
      }),
      http.get(REMINDERS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(REMINDERS_ENDPOINT), () => HttpResponse.json({ items: [] })),
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

    await waitForThreadSubscription(THREAD_ID);

    const streamedPayload = {
      id: STREAM_MESSAGE_ID,
      kind: 'assistant' as const,
      text: 'Streamed',
      source: {},
      createdAt: t(6),
      runId: STREAM_RUN_ID,
    };

    socketServer.emitMessageCreated(THREAD_ID, streamedPayload);
    await waitFor(async () => expect((await within(list).findAllByTestId('message-bubble')).length).toBe(2));

    socketServer.emitMessageCreated(THREAD_ID, streamedPayload);
    await waitFor(async () => expect((await within(list).findAllByTestId('message-bubble')).length).toBe(2));
  });

  it('buffers messages for unknown runs until the run is created', async () => {
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: THREAD_SUMMARY, createdAt: t(0) }] }),
      ),
      http.get(THREAD_RUNS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(THREAD_RUNS_ENDPOINT), () => HttpResponse.json({ items: [] })),
      http.get(REMINDERS_ENDPOINT, () => HttpResponse.json({ items: [] })),
      http.get(abs(REMINDERS_ENDPOINT), () => HttpResponse.json({ items: [] })),
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

    await waitForThreadSubscription(THREAD_ID);

    socketServer.emitMessageCreated(THREAD_ID, {
      id: '77777777-7777-7777-7777-777777777777',
      kind: 'assistant',
      text: 'Buffered',
      source: {},
      createdAt: t(2),
      runId: BUFFERED_RUN_ID,
    });

    expect(screen.queryByText('Buffered')).toBeNull();

    socketServer.emitRunStatusChanged(THREAD_ID, {
      id: BUFFERED_RUN_ID,
      status: 'running',
      createdAt: t(1),
      updatedAt: t(1),
    });

    socketServer.emitMessageCreated(THREAD_ID, {
      id: '77777777-7777-7777-7777-777777777777',
      kind: 'assistant',
      text: 'Buffered',
      source: {},
      createdAt: t(2),
      runId: BUFFERED_RUN_ID,
    });

    await expectMessageBubbleText(await screen.findByTestId('message-list'), 'Buffered');
  });
});
