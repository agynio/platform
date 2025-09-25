import { describe, it, beforeAll, afterAll, expect } from 'vitest';
 
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';
import { MemoryConnectorNode } from '../src/nodes/memoryConnector.node';

let db: any;
const logger = new LoggerService();

beforeAll(async () => {
  const { makeFakeDb } = await import('./helpers/fakeDb');
  db = makeFakeDb().db;
});

afterAll(async () => {
  db = undefined as any;
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
