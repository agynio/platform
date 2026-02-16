import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Body, Controller, Post } from '@nestjs/common';

import { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';
import { DockerWorkspaceRuntimeProvider } from '../src/workspace/providers/docker.workspace.provider';
import { ContainersController } from '../src/infra/container/containers.controller';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
import { registerTestConfig, clearTestConfig } from './helpers/config';
import { DOCKER_CLIENT, type DockerClient } from '../src/infra/container/dockerClient.token';
import { HttpDockerRunnerClient, DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';

import {
  DEFAULT_SOCKET,
  RUNNER_SECRET,
  hasTcpDocker,
  socketMissing,
  startDockerRunnerProcess,
  startPostgres,
  runPrismaMigrations,
  waitFor,
  type RunnerHandle,
  type PostgresHandle,
} from './helpers/docker.e2e';

const shouldSkip = process.env.SKIP_PLATFORM_FULLSTACK_E2E === '1';
const describeOrSkip = shouldSkip || (socketMissing && !hasTcpDocker) ? describe.skip : describe;
const NETWORK_NAME = 'bridge';
const TEST_IMAGE = 'nginx:1.25-alpine';

@Controller('test/workspaces')
class TestWorkspaceController {
  constructor(
    private readonly workspaceProvider: WorkspaceProvider,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async create(@Body() body: { alias?: string } = {}): Promise<{ containerId: string; threadId: string }> {
    const alias = body.alias ?? `fullstack-${randomUUID().slice(0, 5)}`;
    const threadId = randomUUID();
    const prisma = this.prismaService.getClient();
    await prisma.thread.create({ data: { id: threadId, alias } });

    const { workspaceId } = await this.workspaceProvider.ensureWorkspace(
      { threadId, nodeId: 'workspace-fullstack-node', role: 'workspace' },
      {
        image: TEST_IMAGE,
        persistentVolume: { mountPath: '/workspace' },
        network: { name: this.configService.workspaceNetworkName },
        env: { TEST_SUITE: 'containers-fullstack' },
        ttlSeconds: 600,
      },
    );

    return { containerId: workspaceId, threadId };
  }
}

Reflect.defineMetadata('design:paramtypes', [WorkspaceProvider, PrismaService, ConfigService], TestWorkspaceController);
Reflect.defineMetadata('design:paramtypes', [PrismaService, ContainerAdminService], ContainersController);
Reflect.defineMetadata('design:paramtypes', [Object, ContainerRegistry], ContainerAdminService);

describeOrSkip('workspace create → delete full-stack flow', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let prismaClient: ReturnType<PrismaService['getClient']>;
  let runner: RunnerHandle;
  let dbHandle: PostgresHandle;
  let dockerClient: HttpDockerRunnerClient;
  let configService: ConfigService;
  const createdThreads = new Set<string>();
  const createdContainers = new Set<string>();

  beforeAll(async () => {
    dbHandle = await startPostgres();
    await runPrismaMigrations(dbHandle.connectionString);

    const socketPath = socketMissing && hasTcpDocker ? '' : DEFAULT_SOCKET;
    runner = await startDockerRunnerProcess(socketPath);
    dockerClient = new HttpDockerRunnerClient({ baseUrl: runner.baseUrl, sharedSecret: RUNNER_SECRET });

    clearTestConfig();
    configService = registerTestConfig({
      dockerRunnerBaseUrl: runner.baseUrl,
      dockerRunnerSharedSecret: RUNNER_SECRET,
      agentsDatabaseUrl: dbHandle.connectionString,
      workspaceNetworkName: NETWORK_NAME,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ContainersController, TestWorkspaceController],
      providers: [
        { provide: ConfigService, useValue: configService },
        PrismaService,
        {
          provide: ContainerRegistry,
          inject: [PrismaService],
          useFactory: async (prismaSvc: PrismaService) => {
            const registry = new ContainerRegistry(prismaSvc.getClient());
            await registry.ensureIndexes();
            return registry;
          },
        },
        { provide: DOCKER_CLIENT, useValue: dockerClient },
        {
          provide: WorkspaceProvider,
          inject: [DOCKER_CLIENT, ContainerRegistry],
          useFactory: (client: DockerClient, registry: ContainerRegistry) =>
            new DockerWorkspaceRuntimeProvider(client, registry),
        },
        ContainerAdminService,
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prismaService = app.get(PrismaService);
    prismaClient = prismaService.getClient();
  }, 180_000);

  afterEach(async () => {
    for (const containerId of createdContainers) {
      try {
        await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      } catch {
        // ignore cleanup errors
      }
    }
    createdContainers.clear();
    createdThreads.clear();
    if (prismaClient) {
      await prismaClient.containerEvent.deleteMany();
      await prismaClient.container.deleteMany();
      await prismaClient.thread.deleteMany();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (runner) {
      await runner.close();
    }
    if (dbHandle) {
      await dbHandle.stop();
    }
    clearTestConfig();
  });

  it('provisions and deletes a workspace via HTTP endpoints', async () => {
    const createResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/test/workspaces',
      payload: { alias: 'fullstack-e2e' },
    });

    expect(createResponse.statusCode).toBe(201);
    const payload = JSON.parse(createResponse.payload) as { containerId: string; threadId: string };
    const { containerId, threadId } = payload;
    createdContainers.add(containerId);
    createdThreads.add(threadId);

    const inspect = await dockerClient.inspectContainer(containerId);
    expect(inspect.Id).toBeDefined();
    expect(inspect.State?.Running).toBe(true);

    const dbRow = await prismaClient.container.findUnique({ where: { containerId } });
    expect(dbRow).not.toBeNull();
    expect(dbRow?.status).toBe('running');

    const deleteResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: `/api/containers/${containerId}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    await waitFor(async () => {
      try {
        await dockerClient.inspectContainer(containerId);
        return false;
      } catch (error) {
        if (error instanceof DockerRunnerRequestError && error.statusCode === 404) {
          return true;
        }
        throw error;
      }
    }, { timeoutMs: 30_000, intervalMs: 500 });

    const deletedRow = await prismaClient.container.findUnique({ where: { containerId } });
    expect(deletedRow?.deletedAt).toBeInstanceOf(Date);
    expect(deletedRow?.status).toBe('stopped');
  }, 240_000);
});

if (shouldSkip) {
  console.warn('Skipping docker full-stack tests due to SKIP_PLATFORM_FULLSTACK_E2E=1');
} else if (socketMissing && !hasTcpDocker) {
  console.warn(`Skipping docker full-stack tests because Docker socket is missing at ${DEFAULT_SOCKET}`);
}
