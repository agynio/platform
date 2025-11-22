import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/bootstrap/app.module';
import { PrismaService } from '../src/core/services/prisma.service';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { RunEventsService } from '../src/events/run-events.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { VaultService } from '../src/vault/vault.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';
process.env.NCPS_ENABLED = process.env.NCPS_ENABLED || 'false';
process.env.CONTAINERS_CLEANUP_ENABLED = process.env.CONTAINERS_CLEANUP_ENABLED || 'false';

describe('App bootstrap smoke test', () => {
  it('initializes Nest application and wires critical dependencies', async () => {
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
      $queryRaw: transactionClientStub.$queryRaw,
      $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => {
        await cb(transactionClientStub);
        return undefined;
      }),
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
      touchLastUsed: vi.fn(),
    } satisfies Partial<ContainerRegistry>;

    const containerServiceStub = {
      start: vi.fn(),
      stopContainer: vi.fn(),
      removeContainer: vi.fn(),
      findContainersByLabels: vi.fn().mockResolvedValue([]),
      findContainerByLabels: vi.fn().mockResolvedValue(undefined),
      execContainer: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' }),
      putArchive: vi.fn().mockResolvedValue(undefined),
      touchLastUsed: vi.fn(),
      ensureDinD: vi.fn().mockResolvedValue(undefined),
      cleanupDinDSidecars: vi.fn().mockResolvedValue(undefined),
    } satisfies Partial<ContainerService>;

    const cleanupStub = { start: vi.fn(), stop: vi.fn() } satisfies Partial<ContainerCleanupService>;

    const ncpsStub = {
      init: vi.fn(),
      getKey: vi.fn(),
      getKeysForInjection: vi.fn().mockReturnValue([]),
    } satisfies Partial<NcpsKeyService>;

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
      recordInjected: vi.fn().mockResolvedValue({ messageIds: [] }),
      completeRun: vi.fn(),
      resolveThreadId: vi.fn().mockResolvedValue('thread'),
    } satisfies Partial<AgentsPersistenceService>;

    const threadsMetricsStub = {
      getThreadsMetrics: vi.fn().mockResolvedValue({}),
    } satisfies Partial<ThreadsMetricsService>;

    const vaultStub = {
      getSecret: vi.fn().mockResolvedValue(undefined),
      listKvV2Mounts: vi.fn().mockResolvedValue([]),
    } satisfies Partial<VaultService>;

    const subscriptionSpy = vi.spyOn(EventsBusService.prototype, 'subscribeToRunEvents');

    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
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
      .useValue(vaultStub);

    const moduleRef = await moduleBuilder.compile();
    const app = moduleRef.createNestApplication();

    try {
      await app.init();

      const startupRecovery = app.get(StartupRecoveryService);
      const eventsBus = app.get(EventsBusService);
      expect(startupRecovery).toBeInstanceOf(StartupRecoveryService);
      expect(eventsBus).toBeInstanceOf(EventsBusService);
      expect(Reflect.get(startupRecovery as object, 'eventsBus')).toBe(eventsBus);

      const llmProvisioner = app.get(LLMProvisioner);
      const agentNode = await app.resolve(AgentNode);
      expect(agentNode).toBeInstanceOf(AgentNode);
      expect(Reflect.get(agentNode as object, 'llmProvisioner')).toBe(llmProvisioner);

      const gateway = app.get(GraphSocketGateway);
      expect(gateway).toBeInstanceOf(GraphSocketGateway);
      expect(subscriptionSpy).toHaveBeenCalledTimes(1);
      const [listener] = subscriptionSpy.mock.calls[0] ?? [];
      expect(typeof listener).toBe('function');

      const cleanupRegistry = Reflect.get(gateway as object, 'cleanup');
      expect(Array.isArray(cleanupRegistry)).toBe(true);
      expect(cleanupRegistry.length).toBeGreaterThan(0);
    } finally {
      subscriptionSpy.mockRestore();
      await app.close();
      await moduleRef.close();
    }
  });
});
