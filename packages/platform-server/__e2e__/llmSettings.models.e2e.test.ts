import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { LLMSettingsModule } from '../src/settings/llm/llmSettings.module';
import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import { ConfigService } from '../src/core/services/config.service';
import type { LiteLLMModelRecord } from '../src/settings/llm/types';

describe('LLM settings controller (models endpoint)', () => {
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

  it('returns model list via injected service', async () => {
    const service = app.get(LLMSettingsService);
    const stubModel: LiteLLMModelRecord = {
      model_name: 'model-1',
      litellm_params: { provider: 'openai' },
      model_info: { id: 'model-1' },
    };
    const listModels = vi.spyOn(service, 'listModels').mockResolvedValue([stubModel]);

    const response = await app.inject({ method: 'GET', url: '/api/settings/llm/models' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ models: [stubModel] });
    expect(listModels).toHaveBeenCalledTimes(1);
  });
});
