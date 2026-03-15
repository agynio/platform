import 'reflect-metadata';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/bootstrap/app.module';
import { ConfigService } from '../src/core/services/config.service';
import { PrismaService } from '../src/core/services/prisma.service';

const LITELLM_PORT = 4000;

const REQUIRED_ENV = {
  NODE_ENV: 'production',
  AGENTS_ENV: 'production',
  LOG_LEVEL: 'error',
  LLM_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-test-openai',
  LITELLM_BASE_URL: `http://127.0.0.1:${LITELLM_PORT}`,
  LITELLM_MASTER_KEY: 'sk-test-master-key',
  AGENTS_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/agents_test?schema=public',
  TEAMS_SERVICE_ADDR: 'teams:9090',
  DOCKER_RUNNER_GRPC_HOST: '127.0.0.1',
  DOCKER_RUNNER_PORT: '59999',
  DOCKER_RUNNER_SHARED_SECRET: 'dev-shared-secret',
  DOCKER_RUNNER_OPTIONAL: 'true',
  CONTAINERS_CLEANUP_ENABLED: 'false',
  VOLUME_GC_ENABLED: 'false',
  NCPS_ENABLED: 'false',
} as const;

const TEST_TIMEOUT_MS = 20_000;

describe('Production bootstrap DI', () => {
  let savedEnv: Record<string, string | undefined> = {};
  let graphRepoPath: string;
  let liteLLMServer: Server | undefined;

  beforeEach(async () => {
    savedEnv = {};
    graphRepoPath = mkdtempSync(path.join(os.tmpdir(), 'platform-bootstrap-di-'));
    const overrides = { ...REQUIRED_ENV, GRAPH_REPO_PATH: graphRepoPath } as Record<string, string>;
    for (const [key, value] of Object.entries(overrides)) {
      if (!(key in savedEnv)) {
        savedEnv[key] = process.env[key];
      }
      process.env[key] = value;
    }
    liteLLMServer = await startLiteLLMServer();
    ConfigService.fromEnv();
  });

  afterEach(async () => {
    ConfigService.clearInstanceForTest();
    if (liteLLMServer) {
      await new Promise<void>((resolve, reject) => {
        liteLLMServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      liteLLMServer = undefined;
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedEnv = {};
    rmSync(graphRepoPath, { recursive: true, force: true });
  });

  it(
    'initializes the production bootstrap path when docker runner is optional',
    async () => {
      const transactionClientStub = {
        $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
        run: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        runEvent: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        reminder: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const prismaClientStub = {
        $transaction: vi.fn(async (cb: (tx: typeof transactionClientStub) => Promise<unknown>) => {
          await cb(transactionClientStub);
          return undefined;
        }),
      } satisfies Partial<PrismaClient>;
      const prismaSpy = vi
        .spyOn(PrismaService.prototype, 'getClient')
        .mockReturnValue(prismaClientStub as PrismaClient);
      const adapter = new FastifyAdapter();
      const app = await NestFactory.create(AppModule, adapter);
      try {
        await app.init();
        expect(true).toBe(true);
      } finally {
        prismaSpy.mockRestore();
        await app.close().catch(() => undefined);
      }
    },
    TEST_TIMEOUT_MS,
  );
});

function startLiteLLMServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      if (!req.url) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (req.method === 'POST' && req.url === '/key/generate') {
        const payload = await readJsonBody(req);
        const keyAlias = typeof payload?.key_alias === 'string' ? payload.key_alias : 'test-alias';
        const key = `virtual-key-${keyAlias}`;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ key, key_alias: keyAlias, expires_at: expiresAt }));
        return;
      }
      if (req.method === 'POST' && req.url === '/key/delete') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.listen(LITELLM_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    return undefined;
  }
}
