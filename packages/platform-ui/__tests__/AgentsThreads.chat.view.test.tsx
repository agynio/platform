import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server } from './integration/testUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider } from '../src/lib/graph/templates.provider';
import { TooltipProvider } from '@agyn/ui';
import { AgentsThreads } from '../src/pages/AgentsThreads';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

describe('AgentsThreads chat-like view', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function useThreadsMock() {
    server.use(
      http.get('http://localhost:3010/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'Thread A', createdAt: t(0) }] })),
      http.get('http://localhost:3010/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('http://localhost:3010/api/agents/runs/run1/messages', ({ request }) => {
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
        <AgentsThreads />
      </TestProviders>,
    );
    const threadBtn = await screen.findByRole('button', { name: /Thread A/ });
    fireEvent.click(threadBtn);
    const runBtn = await screen.findByRole('option');
    fireEvent.click(runBtn);
    const list = await screen.findByTestId('message-list');
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
        <AgentsThreads />
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    fireEvent.click(await screen.findByRole('option'));
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
    let outputCount = 1;
    server.use(
      http.get('http://localhost:3010/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'Thread A', createdAt: t(0) }] })),
      http.get('http://localhost:3010/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('http://localhost:3010/api/agents/runs/run1/messages', ({ request }) => {
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
        <AgentsThreads />
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    const runBtn = await screen.findByRole('option');
    fireEvent.click(runBtn);
    const list = await screen.findByTestId('message-list');
    const setScrollTop = vi.fn();
    // Spy on scrollTop assignment used for autoscroll
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => 0, set: setScrollTop });
    outputCount = 2;
    fireEvent.click(runBtn);
    await waitFor(() => expect(setScrollTop).toHaveBeenCalled());
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 100, configurable: true });
    fireEvent.scroll(list);
    expect(await screen.findByTestId('jump-to-latest')).toBeInTheDocument();
  });

  it('shows empty states when no runs or messages', async () => {
    server.use(
      http.get('http://localhost:3010/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'Thread A', createdAt: t(0) }] })),
      http.get('http://localhost:3010/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [] })),
    );
    render(
      <TestProviders>
        <AgentsThreads />
      </TestProviders>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    expect(await screen.findByText(/No runs/)).toBeInTheDocument();
  });

  it('shows error state when message fetch fails', async () => {
    server.use(
      http.get('http://localhost:3010/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'Thread A', createdAt: t(0) }] })),
      http.get('http://localhost:3010/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get('http://localhost:3010/api/agents/runs/run1/messages', () => new HttpResponse(null, { status: 500 })),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider delayDuration={0}>
          <TemplatesProvider>
            <AgentsThreads />
          </TemplatesProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thread A/ }));
    fireEvent.click(await screen.findByRole('option'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
