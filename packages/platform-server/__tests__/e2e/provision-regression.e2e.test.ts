import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMProvisioner } from '../../src/llm/provisioners/litellm.provisioner';
import { ConfigService, configSchema } from '../../src/core/services/config.service';

const BASE_URL = 'http://litellm.local';
const SERVICE_ALIAS = 'agents-service';

describe('Provisioning regression guard (stateless flow)', () => {
  const requests: { path: string; body?: unknown }[] = [];
  let fetchImpl: ReturnType<typeof vi.fn>;

  const createConfig = (): ConfigService => {
    const parsed = configSchema.parse({
      agentsDatabaseUrl: 'postgres://user:pass@localhost:5432/agents',
      litellmBaseUrl: BASE_URL,
      litellmMasterKey: 'master-key',
    });
    const service = new ConfigService();
    return service.init(parsed);
  };

  beforeEach(() => {
    requests.length = 0;
    let generateCount = 0;
    fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path: url.pathname, body });

      if (url.pathname === '/key/delete') {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url.pathname === '/key/generate') {
        generateCount += 1;
        return new Response(JSON.stringify({ key: `sk-${generateCount}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected request ${url.pathname}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs delete + generate on each boot without null payload fields', async () => {
    const config = createConfig();

    const firstProvisioner = new LiteLLMProvisioner(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await (firstProvisioner as any).fetchOrCreateKeysInternal();
    expect(first.apiKey).toBe('sk-1');

    const secondProvisioner = new LiteLLMProvisioner(config, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const second = await (secondProvisioner as any).fetchOrCreateKeysInternal();
    expect(second.apiKey).toBe('sk-2');

    expect(requests.map((req) => req.path)).toEqual([
      '/key/delete',
      '/key/generate',
      '/key/delete',
      '/key/generate',
    ]);

    for (const req of requests) {
      if (!req.body) continue;
      const serialized = JSON.stringify(req.body);
      expect(serialized).not.toContain('null');
      expect(serialized).not.toContain('"team_id"');
      if (req.path === '/key/delete') {
        expect(req.body).toEqual({ key_aliases: [SERVICE_ALIAS] });
      }
      if (req.path === '/key/generate') {
        expect(req.body).toEqual({ key_alias: SERVICE_ALIAS, models: ['all-team-models'] });
      }
    }
  });
});
