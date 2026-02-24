import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Server, ServerCredentials, credentials, Metadata } from '@grpc/grpc-js';
import { create } from '@bufbuild/protobuf';

import { createRunnerGrpcServer } from '../../../docker-runner/src/service/grpc/server';
import { ContainerService, NonceCache, buildAuthHeaders } from '../../../docker-runner/src';
import { RunnerServiceGrpcClient, RUNNER_SERVICE_READY_PATH } from '@agyn/runner-proto/grpc.js';
import { ReadyRequestSchema } from '@agyn/runner-proto';

export const RUNNER_SECRET = 'docker-e2e-secret';
export const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
export const hasTcpDocker = Boolean(process.env.DOCKER_HOST);
export const socketMissing = !fs.existsSync(DEFAULT_SOCKET);

export type RunnerHandle = {
  grpcAddress: string;
  close: () => Promise<void>;
};

export type PostgresHandle = {
  connectionString: string;
  stop: () => Promise<void>;
};

export async function startDockerRunner(socketPath: string): Promise<RunnerHandle> {
  const grpcPort = await getAvailablePort();
  const config = {
    grpcHost: '127.0.0.1',
    grpcPort,
    sharedSecret: RUNNER_SECRET,
    signatureTtlMs: 60_000,
    dockerSocket: socketPath,
    logLevel: 'error',
  } as const;

  const previousSocket = process.env.DOCKER_SOCKET;
  if (socketPath) {
    process.env.DOCKER_SOCKET = socketPath;
  } else {
    delete process.env.DOCKER_SOCKET;
  }

  const containers = new ContainerService();
  const nonceCache = new NonceCache({ ttlMs: config.signatureTtlMs });
  const server = createRunnerGrpcServer({ config, containers, nonceCache });
  const grpcAddress = await bindRunnerServer(server, config.grpcHost, config.grpcPort);
  const client = new RunnerServiceGrpcClient(grpcAddress, credentials.createInsecure());

  try {
    await waitForRunnerReady(client, RUNNER_SECRET);
  } catch (error) {
    client.close();
    await shutdownRunnerServer(server);
    if (previousSocket !== undefined) process.env.DOCKER_SOCKET = previousSocket;
    else delete process.env.DOCKER_SOCKET;
    throw error;
  }

  return {
    grpcAddress,
    close: async () => {
      client.close();
      await shutdownRunnerServer(server);
      if (previousSocket !== undefined) process.env.DOCKER_SOCKET = previousSocket;
      else delete process.env.DOCKER_SOCKET;
    },
  };
}

export async function startDockerRunnerProcess(socketPath: string): Promise<RunnerHandle> {
  const grpcPort = await getAvailablePort();
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const runnerEntry = path.resolve(repoRoot, 'packages', 'docker-runner', 'src', 'service', 'main.ts');
  const tsxBin = path.resolve(repoRoot, 'node_modules', '.bin', 'tsx');
  if (!fs.existsSync(tsxBin)) {
    throw new Error(`tsx binary not found at ${tsxBin}`);
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DOCKER_RUNNER_GRPC_HOST: '127.0.0.1',
    DOCKER_RUNNER_GRPC_PORT: String(grpcPort),
    DOCKER_RUNNER_SHARED_SECRET: RUNNER_SECRET,
    DOCKER_RUNNER_LOG_LEVEL: 'error',
  };
  if (socketPath) {
    env.DOCKER_SOCKET = socketPath;
  } else {
    delete env.DOCKER_SOCKET;
  }

  const child = spawn(tsxBin, [runnerEntry], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[docker-runner] ${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[docker-runner] ${chunk}`);
  });

  let exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
  let errorHandler: ((err: Error) => void) | null = null;
  const exitPromise = new Promise<never>((_, reject) => {
    exitHandler = (code, signal) => {
      reject(new Error(`docker-runner exited before readiness (code=${code ?? 0}, signal=${signal ?? 'none'})`));
    };
    errorHandler = (err) => reject(err);
    child.once('exit', exitHandler);
    child.once('error', errorHandler);
  });

  try {
    await Promise.race([
      waitForRunnerReadyOnAddress(`127.0.0.1:${grpcPort}`, RUNNER_SECRET),
      exitPromise,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  } finally {
    if (exitHandler) child.off('exit', exitHandler);
    if (errorHandler) child.off('error', errorHandler);
  }

  return {
    grpcAddress: `127.0.0.1:${grpcPort}`,
    close: async () => {
      if (child.exitCode !== null || child.signalCode) return;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      });
    },
  };
}

async function bindRunnerServer(server: Server, host: string, port: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err);
      resolve(`${host}:${port}`);
    });
  });
}

async function shutdownRunnerServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.tryShutdown((err) => {
      if (err) {
        server.forceShutdown();
      }
      resolve();
    });
  });
}

async function waitForRunnerReady(client: RunnerServiceGrpcClient, secret: string): Promise<void> {
  await waitFor(async () => {
    try {
      await callRunnerReady(client, secret);
      return true;
    } catch {
      return false;
    }
  }, { timeoutMs: 30_000, intervalMs: 250 });
}

async function waitForRunnerReadyOnAddress(address: string, secret: string): Promise<void> {
  const client = new RunnerServiceGrpcClient(address, credentials.createInsecure());
  try {
    await waitForRunnerReady(client, secret);
  } finally {
    client.close();
  }
}

function callRunnerReady(client: RunnerServiceGrpcClient, secret: string): Promise<void> {
  const request = create(ReadyRequestSchema, {});
  const metadata = authMetadata(secret, RUNNER_SERVICE_READY_PATH);
  return new Promise<void>((resolve, reject) => {
    client.ready(request, metadata, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function authMetadata(secret: string, path: string): Metadata {
  const headers = buildAuthHeaders({ method: 'POST', path, body: '', secret });
  const metadata = new Metadata();
  for (const [key, value] of Object.entries(headers)) {
    metadata.set(key, value);
  }
  return metadata;
}

export async function startPostgres(): Promise<PostgresHandle> {
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

export async function runPrismaMigrations(databaseUrl: string): Promise<void> {
  const serverRoot = path.resolve(__dirname, '..', '..');
  await runCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: { ...process.env, AGENTS_DATABASE_URL: databaseUrl },
  });
}

export async function waitFor(predicate: () => Promise<boolean>, options: { timeoutMs: number; intervalMs: number }): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(options.intervalMs);
  }
  throw new Error('Timed out waiting for condition');
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
