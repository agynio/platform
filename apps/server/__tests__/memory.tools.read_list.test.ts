import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';
import { MemoryReadTool } from '../src/tools/memory/memory_read.tool';
import { MemoryListTool } from '../src/tools/memory/memory_list.tool';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

let db: any;
const logger = new LoggerService();

beforeAll(async () => {
  const { makeFakeDb } = await import('./helpers/fakeDb');
  db = makeFakeDb().db;
});

afterAll(async () => {
  db = undefined as any;
});

function cfg(threadId?: string): LangGraphRunnableConfig {
  return { configurable: { thread_id: threadId } } as any;
}

describe('memory_read and memory_list tools', () => {
  it('throws helpful error when MemoryService not set', async () => {
    const readTool = new MemoryReadTool(logger);
    const t = readTool.init(cfg());
    await expect(t.invoke({ path: '/x' } as any, cfg())).rejects.toBeTruthy();
  });

  it('reads file/dir/missing and lists entries; global scope', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'tool-node', scope: 'global', threadResolver: () => undefined });
    await svc.append('/file', 123);
    await svc.append('/folder/x', 1);
    await svc.append('/folder/y', 2);

    const readTool = new MemoryReadTool(logger);
    readTool.setMemoryService(svc);
    const listTool = new MemoryListTool(logger);
    listTool.setMemoryService(svc);

    const r1 = await readTool.init(cfg()).invoke({ path: '/file' } as any, cfg());
    expect(r1.type).toBe('file');
    expect(r1.value).toBe(123);

    const r2 = await readTool.init(cfg()).invoke({ path: '/folder' } as any, cfg());
    expect(r2.type).toBe('dir');
    const r2names = (r2.children as any[]).map((c) => c.name).sort();
    expect(r2names).toEqual(['x', 'y']);

    const r3 = await readTool.init(cfg()).invoke({ path: '/missing' } as any, cfg());
    expect(r3.exists).toBe(false);

    const l1 = await listTool.init(cfg()).invoke({ path: '/' } as any, cfg());
    const l1names = (l1 as any[]).map((c) => c.name).sort();
    expect(l1names).toEqual(['file', 'folder']);

    const l2 = await listTool.init(cfg()).invoke({ path: '/folder' } as any, cfg());
    const l2names = (l2 as any[]).map((c) => c.name).sort();
    expect(l2names).toEqual(['x', 'y']);
  });

  it('perThread vs global scoping', async () => {
    const svcT1 = new MemoryService(db, logger, { nodeId: 'tool-node', scope: 'perThread', threadResolver: () => 'T1' });
    const svcT2 = new MemoryService(db, logger, { nodeId: 'tool-node', scope: 'perThread', threadResolver: () => 'T2' });

    await svcT1.append('/k', 'v1');
    await svcT2.append('/k', 'v2');

    const readTool1 = new MemoryReadTool(logger);
    readTool1.setMemoryService(svcT1);
    const readTool2 = new MemoryReadTool(logger);
    readTool2.setMemoryService(svcT2);

    const r1 = await readTool1.init(cfg('T1')).invoke({ path: '/k' } as any, cfg('T1'));
    const r2 = await readTool2.init(cfg('T2')).invoke({ path: '/k' } as any, cfg('T2'));
    expect(r1.value).toBe('v1');
    expect(r2.value).toBe('v2');
  });
});
