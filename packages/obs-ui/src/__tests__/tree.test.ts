import { describe, it, expect } from 'vitest';
import { buildTree } from '../utils/tree';

describe('buildTree', () => {
  it('builds tree with parent-child relation', () => {
    const spans: any = [
      { traceId: 't1', spanId: 'a', label: 'a', status: 'ok', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
      { traceId: 't1', spanId: 'b', parentSpanId: 'a', label: 'b', status: 'ok', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' }
    ];
    const roots = buildTree(spans);
    expect(Array.isArray(roots)).toBe(true);
    expect(roots.length).toBe(1);
    expect(roots[0].children.length).toBe(1);
  });
});
