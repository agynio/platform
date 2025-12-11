import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import nock from 'nock';
import * as fsPromises from 'fs/promises';
import { join } from 'path';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const BASE_URL = 'http://litellm.local';
const SERVICE_ALIAS = 'agents-service';

function createConfig(): ConfigService {
  const parsed = configSchema.parse({
    agentsDatabaseUrl: 'postgres://user:pass@localhost:5432/agents',
    litellmBaseUrl: BASE_URL,
    litellmMasterKey: 'master-key',
  });
  return new ConfigService().init(parsed);
}

describe('LiteLLMProvisioner (stateless tokens)', () => {
  let config: ConfigService;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    config = createConfig();
    delete process.env.LITELLM_MODELS;
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('deletes existing alias before generating a new key', async () => {
    const provisioner = new LiteLLMProvisioner(config);
    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', {
        key_alias: SERVICE_ALIAS,
        models: ['all-team-models'],
      })
      .reply(200, { key: 'sk-generated' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-generated');
    expect(result.baseUrl).toBe(`${BASE_URL}/v1`);
    expect(scope.isDone()).toBe(true);
  });

  it('proceeds with key generation when delete fails', async () => {
    const provisioner = new LiteLLMProvisioner(config);
    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(500, { error: 'boom' })
      .post('/key/generate', {
        key_alias: SERVICE_ALIAS,
        models: ['all-team-models'],
      })
      .reply(200, { key: 'sk-generated' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-generated');
    expect(scope.isDone()).toBe(true);
  });

  it('throws when key generation fails', async () => {
    const provisioner = new LiteLLMProvisioner(config);
    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', {
        key_alias: SERVICE_ALIAS,
        models: ['all-team-models'],
      })
      .reply(500, { error: 'fail' });

    await expect((provisioner as any).fetchOrCreateKeysInternal()).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });

  it('uses custom model list from environment when provided', async () => {
    process.env.LITELLM_MODELS = 'gpt-4o-mini, gpt-4.1-mini';
    const provisioner = new LiteLLMProvisioner(config);

    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', {
        key_alias: SERVICE_ALIAS,
        models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      })
      .reply(200, { key: 'sk-custom-models' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-custom-models');
    expect(scope.isDone()).toBe(true);
  });

  it('does not touch the filesystem when provisioning keys', async () => {
    const tokenPath = join(
      process.cwd(),
      'packages/platform-server/config/secrets/litellm/service_token.json',
    );
    await fsPromises.rm(tokenPath, { force: true });
    const provisioner = new LiteLLMProvisioner(config);

    nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', {
        key_alias: SERVICE_ALIAS,
        models: ['all-team-models'],
      })
      .reply(200, { key: 'sk-memory-only' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();
    expect(result.apiKey).toBe('sk-memory-only');
    await expect(fsPromises.access(tokenPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans up alias on every startup to avoid accumulation', async () => {
    const provisioner = new LiteLLMProvisioner(config);

    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', { key_alias: SERVICE_ALIAS, models: ['all-team-models'] })
      .reply(200, { key: 'sk-first' })
      .post('/key/delete', { key_aliases: [SERVICE_ALIAS] })
      .reply(200, {})
      .post('/key/generate', { key_alias: SERVICE_ALIAS, models: ['all-team-models'] })
      .reply(200, { key: 'sk-second' });

    const first = await (provisioner as any).fetchOrCreateKeysInternal();
    const second = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(first.apiKey).toBe('sk-first');
    expect(second.apiKey).toBe('sk-second');
    expect(scope.isDone()).toBe(true);
  });
});
