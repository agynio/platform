import { afterEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../src/core/services/config.service';

const previousEnv: Record<string, string | undefined> = {
  llmProvider: process.env.LLM_PROVIDER,
  litellmBaseUrl: process.env.LITELLM_BASE_URL,
  litellmMasterKey: process.env.LITELLM_MASTER_KEY,
  agentsDbUrl: process.env.AGENTS_DATABASE_URL,
  dockerRunnerBaseUrl: process.env.DOCKER_RUNNER_BASE_URL,
  dockerRunnerSharedSecret: process.env.DOCKER_RUNNER_SHARED_SECRET,
};

describe('ConfigService.fromEnv', () => {
  afterEach(() => {
    process.env.LLM_PROVIDER = previousEnv.llmProvider;
    process.env.LITELLM_BASE_URL = previousEnv.litellmBaseUrl;
    process.env.LITELLM_MASTER_KEY = previousEnv.litellmMasterKey;
    process.env.AGENTS_DATABASE_URL = previousEnv.agentsDbUrl;
    process.env.DOCKER_RUNNER_BASE_URL = previousEnv.dockerRunnerBaseUrl;
    process.env.DOCKER_RUNNER_SHARED_SECRET = previousEnv.dockerRunnerSharedSecret;
    ConfigService.clearInstanceForTest();
  });

  it('parses LiteLLM configuration from process environment', () => {
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000/';
    process.env.LITELLM_MASTER_KEY = '  sk-dev-master-1234  ';
    process.env.AGENTS_DATABASE_URL = 'postgresql://agents:agents@localhost:5443/agents';
    process.env.DOCKER_RUNNER_BASE_URL = 'http://127.0.0.1:7071';
    process.env.DOCKER_RUNNER_SHARED_SECRET = 'test-shared-secret';

    const config = ConfigService.fromEnv();

    expect(config.llmProvider).toBe('litellm');
    expect(config.litellmBaseUrl).toBe('http://127.0.0.1:4000');
    expect(config.litellmMasterKey).toBe('sk-dev-master-1234');
    expect(config.agentsDatabaseUrl).toBe('postgresql://agents:agents@localhost:5443/agents');
  });
});
