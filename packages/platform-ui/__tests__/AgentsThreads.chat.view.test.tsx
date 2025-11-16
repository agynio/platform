import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { MemoryRouter } from 'react-router-dom';
// run selection removed; no extra wrappers needed beyond TestProviders
import { AgentsThreads } from '../src/pages/AgentsThreads';
import * as threadsModule from '../src/api/modules/threads';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

const THREAD_ID = '11111111-1111-1111-1111-111111111111';
const THREAD_ALIAS = 'thread-alias-a';

describe('AgentsThreads chat-like view', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  beforeEach(() => {
    vi.spyOn(threadsModule.threads, 'resolveIdentifier').mockImplementation(async (identifier: string) => ({
      id: identifier,
      alias: identifier,
    }));
  });

  function useThreadsMock() {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run1/messages', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi', source: { a: 1 }, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [{ id: 'm2', kind: 'system', text: 'Injected', source: { b: 2 }, createdAt: t(20) }] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'm3', kind: 'assistant', text: 'Hello!', source: { c: 3 }, createdAt: t(30) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run1/messages'), ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi', source: { a: 1 }, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [{ id: 'm2', kind: 'system', text: 'Injected', source: { b: 2 }, createdAt: t(20) }] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'm3', kind: 'assistant', text: 'Hello!', source: { c: 3 }, createdAt: t(30) }] });
        return HttpResponse.json({ items: [] });
      }),
    );
  }

  it('merges messages chronologically and aligns sides', async () => {
    useThreadsMock();
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );
    const threadBtn = await screen.findByRole('button', { name: /Thread A/ });
    fireEvent.click(threadBtn);
    const list = await screen.findByTestId('message-list');
    expect(await within(list).findAllByTestId('run-header')).toHaveLength(1);
    const bubbles = await within(list).findAllByTestId('message-bubble');
    expect(bubbles).toHaveLength(3);
    expect(bubbles[0].dataset.side).toBe('left');
    expect(bubbles[1].dataset.side).toBe('left');
    expect(bubbles[2].dataset.side).toBe('right');
  });

  it('toggles raw JSON per message', async () => {
    useThreadsMock();
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    const list = await screen.findByTestId('message-list');
    const firstBubble = (await within(list).findAllByTestId('message-bubble'))[0];
    const toggle = within(firstBubble).getByRole('button', { name: /Show raw JSON/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    const pre = await screen.findByTestId('raw-json');
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain('"a": 1');
  });

  it('autoscrolls to bottom and shows jump control when scrolled up', async () => {
    const outputCount = 1;
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run1/messages', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi', source: {}, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') {
          const base = [{ id: 'm3', kind: 'assistant', text: 'Hello!', source: {}, createdAt: t(30) }];
          const extra = outputCount > 1 ? [{ id: 'm4', kind: 'assistant', text: 'More', source: {}, createdAt: t(40) }] : [];
          return HttpResponse.json({ items: [...base, ...extra] });
        }
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run1/messages'), ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'm1', kind: 'user', text: 'Hi', source: {}, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') {
          const base = [{ id: 'm3', kind: 'assistant', text: 'Hello!', source: {}, createdAt: t(30) }];
          const extra = outputCount > 1 ? [{ id: 'm4', kind: 'assistant', text: 'More', source: {}, createdAt: t(40) }] : [];
          return HttpResponse.json({ items: [...base, ...extra] });
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
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    const list = await screen.findByTestId('message-list');
    const setScrollTop = vi.fn();
    // Spy on scrollTop assignment used for autoscroll
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => 0, set: setScrollTop });
    // initial autoscroll after first load
    await waitFor(() => expect(setScrollTop).toHaveBeenCalled());
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 100, configurable: true });
    fireEvent.scroll(list);
    expect(await screen.findByTestId('jump-to-latest')).toBeInTheDocument();
  });

  it('renders multiple run headers by default (all runs loaded)', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () =>
        HttpResponse.json({ items: [
          { id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) },
          { id: 'run2', status: 'finished', createdAt: t(3), updatedAt: t(4) },
        ] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () =>
        HttpResponse.json({ items: [
          { id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) },
          { id: 'run2', status: 'finished', createdAt: t(3), updatedAt: t(4) },
        ] }),
      ),
      http.get('/api/agents/runs/run2/messages', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'r2m1', kind: 'user', text: 'R2 in', source: {}, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'r2m2', kind: 'assistant', text: 'R2 out', source: {}, createdAt: t(20) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run2/messages'), ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'r2m1', kind: 'user', text: 'R2 in', source: {}, createdAt: t(10) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'r2m2', kind: 'assistant', text: 'R2 out', source: {}, createdAt: t(20) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get('/api/agents/runs/run1/messages', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'r1m1', kind: 'user', text: 'R1 in', source: {}, createdAt: t(1) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'r1m2', kind: 'assistant', text: 'R1 out', source: {}, createdAt: t(2) }] });
        return HttpResponse.json({ items: [] });
      }),
      http.get(abs('/api/agents/runs/run1/messages'), ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        if (type === 'input') return HttpResponse.json({ items: [{ id: 'r1m1', kind: 'user', text: 'R1 in', source: {}, createdAt: t(1) }] });
        if (type === 'injected') return HttpResponse.json({ items: [] });
        if (type === 'output') return HttpResponse.json({ items: [{ id: 'r1m2', kind: 'assistant', text: 'R1 out', source: {}, createdAt: t(2) }] });
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
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    const list2 = await screen.findByTestId('message-list');
    // Both runs should render without scrolling
    await waitFor(async () => expect((await within(list2).findAllByTestId('run-header')).length).toBe(2));
  });

  it('shows empty states when no runs or messages', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () => HttpResponse.json({ items: [] })),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () => HttpResponse.json({ items: [] })),
    );
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    expect(await screen.findByText(/No messages/)).toBeInTheDocument();
  });

  it('shows error state when message fetch fails', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: THREAD_ID, alias: THREAD_ALIAS, summary: 'Thread A', createdAt: t(0) }] })),
      http.get(`/api/agents/threads/${THREAD_ID}/runs`, () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs(`/api/agents/threads/${THREAD_ID}/runs`), () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('/api/agents/runs/run1/messages', () => new HttpResponse(null, { status: 500 })),
      http.get(abs('/api/agents/runs/run1/messages'), () => new HttpResponse(null, { status: 500 })),
    );
    render(
      <TestProviders>
        <MemoryRouter>
          <AgentsThreads />
        </MemoryRouter>
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
