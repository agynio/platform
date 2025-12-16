import { describe, it, expect, vi } from 'vitest';

import { LLMSettingsController } from '../src/settings/llm/llmSettings.controller';
import type { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import type { LiteLLMCredentialSummary, LiteLLMProviderInfo } from '../src/settings/llm/types';

describe('LLM admin status endpoint', () => {
  it('delegates to the service', async () => {
    const payload = {
      configured: true,
      baseUrl: 'http://127.0.0.1:4000',
      hasMasterKey: true,
      provider: 'litellm',
      adminReachable: true,
    } as const;

    const service = {
      getAdminStatus: vi.fn().mockResolvedValue(payload),
    } as unknown as LLMSettingsService;

    const controller = new LLMSettingsController(service);
    await expect(controller.getAdminStatus()).resolves.toEqual(payload);
    expect(service.getAdminStatus).toHaveBeenCalledTimes(1);
  });

  it('returns providers arrays without additional nesting', async () => {
    const providers: LiteLLMProviderInfo[] = [
      {
        provider: 'openai',
        provider_display_name: 'OpenAI',
        litellm_provider: 'openai',
        credential_fields: [],
      },
    ];

    const service = {
      listProviders: vi.fn().mockResolvedValue(providers),
    } as unknown as LLMSettingsService;

    const controller = new LLMSettingsController(service);
    await expect(controller.listProviders()).resolves.toBe(providers);
    expect(service.listProviders).toHaveBeenCalledTimes(1);
  });

  it('returns credential arrays without additional nesting', async () => {
    const credentials: LiteLLMCredentialSummary[] = [
      {
        credential_name: 'openai-prod',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk***' },
      },
    ];

    const service = {
      listCredentials: vi.fn().mockResolvedValue(credentials),
    } as unknown as LLMSettingsService;

    const controller = new LLMSettingsController(service);
    await expect(controller.listCredentials()).resolves.toBe(credentials);
    expect(service.listCredentials).toHaveBeenCalledTimes(1);
  });
});
