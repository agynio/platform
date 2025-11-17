import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { TestProviders, server, abs } from './integration/testUtils';
import { MemoryRouter } from 'react-router-dom';
import { runs } from '@/api/modules/runs';
import type { RunTimelineEvent } from '@/api/types/agents';
// run selection removed; no extra wrappers needed beyond TestProviders
import { AgentsThreads } from '../src/pages/AgentsThreads';

function t(offsetMs: number) {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function buildTimelineEvent(params: {
  runId: string;
  messageId: string;
  kind: 'assistant' | 'user' | 'system';
  text: string;
  createdAt: string;
  source?: unknown;
}): RunTimelineEvent {
  const { runId, messageId, kind, text, createdAt, source } = params;
  return {
    id: `evt-${messageId}`,
    runId,
    threadId: 'th1',
    type: 'invocation_message',
    status: 'success',
    ts: createdAt,
    startedAt: createdAt,
    endedAt: createdAt,
    durationMs: 0,
    nodeId: null,
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    message: {
      messageId,
      role: kind,
      kind,
      text,
      source: source ?? {},
      createdAt,
    },
    attachments: [],
  };
}

describe('AgentsThreads chat-like view', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function useThreadsMock(events?: RunTimelineEvent[]) {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
      http.get('/api/agents/threads/th1/runs', () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
      http.get(abs('/api/agents/threads/th1/runs'), () =>
        HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
      ),
    );

    const timelineEvents =
      events ?? [
        buildTimelineEvent({ runId: 'run1', messageId: 'm1', kind: 'user', text: 'Hi', createdAt: t(10), source: { a: 1 } }),
        buildTimelineEvent({ runId: 'run1', messageId: 'm2', kind: 'system', text: 'Injected', createdAt: t(20), source: { b: 2 } }),
        buildTimelineEvent({ runId: 'run1', messageId: 'm3', kind: 'assistant', text: 'Hello!', createdAt: t(30), source: { c: 3 } }),
      ];

    const timelineSpy = vi.spyOn(runs, 'timelineEvents').mockImplementation(async (runId) => {
      if (runId === 'run1') return { items: timelineEvents, nextCursor: null };
      return { items: [], nextCursor: null };
    });

    return () => timelineSpy.mockRestore();
  }

  it('merges messages chronologically and aligns sides', async () => {
    const restore = useThreadsMock();
    try {
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
    } finally {
      restore();
    }
  });

  it('toggles raw JSON per message', async () => {
    const restore = useThreadsMock();
    try {
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
    } finally {
      restore();
    }
  });

  it('autoscrolls to bottom and shows jump control when scrolled up', async () => {
    const events = [
      buildTimelineEvent({ runId: 'run1', messageId: 'm1', kind: 'user', text: 'Hi', createdAt: t(10) }),
      buildTimelineEvent({ runId: 'run1', messageId: 'm3', kind: 'assistant', text: 'Hello!', createdAt: t(30) }),
    ];
    const restore = useThreadsMock(events);
    try {
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
      Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => 0, set: setScrollTop });
      await waitFor(() => expect(setScrollTop).toHaveBeenCalled());
      Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true });
      Object.defineProperty(list, 'scrollTop', { value: 100, configurable: true });
      fireEvent.scroll(list);
      expect(await screen.findByTestId('jump-to-latest')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('renders multiple run headers by default (all runs loaded)', async () => {
    const timelineSpy = vi.spyOn(runs, 'timelineEvents').mockImplementation(async (runId) => {
      if (runId === 'run1') {
        return {
          items: [
            buildTimelineEvent({ runId: 'run1', messageId: 'r1m1', kind: 'user', text: 'R1 in', createdAt: t(1) }),
            buildTimelineEvent({ runId: 'run1', messageId: 'r1m2', kind: 'assistant', text: 'R1 out', createdAt: t(2) }),
          ],
          nextCursor: null,
        };
      }
      if (runId === 'run2') {
        return {
          items: [
            buildTimelineEvent({ runId: 'run2', messageId: 'r2m1', kind: 'user', text: 'R2 in', createdAt: t(3) }),
            buildTimelineEvent({ runId: 'run2', messageId: 'r2m2', kind: 'assistant', text: 'R2 out', createdAt: t(4) }),
          ],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    try {
      server.use(
        http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
        http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
        http.get('/api/agents/threads/th1/runs', () =>
          HttpResponse.json({ items: [
            { id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run2', status: 'finished', createdAt: t(3), updatedAt: t(4) },
          ] }),
        ),
        http.get(abs('/api/agents/threads/th1/runs'), () =>
          HttpResponse.json({ items: [
            { id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) },
            { id: 'run2', status: 'finished', createdAt: t(3), updatedAt: t(4) },
          ] }),
        ),
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
      await waitFor(async () => expect((await within(list2).findAllByTestId('run-header')).length).toBe(2));
    } finally {
      timelineSpy.mockRestore();
    }
  });

  it('shows empty states when no runs or messages', async () => {
    server.use(
      http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
      http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
      http.get('/api/agents/threads/th1/runs', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/threads/th1/runs'), () => HttpResponse.json({ items: [] })),
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
    const timelineSpy = vi.spyOn(runs, 'timelineEvents').mockRejectedValue(new Error('boom'));
    try {
      server.use(
        http.get('/api/agents/threads', () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
        http.get(abs('/api/agents/threads'), () => HttpResponse.json({ items: [{ id: 'th1', alias: 'th-a', summary: 'Thread A', createdAt: t(0) }] })),
        http.get('/api/agents/threads/th1/runs', () =>
          HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
        ),
        http.get(abs('/api/agents/threads/th1/runs'), () =>
          HttpResponse.json({ items: [{ id: 'run1', status: 'finished', createdAt: t(1), updatedAt: t(2) }] }),
        ),
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
    } finally {
      timelineSpy.mockRestore();
    }
  });
});
