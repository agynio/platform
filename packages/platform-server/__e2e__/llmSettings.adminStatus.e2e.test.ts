import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { LLMSettingsModule } from '../src/settings/llm/llmSettings.module';
import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import { LLMSettingsController } from '../src/settings/llm/llmSettings.controller';
import { ConfigService } from '../src/core/services/config.service';

describe('LLM settings controller (admin-status endpoint)', () => {
  let app: NestFastifyApplication;
  const previousEnv = {
    agentsDbUrl: process.env.AGENTS_DATABASE_URL,
    litellmBaseUrl: process.env.LITELLM_BASE_URL,
    litellmMasterKey: process.env.LITELLM_MASTER_KEY,
  };

  beforeAll(async () => {
    process.env.AGENTS_DATABASE_URL = 'postgres://localhost:5432/test';
    process.env.LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000';
    process.env.LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-dev-master-1234';

    ConfigService.clearInstanceForTest();
    ConfigService.fromEnv();

    const moduleRef = await Test.createTestingModule({
      imports: [LLMSettingsModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    ConfigService.clearInstanceForTest();
    process.env.AGENTS_DATABASE_URL = previousEnv.agentsDbUrl;
    process.env.LITELLM_BASE_URL = previousEnv.litellmBaseUrl;
    process.env.LITELLM_MASTER_KEY = previousEnv.litellmMasterKey;
  });

  it('injects ConfigService and serves admin status when LiteLLM env is configured', async () => {
    const service = app.get(LLMSettingsService);
    const controller = app.get(LLMSettingsController);
    const config = app.get(ConfigService);

    expect(service).toBeInstanceOf(LLMSettingsService);
    expect(controller).toBeInstanceOf(LLMSettingsController);
    expect(config).toBeInstanceOf(ConfigService);
    expect(config.llmProvider).toBe('litellm');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    } as Awaited<ReturnType<typeof fetch>>);

    const expectedBaseUrl = config.litellmBaseUrl;
    try {
      const response = await app.inject({ method: 'GET', url: '/api/settings/llm/admin-status' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        configured: true,
        baseUrl: expectedBaseUrl,
        hasMasterKey: true,
        provider: 'litellm',
        adminReachable: true,
      });
      expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/public/providers/fields`, expect.objectContaining({
        method: 'GET',
      }));
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
