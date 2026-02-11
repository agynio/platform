import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/bootstrap/app.module';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
import type { PrismaClient } from '@prisma/client';
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
import { EventsBusService } from '../src/events/events-bus.service';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { clearTestConfig, registerTestConfig } from './helpers/config';

process.env.LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-test-master';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agents_test';

describe('AppModule bootstrap smoke test', () => {
  afterEach(() => {
    clearTestConfig();
  });

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
      liteLLMVirtualKey: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      $queryRaw: transactionClientStub.$queryRaw,
      $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => cb(transactionClientStub)),
    } satisfies Partial<PrismaClient>;

    const prismaServiceStub = {
      getClient: vi.fn(() => prismaClientStub as PrismaClient),
    } satisfies Pick<PrismaService, 'getClient'>;

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
      appendLLMCallContextItems: vi.fn(),
      createContextItems: vi.fn(),
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
      recordInjected: vi.fn().mockResolvedValue({ messageIds: [] }),
      completeRun: vi.fn(),
      resolveThreadId: vi.fn().mockResolvedValue('thread'),
      ensureThreadModel: vi.fn(async (_threadId: string, model: string) => model),
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
    const eventsBusStub = createEventsBusStub();
    const startupRecoveryStub = { onApplicationBootstrap: vi.fn() } satisfies Partial<StartupRecoveryService>;
    const liveRuntimeStub = ({
      load: vi.fn().mockResolvedValue({ applied: false }),
      getNodeInstance: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    } satisfies Partial<LiveGraphRuntime>) as LiveGraphRuntime;
    const llmProvisionerStub = {
      init: vi.fn().mockResolvedValue(undefined),
      getLLM: vi.fn().mockResolvedValue({ call: vi.fn() }),
    } satisfies Partial<LLMProvisioner>;

    const config = registerTestConfig({
      litellmBaseUrl: process.env.LITELLM_BASE_URL,
      litellmMasterKey: process.env.LITELLM_MASTER_KEY,
      agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL,
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
      .overrideProvider(EventsBusService)
      .useValue(eventsBusStub as unknown as EventsBusService)
      .overrideProvider(StartupRecoveryService)
      .useValue(startupRecoveryStub)
      .overrideProvider(LiveGraphRuntime)
      .useValue(liveRuntimeStub)
      .overrideProvider(LLMProvisioner)
      .useValue(llmProvisionerStub)
      .overrideProvider(ConfigService)
      .useValue(config)
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
