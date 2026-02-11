import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import type { LLM } from '@agyn/llm';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

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
import { GraphRepository } from '../src/graph/graph.repository';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';

process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';
process.env.NCPS_ENABLED = process.env.NCPS_ENABLED || 'false';
process.env.CONTAINERS_CLEANUP_ENABLED = process.env.CONTAINERS_CLEANUP_ENABLED || 'false';
process.env.LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234';

const TEST_TIMEOUT_MS = 15_000;
const agentProbeToken = Symbol('agent_node_probe');

describe('App bootstrap smoke test', () => {
  it('initializes Nest application and wires critical dependencies', async () => {
    const { AppModule } = await import('../src/bootstrap/app.module');
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

    const graphRepositoryStub = {
      initIfNeeded: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        name: 'main',
        version: 0,
        updatedAt: new Date(0).toISOString(),
        nodes: [],
        edges: [],
        variables: [],
      }),
      upsertNodeState: vi.fn().mockResolvedValue(undefined),
    } satisfies Record<string, unknown>;

    const templateRegistryStub = {
      register: vi.fn().mockReturnThis(),
      getClass: vi.fn(),
      getMeta: vi.fn(),
      toSchema: vi.fn().mockResolvedValue([]),
    } as unknown as TemplateRegistry;

    const liveGraphRuntimeStub = {
      load: vi.fn().mockResolvedValue({ applied: false }),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    } as unknown as LiveGraphRuntime;

    class StubProvisioner extends LLMProvisioner {
      async init(): Promise<void> {}
      getLLM = vi.fn(async () => ({} as LLM));
      async teardown(): Promise<void> {}
    }
    const llmProvisionerStub = new StubProvisioner();

    const subscriptionSpy = vi.spyOn(EventsBusService.prototype, 'subscribeToRunEvents');

    const configService = new ConfigService().init(
      configSchema.parse({
        litellmBaseUrl: process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000',
        litellmMasterKey: process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234',
        agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test',
      }),
    );

    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: agentProbeToken,
          useFactory: (agent: AgentNode, llm: LLMProvisioner) => ({ agent, llm }),
          inject: [AgentNode, LLMProvisioner],
        },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
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
      .overrideProvider(GraphRepository)
      .useValue(graphRepositoryStub as unknown as GraphRepository)
      .overrideProvider(TemplateRegistry)
      .useValue(templateRegistryStub)
      .overrideProvider(LiveGraphRuntime)
      .useValue(liveGraphRuntimeStub)
      .overrideProvider(LLMProvisioner)
      .useValue(llmProvisionerStub)
      .overrideProvider(LLMSettingsService)
      .useValue({});

    const moduleRef = await moduleBuilder.compile();
    expect(moduleRef.get(ConfigService)).toBe(configService);
    const adapter = new FastifyAdapter();
    const fastifyInstance = adapter.getInstance() as { addresses?: () => Array<Record<string, unknown>> };
    if (typeof fastifyInstance.addresses !== 'function') {
      fastifyInstance.addresses = () => [{ address: '127.0.0.1', family: 'IPv4', port: 0 }];
    }

    const app = moduleRef.createNestApplication(adapter);

    try {
      await app.init();

      const startupRecovery = app.get(StartupRecoveryService);
      const eventsBus = app.get(EventsBusService);
      expect(startupRecovery).toBeInstanceOf(StartupRecoveryService);
      expect(eventsBus).toBeInstanceOf(EventsBusService);
      expect(Reflect.get(startupRecovery as object, 'eventsBus')).toBe(eventsBus);

      const llmProvisioner = app.get(LLMProvisioner);
      expect(llmProvisioner).toBe(llmProvisionerStub);

      const agentProbe = app.get<{ agent: AgentNode; llm: LLMProvisioner }>(agentProbeToken);
      expect(agentProbe.llm).toBe(llmProvisioner);
      expect(agentProbe.agent).toBeInstanceOf(AgentNode);
      expect(Reflect.get(agentProbe.agent as object, 'llmProvisioner')).toBe(llmProvisioner);

      const gateway = app.get(GraphSocketGateway);
      expect(gateway).toBeInstanceOf(GraphSocketGateway);
      expect(subscriptionSpy).toHaveBeenCalledTimes(1);
      const [listener] = subscriptionSpy.mock.calls[0] ?? [];
      expect(typeof listener).toBe('function');

      const cleanupRegistry = Reflect.get(gateway as object, 'cleanup') as unknown;
      expect(Array.isArray(cleanupRegistry)).toBe(true);
      expect((cleanupRegistry as unknown[]).length).toBeGreaterThan(0);
    } finally {
      subscriptionSpy.mockRestore();
      await app.close();
      await moduleRef.close();
    }
  }, TEST_TIMEOUT_MS);
});
