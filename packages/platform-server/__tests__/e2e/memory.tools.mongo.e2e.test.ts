import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MemoryNode } from '../../src/graph/nodes/memory/memory.node';
import { LoggerService } from '../../src/core/services/logger.service';
import { UnifiedMemoryFunctionTool as UnifiedMemoryTool } from '../../src/graph/nodes/tools/memory/memory.tool';

const RUN_MONGOMS = process.env.RUN_MONGOMS === '1';

describe.skipIf(!RUN_MONGOMS)('E2E: memory tools with real MongoDB (mongodb-memory-server)', () => {
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
      const memNode = new MemoryNode(db as any, undefined as any as any);
      memNode.init({ nodeId: 'node-1' });

      const { MemoryToolNode } = require('../../src/graph/nodes/tools/memory/memory.node');
      const node = new MemoryToolNode(logger);
      node.setMemorySource(memNode);
      const unified = node.getTool();

      const cfg = { threadId: 'debug' } as any;

      const appendRes = JSON.parse(await unified.execute({ path: 'user/1', command: 'append', content: '{"username":"Test"}' } as any) as any);
      expect(appendRes.ok).toBe(true);
      const content = JSON.parse(await unified.execute({ path: 'user/1', command: 'read' } as any) as any);
      expect(content.ok).toBe(true);
      expect(String(content.result.content)).toContain('"username":"Test"');
    });

    it('should append and not overwrite existing data', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, undefined as any as any);
      memNode.init({ nodeId: 'node-1' });

      const { MemoryToolNode } = require('../../src/graph/nodes/tools/memory/memory.node');
      const node = new MemoryToolNode(logger);
      node.setMemorySource(memNode);
      const unified = node.getTool();

      const cfg = { threadId: 'debug' } as any;

      await unified.execute({ path: 'user/2', command: 'append', content: '{"username":"Test"}' } as any);
      await unified.execute({ path: 'user/2', command: 'append', content: '{"interests":"Sub1,Sub2"}' } as any);

      const content = JSON.parse(await unified.execute({ path: 'user/2', command: 'read' } as any) as any);
      expect(typeof content.result.content).toBe('string');
      expect(String(content.result.content)).toContain('"username":"Test"');
      expect(String(content.result.content)).toContain('"interests":"Sub1,Sub2"');
    });
  });

  describe('list/read/update/delete', () => {
    it('should list directory entries after multiple appends', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, undefined as any as any);
      memNode.init({ nodeId: 'node-lrud-1' });

      const { MemoryToolNode } = require('../../src/graph/nodes/tools/memory/memory.node'); const node = new MemoryToolNode(logger); node.setMemorySource(memNode); const unified = node.getTool();
      const cfg = { threadId: 'debug' } as any;

      await unified.invoke({ path: 'projects/p1', command: 'append', content: '{"name":"Alpha"}' }, cfg);
      await unified.invoke({ path: 'projects/p2', command: 'append', content: '{"name":"Beta"}' }, cfg);

      const listingRaw = JSON.parse(await unified.invoke({ path: 'projects', command: 'list' }, cfg) as any);
      expect(typeof listingRaw).toBe('object');
      const names = listingRaw.result.entries.map((i: any) => i.name).sort();
      expect(names).toEqual(['p1', 'p2']);
    });

    it('should read, update occurrences, and then delete a file', async () => {
      const db = client.db('test');
      const memNode = new MemoryNode(db as any, undefined as any as any);
      memNode.init({ nodeId: 'node-lrud-2' });
      const unifiedInst = new UnifiedMemoryTool(logger); unifiedInst.setMemorySource(memNode); const unified = unifiedInst.init();

      const cfg = { configurable: { thread_id: 'debug' } } as any;
      const targetPath = 'notes/today';

      await unified.execute({ path: targetPath, command: 'append', content: 'Weather is sunny. Mood: good.' } as any);
      let content = JSON.parse(await unified.execute({ path: targetPath, command: 'read' } as any) as any);
      expect(String(content.result.content)).toContain('sunny');

      // Update: replace 'sunny' with 'rainy'
      const updateCount = JSON.parse(await unified.execute({ path: targetPath, command: 'update', oldContent: 'sunny', content: 'rainy' } as any) as any);
      expect(Number(updateCount.result.replaced)).toBeGreaterThanOrEqual(1);
      content = JSON.parse(await unified.execute({ path: targetPath, command: 'read' } as any) as any);
      expect(String(content.result.content)).toContain('rainy');
      expect(String(content.result.content)).not.toContain('sunny');

      // Delete the file
      const delResultRaw = JSON.parse(await unified.execute({ path: targetPath, command: 'delete' } as any) as any);
      expect(typeof delResultRaw).toBe('object');

      // Listing the directory should now not include the deleted file
      const listingRaw = JSON.parse(await unified.execute({ path: 'notes', command: 'list' } as any) as any);
      const names = listingRaw.result.entries.map((i: any) => i.name);
      expect(names).not.toContain('today');
    });
  });
});
