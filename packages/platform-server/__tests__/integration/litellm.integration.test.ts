import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { LLMSettingsService } from '../../src/settings/llm/llmSettings.service';
import type { LiteLLMModelRecord } from '../../src/settings/llm/types';
import { clearTestConfig, registerTestConfig } from '../helpers/config';

const shouldRun = process.env.LITELLM_INTEGRATION === '1';
const describeLiteLLM = shouldRun ? describe : describe.skip;

describeLiteLLM('LiteLLM admin integration', () => {
  const baseUrl = process.env.LITELLM_INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4500';
  const masterKey = process.env.LITELLM_INTEGRATION_MASTER_KEY ?? 'sk-litellm-integration-master';
  const credentialName = process.env.LITELLM_INTEGRATION_CREDENTIAL ?? 'integration-credential';
  let service: LLMSettingsService;

  beforeAll(async () => {
    clearTestConfig();
    const config = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
    });
    service = new LLMSettingsService(config);
    await waitForLiteLLM(service, 120_000);
    await ensureCredential(service, credentialName);
  }, 120_000);

  afterAll(async () => {
    clearTestConfig();
  });

  it('creates, lists, and deletes models via LiteLLM admin API', async () => {
    const modelName = `integration/test-${Date.now()}`;
    let created: LiteLLMModelRecord | undefined;
    try {
      created = await service.createModel({
        name: modelName,
        provider: 'openai',
        model: 'gpt-4o-mini',
        credentialName,
        metadata: { origin: 'integration-test' },
      });
      expect(created.model_name).toBe(modelName);

      const found = await waitForModel(service, modelName, created.model_id);
      expect(found?.model_name ?? found?.model_id).toBeTruthy();
    } finally {
      try {
        const deleteId = created?.model_id ?? modelName;
        await service.deleteModel(deleteId);
      } catch (err) {
        // Ignore cleanup failures; surface only if creation succeeded but deletion failed for other reasons
        if (created) {
          throw err;
        }
      }
    }
  }, 60_000);
});

async function waitForLiteLLM(service: LLMSettingsService, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await service.listCredentials();
      return;
    } catch (err) {
      lastError = err;
      await delay(1_000);
    }
  }
  throw new Error(
    `LiteLLM admin API did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function ensureCredential(service: LLMSettingsService, credentialName: string): Promise<void> {
  const existing = await service.listCredentials();
  if (existing.some((item) => item.credential_name === credentialName)) {
    return;
  }
  await service.createCredential({
    name: credentialName,
    provider: 'openai',
    values: { api_key: 'sk-integration-placeholder' },
  });
}

async function waitForModel(
  service: LLMSettingsService,
  modelName: string,
  modelId?: string,
  timeoutMs = 30_000,
): Promise<LiteLLMModelRecord | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const models = await service.listModels();
    const match = models.find((model) => model.model_name === modelName || (!!modelId && model.model_id === modelId));
    if (match) {
      return match;
    }
    await delay(1_000);
  }
  throw new Error(`Model ${modelName} did not appear in /model/info within ${timeoutMs}ms`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
