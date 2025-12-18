import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { LLMModule } from '../../src/llm/llm.module';
import { LiteLLMProvisioner } from '../../src/llm/provisioners/litellm.provisioner';
import { LiteLLMKeyStore } from '../../src/llm/provisioners/litellm.key.store';
import { ConfigService } from '../../src/core/services/config.service';

const respondJson = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

describe('LiteLLMProvisioner bootstrap (DI smoke)', () => {
  const requiredEnv: Record<string, string> = {
    LLM_PROVIDER: 'litellm',
    LITELLM_BASE_URL: 'http://127.0.0.1:4000',
    LITELLM_MASTER_KEY: 'sk-test',
    AGENTS_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agents_test',
  };

  beforeEach(() => {
    ConfigService.clearInstanceForTest();
    for (const [key, value] of Object.entries(requiredEnv)) {
      process.env[key] = value;
    }
    ConfigService.fromEnv();
  });

  afterEach(() => {
    ConfigService.clearInstanceForTest();
    for (const key of Object.keys(requiredEnv)) {
      delete process.env[key];
    }
    vi.restoreAllMocks();
  });

  it('initializes through Nest DI with mocked LiteLLM admin', async () => {
    const keyStoreMock: LiteLLMKeyStore = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as LiteLLMKeyStore;

    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const fetchMock: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/key/delete')) {
        return respondJson({ deleted_keys: [] });
      }
      if (url.endsWith('/key/generate')) {
        return respondJson({ key: 'sk-litellm', expires: expiresAt });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const originalFetch = globalThis.fetch;
    // Ensure provisioner captures the stubbed fetch implementation during construction
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock;

    try {
      const testingModule = await Test.createTestingModule({
        imports: [LLMModule],
      })
        .overrideProvider(LiteLLMKeyStore)
        .useValue(keyStoreMock)
        .compile();

      const provisioner = testingModule.get(LiteLLMProvisioner);
      await expect(provisioner.init()).resolves.toBeUndefined();
      expect(keyStoreMock.save).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/key/generate'), expect.anything());

      await testingModule.close();
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
