import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

describe('AgentsPersistenceService.ensureThread (explicit parentThreadId)', () => {
  it('creates a root thread when no parentThreadId provided', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const id = await svc.ensureThread('root');
    expect(typeof id).toBe('string');
    expect(stub._store.threads.length).toBe(1);
    expect(stub._store.threads[0].alias).toBe('root');
    expect(stub._store.threads[0].parentId).toBeNull();
  });

  it('creates child thread and sets parentId when parentThreadId provided', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const parentAlias = 'parentA';
    const parentId = await svc.ensureThread(parentAlias);
    const childId = await svc.ensureThread('parentA__child1', parentAlias);
    expect(typeof childId).toBe('string');
    expect(stub._store.threads.length).toBe(2);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentA');
    const child = stub._store.threads.find((t: any) => t.alias === 'parentA__child1');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });

  it('supports nested subthreads via explicit parent passing', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const parentAlias = 'parentB';
    const parentId = await svc.ensureThread(parentAlias);
    const childAlias = 'parentB__child2';
    const childId = await svc.ensureThread(childAlias, parentAlias);
    const leafId = await svc.ensureThread('parentB__child2__leafX', childAlias);
    expect(typeof leafId).toBe('string');
    expect(stub._store.threads.length).toBe(3);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentB');
    const child = stub._store.threads.find((t: any) => t.alias === 'parentB__child2');
    const leaf = stub._store.threads.find((t: any) => t.alias === 'parentB__child2__leafX');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(leaf).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
    expect(leaf.parentId).toBe(child.id);
  });

  it('is idempotent for existing alias (ignores parentThreadId)', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const aAlias = 'A';
    const aId = await svc.ensureThread(aAlias);
    const abAlias = 'A__B';
    const abId = await svc.ensureThread(abAlias, aAlias);
    const abcId1 = await svc.ensureThread('A__B__C', abAlias);
    const abcId2 = await svc.ensureThread('A__B__C', abAlias);
    expect(abcId1).toBe(abcId2);
    expect(stub._store.threads.length).toBe(3);
    const a = stub._store.threads.find((t: any) => t.alias === 'A');
    const ab = stub._store.threads.find((t: any) => t.alias === 'A__B');
    const abc = stub._store.threads.find((t: any) => t.alias === 'A__B__C');
    expect(ab.parentId).toBe(a.id);
    expect(abc.parentId).toBe(ab.id);
  });
});
