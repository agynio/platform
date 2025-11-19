import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { GraphModule } from '../src/graph/graph.module';
import { GraphServicesModule } from '../src/graph/graph-services.module';
import { PrismaService } from '../src/core/services/prisma.service';
import type { PrismaClient } from '@prisma/client';
import { ContainerService } from '../src/infra/container/container.service';
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
import { LoggerService } from '../src/core/services/logger.service';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { GithubService } from '../src/infra/github/github.client';
import { PRService } from '../src/infra/github/pr.usecase';
import { ArchiveService } from '../src/infra/archive/archive.service';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { GraphRepository } from '../src/graph/graph.repository';
import { ModuleRef } from '@nestjs/core';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
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
  describe.skip('GraphModule DI smoke test', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('GraphModule DI smoke test', () => {
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
        ensureDinD: vi.fn().mockResolvedValue(undefined),
        cleanupDinDSidecars: vi.fn().mockResolvedValue(undefined),
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
        recordInjected: vi.fn().mockResolvedValue({ messageIds: [] }),
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

      const envServiceStub = makeStub({
        resolveProviderEnv: vi.fn().mockResolvedValue({}),
      });

      const configServiceStub = new ConfigService().init(
        configSchema.parse({
          llmProvider: 'openai',
          agentsDatabaseUrl: 'postgres://localhost:5432/test',
        }),
      );

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
        imports: [GraphModule, GraphServicesModule],
      });

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
      builder.overrideProvider(VaultService).useFactory(() => vaultStub as VaultService);
      builder.overrideProvider(SlackAdapter).useFactory(() => slackAdapterStub as SlackAdapter);
      builder.overrideProvider(ConfigService).useFactory(() => configServiceStub);
      builder.overrideProvider(EnvService).useFactory(() => envServiceStub as EnvService);
      builder.overrideProvider(GithubService).useFactory(() => makeStub({}));
      builder.overrideProvider(PRService).useFactory(() => makeStub({}));
      builder.overrideProvider(ArchiveService).useFactory(() => makeStub({}));
      builder.overrideProvider(TemplateRegistry).useFactory(() => templateRegistryStub as TemplateRegistry);
      builder.overrideProvider(GraphRepository).useFactory(() => graphRepositoryStub as GraphRepository);
      builder.overrideProvider(GraphSocketGateway).useValue({
        emitThreadCreated: vi.fn(),
        emitThreadUpdated: vi.fn(),
        emitRunEvent: vi.fn(),
        emitRunStatusChanged: vi.fn(),
        scheduleThreadMetrics: vi.fn(),
        scheduleThreadAndAncestorsMetrics: vi.fn(),
      } as unknown as GraphSocketGateway);

      builder.useMocker((token) => {
        if (token === LoggerService) {
          return makeStub({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: vi.fn(),
          });
        }
        return makeStub({});
      });

      const testingModule = await builder.compile();

      const provisioner = testingModule.get(LLMProvisioner, { strict: false });
      expect(provisioner).toBeDefined();

      const moduleRefProvider = testingModule.get(ModuleRef, { strict: false });
      await expect(moduleRefProvider.create(AgentNode)).resolves.toBeInstanceOf(AgentNode);
      await testingModule.close();
    }, 60000);
  });
}
