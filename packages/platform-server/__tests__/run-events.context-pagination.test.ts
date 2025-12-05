import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RunEventsService, DEFAULT_CONTEXT_PAGE_SIZE } from '../src/events/run-events.service';

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
  metadata?: unknown;
  transactionMetadata?: unknown;
  contextItemIds?: string[];
  transactionContextItemIds?: string[];
  items?: ReturnType<typeof baseItem>[];
  newContextItemCount?: number;
}) {
  const runEventRecord = {
    metadata: overrides?.metadata ?? null,
    llmCall: {
      contextItemIds: overrides?.contextItemIds ?? [],
      newContextItemCount: overrides?.newContextItemCount ?? 0,
    },
  };

  const transactionRecord = {
    metadata: overrides?.transactionMetadata ?? overrides?.metadata ?? null,
    llmCall: {
      contextItemIds: overrides?.transactionContextItemIds ?? overrides?.contextItemIds ?? [],
      newContextItemCount: overrides?.newContextItemCount ?? 0,
    },
  };

  const prismaMock = {
    runEvent: {
      findFirst: vi.fn().mockResolvedValue(runEventRecord),
      findUnique: vi.fn().mockResolvedValue(transactionRecord),
      update: vi.fn().mockResolvedValue(undefined),
    },
    contextItem: {
      findMany: vi.fn().mockResolvedValue(overrides?.items ?? []),
    },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prismaMock)),
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
      select: { metadata: true, llmCall: { select: { contextItemIds: true, newContextItemCount: true } } },
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

    const { service } = createService({ metadata, contextItemIds, items, newContextItemCount: 2 });

    const result = await service.listEventContextPage({ runId: 'run-2', eventId: 'evt-2', limit: 2 });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-2', 'ctx-3']);
    expect(result.nextBeforeId).toBe('ctx-1');
    expect(result.totalCount).toBe(4);
  });

  it('returns metadata new items even when the stored context list is empty', async () => {
    const metadata = {
      contextWindow: {
        newIds: ['ctx-new-1', 'ctx-new-2'],
        totalCount: 2,
        prevCursorId: 'ctx-prev',
        pageSize: 5,
      },
    };

    const { service } = createService({
      metadata,
      contextItemIds: [],
      items: [
        baseItem({ id: 'ctx-new-2', createdAt: new Date('2024-01-02T00:00:00.000Z') }),
        baseItem({ id: 'ctx-new-1', createdAt: new Date('2024-01-01T00:00:00.000Z') }),
      ],
      newContextItemCount: 2,
    });

    const result = await service.listEventContextPage({ runId: 'run-3', eventId: 'evt-3' });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-new-1', 'ctx-new-2']);
    expect(result.nextBeforeId).toBe('ctx-prev');
    expect(result.totalCount).toBe(2);
  });

  it('computes prev cursor when metadata lacks prevCursorId', async () => {
    const metadata = {
      contextWindow: {
        newIds: ['ctx-4'],
        totalCount: 5,
        pageSize: 4,
      },
    };

    const contextItemIds = ['ctx-1', 'ctx-2', 'ctx-3', 'ctx-4', 'ctx-5'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ metadata, contextItemIds, items });

    const result = await service.listEventContextPage({ runId: 'run-5', eventId: 'evt-5' });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-4']);
    expect(result.nextBeforeId).toBe('ctx-3');
    expect(result.totalCount).toBe(5);
  });

  it('falls back to llmCall.newContextItemCount when metadata is missing', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2', 'ctx-3', 'ctx-4'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ contextItemIds, items, newContextItemCount: 2 });

    const result = await service.listEventContextPage({ runId: 'run-4', eventId: 'evt-4', limit: 4 });

    expect(result.items.map((item) => item.id)).toEqual(['ctx-3', 'ctx-4']);
    expect(result.nextBeforeId).toBe('ctx-2');
    expect(result.totalCount).toBe(5);
  });

  it('returns no items but exposes next cursor when newContextItemCount is zero', async () => {
    const contextItemIds = ['ctx-0', 'ctx-1', 'ctx-2'];
    const items = contextItemIds.map((id) => baseItem(id));

    const { service } = createService({ contextItemIds, items, newContextItemCount: 0 });

    const result = await service.listEventContextPage({ runId: 'run-5', eventId: 'evt-5' });

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

describe('RunEventsService.appendLLMCallContextWindowNewIds', () => {
  it('appends unique ids and preserves existing metadata fields', async () => {
    const metadata = {
      contextWindow: {
        newIds: ['ctx-3'],
        totalCount: 5,
        prevCursorId: 'ctx-2',
        pageSize: 3,
      },
    };

    const contextItemIds = ['ctx-1', 'ctx-2', 'ctx-3'];

    const { service, prismaMock } = createService({
      metadata,
      contextItemIds,
      transactionMetadata: metadata,
      transactionContextItemIds: contextItemIds,
    });

    await service.appendLLMCallContextWindowNewIds('evt-append-1', ['ctx-tool-1', 'ctx-3']);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.runEvent.findUnique).toHaveBeenCalledWith({
      where: { id: 'evt-append-1' },
      select: {
        metadata: true,
        llmCall: {
          select: {
            contextItemIds: true,
          },
        },
      },
    });

    expect(prismaMock.runEvent.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.runEvent.update.mock.calls[0][0];
    const updatedMetadata = updateArgs.data.metadata as { contextWindow: Record<string, unknown> };
    const contextWindow = updatedMetadata.contextWindow as Record<string, unknown>;

    expect(contextWindow.newIds).toEqual(['ctx-3', 'ctx-tool-1']);
    expect(contextWindow.prevCursorId).toBe('ctx-2');
    expect(contextWindow.totalCount).toBe(5);
    expect(contextWindow.pageSize).toBe(3);
  });

  it('initializes contextWindow when metadata is absent', async () => {
    const contextItemIds = ['ctx-1', 'ctx-2'];
    const { service, prismaMock } = createService({
      metadata: null,
      contextItemIds,
      transactionMetadata: null,
      transactionContextItemIds: contextItemIds,
    });

    await service.appendLLMCallContextWindowNewIds('evt-append-2', ['ctx-tool-1']);

    expect(prismaMock.runEvent.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.runEvent.update.mock.calls[0][0];
    const updatedMetadata = updateArgs.data.metadata as { contextWindow: Record<string, unknown> };
    const contextWindow = updatedMetadata.contextWindow as Record<string, unknown>;

    expect(contextWindow.newIds).toEqual(['ctx-tool-1']);
    expect(contextWindow.prevCursorId).toBe('ctx-2');
    expect(contextWindow.totalCount).toBe(3);
    expect(contextWindow.pageSize).toBe(DEFAULT_CONTEXT_PAGE_SIZE);
  });

  it('ignores empty or duplicate ids', async () => {
    const metadata = {
      contextWindow: {
        newIds: ['ctx-1'],
        totalCount: 2,
        prevCursorId: 'ctx-0',
        pageSize: 2,
      },
    };

    const contextItemIds = ['ctx-0', 'ctx-1'];
    const { service, prismaMock } = createService({
      metadata,
      contextItemIds,
      transactionMetadata: metadata,
      transactionContextItemIds: contextItemIds,
    });

    await service.appendLLMCallContextWindowNewIds('evt-append-3', ['', 'ctx-1']);

    expect(prismaMock.runEvent.update).not.toHaveBeenCalled();
  });
});
