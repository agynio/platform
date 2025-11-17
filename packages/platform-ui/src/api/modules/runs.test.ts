import { afterEach, describe, expect, it, vi } from 'vitest';
import { runs } from './runs';
import { http } from '@/api/http';
import type { RunTimelineEvent } from '@/api/types/agents';

const buildEvent = (id: string): RunTimelineEvent => ({
  id,
  runId: 'run-1',
  threadId: 'thread-1',
  type: 'tool_execution',
  status: 'success',
  ts: '2024-01-01T00:00:00.000Z',
  startedAt: '2024-01-01T00:00:05.000Z',
  endedAt: '2024-01-01T00:00:06.000Z',
  durationMs: 1000,
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
});

describe('runs.timelineEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes legacy responses that use the events field', async () => {
    const event = buildEvent('event-1');
    const nextCursor = { ts: event.ts, id: event.id } as const;

    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      events: [event],
      nextCursor,
    });

    const result = await runs.timelineEvents('run-1', {
      types: 'tool_execution',
      statuses: 'success',
      limit: 25,
      order: 'desc',
      cursor: nextCursor,
    });

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([event]);
    expect(result.nextCursor).toEqual(nextCursor);
  });

  it('accepts pagination.nextCursor and preserves items array', async () => {
    const event = buildEvent('event-2');
    const nextCursor = { ts: '2024-01-01T00:01:00.000Z', id: 'event-100' } as const;

    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      items: [event],
      pagination: { nextCursor },
    });

    const result = await runs.timelineEvents('run-1', {});

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([event]);
    expect(result.nextCursor).toEqual(nextCursor);
  });

  it('unwraps data objects that contain the response payload', async () => {
    const event = buildEvent('event-3');

    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        items: [event],
        next_cursor: { ts: '2024-01-01T00:02:00.000Z', id: 'event-200' },
      },
    });

    const result = await runs.timelineEvents('run-1', {});

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([event]);
    expect(result.nextCursor).toEqual({ ts: '2024-01-01T00:02:00.000Z', id: 'event-200' });
  });

  it('accepts nested page.events arrays and nested data cursor fields', async () => {
    const event = buildEvent('event-4');

    const getSpy = vi.spyOn(http, 'get').mockResolvedValue({
      page: { events: [event] },
      data: { nextCursor: { ts: '2024-01-01T00:03:00.000Z', id: 'event-250' } },
    });

    const result = await runs.timelineEvents('run-1', {});

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([event]);
    expect(result.nextCursor).toEqual({ ts: '2024-01-01T00:03:00.000Z', id: 'event-250' });
  });
});
