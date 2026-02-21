import 'reflect-metadata';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import type { LLM } from '@agyn/llm';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AddressInfo } from 'net';
import { fetch as undiciFetch } from 'undici';

import { PrismaService } from '../src/core/services/prisma.service';
import { StartupRecoveryService } from '../src/core/services/startupRecovery.service';
import { EventsBusService } from '../src/events/events-bus.service';
import { RunEventsService } from '../src/events/run-events.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerService } from '@agyn/docker-runner';
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
import { runnerConfigDefaults } from '../__tests__/helpers/config';
import { DOCKER_CLIENT, type DockerClient } from '../src/infra/container/dockerClient.token';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import { VolumeGcService } from '../src/infra/container/volumeGc.job';
import { DockerRunnerConnectivityMonitor } from '../src/infra/container/dockerRunnerConnectivity.monitor';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';
import { HealthController } from '../src/infra/health/health.controller';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'litellm';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';
process.env.NCPS_ENABLED = process.env.NCPS_ENABLED || 'false';
process.env.CONTAINERS_CLEANUP_ENABLED = process.env.CONTAINERS_CLEANUP_ENABLED || 'false';
process.env.LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234';

const TEST_TIMEOUT_MS = 15_000;
const agentProbeToken = Symbol('agent_node_probe');

type BootstrapStubs = {
  prismaServiceStub: Pick<PrismaService, 'getClient'>;
  containerRegistryStub: Partial<ContainerRegistry>;
  containerServiceStub: Partial<ContainerService>;
  cleanupStub: Partial<ContainerCleanupService>;
  ncpsStub: Partial<NcpsKeyService>;
  runEventsStub: Partial<RunEventsService>;
  agentsPersistenceStub: Partial<AgentsPersistenceService>;
  threadsMetricsStub: Partial<ThreadsMetricsService>;
  vaultStub: Partial<VaultService>;
  graphRepositoryStub: Record<string, unknown>;
  templateRegistryStub: TemplateRegistry;
  liveGraphRuntimeStub: LiveGraphRuntime;
  llmProvisionerStub: LLMProvisioner;
  workspaceWatcherStub: Partial<DockerWorkspaceEventsWatcher>;
  dockerClientStub: Partial<DockerClient>;
  volumeGcStub: Partial<VolumeGcService>;
  connectivityMonitorStub: Partial<DockerRunnerConnectivityMonitor>;
};

const createBootstrapStubs = (): BootstrapStubs => {
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

  const workspaceWatcherStub = {
    start: vi.fn(),
    stop: vi.fn(),
  } satisfies Partial<DockerWorkspaceEventsWatcher>;

  const dockerClientStub = {
    checkConnectivity: vi.fn().mockResolvedValue({ status: 200 }),
    getBaseUrl: vi.fn(() => runnerConfigDefaults.dockerRunnerBaseUrl),
    listContainersByVolume: vi.fn().mockResolvedValue([]),
    removeVolume: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<DockerClient>;

  const volumeGcStub = { start: vi.fn(), stop: vi.fn() } satisfies Partial<VolumeGcService>;
  const connectivityMonitorStub = {
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  } satisfies Partial<DockerRunnerConnectivityMonitor>;

  return {
    prismaServiceStub,
    containerRegistryStub,
    containerServiceStub,
    cleanupStub,
    ncpsStub,
    runEventsStub,
    agentsPersistenceStub,
    threadsMetricsStub,
    vaultStub,
    graphRepositoryStub,
    templateRegistryStub,
    liveGraphRuntimeStub,
    llmProvisionerStub,
    workspaceWatcherStub,
    dockerClientStub,
    volumeGcStub,
    connectivityMonitorStub,
  };
};

const applyBootstrapOverrides = (
  moduleBuilder: TestingModuleBuilder,
  stubs: BootstrapStubs,
  configService: ConfigService,
  options: { stubConnectivityMonitor?: boolean; stubVolumeGc?: boolean; stubDockerClient?: boolean } = {},
): TestingModuleBuilder => {
  moduleBuilder
    .overrideProvider(ConfigService)
    .useValue(configService)
    .overrideProvider(PrismaService)
    .useValue(stubs.prismaServiceStub as PrismaService)
    .overrideProvider(ContainerRegistry)
    .useValue(stubs.containerRegistryStub as ContainerRegistry)
    .overrideProvider(ContainerService)
    .useValue(stubs.containerServiceStub as ContainerService)
    .overrideProvider(ContainerCleanupService)
    .useValue(stubs.cleanupStub as ContainerCleanupService)
    .overrideProvider(NcpsKeyService)
    .useValue(stubs.ncpsStub as NcpsKeyService)
    .overrideProvider(RunEventsService)
    .useValue(stubs.runEventsStub as RunEventsService)
    .overrideProvider(AgentsPersistenceService)
    .useValue(stubs.agentsPersistenceStub as AgentsPersistenceService)
    .overrideProvider(ThreadsMetricsService)
    .useValue(stubs.threadsMetricsStub as ThreadsMetricsService)
    .overrideProvider(VaultService)
    .useValue(stubs.vaultStub as VaultService)
    .overrideProvider(GraphRepository)
    .useValue(stubs.graphRepositoryStub as unknown as GraphRepository)
    .overrideProvider(TemplateRegistry)
    .useValue(stubs.templateRegistryStub)
    .overrideProvider(LiveGraphRuntime)
    .useValue(stubs.liveGraphRuntimeStub)
    .overrideProvider(LLMProvisioner)
    .useValue(stubs.llmProvisionerStub)
    .overrideProvider(LLMSettingsService)
    .useValue({})
    .overrideProvider(DockerWorkspaceEventsWatcher)
    .useValue(stubs.workspaceWatcherStub as DockerWorkspaceEventsWatcher);

  if (options.stubDockerClient !== false) {
    moduleBuilder.overrideProvider(DOCKER_CLIENT).useValue(stubs.dockerClientStub as DockerClient);
  }
  if (options.stubVolumeGc !== false) {
    moduleBuilder.overrideProvider(VolumeGcService).useValue(stubs.volumeGcStub as VolumeGcService);
  }
  if (options.stubConnectivityMonitor !== false) {
    moduleBuilder
      .overrideProvider(DockerRunnerConnectivityMonitor)
      .useValue(stubs.connectivityMonitorStub as DockerRunnerConnectivityMonitor);
  }

  return moduleBuilder;
};

describe('App bootstrap smoke test', () => {
  it('initializes Nest application and wires critical dependencies', async () => {
    const { AppModule } = await import('../src/bootstrap/app.module');
    const stubs = createBootstrapStubs();
    const subscriptionSpy = vi.spyOn(EventsBusService.prototype, 'subscribeToRunEvents');

    const configService = new ConfigService().init(
      configSchema.parse({
        llmProvider: process.env.LLM_PROVIDER || 'litellm',
        litellmBaseUrl: process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000',
        litellmMasterKey: process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234',
        agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test',
        ...runnerConfigDefaults,
      }),
    );

    ConfigService.register(configService);
    const dockerRunnerStatus = new DockerRunnerStatusService(configService);

    const moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: agentProbeToken,
          useFactory: (agent: AgentNode, llm: LLMProvisioner) => ({ agent, llm }),
          inject: [AgentNode, LLMProvisioner],
        },
      ],
    });

    applyBootstrapOverrides(moduleBuilder, stubs, configService);
    moduleBuilder.overrideProvider(DockerRunnerStatusService).useValue(dockerRunnerStatus);

    const moduleRef = await moduleBuilder.compile();
    expect(moduleRef.get(ConfigService)).toBe(configService);
    expect(moduleRef.get(DockerRunnerStatusService)).toBe(dockerRunnerStatus);
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
      expect(llmProvisioner).toBe(stubs.llmProvisionerStub);

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
      ConfigService.clearInstanceForTest();
    }
  }, TEST_TIMEOUT_MS);

  it(
    'serves health and guards docker endpoints when runner is optional and unreachable',
    async () => {
      const { AppModule } = await import('../src/bootstrap/app.module');
      const stubs = createBootstrapStubs();
      const previousEnv = {
        DOCKER_RUNNER_BASE_URL: process.env.DOCKER_RUNNER_BASE_URL,
        DOCKER_RUNNER_SHARED_SECRET: process.env.DOCKER_RUNNER_SHARED_SECRET,
        DOCKER_RUNNER_OPTIONAL: process.env.DOCKER_RUNNER_OPTIONAL,
        VOLUME_GC_ENABLED: process.env.VOLUME_GC_ENABLED,
        VOLUME_GC_INTERVAL_MS: process.env.VOLUME_GC_INTERVAL_MS,
        VOLUME_GC_SWEEP_TIMEOUT_MS: process.env.VOLUME_GC_SWEEP_TIMEOUT_MS,
      } as const;

      process.env.DOCKER_RUNNER_BASE_URL = 'http://127.0.0.1:59999';
      process.env.DOCKER_RUNNER_SHARED_SECRET = 'shared-secret';
      process.env.DOCKER_RUNNER_OPTIONAL = 'true';
      process.env.VOLUME_GC_ENABLED = 'true';
      process.env.VOLUME_GC_INTERVAL_MS = '25';
      process.env.VOLUME_GC_SWEEP_TIMEOUT_MS = '10';

      ConfigService.clearInstanceForTest();
      const configService = ConfigService.register(
        new ConfigService().init(
          configSchema.parse({
            llmProvider: process.env.LLM_PROVIDER || 'litellm',
            litellmBaseUrl: process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000',
            litellmMasterKey: process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234',
            agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test',
            dockerRunnerOptional: true,
            dockerRunnerConnectivityIntervalMs: 5,
            ...runnerConfigDefaults,
          }),
        ),
      );

      stubs.dockerClientStub.checkConnectivity = vi
        .fn()
        .mockRejectedValue(
          new DockerRunnerRequestError(503, 'runner_unreachable', true, 'runner offline'),
        );
      stubs.dockerClientStub.getBaseUrl = vi.fn(() => process.env.DOCKER_RUNNER_BASE_URL || '');
      const volumeGcStarted: string[] = [];
      stubs.volumeGcStub.start = vi.fn((intervalMs?: number) => {
        volumeGcStarted.push(`started:${intervalMs}`);
      });

      const dockerRunnerStatus = new DockerRunnerStatusService(configService);
      const connectivityMonitor = new DockerRunnerConnectivityMonitor(
        stubs.dockerClientStub as DockerClient,
        configService,
        dockerRunnerStatus,
      );

      const moduleBuilder = Test.createTestingModule({
        imports: [AppModule],
      });

      applyBootstrapOverrides(moduleBuilder, stubs, configService, {
        stubConnectivityMonitor: false,
      });
      moduleBuilder.overrideProvider(DockerRunnerStatusService).useValue(dockerRunnerStatus);
      moduleBuilder
        .overrideProvider(DockerRunnerConnectivityMonitor)
        .useValue(connectivityMonitor);
      const moduleRef = await moduleBuilder.compile();
      expect(moduleRef.get(DockerRunnerStatusService)).toBe(dockerRunnerStatus);
      const app = moduleRef.createNestApplication(new FastifyAdapter());
      const fastify = app.getHttpAdapter().getInstance();

      try {
        await app.init();

        const healthController = app.get(HealthController);
        expect(healthController).toBeInstanceOf(HealthController);
        Reflect.set(healthController as object, 'dockerRunnerStatus', dockerRunnerStatus);

        const listenStartedAt = Date.now();
        await fastify.listen({ port: 0, host: '127.0.0.1' });
        const listenDuration = Date.now() - listenStartedAt;
        expect(listenDuration).toBeLessThan(5_000);

        const volumeGc = app.get(VolumeGcService);
        setImmediate(() => {
          const interval = Number(process.env.VOLUME_GC_INTERVAL_MS ?? '') || 60_000;
          volumeGc.start(interval);
        });
        await new Promise((resolve) => setImmediate(resolve));
        expect(volumeGcStarted.length).toBeGreaterThanOrEqual(1);

        await new Promise((resolve) => setTimeout(resolve, 20));

        const addressInfo = fastify.server.address() as AddressInfo;
        const host = addressInfo.address === '::' ? '127.0.0.1' : addressInfo.address;
        const baseUrl = `http://${host}:${addressInfo.port}`;

        const healthResponse = await undiciFetch(`${baseUrl}/health`);
        expect(healthResponse.status).toBe(200);
        const healthBody = (await healthResponse.json()) as {
          dependencies?: { dockerRunner?: { status?: string; optional?: boolean } };
        };
        expect(healthBody.dependencies?.dockerRunner?.status).toBe('down');
        expect(healthBody.dependencies?.dockerRunner?.optional).toBe(true);

        const containersResponse = await undiciFetch(`${baseUrl}/api/containers`);
        expect(containersResponse.status).toBe(503);
        const containersBody = (await containersResponse.json()) as { error?: { code?: string } };
        expect(containersBody.error?.code).toBe('docker_runner_not_ready');
      } finally {
        await fastify.close();
        await app.close();
        await moduleRef.close();
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
        ConfigService.clearInstanceForTest();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
