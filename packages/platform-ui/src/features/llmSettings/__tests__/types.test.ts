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

  it('captures canonical LiteLLM identifiers for models', () => {
    const providers = mapProviders(providerPayload);
    const providerMap = createProviderOptionMap(providers);

    const modelsPayload: LiteLLMModel[] = [
      {
        model_name: 'assistant-prod',
        model_id: 'litellm-model-001',
        litellm_params: {
          model: 'gpt-4o-mini',
          litellm_provider: 'azure_openai',
          litellm_credential_name: 'azure-credential',
        },
        model_info: { id: 'model-info-001', mode: 'chat' },
      },
    ];

    const [model] = mapModels(modelsPayload, providerMap);
    expect(model.id).toBe('assistant-prod');
    expect(model.identifier).toBe('litellm-model-001');
    expect(model.litellmId).toBe('litellm-model-001');
    expect(model.modelInfoId).toBe('model-info-001');
  });

  it('falls back to model_info identifiers when LiteLLM id is missing', () => {
    const providers = mapProviders(providerPayload);
    const providerMap = createProviderOptionMap(providers);

    const modelsPayload: LiteLLMModel[] = [
      {
        model_name: 'assistant-stage',
        litellm_params: {
          model: 'gpt-4o-mini',
          litellm_provider: 'azure_openai',
          litellm_credential_name: 'azure-credential',
        },
        model_info: { id: 'model-info-002', mode: 'chat' },
      },
    ];

    const [model] = mapModels(modelsPayload, providerMap);
    expect(model.identifier).toBe('model-info-002');
    expect(model.litellmId).toBeUndefined();
    expect(model.modelInfoId).toBe('model-info-002');
  });
});
