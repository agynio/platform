import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/bootstrap/app.module';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { MongoService } from '../src/core/services/mongo.service';
import { PrismaService } from '../src/core/services/prisma.service';
import type { PrismaClient } from '@prisma/client';
import type { Db } from 'mongodb';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { RunEventsService } from '../src/events/run-events.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { VaultService } from '../src/vault/vault.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
process.env.MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/test';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';

describe('AppModule bootstrap smoke test', () => {
  it('initializes Nest application with stubbed infrastructure', async () => {
    const transactionClientStub = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      run: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      reminder: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } satisfies Partial<PrismaClient>;

    const prismaClientStub = {
      container: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      conversationState: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      variableLocal: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
      $queryRaw: transactionClientStub.$queryRaw,
      $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => cb(transactionClientStub)),
    } satisfies Partial<PrismaClient>;

    const prismaServiceStub = {
      getClient: vi.fn(() => prismaClientStub as PrismaClient),
    } satisfies Pick<PrismaService, 'getClient'>;

    const mongoCollectionStub = {
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({}),
      replaceOne: vi.fn().mockResolvedValue({}),
      updateOne: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    const mongoServiceStub = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getDb: vi.fn(() => ({ collection: vi.fn(() => mongoCollectionStub) } as unknown as Db)),
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
    } satisfies Partial<ContainerRegistry>;

    const containerServiceStub = {
      start: vi.fn(),
      stopContainer: vi.fn(),
      removeContainer: vi.fn(),
      findContainersByLabels: vi.fn().mockResolvedValue([]),
      touchLastUsed: vi.fn(),
    } satisfies Partial<ContainerService>;

    const cleanupStub = { start: vi.fn(), stop: vi.fn() } satisfies Partial<ContainerCleanupService>;
    const terminationStub = { enqueue: vi.fn() } satisfies Partial<ContainerThreadTerminationService>;
    const ncpsStub = { init: vi.fn(), getKey: vi.fn(), getKeysForInjection: vi.fn().mockReturnValue([]) } satisfies Partial<NcpsKeyService>;
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

    const slackAdapterStub = {
      sendText: vi.fn().mockResolvedValue({ ok: true, channelMessageId: null, threadId: null }),
    } satisfies Partial<SlackAdapter>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MongoService)
      .useValue(mongoServiceStub)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(ContainerRegistry)
      .useValue(containerRegistryStub)
      .overrideProvider(ContainerService)
      .useValue(containerServiceStub)
      .overrideProvider(ContainerCleanupService)
      .useValue(cleanupStub)
      .overrideProvider(ContainerThreadTerminationService)
      .useValue(terminationStub)
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
      .overrideProvider(SlackAdapter)
      .useValue(slackAdapterStub)
      .compile();

    const adapter = new FastifyAdapter();
    const fastifyInstance = adapter.getInstance() as unknown as {
      addresses: () => Array<{ address: string; family: string; port: number }>;
    };
    fastifyInstance.addresses = () => [{ address: '127.0.0.1', family: 'IPv4', port: 0 }];

    const app = moduleRef.createNestApplication(adapter);

    await app.init();
    expect(app).toBeDefined();
    await app.close();
    await moduleRef.close();
  }, 60000);
});
