import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';
import { MemoryConnectorNode } from '../nodes/memoryConnector.node';

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const logger = new LoggerService();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db('test');
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe('MemoryConnector size cap config', () => {
  it('falls back to tree when maxChars is small', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'cap', scope: 'global', threadResolver: () => undefined });
    for (let i = 0; i < 5; i++) await svc.append(`/k${i}`, 'x'.repeat(50));

    const node = new MemoryConnectorNode(logger);
    node.setMemoryService(svc);
    node.setConfig({ placement: 'after_system', content: 'full', maxChars: 10 });
    const msg = await node.renderMessage({} as any);
    expect(String(msg!.content)).toContain('Memory content truncated;');
  });
});
