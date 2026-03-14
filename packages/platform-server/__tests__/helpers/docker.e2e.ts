import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { credentials, Metadata } from '@grpc/grpc-js';
import { create } from '@bufbuild/protobuf';

import { NonceCache, buildAuthHeaders } from '../../src/infra/container/auth';
import { RunnerServiceGrpcClient, RUNNER_SERVICE_READY_PATH } from '../../src/proto/grpc.js';
import { ReadyRequestSchema } from '../../src/proto/gen/agynio/api/runner/v1/runner_pb.js';

export const RUNNER_SECRET = process.env.DOCKER_RUNNER_SHARED_SECRET ?? '';
export const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
export const hasTcpDocker = Boolean(process.env.DOCKER_HOST);
export const socketMissing = !fs.existsSync(DEFAULT_SOCKET);
const runnerHost = process.env.DOCKER_RUNNER_GRPC_HOST ?? process.env.DOCKER_RUNNER_HOST;
const runnerPort = process.env.DOCKER_RUNNER_GRPC_PORT ?? process.env.DOCKER_RUNNER_PORT;
export const runnerAddress =
  process.env.DOCKER_RUNNER_GRPC_ADDRESS ?? (runnerHost && runnerPort ? `${runnerHost}:${runnerPort}` : undefined);
export const runnerAddressMissing = !runnerAddress;
export const runnerSecretMissing = !RUNNER_SECRET;
const readinessNonceCache = new NonceCache();

export type RunnerHandle = {
  grpcAddress: string;
  close: () => Promise<void>;
};

export type PostgresHandle = {
  connectionString: string;
  stop: () => Promise<void>;
};

export async function startDockerRunner(socketPath: string): Promise<RunnerHandle> {
  if (!runnerAddress || !RUNNER_SECRET) {
    throw new Error('DOCKER_RUNNER_GRPC_ADDRESS and DOCKER_RUNNER_SHARED_SECRET are required to run docker e2e tests.');
  }
  void socketPath;
  await waitForRunnerReadyOnAddress(runnerAddress, RUNNER_SECRET);
  return {
    grpcAddress: runnerAddress,
    close: async () => undefined,
  };
}

export async function startDockerRunnerProcess(socketPath: string): Promise<RunnerHandle> {
  return startDockerRunner(socketPath);
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
  const nonce = randomUUID();
  readinessNonceCache.add(nonce);
  const headers = buildAuthHeaders({ method: 'POST', path, body: '', secret, nonce });
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
