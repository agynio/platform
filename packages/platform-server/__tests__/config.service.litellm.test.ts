import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService, configSchema } from '../src/core/services/config.service';

describe('ConfigService LiteLLM configuration', () => {
  const originalEnv = { ...process.env };

  const applyEnv = (env: Record<string, string | undefined>) => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  const initWithEnv = (
    env: Record<string, string | undefined>,
    overrides: Partial<{ litellmBaseUrl: string | undefined; litellmMasterKey: string | undefined }> = {},
  ) => {
    applyEnv(env);
    const parsed = configSchema.parse({
      agentsDatabaseUrl: 'postgres://user:pass@localhost:5432/db',
      litellmBaseUrl: overrides.litellmBaseUrl,
      litellmMasterKey: overrides.litellmMasterKey,
    });
    const service = new ConfigService();
    return service.init(parsed);
  };

  const restoreEnv = () => {
    applyEnv({});
  };

  afterEach(() => {
    restoreEnv();
  });

  it('prefers explicit LITELLM_BASE_URL over OPENAI_BASE_URL when both provided', () => {
    const service = initWithEnv({
      LITELLM_BASE_URL: 'https://litellm.example/api',
      LITELLM_MASTER_KEY: 'sk-litellm-master',
      OPENAI_BASE_URL: 'https://openai.example',
      OPENAI_API_KEY: 'sk-openai-other',
    });

    expect(service.litellmBaseUrl).toBe('https://litellm.example/api');
    expect(service.litellmMasterKey).toBe('sk-litellm-master');
  });

  it('falls back to OPENAI_BASE_URL only when LiteLLM env vars missing', () => {
    const service = initWithEnv({
      OPENAI_BASE_URL: 'https://fallback.openai/v1',
      OPENAI_API_KEY: 'sk-openai',
      LITELLM_BASE_URL: undefined,
      LITELLM_MASTER_KEY: undefined,
    });

    expect(service.litellmBaseUrl).toBe('https://fallback.openai/v1');
    expect(service.litellmMasterKey).toBe('sk-openai');
  });

  it('trims whitespace and strips trailing slashes from base URL', () => {
    const service = initWithEnv({}, {
      litellmBaseUrl: ' https://trim-me.example/ ',
      litellmMasterKey: 'sk-master',
    });

    expect(service.litellmBaseUrl).toBe('https://trim-me.example');
  });

  it('falls back to test defaults when neither LiteLLM nor OpenAI env set', () => {
    const service = initWithEnv({ LITELLM_BASE_URL: undefined, LITELLM_MASTER_KEY: undefined, OPENAI_BASE_URL: undefined, OPENAI_API_KEY: undefined });

    expect(service.litellmBaseUrl).toBe('http://litellm.local');
    expect(service.litellmMasterKey).toBe('test-master-key');
  });

  it('does not mutate process.env outside of initialization', () => {
    initWithEnv({ LITELLM_BASE_URL: 'https://keep.example', LITELLM_MASTER_KEY: 'secret' });
    expect(process.env.LITELLM_BASE_URL).toBe('https://keep.example');
  });
});
