import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLLMAdminClient } from '../src/llm/provisioners/litellm.admin-client';

function createFetchSpy(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

describe('LiteLLMAdminClient payload sanitation', () => {
  const baseUrl = 'https://litellm.local';
  const masterKey = 'master-key';
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: LiteLLMAdminClient;

  beforeEach(() => {
    fetchSpy = createFetchSpy({ key: 'sk-generated' });
    client = new LiteLLMAdminClient(masterKey, baseUrl, {
      maxAttempts: 1,
      baseDelayMs: 1,
      fetchImpl: fetchSpy,
    });
  });

  it('omits team_id when not provided', async () => {
    await client.generateKey({ alias: 'agents-service', models: ['all-team-models'] });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(typeof requestInit?.body).toBe('string');
    const body = JSON.parse(requestInit?.body as string);

    expect(body).toEqual({ key_alias: 'agents-service', models: ['all-team-models'] });
  });

  it('does not send null team_id values', async () => {
    await client.generateKey({
      alias: 'agents-service',
      models: ['all-team-models'],
      teamId: null as unknown as string,
    });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(typeof requestInit?.body).toBe('string');
    const body = JSON.parse(requestInit?.body as string);

    expect(body).not.toHaveProperty('team_id');
  });

  it('includes trimmed team_id when supplied', async () => {
    await client.generateKey({ alias: 'agents-service', models: ['all-team-models'], teamId: '  team-123  ' });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(typeof requestInit?.body).toBe('string');
    const body = JSON.parse(requestInit?.body as string);

    expect(body.team_id).toBe('team-123');
  });

  it('drops empty duration values', async () => {
    await client.generateKey({ alias: 'agents-service', models: ['all-team-models'], duration: '   ' });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(typeof requestInit?.body).toBe('string');
    const body = JSON.parse(requestInit?.body as string);

    expect(body).toEqual({ key_alias: 'agents-service', models: ['all-team-models'] });
  });

  it('sends delete requests without stray optional fields', async () => {
    fetchSpy = createFetchSpy({}, 200);
    client = new LiteLLMAdminClient(masterKey, baseUrl, {
      maxAttempts: 1,
      baseDelayMs: 1,
      fetchImpl: fetchSpy,
    });

    await client.deleteByAlias('agents-service');

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(typeof requestInit?.body).toBe('string');
    const body = JSON.parse(requestInit?.body as string);

    expect(body).toEqual({ key_aliases: ['agents-service'] });
  });
});
