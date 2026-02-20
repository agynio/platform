import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';

import { NonceCache, verifyAuthHeaders } from '@agyn/docker-runner';

import { ContainersController } from '../src/infra/container/containers.controller';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
import { HttpDockerRunnerClient } from '../src/infra/container/httpDockerRunner.client';
import { DOCKER_CLIENT, type DockerClient } from '../src/infra/container/dockerClient.token';
import { InfraModule } from '../src/infra/infra.module';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';
import { VolumeGcService } from '../src/infra/container/volumeGc.job';
import { DockerWorkspaceEventsWatcher } from '../src/infra/container/containerEvent.watcher';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { GithubService } from '../src/infra/github/github.client';
import { PRService } from '../src/infra/github/pr.usecase';
import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import { ArchiveService } from '../src/infra/archive/archive.service';
import { TerminalSessionsService } from '../src/infra/container/terminal.sessions.service';
import { ContainerThreadTerminationService } from '../src/infra/container/containerThreadTermination.service';
import { ContainerEventProcessor } from '../src/infra/container/containerEvent.processor';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { RequireDockerRunnerGuard } from '../src/infra/container/requireDockerRunner.guard';
import { registerTestConfig } from './helpers/config';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DockerRunnerConnectivityMonitor } from '../src/infra/container/dockerRunnerConnectivity.monitor';

// Vitest compiles controllers without emitDecoratorMetadata, so manually register constructor param metadata.
Reflect.defineMetadata('design:paramtypes', [PrismaService, ContainerAdminService, ConfigService], ContainersController);

const RUNNER_SECRET = 'it-is-only-a-test';

type RunnerResponse = { status?: number; body?: unknown };

class MockDockerRunnerServer {
  private readonly app: FastifyInstance;
  private address?: AddressInfo;
  private stopResponse: RunnerResponse | (() => RunnerResponse) = { status: 204 };
  private removeResponse: RunnerResponse | (() => RunnerResponse) = { status: 204 };
  private readonly nonceCache = new NonceCache({ ttlMs: 60_000, maxEntries: 100 });

  constructor(private readonly secret: string) {
    this.app = Fastify({ logger: false });
    this.app.addHook('preHandler', async (request, reply) => {
      const headers = request.headers as Record<string, string | string[] | undefined>;
      const path = request.raw.url ?? request.url;
      const verification = verifyAuthHeaders({
        headers,
        method: request.method,
        path,
        body: request.body ?? '',
        secret: this.secret,
        nonceCache: this.nonceCache,
      });
      if (!verification.ok) {
        reply.code(401).send({ error: verification.code ?? 'unauthorized' });
      }
    });

    this.app.post('/v1/containers/stop', async (request, reply) => {
      const response = typeof this.stopResponse === 'function' ? this.stopResponse() : this.stopResponse;
      const status = response.status ?? 204;
      void reply.code(status).send(response.body ?? (status === 204 ? undefined : { ok: true }));
    });

    this.app.post('/v1/containers/remove', async (request, reply) => {
      const response = typeof this.removeResponse === 'function' ? this.removeResponse() : this.removeResponse;
      const status = response.status ?? 204;
      void reply.code(status).send(response.body ?? (status === 204 ? undefined : { ok: true }));
    });
  }

  async start(): Promise<void> {
    await this.app.listen({ port: 0, host: '127.0.0.1' });
    const address = this.app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine mock runner address');
    }
    this.address = address;
  }

  get baseUrl(): string {
    if (!this.address) {
      throw new Error('Runner server not started');
    }
    return `http://127.0.0.1:${this.address.port}`;
  }

  reset(): void {
    this.stopResponse = { status: 204 };
    this.removeResponse = { status: 204 };
  }

  setStopResponse(response: RunnerResponse): void {
    this.stopResponse = response;
  }

  setRemoveResponse(response: RunnerResponse): void {
    this.removeResponse = response;
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}

type ContainerRow = {
  containerId: string;
  dockerContainerId: string;
  nodeId: string | null;
  threadId: string | null;
  image: string;
  name: string;
  status: Prisma.ContainerStatus;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  metadata: Prisma.JsonValue | null;
  terminationReason: string | null;
  deletedAt: Date | null;
};

class PrismaServiceStub {
  private readonly containers = new Map<string, ContainerRow>();
  private readonly client: PrismaClient;

  constructor() {
    const prisma = {
      container: {
        findUnique: async ({ where }: { where: { containerId: string } }) => {
          const row = this.containers.get(where.containerId);
          return row ? { ...row, metadata: row.metadata ?? null } : null;
        },
        update: async ({ where, data }: { where: { containerId: string }; data: Partial<ContainerRow> }) => {
          const previous = this.containers.get(where.containerId);
          if (!previous) {
            throw new Error(`Container ${where.containerId} missing`);
          }
          const next: ContainerRow = {
            ...previous,
            ...data,
            updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
            metadata: (data.metadata ?? previous.metadata) as Prisma.JsonValue,
          };
          this.containers.set(where.containerId, next);
          return next;
        },
      },
    } satisfies Partial<PrismaClient>;
    this.client = prisma as PrismaClient;
  }

  getClient(): PrismaClient {
    return this.client;
  }

  seedContainer(containerId: string, overrides: Partial<ContainerRow> = {}): void {
    const now = new Date();
    const row: ContainerRow = {
      containerId,
      dockerContainerId: containerId,
      nodeId: overrides.nodeId ?? 'node-1',
      threadId: overrides.threadId ?? 'thread-1',
      image: overrides.image ?? 'nixpkgs/nix',
      name: overrides.name ?? `container-${containerId}`,
      status: overrides.status ?? 'running',
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      lastUsedAt: overrides.lastUsedAt ?? now,
      killAfterAt: overrides.killAfterAt ?? null,
      metadata: overrides.metadata ?? { labels: { threadId: overrides.threadId ?? 'thread-1' } },
      terminationReason: overrides.terminationReason ?? null,
      deletedAt: overrides.deletedAt ?? null,
    };
    this.containers.set(containerId, row);
  }

  getContainer(containerId: string): ContainerRow | undefined {
    const row = this.containers.get(containerId);
    return row ? { ...row } : undefined;
  }

  reset(): void {
    this.containers.clear();
  }
}

const createLifecycleStub = () => ({
  start: vi.fn(),
  stop: vi.fn(),
  sweep: vi.fn().mockResolvedValue(undefined),
});

const createDockerClientStub = (): DockerClient => ({
  touchLastUsed: vi.fn().mockResolvedValue(undefined),
  ensureImage: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue({ id: 'dummy', stop: vi.fn(), remove: vi.fn() }),
  execContainer: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  openInteractiveExec: vi.fn().mockResolvedValue({ stdin: null, stdout: null, stderr: null, close: vi.fn() } as any),
  streamContainerLogs: vi.fn().mockResolvedValue({ close: vi.fn() } as any),
  resizeExec: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  getContainerLabels: vi.fn().mockResolvedValue(undefined),
  getContainerNetworks: vi.fn().mockResolvedValue([]),
  findContainersByLabels: vi.fn().mockResolvedValue([]),
  listContainersByVolume: vi.fn().mockResolvedValue([]),
  removeVolume: vi.fn().mockResolvedValue(undefined),
  findContainerByLabels: vi.fn().mockResolvedValue(undefined),
  putArchive: vi.fn().mockResolvedValue(undefined),
  inspectContainer: vi.fn().mockResolvedValue({} as any),
  getEventsStream: vi.fn().mockResolvedValue({ on: vi.fn(), off: vi.fn() } as any),
} as unknown as DockerClient);

const createContainerRegistryStub = () => ({
  ensureIndexes: vi.fn().mockResolvedValue(undefined),
  registerStart: vi.fn(),
  markDeleted: vi.fn(),
});

const createWorkspaceProviderStub = () => ({
  ensureWorkspace: vi.fn(),
  destroyWorkspace: vi.fn(),
}) as unknown as WorkspaceProvider;

const createNcpsStub = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  getKey: vi.fn(),
  getKeysForInjection: vi.fn().mockReturnValue([]),
});

const createGithubStub = () => ({ isEnabled: vi.fn().mockReturnValue(false) });

const createPrServiceStub = () => ({ getPRInfo: vi.fn() });

const createEventProcessorStub = () => ({
  start: vi.fn(),
  stop: vi.fn(),
});

describe('DELETE /api/containers/:id integration', () => {
  let app: NestFastifyApplication;
  let prismaSvc: PrismaServiceStub;
  let runner: MockDockerRunnerServer;

  beforeAll(async () => {
    runner = new MockDockerRunnerServer(RUNNER_SECRET);
    await runner.start();
    prismaSvc = new PrismaServiceStub();
    const prismaClient = prismaSvc.getClient();

    const moduleRef = await Test.createTestingModule({
      controllers: [ContainersController],
      providers: [
        { provide: PrismaService, useValue: prismaSvc },
        { provide: ContainerRegistry, useValue: new ContainerRegistry(prismaClient) },
        {
          provide: DOCKER_CLIENT,
          useValue: new HttpDockerRunnerClient({ baseUrl: runner.baseUrl, sharedSecret: RUNNER_SECRET }),
        },
        {
          provide: ConfigService,
          useValue: {
            dockerRunnerBaseUrl: runner.baseUrl,
            getDockerRunnerBaseUrl: () => runner.baseUrl,
            isDockerRunnerOptional: () => true,
          } as ConfigService,
        },
        {
          provide: ContainerAdminService,
          useFactory: (dockerClient: HttpDockerRunnerClient, registry: ContainerRegistry) =>
            new ContainerAdminService(dockerClient, registry),
          inject: [DOCKER_CLIENT, ContainerRegistry],
        },
        DockerRunnerStatusService,
        RequireDockerRunnerGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    app.get(DockerRunnerStatusService).markSuccess();
  });

  afterAll(async () => {
    await app.close();
    await runner.close();
  });

  beforeEach(() => {
    prismaSvc.reset();
    runner.reset();
  });

  afterEach(() => {
    runner.reset();
  });

  it('returns 204 and marks container deleted when runner succeeds', async () => {
    prismaSvc.seedContainer('runner-success');

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: '/api/containers/runner-success',
    });

    expect(response.statusCode).toBe(204);
    const row = prismaSvc.getContainer('runner-success');
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.status).toBe('stopped');
    expect(row?.terminationReason).toBe('manual_delete');
  });

  it('returns 204 when runner responds container_not_found via 500 status', async () => {
    prismaSvc.seedContainer('gone-container');
    runner.setRemoveResponse({ status: 500, body: { error: { code: 'container_not_found', message: 'missing' } } });

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: '/api/containers/gone-container',
    });

    expect(response.statusCode).toBe(204);
    const row = prismaSvc.getContainer('gone-container');
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it('returns 204 when runner fallback errors mention missing containers', async () => {
    prismaSvc.seedContainer('fallback-missing');
    runner.setRemoveResponse({
      status: 500,
      body: { error: { code: 'remove_failed', message: 'No such container: fallback-missing' } },
    });

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: '/api/containers/fallback-missing',
    });

    expect(response.statusCode).toBe(204);
    const row = prismaSvc.getContainer('fallback-missing');
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('ContainersController wiring via InfraModule', () => {
  let app: NestFastifyApplication;
  const containerId = 'wired-123';
  const prismaClientStub = {
    container: {
      findUnique: vi.fn().mockResolvedValue({
        containerId,
        status: 'running',
        threadId: 'thread-1',
        nodeId: 'node-1',
      }),
    },
  } as Partial<PrismaClient>;
  const prismaServiceStub = { getClient: () => prismaClientStub } as PrismaService;
  const adminMock = { deleteContainer: vi.fn().mockResolvedValue(undefined) } as unknown as ContainerAdminService;

  beforeAll(async () => {
    registerTestConfig({
      dockerRunnerBaseUrl: 'http://runner.test',
      dockerRunnerSharedSecret: 'runner-secret',
      agentsDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/agents_test',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [InfraModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .overrideProvider(ContainerRegistry)
      .useValue(createContainerRegistryStub())
      .overrideProvider(ContainerCleanupService)
      .useValue(createLifecycleStub())
      .overrideProvider(VolumeGcService)
      .useValue(createLifecycleStub())
      .overrideProvider(DockerWorkspaceEventsWatcher)
      .useValue(createLifecycleStub())
      .overrideProvider(NcpsKeyService)
      .useValue(createNcpsStub())
      .overrideProvider(GithubService)
      .useValue(createGithubStub())
      .overrideProvider(PRService)
      .useValue(createPrServiceStub())
      .overrideProvider(WorkspaceProvider)
      .useValue(createWorkspaceProviderStub())
      .overrideProvider(ContainerThreadTerminationService)
      .useValue(createLifecycleStub())
      .overrideProvider(TerminalSessionsService)
      .useValue({} as TerminalSessionsService)
      .overrideProvider(ContainerEventProcessor)
      .useValue(createEventProcessorStub())
      .overrideProvider(ArchiveService)
      .useValue({} as ArchiveService)
      .overrideProvider(DOCKER_CLIENT)
      .useValue(createDockerClientStub())
      .overrideProvider(DockerRunnerConnectivityMonitor)
      .useValue({ onModuleInit: vi.fn(), onModuleDestroy: vi.fn() } as unknown as DockerRunnerConnectivityMonitor)
      .overrideProvider(ContainerAdminService)
      .useValue(adminMock)
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    app.get(DockerRunnerStatusService).markSuccess();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('delegates DELETE requests to ContainerAdminService without throwing', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: `/api/containers/${containerId}`,
    });

    expect(response.statusCode).toBe(204);
    expect(adminMock.deleteContainer).toHaveBeenCalledWith(containerId);
  });
});
