import { describe, expect, it, vi } from 'vitest';
import { LiteLLMAdminClient } from '../src/llm/provisioners/litellm.admin-client';
import type { Logger } from '@nestjs/common';

const createLogger = () => ({
  debug: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}) as unknown as Logger;

describe('LiteLLMAdminClient authentication', () => {
  it('throws when master key is blank', () => {
    expect(
      () =>
        new LiteLLMAdminClient('   ', 'https://litellm.example', {
          fetchImpl: vi.fn() as unknown as typeof fetch,
          logger: createLogger(),
          maxAttempts: 1,
          baseDelayMs: 1,
        }),
    ).toThrowError('LiteLLM master key is required');
  });

  it('sends authorization header against normalized admin base URL', async () => {
    const responses: Response[] = [
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input.toString();
      const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer master-key');
      expect(url).toBe('https://litellm.example/key/delete');
      return responses.shift() as Response;
    });

    const client = new LiteLLMAdminClient('master-key', 'https://litellm.example/v1///', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: createLogger(),
      maxAttempts: 1,
      baseDelayMs: 1,
    });

    await client.deleteByAlias('agents-service');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
