import React from 'react';
import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => navigateMock,
  };
});

type ThreadDescriptor = {
  id: string;
  summary: string;
  runId: string;
  createdAt: string;
};

function setupScrollMetrics(element: HTMLElement, metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number }) {
  let currentTop = metrics.scrollTop ?? 0;
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentTop,
    set: (value: number) => {
      currentTop = value;
    },
  });
}

function stubRaf() {
  let handle = 0;
  const queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const requestSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    const id = ++handle;
    queue.push({ id, cb });
    return id;
  });
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
    const idx = queue.findIndex((entry) => entry.id === id);
    if (idx !== -1) queue.splice(idx, 1);
  });
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    flush() {
      while (queue.length > 0) {
        const { cb } = queue.shift()!;
        cb(now());
      }
    },
    flushNext() {
      if (queue.length === 0) return;
      const { cb } = queue.shift()!;
      cb(now());
    },
    cancelAll() {
      queue.splice(0, queue.length);
    },
    restore() {
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
    },
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitInAct(ms: number) {
  await act(async () => {
    await wait(ms);
  });
}

function flushRaf(controller: { flush(): void }) {
  act(() => {
    controller.flush();
  });
}

function flushNextRaf(controller: { flushNext(): void }) {
  act(() => {
    controller.flushNext();
  });
}

function registerThreadHandlers(threads: ThreadDescriptor[], options?: { messageDelayMs?: number }) {
  const threadList = threads.map((thread, index) => ({
    id: thread.id,
    alias: `${thread.id}-alias`,
    summary: thread.summary,
    status: 'open',
    createdAt: thread.createdAt,
    parentId: null,
    metrics: { remindersCount: 0, containersCount: 0, activity: index % 2 === 0 ? 'working' : 'idle', runsCount: 1 },
  }));

  const threadById = new Map(threadList.map((item) => [item.id, item]));
  const treeItems = threadList.map((item) => ({ ...item, children: [], hasChildren: false }));
  const runMetaByThread = new Map(
    threads.map((thread) => [thread.id, { id: thread.runId, threadId: thread.id, status: 'finished', createdAt: thread.createdAt, updatedAt: thread.createdAt }]),
  );

  const buildMessages = (threadId: string) => {
    const prefix = threadId.toUpperCase();
    const createdAt = threads.find((item) => item.id === threadId)?.createdAt ?? new Date().toISOString();
    return {
      input: [{ id: `${prefix}-in`, kind: 'user', text: `Input ${threadId}`, createdAt }],
      injected: [{ id: `${prefix}-ctx`, kind: 'system', text: `Ctx ${threadId}`, createdAt }],
      output: [{ id: `${prefix}-out`, kind: 'assistant', text: `Output ${threadId}`, createdAt }],
    };
  };

  const messageMap = new Map(threads.map((thread) => [thread.runId, buildMessages(thread.id)]));
  const delay = options?.messageDelayMs ?? 0;
  const listRequestLog: string[] = [];

  server.use(
    http.get('/api/agents/threads', ({ request }) => {
      listRequestLog.push(request.url);
      return HttpResponse.json({ items: threadList });
    }),
    http.get(abs('/api/agents/threads'), ({ request }) => {
      listRequestLog.push(request.url);
      return HttpResponse.json({ items: threadList });
    }),
    http.get('/api/agents/threads/tree', ({ request }) => {
      listRequestLog.push(request.url);
      return HttpResponse.json({ items: treeItems });
    }),
    http.get(abs('/api/agents/threads/tree'), ({ request }) => {
      listRequestLog.push(request.url);
      return HttpResponse.json({ items: treeItems });
    }),
    http.get('/api/agents/threads/:threadId', ({ params }) => HttpResponse.json(threadById.get(params.threadId as string) ?? threadList[0])),
    http.get(abs('/api/agents/threads/:threadId'), ({ params }) => HttpResponse.json(threadById.get(params.threadId as string) ?? threadList[0])),
    http.get('/api/agents/threads/:threadId/runs', ({ params }) => {
      const run = runMetaByThread.get(params.threadId as string);
      return HttpResponse.json({ items: run ? [run] : [] });
    }),
    http.get(abs('/api/agents/threads/:threadId/runs'), ({ params }) => {
      const run = runMetaByThread.get(params.threadId as string);
      return HttpResponse.json({ items: run ? [run] : [] });
    }),
    http.get('/api/agents/threads/:threadId/children', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/threads/:threadId/children'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/threads/:threadId/queued-messages', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/threads/:threadId/queued-messages'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    http.get('/api/containers', () => HttpResponse.json({ items: [] })),
    http.get(abs('/api/containers'), () => HttpResponse.json({ items: [] })),
    http.get('/api/agents/runs/:runId/messages', async ({ params, request }) => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const runId = params.runId as string;
      const url = new URL(request.url);
      const type = url.searchParams.get('type') as 'input' | 'injected' | 'output' | null;
      const messages = messageMap.get(runId);
      if (!messages || !type) return HttpResponse.json({ items: [] });
      return HttpResponse.json({ items: messages[type] ?? [] });
    }),
    http.get(abs('/api/agents/runs/:runId/messages'), async ({ params, request }) => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const runId = params.runId as string;
      const url = new URL(request.url);
      const type = url.searchParams.get('type') as 'input' | 'injected' | 'output' | null;
      const messages = messageMap.get(runId);
      if (!messages || !type) return HttpResponse.json({ items: [] });
      return HttpResponse.json({ items: messages[type] ?? [] });
    }),
  );

  return { listRequestLog };
}

function renderThreads() {
  render(
    <TestProviders>
      <MemoryRouter>
        <AgentsThreads />
      </MemoryRouter>
    </TestProviders>,
  );
}

describe('AgentsThreads caching and scroll restoration', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    navigateMock.mockReset();
    vi.useRealTimers();
  });
  afterAll(() => server.close());

  it('restores bottom scroll position when switching back to a cached thread', async () => {
    const raf = stubRaf();
    try {
      const threads: ThreadDescriptor[] = [
        { id: 'th1', summary: 'Thread 1', runId: 'run1', createdAt: new Date(1700000000000).toISOString() },
        { id: 'th2', summary: 'Thread 2', runId: 'run2', createdAt: new Date(1700000005000).toISOString() },
      ];
      const { listRequestLog } = registerThreadHandlers(threads);

      const user = userEvent.setup();
      renderThreads();

      await waitFor(() => {
        expect(listRequestLog.length).toBeGreaterThan(0);
      });
      const threadOneRow = await screen.findByText('Thread 1');
      await user.click(threadOneRow);

      await screen.findByText('Loading thread…');
      const scrollContainer = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainer, { scrollHeight: 1200, clientHeight: 300, scrollTop: 0 });

      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      expect(scrollContainer.scrollTop).toBe(1200);

      const threadTwoRow = await screen.findByText('Thread 2');
      await user.click(threadTwoRow);
      await screen.findByText('Loading thread…');
      const scrollContainerTwo = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainerTwo, { scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      await user.click(threadOneRow);
      expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument();
      setupScrollMetrics(scrollContainer, { scrollHeight: 1200, clientHeight: 300, scrollTop: scrollContainer.scrollTop });
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      expect(scrollContainer.scrollTop).toBe(1200);
    } finally {
      raf.restore();
    }
  });

  it('restores distance-from-bottom when returning to a cached thread mid-scroll', async () => {
    const raf = stubRaf();
    try {
      const threads: ThreadDescriptor[] = [
        { id: 'thA', summary: 'Thread A', runId: 'runA', createdAt: new Date(1700001000000).toISOString() },
        { id: 'thB', summary: 'Thread B', runId: 'runB', createdAt: new Date(1700002000000).toISOString() },
      ];
      registerThreadHandlers(threads);

      const user = userEvent.setup();
      renderThreads();

      const threadARow = await screen.findByText('Thread A');
      await user.click(threadARow);
      await screen.findByText('Loading thread…');
      const scrollContainer = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainer, { scrollHeight: 1000, clientHeight: 250, scrollTop: 0 });

      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      scrollContainer.scrollTop = 600;
      fireEvent.scroll(scrollContainer);
      await waitInAct(100);
      flushRaf(raf);

      const threadBRow = await screen.findByText('Thread B');
      await user.click(threadBRow);
      await screen.findByText('Loading thread…');
      const scrollContainerB = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainerB, { scrollHeight: 800, clientHeight: 250, scrollTop: 0 });
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      await user.click(threadARow);
      expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument();
      setupScrollMetrics(scrollContainer, { scrollHeight: 1000, clientHeight: 250, scrollTop: scrollContainer.scrollTop });
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
      flushRaf(raf);

      expect(scrollContainer.scrollTop).toBe(600);
    } finally {
      raf.restore();
    }
  });

  it('evicts the least recently used thread after exceeding cache capacity', async () => {
    const raf = stubRaf();
    try {
      const baseTime = 1700010000000;
      const threads: ThreadDescriptor[] = Array.from({ length: 11 }, (_value, index) => {
        const id = `thread-${index + 1}`;
        return {
          id,
          summary: `Thread ${index + 1}`,
          runId: `run-${index + 1}`,
          createdAt: new Date(baseTime + index * 1000).toISOString(),
        };
      });
      registerThreadHandlers(threads, { messageDelayMs: 50 });

      const user = userEvent.setup();
      renderThreads();

      const setMetrics = () => {
        const container = screen.getByTestId('conversation-scroll');
        setupScrollMetrics(container, { scrollHeight: 1400, clientHeight: 300, scrollTop: 0 });
        return container;
      };

      for (let i = 0; i < 10; i += 1) {
        const threadLabel = `Thread ${i + 1}`;
        const row = await screen.findByText(threadLabel);
        await user.click(row);
        await screen.findByText('Loading thread…');
        const container = setMetrics();
        flushRaf(raf);
        await waitInAct(60);
        flushRaf(raf);
        await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
        expect(container.scrollTop).toBe(1400);
      }

      const thread11 = await screen.findByText('Thread 11');
      await user.click(thread11);
      await screen.findByText('Loading thread…');
      setMetrics();
      flushRaf(raf);
      await waitInAct(60);
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());

      const thread1 = await screen.findByText('Thread 1');
      await user.click(thread1);
      await screen.findByText('Loading thread…');
      setMetrics();
      flushRaf(raf);
      // Still loading because entry was evicted and messages refetch is pending
      expect(screen.getByText('Loading thread…')).toBeInTheDocument();
      // Complete pending fetch and restoration
      await waitInAct(60);
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());

      // Re-select a thread still in cache (thread 5) should hide overlay immediately
      const thread5 = await screen.findByText('Thread 5');
      await user.click(thread5);
      expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument();
      setMetrics();
      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());
    } finally {
      raf.restore();
    }
  });

  it('ignores stale restoration frames when switching threads mid-restore', async () => {
    const raf = stubRaf();
    try {
      const threads: ThreadDescriptor[] = [
        { id: 'th1', summary: 'Thread 1', runId: 'run1', createdAt: new Date(1700000000000).toISOString() },
        { id: 'th2', summary: 'Thread 2', runId: 'run2', createdAt: new Date(1700000005000).toISOString() },
      ];
      const { listRequestLog } = registerThreadHandlers(threads);

      const user = userEvent.setup();
      renderThreads();

      await waitFor(() => {
        expect(listRequestLog.length).toBeGreaterThan(0);
      });

      const threadOneRow = await screen.findByText('Thread 1');
      await user.click(threadOneRow);
      await screen.findByText('Loading thread…');
      const scrollContainer = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainer, { scrollHeight: 1200, clientHeight: 300, scrollTop: 0 });

      flushNextRaf(raf);

      const threadTwoRow = await screen.findByText('Thread 2');
      await user.click(threadTwoRow);
      await screen.findByText('Loading thread…');
      const scrollContainerTwo = await screen.findByTestId('conversation-scroll');
      setupScrollMetrics(scrollContainerTwo, { scrollHeight: 900, clientHeight: 300, scrollTop: 0 });

      flushNextRaf(raf);

      expect(screen.getByText('Loading thread…')).toBeInTheDocument();

      flushRaf(raf);
      await waitFor(() => expect(screen.queryByText('Loading thread…')).not.toBeInTheDocument());

      expect(scrollContainerTwo.scrollTop).toBe(900);
    } finally {
      raf.restore();
    }
  });
});
