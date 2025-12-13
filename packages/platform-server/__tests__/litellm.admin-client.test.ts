import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMAdminClient, LiteLLMAdminHttpError, LiteLLMAdminTimeoutError } from '../src/llm/provisioners/litellm.admin-client';
import type { Logger } from '@nestjs/common';

type FetchCall = [Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]];

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers,
  });
};

const textResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    status: init.status ?? 200,
  });

const createAbortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

const createLogger = () => ({
  debug: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
} as unknown as Logger);

interface ClientHarnessOptions {
  responses?: Array<
    | Response
    | ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Response | Promise<Response>)
    | Error
  >;
  clientOptions?: Partial<{ maxAttempts: number; baseDelayMs: number; logger: Logger }>;
  masterKey?: string;
  baseUrl?: string;
}

const createClient = (options: ClientHarnessOptions = {}) => {
  const queue = [...(options.responses ?? [])];
  const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (queue.length === 0) {
      throw new Error('No queued response');
    }
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') {
      const value = next(input, init);
      return value instanceof Promise ? await value : value;
    }
    return next;
  });

  const logger = options.clientOptions?.logger ?? createLogger();
  const client = new LiteLLMAdminClient(options.masterKey ?? 'master-key', options.baseUrl ?? 'https://litellm.example', {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    maxAttempts: options.clientOptions?.maxAttempts ?? 3,
    baseDelayMs: options.clientOptions?.baseDelayMs ?? 1,
    logger,
  });

  return { client, fetchImpl, logger };
};

const getRequestPayload = (call: FetchCall | undefined) => {
  const body = call?.[1]?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
};

describe('LiteLLMAdminClient', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleDebug = console.debug;

  beforeEach(() => {
    console.debug = vi.fn();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
    console.debug = originalConsoleDebug;
    vi.restoreAllMocks();
  });

  it('normalizes base URL for admin requests', async () => {
    const { client, fetchImpl } = createClient({
      baseUrl: 'https://litellm.example/v1///',
      responses: [jsonResponse({}, { status: 404 })],
    });

    await expect(client.validateKey('sk-alias', 1000)).resolves.toBe(false);

    const [url, init] = fetchImpl.mock.calls[0] as FetchCall;
    expect(url).toBe('https://litellm.example/key/info?key=sk-alias');
    expect(init?.method).toBe('GET');
  });

  describe('key validation and deletion', () => {
    it('returns true for valid keys', async () => {
      const { client } = createClient({ responses: [jsonResponse({}, { status: 200 })] });
      await expect(client.validateKey('sk-valid', 1000)).resolves.toBe(true);
    });

    it('returns false for invalid keys', async () => {
      const { client } = createClient({ responses: [jsonResponse({}, { status: 400 })] });
      await expect(client.validateKey('sk-invalid', 1000)).resolves.toBe(false);
    });

    it('returns early when deleting zero keys', async () => {
      const { client, fetchImpl } = createClient();
      await client.deleteKeys([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('posts sanitized payload when deleting keys', async () => {
      const { client, fetchImpl } = createClient({ responses: [jsonResponse({}, { status: 200 })] });
      await client.deleteKeys(['first', 'second']);
      const payload = getRequestPayload(fetchImpl.mock.calls[0] as FetchCall);
      expect(payload).toEqual({ keys: ['first', 'second'] });
    });

    it('sends alias payload when deleting by alias', async () => {
      const { client, fetchImpl } = createClient({ responses: [jsonResponse({}, { status: 200 })] });
      await client.deleteByAlias('agents-service');
      const payload = getRequestPayload(fetchImpl.mock.calls[0] as FetchCall);
      expect(payload).toEqual({ key_aliases: ['agents-service'] });
    });
  });

  describe('team management', () => {
    it('returns undefined when team not found by id', async () => {
      const { client } = createClient({ responses: [jsonResponse({}, { status: 404 })] });
      await expect(client.fetchTeamById('team-1')).resolves.toBeUndefined();
    });

    it('parses direct team payloads', async () => {
      const { client } = createClient({ responses: [jsonResponse({ team_id: 'team-2', team_alias: 'agents' })] });
      await expect(client.fetchTeamById('team-2')).resolves.toEqual({ id: 'team-2', alias: 'agents' });
    });

    it('parses wrapped team payloads', async () => {
      const { client } = createClient({ responses: [jsonResponse({ team: { team_id: 'team-3', team_alias: 'alias' } })] });
      await expect(client.fetchTeamByAlias('alias')).resolves.toEqual({ id: 'team-3', alias: 'alias' });
    });

    it('creates a new team when no conflict', async () => {
      const { client } = createClient({ responses: [jsonResponse({ team_id: 'team-4', team_alias: 'agents' })] });
      await expect(client.createTeam('agents')).resolves.toEqual({ id: 'team-4', alias: 'agents' });
    });

    it('reuses existing team when alias conflict occurs', async () => {
      const { client } = createClient({
        responses: [
          jsonResponse({}, { status: 409 }),
          jsonResponse({ team: { team_id: 'team-5', team_alias: 'agents' } }),
        ],
      });
      await expect(client.createTeam('agents')).resolves.toEqual({ id: 'team-5', alias: 'agents' });
    });

    it('throws when alias conflict cannot be resolved', async () => {
      const { client } = createClient({ responses: [jsonResponse({}, { status: 409 }), jsonResponse({}, { status: 404 })] });
      await expect(client.createTeam('agents')).rejects.toThrow('litellm_team_exists_but_unreadable');
    });
  });

  describe('key generation', () => {
    it('trims optional parameters and returns parsed key', async () => {
      const { client, fetchImpl } = createClient({ responses: [jsonResponse({ key: 'sk', id: 'id', team_id: 'tid' })] });
      await expect(
        client.generateKey({ alias: 'agents', models: ['m1'], teamId: ' team ', duration: ' 30m ' }),
      ).resolves.toEqual({ key: 'sk', id: 'id', teamId: 'tid' });
      const payload = getRequestPayload(fetchImpl.mock.calls[0] as FetchCall);
      expect(payload).toEqual({ key_alias: 'agents', models: ['m1'], team_id: 'team', duration: '30m' });
    });

    it('omits optional fields when blank', async () => {
      const { client, fetchImpl } = createClient({ responses: [jsonResponse({ key: 'sk2' })] });
      await client.generateKey({ alias: 'agents', models: ['m1'], teamId: '   ', duration: '' });
      const payload = getRequestPayload(fetchImpl.mock.calls[0] as FetchCall);
      expect(payload).toEqual({ key_alias: 'agents', models: ['m1'] });
    });

    it('redacts master key from debug logs', async () => {
      process.env.NODE_ENV = 'development';
      const { client } = createClient({ responses: [jsonResponse({ key: 'sk3' })], masterKey: 'super-secret' });
      await client.generateKey({ alias: 'agents', models: ['m1'] });
      expect(console.debug).toHaveBeenCalled();
      for (const call of (console.debug as unknown as vi.Mock).mock.calls) {
        expect(JSON.stringify(call)).not.toContain('super-secret');
      }
    });

    it('logs skip message in production', async () => {
      process.env.NODE_ENV = 'production';
      const { client } = createClient({ responses: [jsonResponse({ key: 'sk' })] });
      await client.generateKey({ alias: 'agents', models: ['m1'] });
      expect(console.debug).toHaveBeenCalledWith('[LiteLLM admin skipped logging in production]', expect.any(Object));
    });
  });

  describe('request error handling', () => {
    it('retries once on server error before succeeding', async () => {
      const logger = createLogger();
      const { client, fetchImpl } = createClient({
        clientOptions: { logger, maxAttempts: 3 },
        responses: [textResponse('nope', { status: 500 }), jsonResponse({ key: 'sk' })],
      });
      await client.generateKey({ alias: 'agents', models: ['m1'] });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('retrying'));
    });

    it('throws LiteLLMAdminHttpError on client error', async () => {
      const { client } = createClient({ responses: [textResponse('denied', { status: 403 })] });
      await expect(client.generateKey({ alias: 'agents', models: ['m1'] })).rejects.toBeInstanceOf(LiteLLMAdminHttpError);
    });

    it('translates abort errors into timeout errors', async () => {
      const { client } = createClient({ clientOptions: { maxAttempts: 1 }, responses: [createAbortError()] });
      await expect(client.validateKey('sk', 10)).rejects.toBeInstanceOf(LiteLLMAdminTimeoutError);
    });

    it('rethrows last error after exhausting retries', async () => {
      const error = new Error('network down');
      const logger = createLogger();
      const { client } = createClient({ clientOptions: { maxAttempts: 2, logger }, responses: [error, error] });
      await expect(client.validateKey('sk', 10)).rejects.toThrow('network down');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('internal helpers', () => {
    it('sanitizes nested payloads by removing nullish values', async () => {
      const { client, fetchImpl } = createClient({ responses: [jsonResponse({ ok: true })] });
      await (client as any).request('POST', 'key/delete', {
        body: { outer: null, nested: { keep: 'value', drop: undefined }, array: ['a', null, 'b'] },
      });
      const payload = getRequestPayload(fetchImpl.mock.calls[0] as FetchCall);
      expect(payload).toEqual({ nested: { keep: 'value' }, array: ['a', 'b'] });
    });

    it('throws when team payload invalid', () => {
      const { client } = createClient();
      expect(() => (client as any).parseTeam({ status: 200, json: { nope: true } })).toThrow('litellm_invalid_team_response');
    });

    it('returns status when json parsing fails', async () => {
      const { client } = createClient();
      const failing = {
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
        json: async () => {
          throw new Error('bad');
        },
      } as unknown as Response;
      await expect((client as any).toRawResponse(failing)).resolves.toEqual({ status: 200 });
    });

    it('returns text payload for non-json responses', async () => {
      const { client } = createClient();
      await expect((client as any).toRawResponse(textResponse('hello', { status: 202 }))).resolves.toEqual({
        status: 202,
        text: 'hello',
      });
    });

    it('safeText returns empty string when response.text throws', async () => {
      const { client } = createClient();
      const response = { text: async () => Promise.reject(new Error('boom')) } as unknown as Response;
      await expect((client as any).safeText(response)).resolves.toBe('');
    });

    it('toErrorMessage formats inputs consistently', () => {
      const { client } = createClient();
      expect((client as any).toErrorMessage(new Error('bad'))).toBe('bad');
      expect((client as any).toErrorMessage('bad-str')).toBe('bad-str');
      expect((client as any).toErrorMessage({ code: 1 })).toBe('{"code":1}');
    });
  });
});
