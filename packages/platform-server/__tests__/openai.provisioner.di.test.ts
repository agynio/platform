import { describe, it, expect } from 'vitest';

import { OpenAILLMProvisioner } from '../src/llm/provisioners/openai.provisioner';
import { ConfigService, configSchema, type Config } from '../src/core/services/config.service';
import { runnerConfigDefaults } from './helpers/config';

const baseConfig: Partial<Config> = {
  llmProvider: 'openai',
  openaiApiKey: 'sk-test',
  litellmBaseUrl: 'http://127.0.0.1:4000',
  litellmMasterKey: 'sk-master',
  agentsDatabaseUrl: 'postgres://dev:dev@localhost:5432/agents',
  ...runnerConfigDefaults,
};

describe('OpenAILLMProvisioner DI enforcement', () => {
  it('throws when ConfigService is not initialized through Nest', () => {
    const cfg = new ConfigService();
    expect(() => new OpenAILLMProvisioner(cfg)).toThrow(/ConfigService injected before initialization/);
  });

  it('can be constructed when ConfigService is initialized', () => {
    const cfg = new ConfigService().init(configSchema.parse(baseConfig));
    expect(() => new OpenAILLMProvisioner(cfg)).not.toThrow();
  });
});
