import { describe, expect, it } from 'vitest';

import type { LiteLLMModel, LiteLLMProviderInfo } from '@/api/modules/llmSettings';
import { createProviderOptionMap, mapModels, mapProviders } from '../types';

describe('LLM settings provider normalization', () => {
  const providerPayload: LiteLLMProviderInfo[] = [
    {
      provider: 'Azure-OpenAI',
      provider_display_name: 'Azure OpenAI',
      litellm_provider: 'azure_openai',
      credential_fields: [],
      default_model_placeholder: null,
    },
  ];

  it('canonicalizes provider identifiers with aliases', () => {
    const providers = mapProviders(providerPayload);
    expect(providers).toHaveLength(1);
    const [provider] = providers;
    expect(provider.id).toBe('azure');
    expect(provider.litellmProvider).toBe('azure');
    expect(provider.label).toBe('Azure OpenAI');
  });

  it('creates provider lookup map that resolves aliases', () => {
    const providers = mapProviders(providerPayload);
    const map = createProviderOptionMap(providers);

    expect(map.get('azure')).toBeDefined();
    expect(map.get('azure_openai')).toBeDefined();
    expect(map.get('azure-openai')).toBeDefined();
  });

  it('maps models to canonical provider keys when parameters contain aliases', () => {
    const providers = mapProviders(providerPayload);
    const providerMap = createProviderOptionMap(providers);

    const modelsPayload: LiteLLMModel[] = [
      {
        model_name: 'azure/gpt-4',
        litellm_params: {
          model: 'gpt-4',
          litellm_provider: 'azure_openai',
          litellm_credential_name: 'azure-credential',
        },
        model_info: { mode: 'chat' },
      },
    ];

    const models = mapModels(modelsPayload, providerMap);
    expect(models).toHaveLength(1);
    const [model] = models;
    expect(model.providerKey).toBe('azure');
    expect(model.providerLabel).toBe('Azure OpenAI');
  });
});
