import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MemoryNode } from '../../src/nodes/memory.node';
import { LoggerService } from '../../src/services/logger.service';
import { MemoryAppendTool } from '../../src/tools/memory/memory_append.tool';
import { MemoryReadTool } from '../../src/tools/memory/memory_read.tool';
import { MemoryListTool } from '../../src/tools/memory/memory_list.tool';
import { MemoryUpdateTool } from '../../src/tools/memory/memory_update.tool';
import { MemoryDeleteTool } from '../../src/tools/memory/memory_delete.tool';

describe('E2E: memory tools with real MongoDB (mongodb-memory-server)', () => {
  const logger = new LoggerService();
  let mongod: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    // Pin explicit MongoDB binary to ensure consistency across CI/local (mirrors MONGOMS_VERSION)
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
  });

  afterAll(async () => {
    try {
      await client?.close(true);
    } catch {}
    try {
      await mongod?.stop();
    } catch {}
  });

  describe('append', () => {
    it('should store data for new path', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, 'node-1', { scope: 'global' });

      const appendInst = new MemoryAppendTool(logger);
      appendInst.setMemorySource(memNode);
      const append = appendInst.init();

      const readInst = new MemoryReadTool(logger);
      readInst.setMemorySource(memNode);
      const read = readInst.init();

      const cfg = { configurable: { thread_id: 'debug' } } as any;

      const appendRes = await append.invoke({ path: 'user/1', data: '{"username":"Test"}' }, cfg);
      expect(appendRes).toBe('ok');
      const content = await read.invoke({ path: 'user/1' }, cfg);
      expect(typeof content).toBe('string');
      expect(String(content)).toContain('"username":"Test"');
    });

    it('should append and not overwrite existing data', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, 'node-1', { scope: 'global' });

      const appendInst = new MemoryAppendTool(logger);
      appendInst.setMemorySource(memNode);
      const append = appendInst.init();

      const readInst = new MemoryReadTool(logger);
      readInst.setMemorySource(memNode);
      const read = readInst.init();

      const cfg = { configurable: { thread_id: 'debug' } } as any;

      await append.invoke({ path: 'user/2', data: '{"username":"Test"}' }, cfg);
      await append.invoke({ path: 'user/2', data: '{"interests":"Sub1,Sub2"}' }, cfg);

      const content = await read.invoke({ path: 'user/2' }, cfg);
      expect(typeof content).toBe('string');
      expect(String(content)).toContain('"username":"Test"');
      expect(String(content)).toContain('"interests":"Sub1,Sub2"');
    });
  });

  describe('list/read/update/delete', () => {
    it('should list directory entries after multiple appends', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, 'node-lrud-1', { scope: 'global' });

      const appendInst = new MemoryAppendTool(logger); appendInst.setMemorySource(memNode); const append = appendInst.init();
      const listInst = new MemoryListTool(logger); listInst.setMemorySource(memNode); const list = listInst.init();
      const cfg = { configurable: { thread_id: 'debug' } } as any;

      await append.invoke({ path: 'projects/p1', data: '{"name":"Alpha"}' }, cfg);
      await append.invoke({ path: 'projects/p2', data: '{"name":"Beta"}' }, cfg);

      const listingRaw = await list.invoke({ path: 'projects' }, cfg);
      expect(typeof listingRaw).toBe('string');
      const listing = JSON.parse(String(listingRaw));
      const names = listing.map((i: any) => i.name).sort();
      expect(names).toEqual(['p1', 'p2']);
    });

    it('should read, update occurrences, and then delete a file', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, 'node-lrud-2', { scope: 'global' });
      const appendInst = new MemoryAppendTool(logger); appendInst.setMemorySource(memNode); const append = appendInst.init();
      const readInst = new MemoryReadTool(logger); readInst.setMemorySource(memNode); const read = readInst.init();
      const updateInst = new MemoryUpdateTool(logger); updateInst.setMemorySource(memNode); const update = updateInst.init();
      const deleteInst = new MemoryDeleteTool(logger); deleteInst.setMemorySource(memNode); const del = deleteInst.init();
      const listInst = new MemoryListTool(logger); listInst.setMemorySource(memNode); const list = listInst.init();

      const cfg = { configurable: { thread_id: 'debug' } } as any;
      const targetPath = 'notes/today';

      await append.invoke({ path: targetPath, data: 'Weather is sunny. Mood: good.' }, cfg);
      let content = await read.invoke({ path: targetPath }, cfg);
      expect(String(content)).toContain('sunny');

      // Update: replace 'sunny' with 'rainy'
      const updateCount = await update.invoke({ path: targetPath, old_data: 'sunny', new_data: 'rainy' }, cfg);
      expect(Number(updateCount)).toBeGreaterThanOrEqual(1);
      content = await read.invoke({ path: targetPath }, cfg);
      expect(String(content)).toContain('rainy');
      expect(String(content)).not.toContain('sunny');

      // Delete the file
      const delResultRaw = await del.invoke({ path: targetPath }, cfg);
      expect(typeof delResultRaw).toBe('string');
      // Result is JSON object; parse and check basic shape
      let delResult: any;
      try { delResult = JSON.parse(String(delResultRaw)); } catch { delResult = {}; }
      expect(delResult).toBeTypeOf ? expect(delResult).toBeTypeOf('object') : expect(typeof delResult).toBe('object');

      // Listing the directory should now not include the deleted file
      const listingRaw = await list.invoke({ path: 'notes' }, cfg);
      const listing = JSON.parse(String(listingRaw));
      const names = listing.map((i: any) => i.name);
      expect(names).not.toContain('today');
    });
  });
});
