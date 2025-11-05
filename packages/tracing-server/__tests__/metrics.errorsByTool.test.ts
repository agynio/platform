import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer, SpanDoc } from '../src/server';

let server: any; let mm: any;

describe.skipIf(!RUN_MONGOMS)('GET /v1/metrics/errors-by-tool', () => {
  beforeAll(async () => {
    mm = await startMemoryMongo('obs-metrics');
    server = await createServer(mm.db, { logger: false });
  });
  afterAll(async () => {
    await server.close();
    await mm.stop();
  });

  async function insertSpan(doc: Partial<SpanDoc>) {
    const now = new Date().toISOString();
    const base: SpanDoc = {
      traceId: doc.traceId || 't1',
      spanId: doc.spanId || Math.random().toString(36).slice(2),
      label: doc.label || 'span',
      status: (doc.status as any) || 'ok',
      startTime: doc.startTime || now,
      endTime: doc.endTime,
      completed: doc.completed ?? true,
      lastUpdate: doc.lastUpdate || now,
      attributes: doc.attributes || {},
      events: [],
      rev: 0,
      idempotencyKeys: [],
      createdAt: now,
      updatedAt: now,
      parentSpanId: doc.parentSpanId,
      nodeId: doc.nodeId,
      threadId: doc.threadId,
    };
    await mm.db.collection('spans').insertOne(base as any);
  }

  it('aggregates error counts by tool label with defaults (last 6h)', async () => {
    const now = new Date();
    const before7h = new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString();
    const within = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    // outside default window
    await insertSpan({ label: 'tool:weather', status: 'error', lastUpdate: before7h });
    // in window
    await insertSpan({ label: 'tool:weather', status: 'error', lastUpdate: within });
    await insertSpan({ label: 'tool:weather', status: 'error', lastUpdate: within });
    await insertSpan({ label: 'tool:search', status: 'error', lastUpdate: within });
    await insertSpan({ label: 'tool:search', status: 'ok', lastUpdate: within }); // not counted
    await insertSpan({ label: 'llm:provider', status: 'error', lastUpdate: within }); // label not tool:*, not counted

    const res = await server.inject({ method: 'GET', url: '/v1/metrics/errors-by-tool' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.items)).toBe(true);
    // Should count only within window and tool:* labels
    const map: Record<string, number> = Object.fromEntries(body.items.map((i: any) => [i.label, i.count]));
    expect(map['tool:weather']).toBe(2);
    expect(map['tool:search']).toBe(1);
    expect(map['llm:provider']).toBeUndefined();
  });

  it('respects field=startTime filtering', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    // Start time inside window but lastUpdate outside - should be included when field=startTime
    await insertSpan({ label: 'tool:calc', status: 'error', startTime: from, lastUpdate: new Date(now.getTime() + 1000).toISOString() });
    const url = `/v1/metrics/errors-by-tool?field=startTime&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await server.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const hasCalc = body.items.some((i: any) => i.label === 'tool:calc');
    expect(hasCalc).toBe(true);
  });

  it('validates ISO datetime and from<=to', async () => {
    const res1 = await server.inject({ method: 'GET', url: '/v1/metrics/errors-by-tool?from=not-a-date&to=also-bad' });
    expect(res1.statusCode).toBe(400);
    const now = new Date();
    const from = new Date(now.getTime()).toISOString();
    const to = new Date(now.getTime() - 3600_000).toISOString();
    const res2 = await server.inject({ method: 'GET', url: `/v1/metrics/errors-by-tool?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` });
    expect(res2.statusCode).toBe(400);
  });

  it('GET /v1/spans enforces ISO, range and sorting/limit cap', async () => {
    // invalid iso
    const bad = await server.inject({ method: 'GET', url: '/v1/spans?from=bad&to=worse' });
    expect(bad.statusCode).toBe(400);
    // insert docs
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000);
    const later = new Date(now.getTime());
    await mm.db.collection('spans').insertMany([
      { traceId: 't', spanId: 'a', label: 'L', status: 'ok', startTime: earlier.toISOString(), lastUpdate: earlier.toISOString(), completed: true, attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: earlier.toISOString(), updatedAt: earlier.toISOString() },
      { traceId: 't', spanId: 'b', label: 'L', status: 'error', startTime: later.toISOString(), lastUpdate: later.toISOString(), completed: true, attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: later.toISOString(), updatedAt: later.toISOString() },
    ] as any);
    const from = new Date(earlier.getTime() - 10_000).toISOString();
    const to = new Date(later.getTime() + 10_000).toISOString();
    const ok = await server.inject({ method: 'GET', url: `/v1/spans?limit=1&sort=startTime&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.items.length).toBe(1);
    // Assert sorting/limit behavior without hardcoding spanId
    const returned = body.items[0];
    expect(returned.label).toBe('L');
    // Should be the most recent by startTime
    expect(new Date(returned.startTime).toISOString()).toBe(later.toISOString());
  });
});
