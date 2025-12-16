import nock from 'nock';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import { ConfigService, configSchema, type Config } from '../src/core/services/config.service';

const BASE_URL = 'http://litellm.test';

const defaultConfig: Partial<Config> = {
  llmProvider: 'litellm',
  litellmBaseUrl: BASE_URL,
  litellmMasterKey: 'sk-master',
  agentsDatabaseUrl: 'postgres://dev:dev@localhost:5432/agents',
};

const createConfig = (overrides?: Partial<Config>) => {
  const merged: Record<string, unknown> = { ...defaultConfig };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
  }
  return new ConfigService().init(configSchema.parse(merged));
};

describe.sequential('LLMSettingsService', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('lists providers by filtering invalid entries', async () => {
    const scope = nock(BASE_URL)
      .get('/public/providers/fields')
      .matchHeader('authorization', 'Bearer sk-master')
      .reply(200, [
        {
          provider: 'openai',
          provider_display_name: 'OpenAI',
          litellm_provider: 'openai',
          credential_fields: [{ key: 'api_key', label: 'API Key', required: true, field_type: 'string' }],
        },
        { foo: 'bar' },
      ]);

    const service = new LLMSettingsService(createConfig());
    const result = await service.listProviders();
    expect(result.readOnly).toBe(false);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.provider).toBe('openai');
    scope.done();
  });

  it('supports legacy data wrapper when listing providers', async () => {
    const scope = nock(BASE_URL)
      .get('/public/providers/fields')
      .matchHeader('authorization', 'Bearer sk-master')
      .reply(200, {
        data: [
          {
            provider: 'anthropic',
            provider_display_name: 'Anthropic',
            litellm_provider: 'anthropic',
            credential_fields: [{ key: 'api_key', label: 'API Key', required: true, field_type: 'string' }],
          },
        ],
      });

    const service = new LLMSettingsService(createConfig());
    const result = await service.listProviders();
    expect(result.readOnly).toBe(false);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.provider_display_name).toBe('Anthropic');
    scope.done();
  });

  it('lists credentials from nested payload structures', async () => {
    const scope = nock(BASE_URL)
      .get('/credentials')
      .matchHeader('authorization', 'Bearer sk-master')
      .reply(200, {
        credentials: [
          {
            credential_name: 'openai-dev',
            credential_info: { litellm_provider: 'openai' },
            credential_values: { api_key: 'sk***' },
          },
          { foo: 'bar' },
        ],
      });

    const service = new LLMSettingsService(createConfig());
    const result = await service.listCredentials();
    expect(result.readOnly).toBe(false);
    expect(result.credentials).toHaveLength(1);
    expect(result.credentials[0]?.credential_name).toBe('openai-dev');
    scope.done();
  });

  it('prevents deleting credentials referenced by models', async () => {
    const modelsScope = nock(BASE_URL)
      .get('/model/info')
      .reply(200, {
        data: [
          {
            model_name: 'openai/gpt-4o',
            litellm_params: { litellm_credential_name: 'openai-dev' },
            model_info: { id: 'openai/gpt-4o' },
          },
        ],
      });

    const service = new LLMSettingsService(createConfig());
    const deletion = service.deleteCredential('openai-dev');
    await expect(deletion).rejects.toBeInstanceOf(BadRequestException);
    await deletion.catch((err) => {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        error: 'credential_in_use',
        models: ['openai/gpt-4o'],
      });
    });
    modelsScope.done();
  });

  it('creates credential with sanitized payload', async () => {
    const scope = nock(BASE_URL)
      .post('/credentials', (body) => {
        expect(body).toMatchObject({
          credential_name: 'openai-dev',
          credential_info: {
            litellm_provider: 'openai',
            tags: ['default'],
          },
          credential_values: {
            api_key: 'sk-test',
            api_base: 'https://api.openai.com/v1',
          },
        });
        return true;
      })
      .matchHeader('authorization', 'Bearer sk-master')
      .reply(200, { success: true });

    const service = new LLMSettingsService(createConfig());
    const res = await service.createCredential({
      name: 'openai-dev',
      provider: 'openai',
      tags: ['default', ''],
      values: { api_key: ' sk-test ', api_base: 'https://api.openai.com/v1' },
    });
    expect(res).toMatchObject({ success: true });
    scope.done();
  });

  it('does not clear secrets when updating non-secret fields', async () => {
    const scope = nock(BASE_URL)
      .patch('/credentials/openai-dev', (body) => {
        expect(body).toMatchObject({
          credential_name: 'openai-dev',
          credential_info: {
            tags: ['primary'],
          },
        });
        expect(body).not.toHaveProperty('credential_values');
        return true;
      })
      .matchHeader('authorization', 'Bearer sk-master')
      .reply(200, { success: true });

    const service = new LLMSettingsService(createConfig());
    const res = await service.updateCredential({ name: 'openai-dev', tags: ['primary'] });
    expect(res).toMatchObject({ success: true });
    scope.done();
  });

  it('tests credential by calling health endpoint with provider metadata', async () => {
    const detailScope = nock(BASE_URL)
      .get('/credentials/by_name/openai-dev')
      .reply(200, {
        credential_name: 'openai-dev',
        credential_info: { litellm_provider: 'openai' },
        credential_values: { api_key: 'sk***' },
      });

    const testScope = nock(BASE_URL)
      .post('/health/test_connection', (body) => {
        expect(body).toMatchObject({
          mode: 'chat',
          litellm_params: {
            model: 'gpt-4o',
            custom_llm_provider: 'openai',
            litellm_credential_name: 'openai-dev',
          },
        });
        return true;
      })
      .reply(200, { success: true });

    const service = new LLMSettingsService(createConfig());
    const res = await service.testCredential({ name: 'openai-dev', model: 'gpt-4o' });
    expect(res).toMatchObject({ success: true });
    detailScope.done();
    testScope.done();
  });

  it('updates model by merging existing configuration', async () => {
    const modelsScope = nock(BASE_URL)
      .get('/model/info')
      .reply(200, {
        data: [
          {
            model_name: 'openai/gpt-4o',
            litellm_params: {
              model: 'gpt-4o',
              custom_llm_provider: 'openai',
              litellm_credential_name: 'openai-dev',
            },
            model_info: { id: 'openai/gpt-4o', mode: 'chat' },
          },
        ],
      });

    const updateScope = nock(BASE_URL)
      .post('/model/update', (body) => {
        expect(body).toMatchObject({
          model_name: 'openai/gpt-4o',
          litellm_params: {
            model: 'gpt-4o',
            custom_llm_provider: 'openai',
            litellm_credential_name: 'cred-2',
            temperature: 0.2,
          },
          model_info: { id: 'openai/gpt-4o', mode: 'chat' },
        });
        return true;
      })
      .reply(200, {
        model_name: 'openai/gpt-4o',
        litellm_params: { model: 'gpt-4o' },
        model_info: { id: 'openai/gpt-4o' },
      });

    const service = new LLMSettingsService(createConfig());
    const res = await service.updateModel({
      id: 'openai/gpt-4o',
      credentialName: 'cred-2',
      temperature: 0.2,
    });
    expect(res.model_name).toBe('openai/gpt-4o');
    modelsScope.done();
    updateScope.done();
  });

  it('rejects model params that contain secrets', async () => {
    const service = new LLMSettingsService(createConfig());
    await expect(
      service.createModel({
        name: 'openai/unsafe',
        provider: 'openai',
        model: 'gpt-4o',
        credentialName: 'openai-dev',
        params: { api_key: 'should-not-pass' },
      }),
    ).rejects.toThrow('model parameters must not include credential secrets');
  });

  it('throws when LiteLLM configuration is missing', async () => {
    const service = new LLMSettingsService({
      isInitialized: () => true,
    } as unknown as ConfigService);
    const result = await service.listProviders();
    expect(result).toMatchObject({
      providers: [],
      readOnly: true,
      reason: 'missing_env',
    });
  });

  it('reports missing master key when base URL is present', async () => {
    const config = {
      litellmBaseUrl: 'http://litellm.test',
      litellmMasterKey: undefined,
      isInitialized: () => true,
    } as unknown as ConfigService;
    const service = new LLMSettingsService(config);

    const result = await service.listProviders();
    expect(result).toMatchObject({
      providers: [],
      readOnly: true,
      reason: 'missing_env',
    });
  });


  it('propagates LiteLLM admin errors when write fails', async () => {
    const scope = nock(BASE_URL)
      .post('/credentials')
      .reply(403, { error: 'litellm_admin_auth_required' });

    const service = new LLMSettingsService(createConfig());

    await expect(
      service.createCredential({
        name: 'openai-dev',
        provider: 'openai',
        tags: [],
        values: { api_key: 'sk-test' },
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        error: 'litellm_admin_unauthorized',
        status: 503,
        details: {
          status: 403,
          body: { error: 'litellm_admin_auth_required' },
        },
      },
    });

    scope.done();
  });

  it('maps LiteLLM admin network failures to litellm_unreachable', async () => {
    const scope = nock(BASE_URL)
      .post('/credentials')
      .replyWithError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });

    const service = new LLMSettingsService(createConfig());

    await expect(
      service.createCredential({
        name: 'openai-dev',
        provider: 'openai',
        tags: [],
        values: { api_key: 'sk-test' },
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        error: 'litellm_unreachable',
        status: 503,
      },
    });

    scope.done();
  });

  it('throws when ConfigService injection is not initialized', () => {
    const config = {
      isInitialized: () => false,
    } as unknown as ConfigService;
    expect(() => new LLMSettingsService(config)).toThrow(/ConfigService injected before initialization/);
  });

  it('reports admin status when configuration is missing', async () => {
    const config = createConfig();
    const params = { ...(config as any)._params } as Record<string, unknown>;
    params.litellmBaseUrl = undefined;
    params.litellmMasterKey = undefined;
    (config as any)._params = params;
    const service = new LLMSettingsService(config);
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: false,
      baseUrl: undefined,
      hasMasterKey: false,
      provider: 'litellm',
      reason: 'missing_env',
    });
  });

  it('reports partial configuration when master key is missing', async () => {
    const config = createConfig();
    const params = { ...(config as any)._params } as Record<string, unknown>;
    params.litellmMasterKey = undefined;
    (config as any)._params = params;
    const service = new LLMSettingsService(config);
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: false,
      baseUrl: BASE_URL,
      hasMasterKey: false,
      provider: 'litellm',
      reason: 'missing_env',
    });
  });

  it('reports provider mismatch when LiteLLM mode is disabled', async () => {
    const config = {
      llmProvider: 'openai',
      litellmBaseUrl: BASE_URL,
      litellmMasterKey: 'sk-master',
      isInitialized: () => true,
    } as unknown as ConfigService;
    const service = new LLMSettingsService(config);
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: false,
      baseUrl: BASE_URL,
      hasMasterKey: true,
      provider: 'openai',
      reason: 'provider_mismatch',
    });
  });

  it('confirms admin reachability when LiteLLM responds', async () => {
    const scope = nock(BASE_URL)
      .get('/public/providers/fields')
      .reply(200, []);

    const service = new LLMSettingsService(createConfig());
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: true,
      baseUrl: BASE_URL,
      hasMasterKey: true,
      provider: 'litellm',
      adminReachable: true,
    });

    scope.done();
  });

  it('flags unauthorized admin credentials during status probe', async () => {
    const scope = nock(BASE_URL)
      .get('/public/providers/fields')
      .reply(401, { error: 'unauthorized' });

    const service = new LLMSettingsService(createConfig());
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: true,
      adminReachable: false,
      reason: 'unauthorized',
    });

    scope.done();
  });

  it('flags unreachable admin endpoint during status probe', async () => {
    const scope = nock(BASE_URL)
      .get('/public/providers/fields')
      .replyWithError({ code: 'ECONNRESET', message: 'socket hang up' });

    const service = new LLMSettingsService(createConfig());
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: true,
      adminReachable: false,
      reason: 'unreachable',
    });

    scope.done();
  });
});
