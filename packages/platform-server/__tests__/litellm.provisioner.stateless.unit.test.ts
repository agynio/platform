import { describe, expect, it, vi } from 'vitest';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { ConfigService } from '../src/core/services/config.service';

const createConfig = (overrides: Partial<Record<'litellmBaseUrl' | 'litellmMasterKey', string | undefined>> = {}) => ({
  litellmBaseUrl: overrides.litellmBaseUrl,
  litellmMasterKey: overrides.litellmMasterKey,
}) as unknown as ConfigService;

const createConfigWithDefaults = (
  overrides: Partial<Record<'litellmBaseUrl' | 'litellmMasterKey', string | undefined>> = {},
) =>
  createConfig({
    litellmBaseUrl: overrides.litellmBaseUrl ?? 'https://litellm.example',
    litellmMasterKey: overrides.litellmMasterKey ?? 'master-key',
  });

describe('LiteLLMProvisioner stateless behavior', () => {
  it('throws when configuration missing', async () => {
    const config = createConfig();
    (config as any).litellmBaseUrl = undefined;
    (config as any).litellmMasterKey = undefined;
    const provisioner = new LiteLLMProvisioner(config);
    await expect((provisioner as any).fetchOrCreateKeysInternal()).rejects.toThrow('LiteLLM configuration missing');
  });

  it('sanitizes base URL before provisioning', async () => {
    const config = createConfigWithDefaults({ litellmBaseUrl: 'https://litellm.example/v1///' });
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith('/key/delete')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ key: 'sk-test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const provisioner = new LiteLLMProvisioner(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const adminSpy = vi.spyOn<any, any>(provisioner, 'createAdminClient');

    const result = await (provisioner as any).provisionLiteLLMToken();

    expect(adminSpy).toHaveBeenCalledWith('https://litellm.example', 'master-key');
    expect(result.baseUrl).toBe('https://litellm.example/v1');
  });

  it('parses model list from env and falls back to default', async () => {
    const config = createConfigWithDefaults();
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith('/key/delete')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ key: 'sk-generated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provisioner = new LiteLLMProvisioner(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const modelsSpy = vi.spyOn<any, any>(provisioner, 'parseModels');

    process.env.LITELLM_MODELS = 'gpt-4o-mini, gpt-4o';
    await (provisioner as any).provisionLiteLLMToken();
    expect(modelsSpy).toHaveReturnedWith(['gpt-4o-mini', 'gpt-4o']);

    delete process.env.LITELLM_MODELS;
    await (provisioner as any).provisionLiteLLMToken();
    expect(modelsSpy).toHaveReturnedWith(['all-team-models']);
  });

  it('returns cached LLM instance on subsequent getLLM calls', async () => {
    const config = createConfigWithDefaults();
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith('/key/delete')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ key: 'sk-generated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provisioner = new LiteLLMProvisioner(config, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = await provisioner.getLLM();
    const second = await provisioner.getLLM();

    expect(first).toBe(second);
  });
});
