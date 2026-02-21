import 'reflect-metadata';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AppModule } from '../src/bootstrap/app.module';
import { ConfigService } from '../src/core/services/config.service';

const REQUIRED_ENV = {
  NODE_ENV: 'production',
  AGENTS_ENV: 'production',
  LOG_LEVEL: 'error',
  LLM_PROVIDER: 'litellm',
  LITELLM_BASE_URL: 'http://127.0.0.1:4000',
  LITELLM_MASTER_KEY: 'sk-test-master-key',
  AGENTS_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/agents',
  DOCKER_RUNNER_BASE_URL: 'http://127.0.0.1:59999',
  DOCKER_RUNNER_SHARED_SECRET: 'dev-shared-secret',
  DOCKER_RUNNER_OPTIONAL: 'true',
  CONTAINERS_CLEANUP_ENABLED: 'false',
  VOLUME_GC_ENABLED: 'false',
  NCPS_ENABLED: 'false',
  WORKSPACE_NETWORK_NAME: 'agents_net',
} as const;

const TEST_TIMEOUT_MS = 20_000;

describe('Production bootstrap DI', () => {
  let savedEnv: Record<string, string | undefined> = {};
  let graphRepoPath: string;

  beforeEach(() => {
    savedEnv = {};
    graphRepoPath = mkdtempSync(path.join(os.tmpdir(), 'platform-bootstrap-di-'));
    const overrides = { ...REQUIRED_ENV, GRAPH_REPO_PATH: graphRepoPath } as Record<string, string>;
    for (const [key, value] of Object.entries(overrides)) {
      if (!(key in savedEnv)) {
        savedEnv[key] = process.env[key];
      }
      process.env[key] = value;
    }
    ConfigService.fromEnv();
  });

  afterEach(() => {
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
      const adapter = new FastifyAdapter();
      const app = await NestFactory.create(AppModule, adapter);
      try {
        await app.init();
        expect(true).toBe(true);
      } finally {
        await app.close().catch(() => undefined);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
