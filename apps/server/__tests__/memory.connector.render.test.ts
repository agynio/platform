import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { SystemMessage } from '@langchain/core/messages';
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

describe('MemoryConnectorNode.renderMessage', () => {
  it('returns null when no MemoryService set', async () => {
    const node = new MemoryConnectorNode(logger);
    const msg = await node.renderMessage({} as any);
    expect(msg).toBeNull();
  });

  it('renders full content with values', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'mc', scope: 'global', threadResolver: () => undefined });
    await svc.append('/a/b', 1);
    await svc.append('/a/c', 2);
    await svc.append('/x', 'y');

    const node = new MemoryConnectorNode(logger);
    node.setMemoryService(svc);
    node.setConfig({ placement: 'after_system', content: 'full' });

    const msg = (await node.renderMessage({} as any)) as SystemMessage;
    expect(msg).toBeInstanceOf(SystemMessage);
    const content = String(msg.content);
    expect(content).toContain('<memory>');
    expect(content).toContain('a.b');
    expect(content).toContain('x');
    expect(content).toContain('1');
  });

  it('renders tree content', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'mc2', scope: 'global', threadResolver: () => undefined });
    await svc.ensureDir('/folder');
    await svc.append('/folder/one', 1);
    await svc.append('/folder/two', 2);

    const node = new MemoryConnectorNode(logger);
    node.setMemoryService(svc);
    node.setConfig({ placement: 'after_system', content: 'tree' });

    const msg = (await node.renderMessage({} as any)) as SystemMessage;
    const content = String(msg.content);
    expect(content).toContain('[dir] folder');
    // tree mode lists only immediate children; inner files may not be listed
    expect(content).not.toContain('[file] one');
    expect(content).not.toContain('[file] two');
  });

  it('falls back to tree when full exceeds size cap', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'mc3', scope: 'global', threadResolver: () => undefined });
    // Create large content
    for (let i = 0; i < 200; i++) {
      await svc.append(`/big/key${i}`, 'x'.repeat(200));
    }
    const node = new MemoryConnectorNode(logger);
    node.setMemoryService(svc);
    node.setConfig({ placement: 'after_system', content: 'full' });

    const msg = (await node.renderMessage({} as any)) as SystemMessage;
    const content = String(msg.content);
    expect(content).toContain('Memory content truncated; showing tree only');
    expect(content).toContain('[dir]');
  });
});
