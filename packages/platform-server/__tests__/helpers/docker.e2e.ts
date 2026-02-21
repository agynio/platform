import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { fetch } from 'undici';

import { createRunnerApp } from '../../../docker-runner/src/service/app';

export const RUNNER_SECRET = 'docker-e2e-secret';
export const DEFAULT_SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
export const hasTcpDocker = Boolean(process.env.DOCKER_HOST);
export const socketMissing = !fs.existsSync(DEFAULT_SOCKET);
export const dockerReachable = detectDockerReachable();

export type RunnerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

export type PostgresHandle = {
  connectionString: string;
  stop: () => Promise<void>;
};

export async function startDockerRunner(socketPath: string): Promise<RunnerHandle> {
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
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  };
}

export async function startDockerRunnerProcess(socketPath: string): Promise<RunnerHandle> {
  const port = await getAvailablePort();
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const runnerEntry = path.resolve(repoRoot, 'packages', 'docker-runner', 'src', 'service', 'main.ts');
  const tsxBin = path.resolve(repoRoot, 'node_modules', '.bin', 'tsx');
  if (!fs.existsSync(tsxBin)) {
    throw new Error(`tsx binary not found at ${tsxBin}`);
  }
  const mockModuleRoot = path.resolve(repoRoot, 'packages', 'docker-runner', '__tests__', 'mocks');
  const mockLoader = path.resolve(mockModuleRoot, 'mock-openziti-loader.mjs');
  const mockIdentity = path.resolve(repoRoot, '.ziti', 'identities', 'vitest.docker-runner.identity.json');
  await fs.promises.mkdir(path.dirname(mockIdentity), { recursive: true });
  await fs.promises.writeFile(mockIdentity, '{"mock":"identity"}');
  const existingNodeOptions = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DOCKER_RUNNER_HOST: '127.0.0.1',
    DOCKER_RUNNER_PORT: String(port),
    DOCKER_RUNNER_SHARED_SECRET: RUNNER_SECRET,
    DOCKER_RUNNER_LOG_LEVEL: 'error',
    ZITI_IDENTITY_FILE: mockIdentity,
    ZITI_SERVICE_NAME: process.env.ZITI_SERVICE_NAME ?? 'dev.agyn-platform.platform-api',
    NODE_OPTIONS: `${existingNodeOptions}--loader=${mockLoader}`.trim(),
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
      waitFor(async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
          return response.ok;
        } catch {
          return false;
        }
      }, { timeoutMs: 30_000, intervalMs: 250 }),
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
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      if (child.exitCode !== null || child.signalCode) return;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      });
    },
  };
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

function detectDockerReachable(): boolean {
  try {
    const env = {
      ...process.env,
      DOCKER_CLIENT_TIMEOUT: process.env.DOCKER_CLIENT_TIMEOUT ?? '3',
      COMPOSE_HTTP_TIMEOUT: process.env.COMPOSE_HTTP_TIMEOUT ?? '3',
    };
    const result = spawnSync('docker', ['info'], { stdio: 'ignore', env, timeout: 4000 });
    if (result.error) {
      return false;
    }
    return result.status === 0;
  } catch {
    return false;
  }
}
