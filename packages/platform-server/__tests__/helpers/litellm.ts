import type { LiteLLMModelRecord } from '../../src/settings/llm/types';
import { LLMSettingsService } from '../../src/settings/llm/llmSettings.service';

export async function waitForLiteLLM(service: LLMSettingsService, timeoutMs: number): Promise<void> {
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

export async function ensureCredential(service: LLMSettingsService, credentialName: string): Promise<void> {
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

export async function waitForModel(
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
