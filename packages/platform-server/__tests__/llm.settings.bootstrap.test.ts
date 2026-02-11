import { Test } from '@nestjs/testing';
import { describe, expect, it, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { LLMSettingsModule } from '../src/settings/llm/llmSettings.module';
import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { PrismaService } from '../src/core/services/prisma.service';

describe('LLMSettingsModule bootstrap', () => {
  afterEach(() => {
    ConfigService.clearInstanceForTest();
  });

  it('initializes controller and service without runtime errors', async () => {
    const config = ConfigService.register(
      new ConfigService().init(
        configSchema.parse({
          litellmBaseUrl: 'http://127.0.0.1:4000',
          litellmMasterKey: 'sk-test-master',
          agentsDatabaseUrl: 'postgres://postgres:postgres@localhost:5432/test',
        }),
      ),
    );

    const moduleRef = await Test.createTestingModule({
      imports: [LLMSettingsModule],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue({ getClient: () => ({}) as PrismaClient })
      .compile();

    const app = moduleRef.createNestApplication(new FastifyAdapter());

    try {
      await app.init();
      const service = app.get(LLMSettingsService);
      expect(service).toBeInstanceOf(LLMSettingsService);
    } finally {
      await app.close();
      await moduleRef.close();
    }
  });
});
