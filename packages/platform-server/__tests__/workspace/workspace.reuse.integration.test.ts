import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DockerWorkspaceRuntimeProvider } from '../../src/workspace/providers/docker.workspace.provider';
import { WorkspaceNode, ContainerProviderStaticConfigSchema } from '../../src/nodes/workspace/workspace.node';
import { EnvService } from '../../src/env/env.service';
import { NcpsKeyService } from '../../src/infra/ncps/ncpsKey.service';
import { RunnerGrpcClient } from '../../src/infra/container/runnerGrpc.client';
import { ContainerRegistry } from '../../src/infra/container/container.registry';
import { PrismaService } from '../../src/core/services/prisma.service';
import { registerTestConfig, clearTestConfig } from '../helpers/config';
import {
  RUNNER_SECRET,
  DEFAULT_SOCKET,
  hasTcpDocker,
  socketMissing,
  startDockerRunnerProcess,
  startPostgres,
  runPrismaMigrations,
  type RunnerHandle,
  type PostgresHandle,
} from '../helpers/docker.e2e';

const shouldSkip = process.env.SKIP_WORKSPACE_REUSE_E2E === '1';
const describeOrSkip = shouldSkip || (socketMissing && !hasTcpDocker) ? describe.skip : describe.sequential;

describeOrSkip('Docker workspace reuse lifecycle', () => {
  let runner: RunnerHandle;
  let dockerClient: RunnerGrpcClient;
  let dbHandle: PostgresHandle;
  let prismaService: PrismaService;
  let prismaClient: ReturnType<PrismaService['getClient']>;
  let containerRegistry: ContainerRegistry;
  let workspaceProvider: DockerWorkspaceRuntimeProvider;
  let workspaceNode: WorkspaceNode;
  const createdContainers = new Set<string>();
  const createdThreads = new Set<string>();

  beforeAll(async () => {
    dbHandle = await startPostgres();
    await runPrismaMigrations(dbHandle.connectionString);

    const socketPath = socketMissing && hasTcpDocker ? '' : DEFAULT_SOCKET;
    runner = await startDockerRunnerProcess(socketPath);
    dockerClient = new RunnerGrpcClient({ address: runner.grpcAddress, sharedSecret: RUNNER_SECRET });

    clearTestConfig();
    const [grpcHost, grpcPort] = runner.grpcAddress.split(':');
    const configService = registerTestConfig({
      dockerRunnerSharedSecret: RUNNER_SECRET,
      dockerRunnerGrpcHost: grpcHost ?? '127.0.0.1',
      dockerRunnerGrpcPort: grpcPort ? Number(grpcPort) : undefined,
      agentsDatabaseUrl: dbHandle.connectionString,
    });

    prismaService = new PrismaService(configService);
    prismaClient = prismaService.getClient();
    containerRegistry = new ContainerRegistry(prismaClient);
    await containerRegistry.ensureIndexes();

    const envService = new EnvService();
    const ncpsKeyService = new NcpsKeyService(configService);
    workspaceProvider = new DockerWorkspaceRuntimeProvider(dockerClient, containerRegistry);
    workspaceNode = new WorkspaceNode(workspaceProvider, configService, ncpsKeyService, envService);
    workspaceNode.init({ nodeId: 'workspace-reuse-node' });
    await workspaceNode.setConfig(
      ContainerProviderStaticConfigSchema.parse({
        ttlSeconds: 600,
        platform: 'linux/amd64',
        image: 'redis:7-alpine',
        initialScript: 'mkdir -p /workspace',
      }),
    );
  }, 240_000);

  afterEach(async () => {
    for (const containerId of createdContainers) {
      try {
        await workspaceProvider.destroyWorkspace(containerId, { force: true });
      } catch {
        try {
          await dockerClient.removeContainer(containerId, { force: true, removeVolumes: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }
    createdContainers.clear();

    if (prismaClient) {
      await prismaClient.containerEvent.deleteMany();
      await prismaClient.container.deleteMany();
    }

    if (prismaClient && createdThreads.size > 0) {
      const threadIds = Array.from(createdThreads);
      await prismaClient.thread.deleteMany({ where: { id: { in: threadIds } } });
    }
    createdThreads.clear();
  });

  afterAll(async () => {
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
    if (runner) {
      await runner.close();
    }
    if (dbHandle) {
      await dbHandle.stop();
    }
    clearTestConfig();
  }, 120_000);

  it('reuses the container across shell and MCP-style execs', async () => {
    const threadId = randomUUID();
    createdThreads.add(threadId);
    await prismaClient.thread.create({ data: { id: threadId, alias: `reuse-${threadId.slice(0, 8)}` } });

    const firstHandle = await workspaceNode.provide(threadId);
    createdContainers.add(firstHandle.id);
    const writeResult = await firstHandle.exec(['sh', '-lc', 'echo shell-data > /workspace/reuse.txt']);
    expect(writeResult.exitCode).toBe(0);

    const mcpHandle = await workspaceNode.provide(threadId);
    expect(mcpHandle.id).toBe(firstHandle.id);
    const mcpRead = await mcpHandle.exec(['sh', '-lc', 'cat /workspace/reuse.txt']);
    expect(mcpRead.exitCode).toBe(0);
    expect(mcpRead.stdout.trim()).toBe('shell-data');

    const finalHandle = await workspaceNode.provide(threadId);
    expect(finalHandle.id).toBe(firstHandle.id);
    const finalRead = await finalHandle.exec(['sh', '-lc', 'cat /workspace/reuse.txt']);
    expect(finalRead.exitCode).toBe(0);
    expect(finalRead.stdout.trim()).toBe('shell-data');
  }, 180_000);

  it('reuses the container across sequential shell execs', async () => {
    const threadId = randomUUID();
    createdThreads.add(threadId);
    await prismaClient.thread.create({ data: { id: threadId, alias: `shell-${threadId.slice(0, 8)}` } });

    const firstHandle = await workspaceNode.provide(threadId);
    createdContainers.add(firstHandle.id);
    const writeResult = await firstHandle.exec(['sh', '-lc', 'echo shell-only > /workspace/shell.txt']);
    expect(writeResult.exitCode).toBe(0);

    const secondHandle = await workspaceNode.provide(threadId);
    expect(secondHandle.id).toBe(firstHandle.id);
    const readResult = await secondHandle.exec(['sh', '-lc', 'cat /workspace/shell.txt']);
    expect(readResult.exitCode).toBe(0);
    expect(readResult.stdout.trim()).toBe('shell-only');
  }, 120_000);
});
