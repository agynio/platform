import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RunEventsService } from '../src/events/run-events.service';

const baseItem = (id: string) => ({
  id,
  role: 'system' as const,
  contentText: `text-${id}`,
  contentJson: null,
  metadata: {},
  sizeBytes: 0,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
});

function createService(overrides?: {
  metadata?: unknown;
  contextItemIds?: string[];
  items?: ReturnType<typeof baseItem>[];
}) {
  const runEventRecord = {
    metadata: overrides?.metadata ?? null,
    llmCall: {
      contextItemIds: overrides?.contextItemIds ?? [],
    },
  };

  const prismaMock = {
    runEvent: {
      findFirst: vi.fn().mockResolvedValue(runEventRecord),
    },
    contextItem: {
      findMany: vi.fn().mockResolvedValue(overrides?.items ?? []),
    },
  };

  const prismaService = { getClient: () => prismaMock } as unknown as { getClient: () => typeof prismaMock };
  const service = new RunEventsService(prismaService as any);
  return { service, prismaMock };
}

describe('RunEventsService.listEventContextPage', () => {
  it('returns ordered items before the cursor with pagination details', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2', 'ctx-3'];
    const metadata = {
      contextWindow: {
        newIds: ['ctx-2', 'ctx-3', 'ctx-assistant'],
        totalCount: 6,
        prevCursorId: 'ctx-1',
        pageSize: 10,
      },
    };

    const items = contextItemIds.map((id) => baseItem(id));

    const { service, prismaMock } = createService({ metadata, contextItemIds, items });

    const result = await service.listEventContextPage({
      runId: 'run-1',
      eventId: 'evt-1',
      beforeId: 'ctx-1',
      limit: 2,
    });

    expect(prismaMock.runEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'evt-1', runId: 'run-1' },
      select: { metadata: true, llmCall: { select: { contextItemIds: true } } },
    });
    expect(prismaMock.contextItem.findMany).toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['ctx-0', 'ctx-1']);
    expect(result.nextBeforeId).toBeNull();
    expect(result.totalCount).toBe(6);
  });

  it('returns the most recent items when beforeId is omitted', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2', 'ctx-3'];
    const metadata = {
      contextWindow: {
        newIds: ['ctx-2', 'ctx-3'],
        totalCount: 4,
        prevCursorId: 'ctx-1',
        pageSize: 10,
      },
    };
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ metadata, contextItemIds, items });

    const result = await service.listEventContextPage({ runId: 'run-2', eventId: 'evt-2', limit: 2 });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-2', 'ctx-3']);
    expect(result.nextBeforeId).toBe('ctx-1');
    expect(result.totalCount).toBe(4);
  });

  it('throws NotFoundException when the event does not exist', async () => {
    const prismaService = { getClient: () => ({
      runEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      contextItem: { findMany: vi.fn() },
    }) } as any;
    const service = new RunEventsService(prismaService);

    await expect(
      service.listEventContextPage({ runId: 'run-missing', eventId: 'evt-missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
