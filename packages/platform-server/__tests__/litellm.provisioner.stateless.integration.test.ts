import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { LiteLLMAdminClient } from '../src/llm/provisioners/litellm.admin-client';
import { ConfigService } from '../src/core/services/config.service';

vi.mock('../src/llm/provisioners/litellm.admin-client');

describe('LiteLLMProvisioner stateless integration', () => {
  const baseUrl = 'https://litellm.example';
  const createConfig = () => ({
    litellmBaseUrl: baseUrl,
    litellmMasterKey: 'master-key',
  }) as unknown as ConfigService;

  beforeEach(() => {
    (LiteLLMAdminClient as unknown as vi.Mock).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const initConfig = () => createConfig();

  it('deletes existing alias before generating a new key', async () => {
    const deleteByAlias = vi.fn(async () => {});
    const generateKey = vi.fn(async () => ({ key: 'sk-generated' }));

    (LiteLLMAdminClient as unknown as vi.Mock).mockImplementation(() => ({
      deleteByAlias,
      generateKey,
    }));

    const provisioner = new LiteLLMProvisioner(initConfig());
    const result = await (provisioner as any).provisionLiteLLMToken();

    expect(deleteByAlias).toHaveBeenCalledWith('agents-service');
    expect(generateKey).toHaveBeenCalledWith({
      alias: 'agents-service',
      models: ['all-team-models'],
    });
    expect(result).toEqual({ apiKey: 'sk-generated', baseUrl: `${baseUrl}/v1` });
  });

  it('logs and continues when alias deletion fails', async () => {
    const deleteByAlias = vi.fn(async () => {
      throw new Error('not found');
    });
    const generateKey = vi.fn(async () => ({ key: 'sk-generated' }));
    (LiteLLMAdminClient as unknown as vi.Mock).mockImplementation(() => ({
      deleteByAlias,
      generateKey,
    }));

    const provisioner = new LiteLLMProvisioner(initConfig());
    const warnSpy = vi.spyOn((provisioner as any).logger, 'warn').mockImplementation(() => {});
    const result = await (provisioner as any).provisionLiteLLMToken();

    expect(deleteByAlias).toHaveBeenCalled();
    expect(generateKey).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(result.apiKey).toBe('sk-generated');
  });
});
