import { ConfigService, configSchema } from '../../src/core/services/config.service';

export const runnerConfigDefaults = {
  dockerRunnerSharedSecret: 'test-shared-secret',
  dockerRunnerGrpcHost: '127.0.0.1',
  dockerRunnerGrpcPort: 50051,
  litellmKeyAlias: 'agents/test/local',
  litellmKeyDuration: '30d',
  litellmModels: ['all-team-models'],
} as const;

const defaultConfigInput = {
  llmProvider: 'litellm',
  litellmBaseUrl: 'http://127.0.0.1:4000',
  litellmMasterKey: 'sk-test-master',
  litellmKeyAlias: 'agents/test/local',
  litellmKeyDuration: '30d',
  litellmModels: ['all-team-models'],
  agentsDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/agents_test',
  ...runnerConfigDefaults,
};

type ConfigInput = Parameters<typeof configSchema.parse>[0];

export function registerTestConfig(overrides: Partial<ConfigInput> = {}): ConfigService {
  const config = new ConfigService().init(configSchema.parse({ ...defaultConfigInput, ...overrides }));
  return ConfigService.register(config);
}

export function buildConfigInput(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return { ...defaultConfigInput, ...overrides };
}

export function clearTestConfig(): void {
  ConfigService.clearInstanceForTest();
}
