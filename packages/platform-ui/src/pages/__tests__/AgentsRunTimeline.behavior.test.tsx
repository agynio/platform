import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunTimeline } from '../AgentsRunTimeline';
import type { RunTimelineEvent } from '@/api/types/agents';

type TimelineControls = {
  reset(): void;
  prime(input: {
    runId: string;
    threadId: string;
    pages: Array<{
      cursor: { ts: string; id: string } | null;
      items: RunTimelineEvent[];
      nextCursor: { ts: string; id: string } | null;
    }>;
  }): void;
};

const timeline = globalThis.__timeline as TimelineControls;

const runId = 'run-1';
const threadId = 'thread-1';
const INITIAL_COUNT = 100;
const OLDER_COUNT = 20;

const baseTimestamp = new Date('2024-01-01T09:00:00.000Z').getTime();

const buildEvent = (id: string, secondsAgo: number): RunTimelineEvent => {
  const ts = new Date(baseTimestamp - secondsAgo * 1000).toISOString();
  return {
    id,
    runId,
    threadId,
    type: 'tool_execution',
    status: 'success',
    ts,
    startedAt: ts,
    endedAt: ts,
    durationMs: 0,
    nodeId: null,
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'demo',
      toolCallId: null,
      execStatus: 'success',
      input: {},
      output: {},
      errorMessage: null,
      raw: null,
    },
    attachments: [],
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/agents/threads/${threadId}/runs/${runId}`]}>
      <QueryClientProvider client={createQueryClient()}>
        <Routes>
          <Route path="/agents/threads/:threadId/runs/:runId" element={<AgentsRunTimeline />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const setMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const primeTimeline = () => {
  const current = Array.from({ length: INITIAL_COUNT }, (_, index) => buildEvent(`current-${index + 1}`, index));
  const oldestCurrent = current.at(-1)!;
  const older = Array.from({ length: OLDER_COUNT }, (_, index) => buildEvent(`older-${index + 1}`, INITIAL_COUNT + index + 1));

  timeline.reset();
  timeline.prime({
    runId,
    threadId,
    pages: [
      {
        cursor: null,
        items: current,
        nextCursor: { ts: oldestCurrent.ts, id: oldestCurrent.id },
      },
      {
        cursor: { ts: oldestCurrent.ts, id: oldestCurrent.id },
        items: older,
        nextCursor: null,
      },
    ],
  });

  return { current, older };
};

describe('AgentsRunTimeline behavior', () => {
  beforeEach(() => {
    setMatchMedia(true);
  });

  it('anchors to the bottom after the newest page loads', async () => {
    primeTimeline();

    renderPage();

    const list = await screen.findByTestId('agents-run-timeline-scroll');
    const metrics = { client: 400, height: 1600, top: 0 };

    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      get: () => metrics.client,
    });
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => metrics.height,
    });
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => metrics.top,
      set: (value: number) => {
        metrics.top = value;
      },
    });

    await waitFor(() => expect(document.querySelectorAll('[data-event-id]').length).toBe(INITIAL_COUNT));

    await waitFor(() => expect(metrics.top).toBe(metrics.height));
  });

  it('prepends older events when the user scrolls to the top while preserving scroll offset', async () => {
    const { current, older } = primeTimeline();

    renderPage();

    const list = await screen.findByTestId('agents-run-timeline-scroll');
    const metrics = { client: 480, height: 2400, top: 0 };

    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      get: () => metrics.client,
    });
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => metrics.height,
    });
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => metrics.top,
      set: (value: number) => {
        metrics.top = value;
      },
    });

    await waitFor(() => expect(document.querySelectorAll('[data-event-id]').length).toBe(INITIAL_COUNT));
    await waitFor(() => expect(metrics.top).toBe(metrics.height));

    const previousHeight = metrics.height;
    const previousTop = 20;
    metrics.top = previousTop;

    const nextHeight = previousHeight + 600;

    await act(async () => {
      fireEvent.scroll(list);
      metrics.height = nextHeight;
    });

    await waitFor(() => expect(document.querySelectorAll('[data-event-id]').length).toBe(INITIAL_COUNT + OLDER_COUNT));

    const expectedTop = previousTop + (nextHeight - previousHeight);
    await waitFor(() => expect(metrics.top).toBe(expectedTop));

    const orderedIds = Array.from(document.querySelectorAll('[data-event-id]')).map((node) => node.getAttribute('data-event-id') as string);
    const expectedIds = [...older, ...current].sort((a, b) => a.ts.localeCompare(b.ts)).map((event) => event.id);
    expect(orderedIds).toEqual(expectedIds);
  });
});
