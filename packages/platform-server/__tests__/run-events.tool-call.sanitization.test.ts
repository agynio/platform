import { describe, expect, it, vi } from 'vitest';
import { Prisma, RunEventStatus } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';
import type { PrismaService } from '../src/core/services/prisma.service';

function createTx() {
  const startedAt = new Date();
  return {
    runEvent: {
      findUnique: vi.fn().mockResolvedValue({ startedAt }),
      update: vi.fn().mockResolvedValue({ startedAt }),
    },
    lLMCall: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    toolCall: {
      deleteMany: vi.fn().mockResolvedValue(undefined),
      createMany: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('RunEventsService tool call argument sanitization', () => {
  it('preserves Prisma.JsonNull sentinels when sanitizing tool call arguments', async () => {
    const tx = createTx();
    const prismaService = { getClient: () => tx } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    await expect(
      service.completeLLMCall({
        tx: tx as any,
        eventId: 'event-json-null',
        status: RunEventStatus.success,
        toolCalls: [
          {
            callId: 'call-json-null',
            name: 'noop',
            arguments: Prisma.JsonNull,
          },
        ],
      }),
    ).resolves.not.toThrow();

    expect(tx.toolCall.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            callId: 'call-json-null',
            arguments: Prisma.JsonNull,
          }),
        ],
      }),
    );
  });

  it('maps null tool call arguments to Prisma.JsonNull during sanitization', async () => {
    const tx = createTx();
    const prismaService = { getClient: () => tx } as unknown as PrismaService;
    const service = new RunEventsService(prismaService);

    await service.completeLLMCall({
      tx: tx as any,
      eventId: 'event-plain-null',
      status: RunEventStatus.success,
      toolCalls: [
        {
          callId: 'call-plain-null',
          name: 'noop',
          arguments: null as unknown as Prisma.InputJsonValue,
        },
      ],
    });

    expect(tx.toolCall.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            callId: 'call-plain-null',
            arguments: Prisma.JsonNull,
          }),
        ],
      }),
    );
  });
});
