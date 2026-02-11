import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { ConfigService, configSchema, type Config } from '../src/core/services/config.service';
import type { LiteLLMKeyStore, PersistedLiteLLMKey } from '../src/llm/provisioners/litellm.key.store';
import { HumanMessage } from '@agyn/llm';

class InMemoryKeyStore implements LiteLLMKeyStore {
  private snapshot: PersistedLiteLLMKey | null;

  constructor(initial?: PersistedLiteLLMKey | null) {
    this.snapshot = initial ?? null;
  }

  async load(alias: string): Promise<PersistedLiteLLMKey | null> {
    return this.snapshot && this.snapshot.alias === alias ? { ...this.snapshot } : null;
  }

  async save(record: PersistedLiteLLMKey): Promise<void> {
    this.snapshot = { ...record };
  }

  async delete(alias: string): Promise<void> {
    if (this.snapshot?.alias === alias) {
      this.snapshot = null;
    }
  }

  get current(): PersistedLiteLLMKey | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }
}

const respondJson = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });

const respondStatus = (status: number, body = '') => new Response(body, { status });

const baseConfig = (): ConfigService => {
  const params: Partial<Config> = {
    litellmBaseUrl: 'http://litellm.local:4000',
    litellmMasterKey: 'sk-master',
    agentsDatabaseUrl: 'postgres://dev:dev@localhost:5432/agents',
  };
  return new ConfigService().init(configSchema.parse(params));
};

const getUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
};

describe('LiteLLMProvisioner', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('revokes persisted key on startup and stores newly issued key', async () => {
    const store = new InMemoryKeyStore({ alias: 'agyn_key', key: 'sk-old', expiresAt: null });
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrl(input);
      if (url.endsWith('/key/delete')) {
        return respondJson({ deleted_keys: ['sk-old'] });
      }
      if (url.endsWith('/key/generate')) {
        return respondJson({ key: 'sk-new', expires });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(baseConfig(), store, fetchMock as unknown as typeof fetch);
    await provisioner.init();

    const deleteCall = fetchMock.mock.calls.find(([arg]) => getUrl(arg as RequestInfo | URL).endsWith('/key/delete'));
    expect(deleteCall?.[1]).toMatchObject({ body: JSON.stringify({ keys: ['sk-old'] }) });

    const generateCalls = fetchMock.mock.calls.filter(([arg]) =>
      getUrl(arg as RequestInfo | URL).endsWith('/key/generate'),
    );
    expect(generateCalls.length).toBeGreaterThanOrEqual(1);
    expect(store.current?.key).toBe('sk-new');
    await provisioner.teardown();
  });

  it('refreshes the virtual key before expiry and revokes the previous key', async () => {
    vi.useFakeTimers();
    const now = new Date('2025-01-01T00:00:00.000Z');
    vi.setSystemTime(now);
    const store = new InMemoryKeyStore();
    const generateResponses = [
      respondJson({ key: 'sk-one', expires: new Date(now.getTime() + 10 * 60 * 1000).toISOString() }),
      respondJson({ key: 'sk-two', expires: new Date(now.getTime() + 20 * 60 * 1000).toISOString() }),
    ];
    const deleteResponses = [respondJson({ deleted_keys: ['sk-one'] })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        const next = deleteResponses.shift();
        if (!next) throw new Error('Missing delete response');
        return next;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(baseConfig(), store, fetchMock as unknown as typeof fetch);
    await provisioner.init();

    // Advance past the 5 minute refresh lead time.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    const generateCalls = fetchMock.mock.calls.filter(([arg]) =>
      getUrl(arg as RequestInfo | URL).endsWith('/key/generate'),
    );
    expect(generateCalls.length).toBe(2);

    const deleteCall = fetchMock.mock.calls.find(([arg]) => getUrl(arg as RequestInfo | URL).endsWith('/key/delete'));
    expect(deleteCall?.[1]).toMatchObject({ body: JSON.stringify({ keys: ['sk-one'] }) });
    expect(store.current?.key).toBe('sk-two');

    await provisioner.teardown();
  });

  it('reprovisions once on 401 and retries the original OpenAI call', async () => {
    const store = new InMemoryKeyStore();
    const messages = [HumanMessage.fromText('hello world')];
    const responsePayload = {
      id: 'resp-1',
      object: 'response',
      created: 0,
      model: 'gpt-test',
      output: [
        {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'all good' }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };

    const generateResponses = [
      respondJson({ key: 'sk-initial', expires: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      respondJson({ key: 'sk-refreshed', expires: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    ];
    const deleteResponses = [respondJson({ deleted_keys: ['sk-initial'] })];
    let llmRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        const next = deleteResponses.shift();
        if (!next) throw new Error('Missing delete response');
        return next;
      }
      if (url.endsWith('/v1/responses')) {
        llmRequestCount += 1;
        if (llmRequestCount === 1) {
          return respondStatus(401, 'expired');
        }
        return respondJson(responsePayload);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(baseConfig(), store, fetchMock as unknown as typeof fetch);
    await provisioner.init();

    const llm = await provisioner.getLLM();
    const response = await llm.call({ model: 'gpt-test', input: messages });

    expect(response.text).toBe('all good');
    expect(llmRequestCount).toBe(2);
    expect(store.current?.key).toBe('sk-refreshed');
    await provisioner.teardown();
  });

  it('keeps retrying scheduled refresh when LiteLLM is unavailable', async () => {
    vi.useFakeTimers();
    const now = new Date('2025-01-01T00:00:00.000Z');
    vi.setSystemTime(now);
    const store = new InMemoryKeyStore();
    const generateResponses = [
      respondJson({ key: 'sk-first', expires: new Date(now.getTime() + 10 * 60 * 1000).toISOString() }),
      respondStatus(500, 'down'),
      respondStatus(500, 'down'),
      respondStatus(500, 'down'),
      respondJson({ key: 'sk-recovered', expires: new Date(now.getTime() + 20 * 60 * 1000).toISOString() }),
    ];
    const deleteResponses = [respondJson({ deleted_keys: ['sk-first'] })];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        const next = deleteResponses.shift();
        if (!next) throw new Error('Missing delete response');
        return next;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(baseConfig(), store, fetchMock as unknown as typeof fetch);
    await provisioner.init();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(store.current?.key).toBe('sk-first');

    await vi.advanceTimersByTimeAsync(15_000 + 10);

    expect(store.current?.key).toBe('sk-recovered');
    await provisioner.teardown();
  });
});
