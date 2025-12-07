import { beforeEach, afterEach, describe, expect, it, vi, type SpyInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { RunEventStatus } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';
import type { PrismaService } from '../src/core/services/prisma.service';

describe('RunEventsService tool call sanitization', () => {
  let debugSpy: SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('sanitizes call identifiers and arguments before persistence', async () => {
    const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const createManyMock = vi.fn().mockResolvedValue({ count: 1 });

    const prismaClient = {
      runEvent: {
        findUnique: vi.fn().mockResolvedValue({ startedAt: new Date(Date.now() - 50) }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      lLMCall: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      toolCall: {
        deleteMany: deleteManyMock,
        createMany: createManyMock,
      },
    } as any;

    const prismaService = {
      getClient: () => prismaClient,
    } as unknown as PrismaService;

    const service = new RunEventsService(prismaService);

    await service.completeLLMCall({
      eventId: 'event-1',
      status: RunEventStatus.success,
      responseText: null,
      rawResponse: null,
      toolCalls: [
        {
          callId: 'call\u0000id',
          name: 'lookup\u0000weather',
          arguments: {
            location: 'Par\u0000is',
            nested: { city: 'Par\u0000is', codes: ['FR\u0000'] },
          },
        },
      ],
    });

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { llmCallEventId: 'event-1' } });
    expect(createManyMock).toHaveBeenCalledTimes(1);

    const createPayload = createManyMock.mock.calls[0]?.[0]?.data;
    expect(Array.isArray(createPayload)).toBe(true);
    const record = Array.isArray(createPayload) ? (createPayload[0] as Record<string, unknown>) : null;
    expect(record?.callId).toBe('call\uFFFDid');
    expect(record?.name).toBe('lookup\uFFFDweather');
    expect(JSON.stringify(record?.arguments)).not.toContain('\\u0000');

    expect(debugSpy).toHaveBeenCalledWith(
      'Persisting sanitized tool calls',
      expect.objectContaining({
        eventId: 'event-1',
        containsNullChar: false,
      }),
    );
  });
});
