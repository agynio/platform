import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../../graph/api';

const g: any = globalThis;

describe('graph api client', () => {
  const origFetch = g.fetch;
  beforeEach(() => {
    g.fetch = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/graph/templates')) {
        return new Response(JSON.stringify([{ name: 'x', title: 'X', kind: 'tool', sourcePorts: {}, targetPorts: {} }]));
      }
      if (url.includes('/status')) {
        return new Response(JSON.stringify({ isPaused: false }));
      }
      // dynamic config schema mock flows
      if (url.includes('/dynamic-config-schema') || url.includes('/dynamic-config/schema')) {
        // default mock brings empty object to validate normalization in individual tests that override fetch impl
        return new Response(JSON.stringify({}));
      }
      return new Response('', { status: 204 });
    }) as any;
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
    (g.fetch as any).mockImplementationOnce(async () => new Response(JSON.stringify({ ready: false })));
    // fallback second call should not be used, but ensure it would be empty if called
    (g.fetch as any).mockImplementationOnce(async () => new Response(JSON.stringify({})));
    const r1 = await api.getDynamicConfigSchema('n1');
    expect(r1).toBeNull();

    // empty object
    (g.fetch as any).mockImplementationOnce(async () => new Response(JSON.stringify({})));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toBeNull();
  });

  it('getDynamicConfigSchema returns schema when valid', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    (g.fetch as any).mockImplementationOnce(async () => new Response(JSON.stringify(schema)));
    const r = await api.getDynamicConfigSchema('n1');
    expect(r).toEqual(schema);

    // wrapped
    (g.fetch as any).mockImplementationOnce(async () => new Response(JSON.stringify({ ready: true, schema })));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toEqual(schema);
  });
});
