import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '../src/services/config.service';
import type { LoggerService } from '../src/services/logger.service';
import { maybeProvisionLiteLLMKey, configureOpenAIEnvFromLiteLLM } from '../src/services/litellm.provision';

const logger: Pick<LoggerService, 'info' | 'error' | 'debug'> = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('LiteLLM provisioning helper', () => {
  const OG_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...OG_ENV };
  });

  afterEach(() => {
    process.env = OG_ENV;
  });

  const cfg = (over: Partial<NodeJS.ProcessEnv> = {}) => {
    const env = {
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY: 'x',
      GITHUB_INSTALLATION_ID: '2',
      GH_TOKEN: 't',
      MONGODB_URL: 'mongodb://example/db',
      ...over,
    } as NodeJS.ProcessEnv;
    process.env = { ...process.env, ...env };
    return ConfigService.fromEnv();
  };

  it('bypass when OPENAI_API_KEY present', async () => {
    const c = cfg({ OPENAI_API_KEY: 'sk-existing', LITELLM_BASE_URL: 'http://x', LITELLM_MASTER_KEY: 'sk-master' });
    const spy = vi.spyOn(globalThis, 'fetch' as any);
    const res = await maybeProvisionLiteLLMKey(c, logger as any);
    expect(res).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('success path provisions and sets env', async () => {
    const c = cfg({ LITELLM_BASE_URL: 'http://litellm:4000', LITELLM_MASTER_KEY: 'sk-master' });
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ key: 'sk-virtual-123' }), { status: 200, headers: { 'content-type': 'application/json' } }) as any,
    );
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    const res = await configureOpenAIEnvFromLiteLLM(c, logger as any);
    expect(res.apiKey).toBe('sk-virtual-123');
    expect(res.baseUrl).toBe('http://litellm:4000/v1');
    expect(process.env.OPENAI_API_KEY).toBe('sk-virtual-123');
    expect(process.env.OPENAI_BASE_URL).toBe('http://litellm:4000/v1');
  });

  it('failure path throws with status code', async () => {
    const c = cfg({ LITELLM_BASE_URL: 'http://litellm:4000', LITELLM_MASTER_KEY: 'sk-master' });
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }) as any);
    await expect(maybeProvisionLiteLLMKey(c, logger as any)).rejects.toThrow(/litellm_provision_failed_401/);
  });
});

