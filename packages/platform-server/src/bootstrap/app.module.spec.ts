import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AppModule } from './app.module';
import { MongoService } from '../core/services/mongo.service';
import { PrismaService } from '../core/services/prisma.service';
import type { PrismaClient } from '@prisma/client';
import type { Db } from 'mongodb';
import { ContainerService } from '../infra/container/container.service';
import { ContainerCleanupService } from '../infra/container/containerCleanup.job';
import { ContainerRegistry } from '../infra/container/container.registry';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { RunEventsService } from '../events/run-events.service';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { ThreadsMetricsService } from '../agents/threads.metrics.service';
import { VaultService } from '../vault/vault.service';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';

describe('AppModule', () => {
  it('compiles with stubbed infrastructure', async () => {
    const prismaServiceStub = {
      getClient: vi.fn(() => ({} as PrismaClient)),
    } satisfies Pick<PrismaService, 'getClient'>;

    const mongoCollectionFactory = () => ({
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({}),
      updateOne: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });

    const mongoStub = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn(() => ({ collection: vi.fn(() => mongoCollectionFactory()) } as unknown as Db)),
    } satisfies Partial<MongoService>;

    const containerRegistryStub = {
      registerStart: vi.fn(),
      updateLastUsed: vi.fn(),
      claimForTermination: vi.fn().mockResolvedValue(false),
      markStopped: vi.fn(),
      getExpired: vi.fn().mockResolvedValue([]),
      ensureIndexes: vi.fn(),
      recordTerminationFailure: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    };

    const containerServiceStub = {
      start: vi.fn(),
      stopContainer: vi.fn(),
      removeContainer: vi.fn(),
      findContainersByLabels: vi.fn().mockResolvedValue([]),
      touchLastUsed: vi.fn(),
    };

    const cleanupStub = { start: vi.fn(), stop: vi.fn() };
    const ncpsStub = { init: vi.fn(), getKey: vi.fn() };
    const runEventsStub = {
      recordInvocationMessage: vi.fn(),
      recordInjection: vi.fn(),
      startLLMCall: vi.fn(),
      completeLLMCall: vi.fn(),
      startToolExecution: vi.fn(),
      completeToolExecution: vi.fn(),
      recordSummarization: vi.fn(),
      publishEvent: vi.fn(),
      listRunEvents: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getRunSummary: vi.fn().mockResolvedValue(null),
      getEventSnapshot: vi.fn().mockResolvedValue(null),
    } satisfies Partial<RunEventsService>;

    const agentsPersistenceStub = {
      getOrCreateThreadByAlias: vi.fn().mockResolvedValue('thread'),
      updateThreadChannelDescriptor: vi.fn(),
      getOrCreateSubthreadByAlias: vi.fn().mockResolvedValue('thread-child'),
      beginRunThread: vi.fn().mockResolvedValue({ runId: 'run' }),
      recordInjected: vi.fn(),
      completeRun: vi.fn(),
      resolveThreadId: vi.fn().mockResolvedValue('thread'),
      setEventsPublisher: vi.fn(),
    } satisfies Partial<AgentsPersistenceService>;

    const threadsMetricsStub = {
      getThreadsMetrics: vi.fn().mockResolvedValue({}),
    } satisfies Partial<ThreadsMetricsService>;

    const vaultStub = {
      getSecret: vi.fn().mockResolvedValue(undefined),
      listKvV2Mounts: vi.fn().mockResolvedValue([]),
    } satisfies Partial<VaultService>;

    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MongoService)
      .useValue(mongoStub)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(ContainerRegistry)
      .useValue(containerRegistryStub)
      .overrideProvider(ContainerService)
      .useValue(containerServiceStub)
      .overrideProvider(ContainerCleanupService)
      .useValue(cleanupStub)
      .overrideProvider(NcpsKeyService)
      .useValue(ncpsStub)
      .overrideProvider(RunEventsService)
      .useValue(runEventsStub)
      .overrideProvider(AgentsPersistenceService)
      .useValue(agentsPersistenceStub)
      .overrideProvider(ThreadsMetricsService)
      .useValue(threadsMetricsStub)
      .overrideProvider(VaultService)
      .useValue(vaultStub)
      .compile();

    expect(testingModule).toBeDefined();
    const gateway = testingModule.get(GraphSocketGateway, { strict: false });
    expect(gateway).toBeDefined();

    await testingModule.close();
  });
});
