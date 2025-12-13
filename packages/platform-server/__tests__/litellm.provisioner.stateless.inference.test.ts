import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const responseMessage = {
    output: [
      {
        id: 'msg-1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: 'hello',
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
    },
  };

  const responsesCreate = vi.fn(async () => responseMessage);
  const openAICalls: Array<{ apiKey: string; baseURL: string }> = [];

  return { responseMessage, responsesCreate, openAICalls };
});

vi.mock('openai', () => ({
  default: vi.fn((options: { apiKey: string; baseURL: string }) => {
    hoisted.openAICalls.push(options);
    return { responses: { create: hoisted.responsesCreate } };
  }),
}));

import OpenAI from 'openai';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { ConfigService } from '../src/core/services/config.service';

const mockedOpenAI = vi.mocked(OpenAI);

const createConfig = (overrides: Partial<Record<'litellmBaseUrl' | 'litellmMasterKey', string | undefined>> = {}) => ({
  litellmBaseUrl: overrides.litellmBaseUrl,
  litellmMasterKey: overrides.litellmMasterKey,
}) as unknown as ConfigService;

describe('LiteLLMProvisioner inference integration', () => {
  beforeEach(() => {
    hoisted.responsesCreate.mockClear();
    mockedOpenAI.mockClear();
    hoisted.openAICalls.length = 0;
  });

  it('deletes by alias, generates key, and builds inference client against base /v1', async () => {
    const fetchCalls: Array<{ url: string; headers: Headers; body: unknown }> = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input.toString();
      const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
      const authorization = headers.get('authorization');
      if (authorization !== 'Bearer master-key') {
        return new Response('missing auth', { status: 401 });
      }

      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, headers, body });

      if (url.endsWith('/key/delete')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url.endsWith('/key/generate')) {
        return new Response(JSON.stringify({ key: 'sk-generated' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('unexpected url', { status: 500 });
    });

    const provisioner = new LiteLLMProvisioner(
      createConfig({ litellmBaseUrl: 'https://litellm.example/v1///', litellmMasterKey: 'master-key' }),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    const llm = await provisioner.getLLM();
    const response = await llm.call({ model: 'gpt-4o-mini', input: [] });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchCalls[0]?.url).toBe('https://litellm.example/key/delete');
    expect(fetchCalls[1]?.url).toBe('https://litellm.example/key/generate');
    expect(mockedOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-generated', baseURL: 'https://litellm.example/v1' });
    expect(hoisted.openAICalls[0]).toEqual({ apiKey: 'sk-generated', baseURL: 'https://litellm.example/v1' });
    expect(hoisted.responsesCreate).toHaveBeenCalledWith({ model: 'gpt-4o-mini', input: [], tools: undefined });
    expect(response.text).toBe('hello');
  });

  it('fails fast when master key is blank', async () => {
    const provisioner = new LiteLLMProvisioner(
      createConfig({ litellmBaseUrl: 'https://litellm.example', litellmMasterKey: '   ' }),
    );

    await expect(provisioner.getLLM()).rejects.toThrow('LiteLLM master key is required');
  });
});
