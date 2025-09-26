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
});
