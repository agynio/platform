import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer } from '../src/server';

let mm: Awaited<ReturnType<typeof startMemoryMongo>>;
let server: any;

const traceId = 't-1';
const spanId = 's-1';

async function upsert(payload: any) {
  const res = await server.inject({ method: 'POST', url: '/v1/spans/upsert', payload });
  return { status: res.statusCode, body: res.json() };
}

describe.skipIf(!RUN_MONGOMS)('spans upsert e2e', () => {
  beforeAll(async () => {
    mm = await startMemoryMongo();
    server = await createServer(mm.db, { logger: false });
  });

  afterAll(async () => {
    await server.close();
    await mm.stop();
  });

  it('creates span (state=created)', async () => {
    const { status, body } = await upsert({ state: 'created', traceId, spanId, label: 'root' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('updates span (state=updated) merges attributes and bumps rev', async () => {
    const first = await upsert({ state: 'updated', traceId, spanId, attributes: { a: 1 } });
    expect(first.status).toBe(200);
    const second = await upsert({ state: 'updated', traceId, spanId, attributes: { b: 2 } });
    expect(second.status).toBe(200);
  });

  it('completes span (state=completed)', async () => {
    const { status } = await upsert({ state: 'completed', traceId, spanId, status: 'ok' });
    expect(status).toBe(200);
  });

  it('idempotent completion returns ok without error', async () => {
    const { status } = await upsert({ state: 'completed', traceId, spanId });
    expect(status).toBe(200);
  });
});
