import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';
import { startMemoryMongo } from './helpers/mongoMemory';
import { createServer } from '../src/server';

let server: any; let mm: any;

describe.skipIf(!RUN_MONGOMS)('smoke + cors', () => {
  beforeAll(async () => {
    mm = await startMemoryMongo();
    server = await createServer(mm.db, { logger: false });
  });
  afterAll(async () => {
    await server.close();
    await mm.stop();
  });
  it('healthz works', async () => {
    const res = await server.inject({ method: 'GET', url: '/healthz', headers: { origin: 'http://localhost:5175' } });
    expect(res.statusCode).toBe(200);
  expect(['*', 'http://localhost:5175']).toContain(res.headers['access-control-allow-origin']);
  });
});
