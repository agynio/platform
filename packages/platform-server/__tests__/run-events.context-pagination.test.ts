import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RunEventsService } from '../src/events/run-events.service';

const baseItem = (input: string | { id: string; createdAt?: Date }) => {
  const id = typeof input === 'string' ? input : input.id;
  const createdAt =
    typeof input === 'string'
      ? new Date('2024-01-01T00:00:00.000Z')
      : input.createdAt ?? new Date('2024-01-01T00:00:00.000Z');
  return {
    id,
    role: 'system' as const,
    contentText: `text-${id}`,
    contentJson: null,
    metadata: {},
    sizeBytes: 0,
    createdAt,
  };
};

function createService(overrides?: {
  contextItemIds?: string[];
  items?: ReturnType<typeof baseItem>[];
  newContextItemCount?: number;
}) {
  const runEventRecord = {
    metadata: null,
    llmCall: {
      contextItemIds: overrides?.contextItemIds ?? [],
      newContextItemCount: overrides?.newContextItemCount ?? 0,
    },
  };

  const prismaMock = {
    runEvent: {
      findFirst: vi.fn().mockResolvedValue(runEventRecord),
      findUnique: vi.fn(),
      update: vi.fn(),
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
    const items = contextItemIds.map((id) => baseItem(id));

    const { service, prismaMock } = createService({ contextItemIds, items, newContextItemCount: 3 });

    const result = await service.listEventContextPage({
      runId: 'run-1',
      eventId: 'evt-1',
      beforeId: 'ctx-2',
      limit: 2,
    });

    expect(prismaMock.runEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'evt-1', runId: 'run-1' },
      select: { metadata: true, llmCall: { select: { contextItemIds: true, newContextItemCount: true } } },
    });
    expect(prismaMock.contextItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ctx-1', 'ctx-2'] } },
      select: expect.any(Object),
    });
    expect(result.items.map((item) => item.id)).toEqual(['ctx-1', 'ctx-2']);
    expect(result.nextBeforeId).toBe('ctx-0');
    expect(result.totalCount).toBe(4);
  });

  it('returns the tail defined by newContextItemCount when beforeId is omitted', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2', 'ctx-3'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ contextItemIds, items, newContextItemCount: 2 });

    const result = await service.listEventContextPage({ runId: 'run-2', eventId: 'evt-2' });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-2', 'ctx-3']);
    expect(result.nextBeforeId).toBe('ctx-1');
    expect(result.totalCount).toBe(4);
  });

  it('respects the provided limit when tail count exceeds the page size', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2', 'ctx-3', 'ctx-4'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ contextItemIds, items, newContextItemCount: 4 });

    const result = await service.listEventContextPage({ runId: 'run-3', eventId: 'evt-3', limit: 2 });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-3', 'ctx-4']);
    expect(result.nextBeforeId).toBe('ctx-2');
    expect(result.totalCount).toBe(5);
  });

  it('returns no items but exposes the newest cursor when newContextItemCount is zero', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ contextItemIds, items, newContextItemCount: 0 });

    const result = await service.listEventContextPage({ runId: 'run-4', eventId: 'evt-4' });

    expect(result.items).toEqual([]);
    expect(result.nextBeforeId).toBe('ctx-2');
    expect(result.totalCount).toBe(3);
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

  it('throws BadRequestException when beforeId does not match known context items', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1'];
    const items = contextItemIds.map((id) => baseItem(id));
    const { service } = createService({ contextItemIds, items });

    await expect(
      service.listEventContextPage({ runId: 'run-1', eventId: 'evt-1', beforeId: 'ctx-missing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
