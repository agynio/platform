import { ConfigService, configSchema } from '../../src/core/services/config.service';

const defaultConfigInput = {
  llmProvider: 'litellm',
  litellmBaseUrl: 'http://127.0.0.1:4000',
  litellmMasterKey: 'sk-test-master',
  agentsDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/agents_test',
};

type ConfigInput = Parameters<typeof configSchema.parse>[0];

export function registerTestConfig(overrides: Partial<ConfigInput> = {}): ConfigService {
  const config = new ConfigService().init(configSchema.parse({ ...defaultConfigInput, ...overrides }));
  return ConfigService.register(config);
}

export function clearTestConfig(): void {
  ConfigService.clearInstanceForTest();
}
