import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MemoryNode } from '../../src/nodes/memory.node';
import { LoggerService } from '../../src/services/logger.service';
import { MemoryAppendTool } from '../../src/tools/memory/memory_append.tool';
import { MemoryReadTool } from '../../src/tools/memory/memory_read.tool';

describe('E2E: memory tools with real MongoDB (mongodb-memory-server)', () => {
  const logger = new LoggerService();
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let skipSuite = false;

  beforeAll(async () => {
    try {
      // Use older binary to avoid AVX requirement on CI; fallback to default if needed
      mongod = await MongoMemoryServer.create({ binary: { version: '6.0.25' } });
      const uri = mongod.getUri();
      client = new MongoClient(uri);
      await client.connect();
    } catch (e: any) {
      skipSuite = true;
      // eslint-disable-next-line no-console
      console.warn('[memory.tools.mongo.e2e] Skipping test due to Mongo startup error:', e?.message || e);
    }
  });

  afterAll(async () => {
    if (skipSuite) return;
    try { await client?.close(true); } catch {}
    try { await mongod?.stop(); } catch {}
  });

  it('append then read using direct tool.invoke', async () => {
    if (skipSuite) { expect(true).toBe(true); return; }
    const db = client.db('test');
    const memNode = new MemoryNode(db as any, 'node-1', { scope: 'global' });

    const appendInst = new MemoryAppendTool(logger);
    appendInst.setMemorySource(memNode);
    const append = appendInst.init();

    const readInst = new MemoryReadTool(logger);
    readInst.setMemorySource(memNode);
    const read = readInst.init();

    const cfg = { configurable: { thread_id: 'debug' } } as any;

    const appendRes = await append.invoke({ path: 'user/111', data: '{"username":"Test"}' }, cfg);
    expect(appendRes).toBe('ok');
    const content = await read.invoke({ path: 'user/111' }, cfg);
    expect(typeof content).toBe('string');
    expect(String(content)).toContain('"username":"Test"');
  });
});
