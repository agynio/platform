import 'reflect-metadata';
import fs from 'node:fs';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';

import { ContainersController } from '../src/infra/container/containers.controller';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { HttpDockerRunnerClient, DockerRunnerRequestError } from '../src/infra/container/httpDockerRunner.client';
import { DOCKER_CLIENT } from '../src/infra/container/dockerClient.token';
import type { PrismaClient } from '@prisma/client';
import { PrismaClient as Prisma } from '@prisma/client';

import { createRunnerApp } from '../../docker-runner/src/service/app';

// Vitest compiles controllers without emitDecoratorMetadata, so manually register constructor param metadata.
Reflect.defineMetadata('design:paramtypes', [PrismaService, ContainerAdminService], ContainersController);
Reflect.defineMetadata('design:paramtypes', [Object, ContainerRegistry], ContainerAdminService);

const RUNNER_SECRET = 'docker-e2e-secret';
const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const shouldSkip = process.env.SKIP_DOCKER_DELETE_E2E === '1';
const hasTcpDocker = !!process.env.DOCKER_HOST;
const socketMissing = !fs.existsSync(DEFAULT_SOCKET);

type RunnerHandle = {
  app: FastifyInstance;
  baseUrl: string;
  close: () => Promise<void>;
};

type PostgresHandle = {
  connectionString: string;
  stop: () => Promise<void>;
};

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
        ContainerAdminService,
      ],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
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

});

async function startDockerRunner(socketPath: string): Promise<RunnerHandle> {
  const port = await getAvailablePort();
  const app = createRunnerApp({
    port,
    host: '127.0.0.1',
    sharedSecret: RUNNER_SECRET,
    dockerSocket: socketPath,
    signatureTtlMs: 60_000,
    logLevel: 'error',
  });
  await app.listen({ port, host: '127.0.0.1' });
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  };
}

async function startPostgres(): Promise<PostgresHandle> {
  const containerName = `containers-pg-${randomUUID()}`;
  const port = await getAvailablePort();
  await runCommand('docker', [
    'run',
    '-d',
    '--name',
    containerName,
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_DB=agents_test',
    '-p',
    `${port}:5432`,
    'postgres:15-alpine',
  ]);

  await waitFor(async () => {
    try {
      await runCommand('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres']);
      return true;
    } catch {
      return false;
    }
  }, { timeoutMs: 30_000, intervalMs: 1_000 });

  const connectionString = `postgresql://postgres:postgres@127.0.0.1:${port}/agents_test`;
  return {
    connectionString,
    stop: async () => {
      try {
        await runCommand('docker', ['rm', '-f', containerName]);
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

async function runPrismaMigrations(databaseUrl: string): Promise<void> {
  const serverRoot = path.resolve(__dirname, '..');
  await runCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: { ...process.env, AGENTS_DATABASE_URL: databaseUrl },
  });
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function runCommand(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function waitFor(predicate: () => Promise<boolean>, options: { timeoutMs: number; intervalMs: number }): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(options.intervalMs);
  }
  throw new Error('Timed out waiting for condition');
}

if (shouldSkip) {
  console.warn('Skipping docker deletion integration tests due to SKIP_DOCKER_DELETE_E2E=1');
} else if (socketMissing && !hasTcpDocker) {
  console.warn(`Skipping docker deletion integration tests because Docker socket is missing at ${DEFAULT_SOCKET}`);
}
