import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';
import { MemoryAppendTool } from '../src/tools/memory/memory_append.tool';
import { MemoryUpdateTool } from '../src/tools/memory/memory_update.tool';
import { MemoryDeleteTool } from '../src/tools/memory/memory_delete.tool';

let db: any;
const logger = new LoggerService();

beforeAll(async () => {
  const { makeFakeDb } = await import('./helpers/fakeDb');
  db = makeFakeDb().db;
});

afterAll(async () => {
  db = undefined as any;
});

describe('memory write tools', () => {
  it('errors if MemoryService not set', async () => {
    const t = new MemoryAppendTool(logger);
    const tool = t.init({} as any);
    await expect(tool.invoke({ path: '/a', data: 1 } as any, {} as any)).rejects.toBeTruthy();
  });

  it('append behaves and errors on directory', async () => {
    const svc = new MemoryService(db, logger, { nodeId: 'tools-write', scope: 'global', threadResolver: () => undefined });
    const append = new MemoryAppendTool(logger);
    append.setMemoryService(svc);
    await append.init({} as any).invoke({ path: '/x', data: 1 } as any, {} as any);
    expect(await svc.read('/x')).toBe(1);

    // array pushes
    await append.init({} as any).invoke({ path: '/arr', data: [1] } as any, {} as any);
    await append.init({} as any).invoke({ path: '/arr', data: 2 } as any, {} as any);
    expect(await svc.read('/arr')).toEqual([1, 2]);

    // directory error
    await svc.ensureDir('/dir');
    await expect(append.init({} as any).invoke({ path: '/dir', data: 1 } as any, {} as any)).rejects.toBeTruthy();
  });

  it('update returns counts and delete removes items; perThread scoping', async () => {
    const svc1 = new MemoryService(db, logger, { nodeId: 'tools-write', scope: 'perThread', threadResolver: () => 'T1' });
    const svc2 = new MemoryService(db, logger, { nodeId: 'tools-write', scope: 'perThread', threadResolver: () => 'T2' });

    const update1 = new MemoryUpdateTool(logger); update1.setMemoryService(svc1);
    const update2 = new MemoryUpdateTool(logger); update2.setMemoryService(svc2);
    const del1 = new MemoryDeleteTool(logger); del1.setMemoryService(svc1);

    // seed arrays in each scope
    const append1 = new MemoryAppendTool(logger); append1.setMemoryService(svc1);
    const append2 = new MemoryAppendTool(logger); append2.setMemoryService(svc2);
    await append1.init({} as any).invoke({ path: '/a', data: [1,2,1] } as any, {} as any);
    await append2.init({} as any).invoke({ path: '/a', data: [1,2,1] } as any, {} as any);

    const r2 = await update2.init({} as any).invoke({ path: '/a', old_data: 1, new_data: 9 } as any, {} as any) as any;
    expect(r2.updated).toBe(2);
    expect(await svc2.read('/a')).toEqual([9,2,9]);

    const r1 = await update1.init({} as any).invoke({ path: '/a', old_data: 2, new_data: 3 } as any, {} as any) as any;
    expect(r1.updated).toBe(1);
    expect(await svc1.read('/a')).toEqual([1,3,1]);

    // delete one file
    const d1 = await del1.init({} as any).invoke({ path: '/a' } as any, {} as any) as any;
    expect(d1.deleted).toBeGreaterThan(0);
    expect(await svc1.read('/a')).toBeUndefined();

    // delete subtree
    await append2.init({} as any).invoke({ path: '/b/c', data: 1 } as any, {} as any);
    await append2.init({} as any).invoke({ path: '/b/d', data: 2 } as any, {} as any);
    const d2 = await new MemoryDeleteTool(logger).init({} as any).invoke({ path: '/b' } as any, {} as any).catch((e)=>e);
    // Should fail because MemoryService not set
    expect(d2).toBeInstanceOf(Error);

    const del2 = new MemoryDeleteTool(logger); del2.setMemoryService(svc2);
    const d2ok = await del2.init({} as any).invoke({ path: '/b' } as any, {} as any) as any;
    expect(d2ok.deleted).toBe(2);
    expect(await svc2.read('/b')).toBeUndefined();
  });
});
