import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { ConfigService, configSchema, type Config } from '../src/core/services/config.service';
import type { LiteLLMKeyStore, PersistedLiteLLMKey } from '../src/llm/provisioners/litellm.key.store';
import { HumanMessage } from '@agyn/llm';
import { runnerConfigDefaults } from './helpers/config';

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

const parseJsonBody = (init?: RequestInit): Record<string, unknown> | null => {
  if (!init?.body) return null;
  try {
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const respondDelete = (init: RequestInit | undefined, deleteResponses: Response[]) => {
  const body = parseJsonBody(init);
  if (body && Array.isArray(body.key_aliases)) {
    return respondJson({ deleted_aliases: body.key_aliases });
  }
  const next = deleteResponses.shift();
  if (!next) throw new Error('Missing delete response');
  return next;
};

const baseConfig = (overrides: Partial<Config> = {}): ConfigService => {
  const params: Partial<Config> = {
    llmProvider: 'litellm',
    litellmBaseUrl: 'http://litellm.local:4000',
    litellmMasterKey: 'sk-master',
    agentsDatabaseUrl: 'postgres://dev:dev@localhost:5432/agents',
    ...runnerConfigDefaults,
    litellmKeyAlias: 'agents/unit-test',
    ...overrides,
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
    process.env.LITELLM_KEY_ALIAS = 'agents/unit-test';
  });

  afterEach(() => {
    delete process.env.LITELLM_KEY_ALIAS;
  });

  it('revokes persisted key on startup and stores newly issued key', async () => {
    const store = new InMemoryKeyStore({ alias: 'agents/unit-test', key: 'sk-old', expiresAt: null });
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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

  it('passes configured alias, duration, and models when generating keys', async () => {
    const store = new InMemoryKeyStore();
    const expires = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        return respondJson({ key: 'sk-config', expires });
      }
      if (url.endsWith('/key/delete')) {
        return respondJson({ deleted_keys: [] });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(
      baseConfig({
        litellmKeyAlias: 'agents/custom',
        litellmKeyDuration: '45m',
        litellmModels: ['gpt-4o', 'claude-4.1'],
      }),
      store,
      fetchMock as unknown as typeof fetch,
    );
    await provisioner.init();

    const generateCall = fetchMock.mock.calls.find(([arg]) => getUrl(arg as RequestInfo | URL).endsWith('/key/generate'));
    expect(generateCall).toBeDefined();
    const requestInit = generateCall?.[1] as RequestInit;
    expect(requestInit?.body).toBeDefined();
    const parsedBody = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(parsedBody.key_alias).toBe('agents/custom');
    expect(parsedBody.duration).toBe('45m');
    expect(parsedBody.models).toEqual(['gpt-4o', 'claude-4.1']);

    await provisioner.teardown();
  });

  it('clears alias conflicts and provisions a new key', async () => {
    const store = new InMemoryKeyStore();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    let generateCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        generateCount += 1;
        if (generateCount === 1) {
          return respondStatus(400, 'Alias already exists');
        }
        return respondJson({ key: 'sk-recovered', expires });
      }
      if (url.endsWith('/key/delete')) {
        return respondDelete(init, [respondJson({ deleted_aliases: ['agents/unit-test'] })]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const provisioner = new LiteLLMProvisioner(baseConfig(), store, fetchMock as unknown as typeof fetch);
    await provisioner.init();

    const requestUrls = fetchMock.mock.calls.map(([arg]) => getUrl(arg as RequestInfo | URL));
    const generateIndices = requestUrls
      .map((url, index) => (url.endsWith('/key/generate') ? index : -1))
      .filter((index) => index >= 0);
    const deleteIndices = requestUrls
      .map((url, index) => (url.endsWith('/key/delete') ? index : -1))
      .filter((index) => index >= 0);

    expect(generateIndices).toHaveLength(2);
    expect(deleteIndices.length).toBeGreaterThanOrEqual(2);
    const aliasCleanupIndex = deleteIndices[deleteIndices.length - 1] ?? -1;
    expect(aliasCleanupIndex).toBeGreaterThan(generateIndices[0] ?? -1);
    expect(aliasCleanupIndex).toBeLessThan(generateIndices[1] ?? Number.MAX_SAFE_INTEGER);

    const deleteCall = fetchMock.mock.calls[aliasCleanupIndex];
    const deleteBody = parseJsonBody(deleteCall?.[1] as RequestInit | undefined);
    expect(deleteBody?.key_aliases).toEqual(['agents/unit-test']);
    expect(store.current?.key).toBe('sk-recovered');

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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        return respondDelete(init, deleteResponses);
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

    const deleteCall = fetchMock.mock.calls.find(([, init]) => {
      const body = parseJsonBody(init as RequestInit | undefined);
      return Array.isArray(body?.keys);
    });
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        return respondDelete(init, deleteResponses);
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

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getUrl(input);
      if (url.endsWith('/key/generate')) {
        const next = generateResponses.shift();
        if (!next) throw new Error('Missing generate response');
        return next;
      }
      if (url.endsWith('/key/delete')) {
        return respondDelete(init, deleteResponses);
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
