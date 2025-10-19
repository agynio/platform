import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer } from '../src/server';

let mm: Awaited<ReturnType<typeof startMemoryMongo>>;
let server: any;

async function post(url: string, payload: any) {
  const res = await server.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json() };
}

async function get(url: string) {
  const res = await server.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
}

describe.skipIf(!RUN_MONGOMS)('traces ingestion e2e', () => {
  beforeAll(async () => {
    mm = await startMemoryMongo();
    server = await createServer(mm.db, { logger: false });
  });

  afterAll(async () => {
    await server.close();
    await mm.stop();
  });

  it('ingests multiple spans via /v1/traces and lists them', async () => {
    const traceId = 'trace-bulk-1';
    const spans = [
      { traceId, spanId: 'a', label: 'A', status: 'ok' },
      { traceId, spanId: 'b', label: 'B', status: 'ok' },
    ];
    const ingest = await post('/v1/traces', { spans });
    expect(ingest.status).toBe(200);
    expect(ingest.body.count).toBe(2);

    const list = await get('/v1/spans?limit=10');
    expect(list.status).toBe(200);
    const ids = list.body.items.filter((s: any) => s.traceId === traceId).map((s: any) => s.spanId).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});
