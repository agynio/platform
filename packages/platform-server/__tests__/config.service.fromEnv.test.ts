import { afterEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../src/core/services/config.service';

const trackedEnvKeys = [
  'LLM_PROVIDER',
  'LITELLM_BASE_URL',
  'LITELLM_MASTER_KEY',
  'LITELLM_KEY_ALIAS',
  'LITELLM_KEY_DURATION',
  'LITELLM_MODELS',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'AGENTS_DATABASE_URL',
  'AGENTS_ENV',
  'AGENTS_DEPLOYMENT',
  'DEPLOYMENT_ID',
  'TEAMS_SERVICE_ADDR',
  'DEPLOYMENT_ID',
  'NODE_ENV',
  'HOSTNAME',
];

const previousEnv: Record<string, string | undefined> = trackedEnvKeys.reduce((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {} as Record<string, string | undefined>);

describe('ConfigService.fromEnv', () => {
  afterEach(() => {
    for (const key of trackedEnvKeys) {
      const value = previousEnv[key];
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    ConfigService.clearInstanceForTest();
  });

  it('parses LiteLLM configuration from process environment', () => {
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000/';
    process.env.LITELLM_MASTER_KEY = '  sk-dev-master-1234  ';
    process.env.LITELLM_KEY_ALIAS = ' agents/test/custom ';
    process.env.LITELLM_KEY_DURATION = ' 15m ';
    process.env.LITELLM_MODELS = 'gpt-5o, claude-4 '; 
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.TEAMS_SERVICE_ADDR = 'teams:9090';

    const config = ConfigService.fromEnv();

    expect(config.llmProvider).toBe('litellm');
    expect(config.litellmBaseUrl).toBe('http://127.0.0.1:4000');
    expect(config.litellmMasterKey).toBe('sk-dev-master-1234');
    expect(config.litellmKeyAlias).toBe('agents/test/custom');
    expect(config.litellmKeyDuration).toBe('15m');
    expect(config.litellmModels).toEqual(['gpt-5o', 'claude-4']);
    expect(config.agentsDatabaseUrl).toBe('postgresql://agents:agents@localhost:5443/agents');
  });

  it('defaults the LLM provider to litellm when unset', () => {
    delete process.env.LLM_PROVIDER;
    process.env.LITELLM_BASE_URL = 'http://litellm.internal:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-master';
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.AGENTS_ENV = ' staging ';
    process.env.HOSTNAME = 'web-1';
    process.env.TEAMS_SERVICE_ADDR = 'teams:9090';

    const config = ConfigService.fromEnv();

    expect(config.llmProvider).toBe('litellm');
    expect(config.litellmKeyAlias).toBe('agents/staging/platform-server');
  });

  it('throws when LLM_PROVIDER is not recognized', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LITELLM_BASE_URL = 'http://litellm.internal:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-master';
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.TEAMS_SERVICE_ADDR = 'teams:9090';

    expect(() => ConfigService.fromEnv()).toThrowError(
      'LLM_PROVIDER must be either "litellm" or "openai", received "anthropic"',
    );
  });

  it('maps legacy OPENAI_* variables only when provider is openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LITELLM_BASE_URL = 'http://litellm.fallback:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-master';
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.TEAMS_SERVICE_ADDR = 'teams:9090';

    const config = ConfigService.fromEnv();

    expect(config.llmProvider).toBe('openai');
    expect(config.openaiApiKey).toBe('sk-openai');
    expect(config.openaiBaseUrl).toBe('https://api.openai.com/v1');
  });

  it('ignores legacy OPENAI_* variables when provider is litellm', () => {
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LITELLM_BASE_URL = 'http://litellm.internal:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-master';
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.OPENAI_API_KEY = 'sk-openai-lite';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.TEAMS_SERVICE_ADDR = 'teams:9090';

    const config = ConfigService.fromEnv();

    expect(config.openaiApiKey).toBeUndefined();
    expect(config.openaiBaseUrl).toBeUndefined();
  });
});
