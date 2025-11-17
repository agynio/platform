import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AgentsThreads } from '../src/pages/AgentsThreads';
import { TestProviders, server, abs } from './integration/testUtils';
import type { RunTimelineEvent } from '@/api/types/agents';
import { runs } from '@/api/modules/runs';

const threadId = 'th-load';
const runId = 'run-load';
const TOTAL_EVENTS = 130;
const PAGE_SIZE = 100;
const baseTimestamp = new Date('2024-03-01T00:00:00.000Z').getTime();

const createEvent = (index: number): RunTimelineEvent => {
  const ts = new Date(baseTimestamp + index * 1000).toISOString();
  const role = index % 2 === 0 ? 'user' : 'assistant';
  return {
    id: `evt-${index.toString().padStart(3, '0')}`,
    runId,
    threadId,
    type: 'invocation_message',
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
    message: {
      messageId: `msg-${index.toString().padStart(3, '0')}`,
      role,
      kind: role,
      text: `Message ${index}`,
      source: { index },
      createdAt: ts,
    },
    attachments: [],
  };
};

describe('AgentsThreads timeline pagination integration', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('loads older events and merges them into the message list', async () => {
    const events = Array.from({ length: TOTAL_EVENTS }, (_, idx) => createEvent(idx));
    const newestPage = events.slice(TOTAL_EVENTS - PAGE_SIZE).reverse();
    const oldestFromNewest = newestPage.at(-1)!;
    const nextCursor = { ts: oldestFromNewest.ts, id: oldestFromNewest.id } as const;
    const olderPage = events.slice(0, TOTAL_EVENTS - PAGE_SIZE).reverse();

    const timelineCalls: Array<{ runId: string; params: Parameters<typeof runs.timelineEvents>[1] | undefined }> = [];
    const timelineSpy = vi
      .spyOn(runs, 'timelineEvents')
      .mockImplementation(async (incomingRunId, params) => {
        timelineCalls.push({ runId: incomingRunId, params });
        if (timelineCalls.length === 1) {
          return { items: newestPage, nextCursor };
        }
        if (timelineCalls.length === 2) {
          return { items: olderPage, nextCursor: null };
        }
        return { items: [], nextCursor: null };
      });

    server.resetHandlers();
    server.use(
      http.get('/api/agents/threads', () =>
        HttpResponse.json({ items: [{ id: threadId, alias: 'thread-load', summary: 'Thread Load', createdAt: new Date(baseTimestamp).toISOString() }] }),
      ),
      http.get(abs('/api/agents/threads'), () =>
        HttpResponse.json({ items: [{ id: threadId, alias: 'thread-load', summary: 'Thread Load', createdAt: new Date(baseTimestamp).toISOString() }] }),
      ),
      http.get(`/api/agents/threads/${threadId}/runs`, () =>
        HttpResponse.json({ items: [{ id: runId, status: 'finished', createdAt: new Date(baseTimestamp + 1000).toISOString(), updatedAt: new Date(baseTimestamp + 2000).toISOString() }] }),
      ),
      http.get(abs(`/api/agents/threads/${threadId}/runs`), () =>
        HttpResponse.json({ items: [{ id: runId, status: 'finished', createdAt: new Date(baseTimestamp + 1000).toISOString(), updatedAt: new Date(baseTimestamp + 2000).toISOString() }] }),
      ),
      http.get('/api/agents/reminders', () => HttpResponse.json({ items: [] })),
      http.get(abs('/api/agents/reminders'), () => HttpResponse.json({ items: [] })),
    );

    try {
      render(
        <TestProviders>
          <MemoryRouter>
            <AgentsThreads />
          </MemoryRouter>
        </TestProviders>,
      );

      const threadButton = await screen.findByRole('button', { name: /thread load/i });
      fireEvent.click(threadButton);

      const list = await screen.findByTestId('message-list');
      await waitFor(() => expect(timelineCalls.length).toBeGreaterThan(0));
      await waitFor(() => expect(within(list).getAllByTestId('message-bubble').length).toBe(PAGE_SIZE));

      expect(timelineCalls.length).toBe(1);
      expect(timelineCalls[0].runId).toBe(runId);
      expect(timelineCalls[0].params?.limit).toBe(PAGE_SIZE);
      expect(timelineCalls[0].params?.order).toBe('desc');
      expect(timelineCalls[0].params?.cursor ?? null).toBeNull();

      const initialBubbles = within(list).getAllByTestId('message-bubble');
      const initialFirstTime = initialBubbles[0].querySelector('time')?.getAttribute('datetime');
      expect(initialFirstTime).toBeDefined();

      const loadOlderButton = await screen.findByRole('button', { name: /load older events/i });
      fireEvent.click(loadOlderButton);

      await waitFor(() => expect(within(list).getAllByTestId('message-bubble').length).toBe(TOTAL_EVENTS));

      await waitFor(() => expect(timelineCalls.length).toBe(2));
      expect(timelineCalls[1].params?.limit).toBe(PAGE_SIZE);
      expect(timelineCalls[1].params?.order).toBe('desc');
      expect(timelineCalls[1].params?.cursor).toEqual(nextCursor);

      const updatedBubbles = within(list).getAllByTestId('message-bubble');
      const updatedFirstTime = updatedBubbles[0].querySelector('time')?.getAttribute('datetime');
      expect(updatedFirstTime).toBeDefined();

      if (initialFirstTime && updatedFirstTime) {
        expect(new Date(updatedFirstTime).getTime()).toBeLessThan(new Date(initialFirstTime).getTime());
      }

      await waitFor(() => expect(screen.queryByRole('button', { name: /load older events/i })).toBeNull());
    } finally {
      timelineSpy.mockRestore();
    }
  });
});
