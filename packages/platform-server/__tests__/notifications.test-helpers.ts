import { ConfigService } from '../src/core/services/config.service';

export const NOTIFICATIONS_BASE_ENV: Record<string, string> = {
  LLM_PROVIDER: 'litellm',
  LITELLM_BASE_URL: 'http://127.0.0.1:4000',
  LITELLM_MASTER_KEY: 'sk-test-master',
  DOCKER_RUNNER_BASE_URL: 'http://localhost:7071',
  DOCKER_RUNNER_SHARED_SECRET: 'test-shared-secret',
  NOTIFICATIONS_REDIS_URL: 'redis://localhost:6379/0',
  NOTIFICATIONS_CHANNEL: 'notifications.test',
  AGENTS_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
};

export type EnvSnapshot = Record<string, string | undefined>;

const applyEnv = (overrides?: Partial<Record<string, string | undefined>>): EnvSnapshot => {
  const snapshot: EnvSnapshot = {};
  for (const key of Object.keys(NOTIFICATIONS_BASE_ENV)) {
    snapshot[key] = process.env[key];
  }
  const next = { ...NOTIFICATIONS_BASE_ENV, ...overrides } as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return snapshot;
};

export const initNotificationsConfig = (
  overrides?: Partial<Record<string, string | undefined>>,
): EnvSnapshot => {
  ConfigService.clearInstanceForTest();
  const snapshot = applyEnv(overrides);
  ConfigService.fromEnv();
  return snapshot;
};

export const resetNotificationsConfig = (snapshot: EnvSnapshot): void => {
  ConfigService.clearInstanceForTest();
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};
