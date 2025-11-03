import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '@/api/graph';
// Use a typed handle for global fetch
const g = globalThis as unknown as { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
let fetchMock: ReturnType<typeof vi.fn>;

describe('graph api client', () => {
  const origFetch = g.fetch;
  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/graph/templates')) {
        return new Response(JSON.stringify([{ name: 'x', title: 'X', kind: 'tool', sourcePorts: {}, targetPorts: {} }]));
      }
      if (url.includes('/status')) {
        return new Response(JSON.stringify({ isPaused: false }));
      }
      // dynamic config schema mock flows
      if (url.includes('/dynamic-config/schema')) {
        // default mock brings empty object to validate normalization in individual tests that override fetch impl
        return new Response(JSON.stringify({}));
      }
      return new Response('', { status: 204 });
    });
    g.fetch = fetchMock as unknown as typeof g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
  });

  it('getTemplates', async () => {
    const t = await api.getTemplates();
    expect(t[0].name).toBe('x');
  });
  it('getNodeStatus', async () => {
    const s = await api.getNodeStatus('n1');
    expect(s.isPaused).toBe(false);
  });

  it('getDynamicConfigSchema returns null for wrapper/empty', async () => {
    // wrapper response
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ready: false })));
    const r1 = await api.getDynamicConfigSchema('n1');
    expect(r1).toBeNull();

    // empty object
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({})));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toBeNull();
  });

  it('getDynamicConfigSchema returns schema when valid', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(schema)));
    const r = await api.getDynamicConfigSchema('n1');
    expect(r).toEqual(schema);

    // wrapped
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ready: true, schema })));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toEqual(schema);
  });
});
