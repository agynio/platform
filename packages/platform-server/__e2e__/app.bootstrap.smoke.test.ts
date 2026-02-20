import { ServiceUnavailableException } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import type { LLM } from '@agyn/llm';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { createServer, type AddressInfo } from 'node:net';
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
import { VolumeGcService } from '../src/infra/container/volumeGc.job';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import { DockerRunnerConnectivityMonitor } from '../src/infra/container/dockerRunnerConnectivity.monitor';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { RequireDockerRunnerGuard } from '../src/infra/container/requireDockerRunner.guard';
import type { DockerClient } from '../src/infra/container/dockerClient.token';
import { DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';

process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'litellm';
process.env.AGENTS_DATABASE_URL = process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test';
process.env.NCPS_ENABLED = process.env.NCPS_ENABLED || 'false';
process.env.CONTAINERS_CLEANUP_ENABLED = process.env.CONTAINERS_CLEANUP_ENABLED || 'false';
process.env.LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234';

const TEST_TIMEOUT_MS = 30_000;
const agentProbeToken = Symbol('agent_node_probe');

class StubProvisioner extends LLMProvisioner {
  async init(): Promise<void> {}
  getLLM = vi.fn(async () => ({} as LLM));
  async teardown(): Promise<void> {}
}

type BootstrapStubs = ReturnType<typeof createBootstrapStubs>;

const createBootstrapStubs = () => {
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
  } as unknown as GraphRepository;

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

  const llmProvisionerStub = new StubProvisioner();
  const volumeGcStub = { sweep: vi.fn(), onModuleInit: vi.fn(), onModuleDestroy: vi.fn() } satisfies Partial<VolumeGcService>;
  const workspaceWatcherStub = { start: vi.fn(), stop: vi.fn() } satisfies Partial<DockerWorkspaceEventsWatcher>;
  const connectivityMonitorStub = { onModuleInit: vi.fn(), onModuleDestroy: vi.fn() } satisfies Partial<DockerRunnerConnectivityMonitor>;

  return {
    transactionClientStub,
    prismaClientStub,
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
    volumeGcStub,
    workspaceWatcherStub,
    connectivityMonitorStub,
  };
};

const applyBootstrapOverrides = (
  moduleBuilder: TestingModuleBuilder,
  stubs: BootstrapStubs,
  configService: ConfigService,
  options: { stubConnectivityMonitor?: boolean } = {},
): TestingModuleBuilder => {
  moduleBuilder
    .overrideProvider(ConfigService)
    .useValue(configService)
    .overrideProvider(VolumeGcService)
    .useValue(stubs.volumeGcStub as unknown as VolumeGcService)
    .overrideProvider(DockerWorkspaceEventsWatcher)
    .useValue(stubs.workspaceWatcherStub as unknown as DockerWorkspaceEventsWatcher)
    .overrideProvider(PrismaService)
    .useValue(stubs.prismaServiceStub)
    .overrideProvider(ContainerRegistry)
    .useValue(stubs.containerRegistryStub)
    .overrideProvider(ContainerService)
    .useValue(stubs.containerServiceStub)
    .overrideProvider(ContainerCleanupService)
    .useValue(stubs.cleanupStub)
    .overrideProvider(NcpsKeyService)
    .useValue(stubs.ncpsStub)
    .overrideProvider(RunEventsService)
    .useValue(stubs.runEventsStub)
    .overrideProvider(AgentsPersistenceService)
    .useValue(stubs.agentsPersistenceStub)
    .overrideProvider(ThreadsMetricsService)
    .useValue(stubs.threadsMetricsStub)
    .overrideProvider(VaultService)
    .useValue(stubs.vaultStub)
    .overrideProvider(GraphRepository)
    .useValue(stubs.graphRepositoryStub)
    .overrideProvider(TemplateRegistry)
    .useValue(stubs.templateRegistryStub)
    .overrideProvider(LiveGraphRuntime)
    .useValue(stubs.liveGraphRuntimeStub)
    .overrideProvider(LLMProvisioner)
    .useValue(stubs.llmProvisionerStub)
    .overrideProvider(LLMSettingsService)
    .useValue({});

  if (options.stubConnectivityMonitor !== false) {
    moduleBuilder
      .overrideProvider(DockerRunnerConnectivityMonitor)
      .useValue(stubs.connectivityMonitorStub as unknown as DockerRunnerConnectivityMonitor);
  }

  return moduleBuilder;
};

const allocateUnusedPort = async (): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to determine available port')));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((address as AddressInfo).port);
      });
    });
  });

const listenWithTimeout = async (app: NestFastifyApplication, timeoutMs: number): Promise<number> => {
  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for server listen')), timeoutMs);
    app
      .listen(0, '127.0.0.1')
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
  return Date.now() - startedAt;
};

const runWithTimeout = async <T>(operation: () => Promise<T>, label: string, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });


describe('App bootstrap smoke test', () => {
  it('initializes Nest application and wires critical dependencies', async () => {
    const { AppModule } = await import('../src/bootstrap/app.module');
    const stubs = createBootstrapStubs();
    const subscriptionSpy = vi.spyOn(EventsBusService.prototype, 'subscribeToRunEvents');

    ConfigService.clearInstanceForTest();
    const configService = ConfigService.register(
      new ConfigService().init(
        configSchema.parse({
          llmProvider: process.env.LLM_PROVIDER || 'litellm',
          litellmBaseUrl: process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000',
          litellmMasterKey: process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234',
          agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL || 'postgres://localhost:5432/test',
          ...runnerConfigDefaults,
        }),
      ),
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
    });

    applyBootstrapOverrides(moduleBuilder, stubs, configService, { stubConnectivityMonitor: true });

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
    }
  }, TEST_TIMEOUT_MS);

  it(
    'serves health and guards docker endpoints when runner is optional and unreachable',
    async () => {
      const previousEnv = {
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        LITELLM_BASE_URL: process.env.LITELLM_BASE_URL,
        LITELLM_MASTER_KEY: process.env.LITELLM_MASTER_KEY,
        AGENTS_DATABASE_URL: process.env.AGENTS_DATABASE_URL,
        DOCKER_RUNNER_BASE_URL: process.env.DOCKER_RUNNER_BASE_URL,
        DOCKER_RUNNER_OPTIONAL: process.env.DOCKER_RUNNER_OPTIONAL,
        DOCKER_RUNNER_SHARED_SECRET: process.env.DOCKER_RUNNER_SHARED_SECRET,
      } as const;

      const unusedPort = await allocateUnusedPort();
      process.env.LLM_PROVIDER = 'litellm';
      process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
      process.env.LITELLM_MASTER_KEY = 'sk-dev-master-1234';
      process.env.AGENTS_DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.DOCKER_RUNNER_BASE_URL = `http://127.0.0.1:${unusedPort}`;
      process.env.DOCKER_RUNNER_OPTIONAL = 'true';
      process.env.DOCKER_RUNNER_SHARED_SECRET = 'shared-secret';

      ConfigService.clearInstanceForTest();
      const configService = ConfigService.register(
        new ConfigService().init(
          configSchema.parse({
            ...runnerConfigDefaults,
            llmProvider: process.env.LLM_PROVIDER,
            litellmBaseUrl: process.env.LITELLM_BASE_URL,
            litellmMasterKey: process.env.LITELLM_MASTER_KEY,
            agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL,
            dockerRunnerBaseUrl: process.env.DOCKER_RUNNER_BASE_URL,
            dockerRunnerOptional: process.env.DOCKER_RUNNER_OPTIONAL,
            dockerRunnerSharedSecret: process.env.DOCKER_RUNNER_SHARED_SECRET,
          }),
        ),
      );
      const dockerClientStub = {
        checkConnectivity: vi
          .fn()
          .mockRejectedValue(new DockerRunnerRequestError(503, 'runner_unreachable', true, 'runner offline')),
        getBaseUrl: () => process.env.DOCKER_RUNNER_BASE_URL || 'http://127.0.0.1:0',
      } as Partial<DockerClient>;

      const moduleRef = await runWithTimeout(
        () =>
          Test.createTestingModule({
            providers: [
              DockerRunnerStatusService,
              {
                provide: ConfigService,
                useValue: configService,
              },
            ],
          }).compile(),
        'optional-runner module compile',
        10_000,
      );

      const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      const statusService = moduleRef.get(DockerRunnerStatusService);
      const connectivityMonitor = new DockerRunnerConnectivityMonitor(
        dockerClientStub as DockerClient,
        configService,
        statusService,
      );
      const guard = new RequireDockerRunnerGuard(statusService);

      try {
        await runWithTimeout(() => connectivityMonitor.onModuleInit(), 'connectivity monitor init', 5_000);
        await runWithTimeout(() => app.init(), 'app.init', 5_000);
        const fastify = app.getHttpAdapter().getInstance();
        fastify.get('/health', async (_request, reply) => {
          const snapshot = statusService.getSnapshot();
          const serialize = (value?: Date): string | null => (value ? value.toISOString() : null);
          reply.send({
            status: 'ok',
            timestamp: new Date().toISOString(),
            dependencies: {
              dockerRunner: {
                status: snapshot.status,
                baseUrl: snapshot.baseUrl,
                optional: snapshot.optional,
                consecutiveFailures: snapshot.consecutiveFailures,
                lastSuccessAt: serialize(snapshot.lastSuccessAt),
                lastFailureAt: serialize(snapshot.lastFailureAt),
                nextRetryAt: serialize(snapshot.nextRetryAt),
                lastError: snapshot.lastError ?? null,
              },
            },
          });
        });
        fastify.delete('/docker-protected/:id', async (_request, reply) => {
          try {
            guard.canActivate({} as never);
            reply.send({ ok: true });
          } catch (error) {
            if (error instanceof ServiceUnavailableException) {
              const body = error.getResponse();
              if (typeof body === 'object' && body) {
                reply.status(error.getStatus()).send({ statusCode: error.getStatus(), ...body });
              } else {
                reply.status(error.getStatus()).send({ statusCode: error.getStatus(), message: body });
              }
              return;
            }
            throw error;
          }
        });
        const listenDuration = await listenWithTimeout(app, 5_000);
        expect(listenDuration).toBeLessThan(5_000);

        await runWithTimeout(() => fastify.ready(), 'fastify.ready', 5_000);
        const addressInfo = fastify.server.address() as AddressInfo;
        const baseUrl = `http://${addressInfo.address}:${addressInfo.port}`;

        const health = await runWithTimeout(async () => {
          const response = await undiciFetch(`${baseUrl}/health`);
          expect(response.status).toBe(200);
          return response.json();
        }, 'health request', 5_000);
        expect(health.status).toBe('ok');
        expect(['unknown', 'down']).toContain(health.dependencies?.dockerRunner?.status);
        expect(health.dependencies?.dockerRunner?.baseUrl).toBe(process.env.DOCKER_RUNNER_BASE_URL);
        expect(health.dependencies?.dockerRunner?.optional).toBe(true);

        const deleteBody = await runWithTimeout(async () => {
          const response = await undiciFetch(`${baseUrl}/docker-protected/container-1`, { method: 'DELETE' });
          expect(response.status).toBe(503);
          return response.json();
        }, 'docker-protected delete request', 5_000);
        expect(deleteBody?.error?.code).toBe('docker_runner_not_ready');
        expect(deleteBody?.statusCode).toBe(503);
      } finally {
        await runWithTimeout(() => connectivityMonitor.onModuleDestroy(), 'connectivity monitor destroy', 5_000);
        await runWithTimeout(() => app.close(), 'app.close', 5_000);
        await runWithTimeout(() => moduleRef.close(), 'moduleRef.close', 5_000);
        ConfigService.clearInstanceForTest();
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }
    },
    TEST_TIMEOUT_MS,
  );
});
