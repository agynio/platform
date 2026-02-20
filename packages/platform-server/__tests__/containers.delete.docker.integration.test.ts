import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { ContainersController } from '../src/infra/container/containers.controller';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ConfigService } from '../src/core/services/config.service';
import { HttpDockerRunnerClient, DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';
import { DOCKER_CLIENT } from '../src/infra/container/dockerClient.token';
import { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import { RequireDockerRunnerGuard } from '../src/infra/container/requireDockerRunner.guard';
import type { PrismaClient } from '@prisma/client';
import { PrismaClient as Prisma } from '@prisma/client';

import {
  DEFAULT_SOCKET,
  RUNNER_SECRET,
  hasTcpDocker,
  socketMissing,
  startDockerRunner,
  startDockerRunnerProcess,
  startPostgres,
  runPrismaMigrations,
  type RunnerHandle,
  type PostgresHandle,
} from './helpers/docker.e2e';

// Vitest compiles controllers without emitDecoratorMetadata, so manually register constructor param metadata.
Reflect.defineMetadata('design:paramtypes', [PrismaService, ContainerAdminService, ConfigService], ContainersController);
Reflect.defineMetadata('design:paramtypes', [Object, ContainerRegistry], ContainerAdminService);

const shouldSkip = process.env.SKIP_DOCKER_DELETE_E2E === '1';

const describeOrSkip = shouldSkip || (socketMissing && !hasTcpDocker) ? describe.skip : describe;

describeOrSkip('DELETE /api/containers/:id docker runner integration', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let registry: ContainerRegistry;
  let runner: RunnerHandle;
  let dockerClient: HttpDockerRunnerClient;
  let dbHandle: PostgresHandle;
  const orphanContainers = new Set<string>();
  const startRegisteredContainer = async (prefix: string): Promise<{ containerId: string }> => {
    const containerName = `${prefix}-${randomUUID().slice(0, 8)}`;
    const startHandle = await dockerClient.start({ image: 'alpine:3.19', cmd: ['sleep', '120'], name: containerName });
    const containerId = startHandle.id;
    orphanContainers.add(containerId);

    const threadId = randomUUID();
    await prisma.thread.create({
      data: {
        id: threadId,
        alias: `docker-e2e-${threadId.slice(0, 8)}`,
      },
    });

    await registry.registerStart({
      containerId,
      nodeId: 'node-real-delete',
      threadId,
      image: 'alpine:3.19',
      name: containerName,
      labels: { 'test-suite': 'containers-delete-docker' },
    });

    return { containerId };
  };

  beforeAll(async () => {
    dbHandle = await startPostgres();
    await runPrismaMigrations(dbHandle.connectionString);
    prisma = new Prisma({ datasources: { db: { url: dbHandle.connectionString } } });
    await prisma.$connect();
    registry = new ContainerRegistry(prisma);
    await registry.ensureIndexes();

    const socketPath = socketMissing && hasTcpDocker ? '' : DEFAULT_SOCKET;
    runner = await startDockerRunner(socketPath);
    dockerClient = new HttpDockerRunnerClient({ baseUrl: runner.baseUrl, sharedSecret: RUNNER_SECRET });

    const moduleRef = await Test.createTestingModule({
      controllers: [ContainersController],
      providers: [
        { provide: PrismaService, useValue: { getClient: () => prisma } },
        { provide: ContainerRegistry, useValue: registry },
        { provide: DOCKER_CLIENT, useValue: dockerClient },
        {
          provide: ConfigService,
          useValue: {
            dockerRunnerBaseUrl: runner.baseUrl,
            getDockerRunnerBaseUrl: () => runner.baseUrl,
            isDockerRunnerOptional: () => true,
          } as ConfigService,
        },
        ContainerAdminService,
        DockerRunnerStatusService,
        RequireDockerRunnerGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    app.get(DockerRunnerStatusService).markSuccess();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    const adapter = app?.getHttpAdapter?.().getInstance?.();
    if (app) {
      await app.close();
    }
    if (adapter) {
      await adapter.close?.();
    }
    if (runner) {
      await runner.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    if (dbHandle) {
      await dbHandle.stop();
    }
  });

  beforeEach(async () => {
    await prisma.containerEvent.deleteMany();
    await prisma.container.deleteMany();
    await prisma.thread.deleteMany();
  });

  afterEach(async () => {
    for (const containerId of orphanContainers) {
      try {
        await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      } catch {
        // ignore cleanup failures
      }
      orphanContainers.delete(containerId);
    }
  });

  it('stops and removes a real container via docker-runner and updates registry', async () => {
    const { containerId } = await startRegisteredContainer('delete-real');

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: `/api/containers/${containerId}`,
    });

    expect(response.statusCode).toBe(204);

    await expect(dockerClient.inspectContainer(containerId)).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<DockerRunnerRequestError>);

    const row = await prisma.container.findUnique({ where: { containerId } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.status).toBe('stopped');

    orphanContainers.delete(containerId);
  }, 120_000);

  it('still removes containers when stop returns a runner error', async () => {
    const { containerId } = await startRegisteredContainer('delete-stop-failure');
    const stopSpy = vi
      .spyOn(dockerClient, 'stopContainer')
      .mockImplementation(async () => {
        throw new DockerRunnerRequestError(500, 'stop_failed', false, 'simulated stop failure');
      });

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'DELETE',
        url: `/api/containers/${containerId}`,
      });

      expect(response.statusCode).toBe(204);

      await expect(dockerClient.inspectContainer(containerId)).rejects.toMatchObject({ statusCode: 404 });
      const row = await prisma.container.findUnique({ where: { containerId } });
      expect(row?.deletedAt).toBeInstanceOf(Date);

      orphanContainers.delete(containerId);
    } finally {
      stopSpy.mockRestore();
    }
  }, 120_000);

  it('still removes containers when stop throws a generic error', async () => {
    const { containerId } = await startRegisteredContainer('delete-stop-generic');
    const stopSpy = vi
      .spyOn(dockerClient, 'stopContainer')
      .mockImplementation(async () => {
        throw new Error('network down');
      });

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'DELETE',
        url: `/api/containers/${containerId}`,
      });

      expect(response.statusCode).toBe(204);

      await expect(dockerClient.inspectContainer(containerId)).rejects.toMatchObject({ statusCode: 404 });
      const row = await prisma.container.findUnique({ where: { containerId } });
      expect(row?.deletedAt).toBeInstanceOf(Date);

      orphanContainers.delete(containerId);
    } finally {
      stopSpy.mockRestore();
    }
  }, 120_000);

  it('returns structured runner error when force removal fails', async () => {
    const { containerId } = await startRegisteredContainer('delete-remove-runner-error');
    const removeSpy = vi
      .spyOn(dockerClient, 'removeContainer')
      .mockRejectedValueOnce(new DockerRunnerRequestError(503, 'runner_unreachable', true, 'runner offline'));

    try {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'DELETE',
        url: `/api/containers/${containerId}`,
      });

      expect(response.statusCode).toBe(503);
      const errorBody = response.json() as { code?: string; message?: string };
      expect(errorBody.code).toBe('runner_unreachable');
      expect(errorBody.message).toBe('runner offline');

      // Registry should remain untouched when removal fails
      const row = await prisma.container.findUnique({ where: { containerId } });
      expect(row?.deletedAt).toBeNull();
    } finally {
      removeSpy.mockRestore();
      orphanContainers.delete(containerId);
      try {
        await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      } catch {
        // ignore cleanup failures
      }
    }
  }, 120_000);

});

describeOrSkip('DELETE /api/containers/:id docker runner external process integration', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let registry: ContainerRegistry;
  let runner: RunnerHandle;
  let dockerClient: HttpDockerRunnerClient;
  let dbHandle: PostgresHandle;
  const orphanContainers = new Set<string>();

  const startRegisteredContainer = async (prefix: string): Promise<{ containerId: string }> => {
    const containerName = `${prefix}-${randomUUID().slice(0, 8)}`;
    const startHandle = await dockerClient.start({ image: 'alpine:3.19', cmd: ['sleep', '120'], name: containerName });
    const containerId = startHandle.id;
    orphanContainers.add(containerId);

    const threadId = randomUUID();
    await prisma.thread.create({
      data: {
        id: threadId,
        alias: `docker-e2e-${threadId.slice(0, 8)}`,
      },
    });

    await registry.registerStart({
      containerId,
      nodeId: 'node-real-delete-process',
      threadId,
      image: 'alpine:3.19',
      name: containerName,
      labels: { 'test-suite': 'containers-delete-docker-process' },
    });

    return { containerId };
  };

  beforeAll(async () => {
    dbHandle = await startPostgres();
    await runPrismaMigrations(dbHandle.connectionString);
    prisma = new Prisma({ datasources: { db: { url: dbHandle.connectionString } } });
    await prisma.$connect();
    registry = new ContainerRegistry(prisma);
    await registry.ensureIndexes();

    const socketPath = socketMissing && hasTcpDocker ? '' : DEFAULT_SOCKET;
    runner = await startDockerRunnerProcess(socketPath);
    dockerClient = new HttpDockerRunnerClient({ baseUrl: runner.baseUrl, sharedSecret: RUNNER_SECRET });

    const moduleRef = await Test.createTestingModule({
      controllers: [ContainersController],
      providers: [
        { provide: PrismaService, useValue: { getClient: () => prisma } },
        { provide: ContainerRegistry, useValue: registry },
        { provide: DOCKER_CLIENT, useValue: dockerClient },
        {
          provide: ConfigService,
          useValue: {
            dockerRunnerBaseUrl: runner.baseUrl,
            getDockerRunnerBaseUrl: () => runner.baseUrl,
            isDockerRunnerOptional: () => true,
          } as ConfigService,
        },
        ContainerAdminService,
        DockerRunnerStatusService,
        RequireDockerRunnerGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    app.get(DockerRunnerStatusService).markSuccess();
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (runner) {
      await runner.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    if (dbHandle) {
      await dbHandle.stop();
    }
  });

  beforeEach(async () => {
    await prisma.containerEvent.deleteMany();
    await prisma.container.deleteMany();
    await prisma.thread.deleteMany();
  });

  afterEach(async () => {
    for (const containerId of orphanContainers) {
      try {
        await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
      } catch {
        // ignore cleanup failures
      }
      orphanContainers.delete(containerId);
    }
  });

  it('removes a container via an out-of-process docker-runner', async () => {
    const { containerId } = await startRegisteredContainer('delete-process');

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'DELETE',
      url: `/api/containers/${containerId}`,
    });

    expect(response.statusCode).toBe(204);
    await expect(dockerClient.inspectContainer(containerId)).rejects.toMatchObject({ statusCode: 404 });

    const row = await prisma.container.findUnique({ where: { containerId } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.status).toBe('stopped');

    orphanContainers.delete(containerId);
  }, 120_000);
});

if (shouldSkip) {
  console.warn('Skipping docker deletion integration tests due to SKIP_DOCKER_DELETE_E2E=1');
} else if (socketMissing && !hasTcpDocker) {
  console.warn(`Skipping docker deletion integration tests because Docker socket is missing at ${DEFAULT_SOCKET}`);
}
