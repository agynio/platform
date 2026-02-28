import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphApiModule } from '../src/graph/graph-api.module';
import { PrismaService } from '../src/core/services/prisma.service';
import type { PrismaClient } from '@prisma/client';
import { ContainerService } from '@agyn/docker-runner';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { RunEventsService } from '../src/events/run-events.service';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { VaultService } from '../src/vault/vault.service';
import { SlackAdapter } from '../src/messaging/slack/slack.adapter';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { EnvService } from '../src/env/env.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GithubService } from '../src/infra/github/github.client';
import { PRService } from '../src/infra/github/pr.usecase';
import { ArchiveService } from '../src/infra/archive/archive.service';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import { GraphRepository } from '../src/graph/graph.repository';
import { ModuleRef } from '@nestjs/core';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { GatewayModule } from '../src/gateway/gateway.module';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { runnerConfigDefaults } from './helpers/config';
import { UI_NOTIFICATIONS_PUBLISHER } from '../src/notifications/ui-notifications.publisher';

const connectMocks = vi.hoisted(() => {
  const publish = vi.fn().mockResolvedValue(undefined);
  return {
    publish,
    createClient: vi.fn(() => ({ publish })),
  };
});

vi.mock('@connectrpc/connect', () => ({
  createClient: connectMocks.createClient,
}));

const connectNodeMocks = vi.hoisted(() => ({
  createConnectTransport: vi.fn(() => ({})),
}));

vi.mock('@connectrpc/connect-node', () => ({
  createConnectTransport: connectNodeMocks.createConnectTransport,
}));

vi.mock('../src/proto/gen/agynio/api/notifications/v1/notifications_pb.js', () => ({
  NotificationsService: {
    typeName: 'agynio.api.notifications.v1.NotificationsService',
    methods: {
      publish: {
        name: 'Publish',
      },
    },
  },
}));

process.env.LLM_PROVIDER = 'openai';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';
process.env.NCPS_ENABLED = process.env.NCPS_ENABLED || 'false';
process.env.CONTAINERS_CLEANUP_ENABLED = process.env.CONTAINERS_CLEANUP_ENABLED || 'false';

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';

const makeStub = <T extends Record<string, unknown>>(overrides: T): T =>
  new Proxy(overrides, {
    get(target, prop: string, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      const fn = vi.fn();
      Reflect.set(target, prop, fn);
      return fn;
    },
  });

if (!shouldRunDbTests) {
  describe.skip('GraphApiModule DI smoke test', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('GraphApiModule DI smoke test', () => {
    afterEach(() => {
      ConfigService.clearInstanceForTest();
    });

    it('resolves LLMProvisioner and creates AgentNode instances', async () => {
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
        liteLLMVirtualKey: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({ alias: 'default', key: 'sk-test', provider: 'openai' }),
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
        startToolExecution: vi.fn(),
        completeToolExecution: vi.fn(),
        recordSummarization: vi.fn(),
        publishEvent: vi.fn(),
        createContextItems: vi.fn(),
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


      const envServiceStub = makeStub({
        resolveProviderEnv: vi.fn().mockResolvedValue({}),
      });

      const configServiceStub = new ConfigService().init(
        configSchema.parse({
          llmProvider: 'openai',
          agentsDatabaseUrl: 'postgres://localhost:5432/test',
          litellmBaseUrl: 'http://127.0.0.1:4000',
          litellmMasterKey: 'test-master-key',
          ...runnerConfigDefaults,
          notificationsGrpcAddr: 'notifications:50051',
          notificationsGrpcDeadlineMs: 3000,
        }),
      );
      ConfigService.register(configServiceStub);

      const templateRegistryStub = {
        register: vi.fn().mockReturnThis(),
        getClass: vi.fn(),
        getMeta: vi.fn(),
        toSchema: vi.fn().mockResolvedValue([]),
      } satisfies Partial<TemplateRegistry>;

      const graphRepositoryStub = {
        initIfNeeded: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
        upsertNodeState: vi.fn().mockResolvedValue(undefined),
      } satisfies Partial<GraphRepository>;

      const builder = Test.createTestingModule({
        imports: [GraphApiModule, GatewayModule],
      });

      const liveRuntimeStub = ({
        load: vi.fn().mockResolvedValue({ applied: false }),
        apply: vi.fn().mockResolvedValue({ addedNodes: [], removedNodeIds: [], configUpdateNodeIds: [], addedEdges: [], removedEdges: [] }),
        getNodeInstance: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } satisfies Partial<LiveGraphRuntime>) as LiveGraphRuntime;

      vi.spyOn(PrismaService.prototype, 'getClient').mockReturnValue(prismaClientStub as PrismaClient);
      vi.spyOn(ContainerRegistry.prototype, 'ensureIndexes').mockResolvedValue(undefined);

      builder.overrideProvider(PrismaService).useFactory(() => prismaServiceStub as PrismaService);
      builder.overrideProvider(ContainerRegistry).useFactory(() => containerRegistryStub as ContainerRegistry);
      builder.overrideProvider(ContainerService).useFactory(() => containerServiceStub as ContainerService);
      builder.overrideProvider(ContainerCleanupService).useFactory(() => cleanupStub as ContainerCleanupService);
      builder.overrideProvider(ContainerThreadTerminationService).useFactory(() => terminationStub as ContainerThreadTerminationService);
      builder.overrideProvider(NcpsKeyService).useFactory(() => ncpsStub as NcpsKeyService);
      builder.overrideProvider(RunEventsService).useFactory(() => runEventsStub as RunEventsService);
      builder.overrideProvider(AgentsPersistenceService).useFactory(() => agentsPersistenceStub as AgentsPersistenceService);
      builder.overrideProvider(ThreadsMetricsService).useFactory(() => threadsMetricsStub as ThreadsMetricsService);
      builder.overrideProvider(UI_NOTIFICATIONS_PUBLISHER).useValue({ publishToRooms: vi.fn().mockResolvedValue(undefined) });
      builder.overrideProvider(VaultService).useFactory(() => vaultStub as VaultService);
      builder.overrideProvider(SlackAdapter).useFactory(() => slackAdapterStub as SlackAdapter);
      builder.overrideProvider(LiveGraphRuntime).useFactory(() => liveRuntimeStub);
      builder.overrideProvider(ConfigService).useFactory(() => configServiceStub);
      builder.overrideProvider(EnvService).useFactory(() => envServiceStub as EnvService);
      builder.overrideProvider(GithubService).useFactory(() => makeStub({}));
      builder.overrideProvider(PRService).useFactory(() => makeStub({}));
      builder.overrideProvider(ArchiveService).useFactory(() => makeStub({}));
      builder.overrideProvider(TemplateRegistry).useFactory(() => templateRegistryStub as TemplateRegistry);
      builder.overrideProvider(GraphRepository).useFactory(() => graphRepositoryStub as GraphRepository);
      builder.overrideProvider(GraphSocketGateway).useValue({
        emitNodeState: vi.fn(),
        emitThreadCreated: vi.fn(),
        emitThreadUpdated: vi.fn(),
        emitRunEvent: vi.fn(),
        emitRunStatusChanged: vi.fn(),
        scheduleThreadMetrics: vi.fn(),
        scheduleThreadAndAncestorsMetrics: vi.fn(),
      } as unknown as GraphSocketGateway);

      builder.useMocker((_token) => makeStub({}));

      const testingModule = await builder.compile();

      const provisioner = testingModule.get(LLMProvisioner, { strict: false });
      expect(provisioner).toBeDefined();

      const moduleRefProvider = testingModule.get(ModuleRef, { strict: false });
      await expect(moduleRefProvider.create(AgentNode)).resolves.toBeInstanceOf(AgentNode);
      await testingModule.close();
    }, 60000);
  });
}
