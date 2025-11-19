import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock http client used by modules (use vi.hoisted to avoid TDZ issues)
const hoisted = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock('@/api/http', () => ({ http: { get: hoisted.getMock, post: hoisted.postMock } }));

import { graph as api } from '@/api/modules/graph';

describe('graph api client', () => {
  beforeEach(() => {
    hoisted.getMock.mockReset();
    hoisted.postMock.mockReset();
    hoisted.getMock.mockImplementation(async (url: string) => {
      if (url === '/api/graph/templates') return [{ name: 'x', title: 'X', kind: 'tool', sourcePorts: {}, targetPorts: {} }];
      if (String(url).includes('/status')) return { isPaused: false };
      if (String(url).includes('/dynamic-config/schema')) return {};
      return {};
    });
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
    hoisted.getMock.mockImplementationOnce(async () => ({ ready: false }));
    const r1 = await api.getDynamicConfigSchema('n1');
    expect(r1).toBeNull();

    // empty object
    hoisted.getMock.mockImplementationOnce(async () => ({}));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toBeNull();
  });

  it('getDynamicConfigSchema returns schema when valid', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    hoisted.getMock.mockImplementationOnce(async () => schema);
    const r = await api.getDynamicConfigSchema('n1');
    expect(r).toEqual(schema);

    // wrapped
    hoisted.getMock.mockImplementationOnce(async () => ({ ready: true, schema }));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toEqual(schema);
  });
});
