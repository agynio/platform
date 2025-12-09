import { describe, expect, it, vi } from 'vitest';

import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { RunEventsService } from '../src/events/run-events.service';
import type { EventsBusService } from '../src/events/events-bus.service';

describe('CallAgentLinkingService child termination metadata', () => {
  it('persists terminated status in parent tool metadata', async () => {
    const storedEvent = {
      id: 'evt-manage',
      metadata: {
        tool: 'manage',
        parentThreadId: 'parent-thread',
        childThreadId: 'child-thread',
        childRun: { id: 'run-child', status: 'running', linkEnabled: true, latestMessageId: 'msg-1' },
        childRunId: 'run-child',
        childRunStatus: 'running',
        childRunLinkEnabled: true,
        childMessageId: 'msg-1',
      } as Record<string, unknown>,
    };

    const prismaClient = {
      runEvent: {
        findFirst: vi.fn(async () => storedEvent),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { metadata: Record<string, unknown> } }) => {
          if (where.id !== storedEvent.id) throw new Error('unexpected event id');
          storedEvent.metadata = data.metadata;
          return { id: storedEvent.id, metadata: storedEvent.metadata };
        }),
      },
    };

    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const runEvents = {} as RunEventsService;
    const eventsBus = { publishEvent: vi.fn() } as unknown as EventsBusService;

    const linking = new CallAgentLinkingService(prismaService, runEvents, eventsBus);

    const result = await linking.onChildRunCompleted({ runId: 'run-child', status: 'terminated' });

    expect(result).toBe('evt-manage');
    expect(prismaClient.runEvent.update).toHaveBeenCalledTimes(1);

    const metadata = storedEvent.metadata as Record<string, unknown>;
    expect(metadata.childRunStatus).toBe('terminated');
    const childRun = metadata.childRun as Record<string, unknown> | undefined;
    expect(childRun).toBeDefined();
    expect(childRun?.status).toBe('terminated');
    expect(childRun?.id).toBe('run-child');
  });
});
