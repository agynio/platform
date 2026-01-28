import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { AgentsPersistenceService } from '../../src/agents/agents.persistence.service';
import type { PrismaService } from '../../src/core/services/prisma.service';
import type { ThreadsMetricsService } from '../../src/agents/threads.metrics.service';
import type { TemplateRegistry } from '../../src/graph-core/templateRegistry';
import type { GraphRepository } from '../../src/graph/graph.repository';
import type { RunEventsService } from '../../src/events/run-events.service';
import type { CallAgentLinkingService } from '../../src/agents/call-agent-linking.service';
import type { EventsBusService } from '../../src/events/events-bus.service';
import { HumanMessage } from '@agyn/llm';
import { createUserServiceStub } from '../helpers/userService.stub';

describe('AgentsPersistenceService', () => {
  it('persists invocation messages as user role', async () => {
    const messageCreate = vi.fn().mockImplementation(async ({ data }) => ({
      id: 'msg-1',
      kind: data.kind,
      text: data.text,
      source: data.source,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    }));

    const threadRepository = {
      findUnique: vi.fn().mockResolvedValue({ id: 'thread-1', ownerUserId: 'user-default' }),
    };

    const txClient = {
      thread: threadRepository,
      run: { create: vi.fn().mockResolvedValue({ id: 'run-1', threadId: 'thread-1', status: 'running' }) },
      message: { create: messageCreate },
      runMessage: { create: vi.fn().mockResolvedValue(undefined) },
    };

    const prismaClient = {
      thread: threadRepository,
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => await fn(txClient)),
    };

    const prismaService = { getClient: () => prismaClient } as unknown as PrismaService;
    const metrics = {} as unknown as ThreadsMetricsService;
    const templateRegistry = {} as unknown as TemplateRegistry;
    const graphRepository = {} as unknown as GraphRepository;
    const runEvents = {
      recordInvocationMessage: vi.fn().mockResolvedValue({ id: 'event-1' }),
    } as unknown as RunEventsService;
    const callAgentLinking = {
      onChildRunStarted: vi.fn().mockResolvedValue(null),
    } as unknown as CallAgentLinkingService;
    const eventsBus = {
      emitRunStatusChanged: vi.fn(),
      emitMessageCreated: vi.fn(),
      emitThreadMetrics: vi.fn(),
      publishEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventsBusService;
    const userService = createUserServiceStub();

    const service = new AgentsPersistenceService(
      prismaService,
      metrics,
      templateRegistry,
      graphRepository,
      runEvents,
      callAgentLinking,
      eventsBus,
      userService,
    );

    await service.beginRunThread('thread-1', [HumanMessage.fromText('Hello there')]);

    expect(messageCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = messageCreate.mock.calls[0];
    expect(data.kind).toBe('user');
    expect(runEvents.recordInvocationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
      }),
    );
  });
});
