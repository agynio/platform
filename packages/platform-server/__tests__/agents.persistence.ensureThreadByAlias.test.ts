import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

describe('AgentsPersistenceService.ensureThreadByAlias', () => {
  it('creates a thread when alias has no parent', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const id = await svc.ensureThreadByAlias('root');
    expect(typeof id).toBe('string');
    expect(stub._store.threads.length).toBe(1);
    expect(stub._store.threads[0].alias).toBe('root');
    expect(stub._store.threads[0].parentId).toBeNull();
  });

  it('creates parent and child when alias contains "__" and sets parentId', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const childId = await svc.ensureThreadByAlias('parentA__child1');
    expect(typeof childId).toBe('string');
    // parent and child created
    expect(stub._store.threads.length).toBe(2);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentA');
    const child = stub._store.threads.find((t: any) => t.alias === 'parentA__child1');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });

  it('handles nested aliases (parent__child__leaf) linking to immediate parent', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const leafId = await svc.ensureThreadByAlias('parentB__child2__leafX');
    expect(typeof leafId).toBe('string');
    // three threads: parent, parent__child, parent__child__leaf
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

  it('is idempotent: re-ensuring nested aliases does not duplicate and maintains correct links', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const id1 = await svc.ensureThreadByAlias('A__B__C');
    const id2 = await svc.ensureThreadByAlias('A__B__C');
    expect(id1).toBe(id2);
    expect(stub._store.threads.length).toBe(3);
    const a = stub._store.threads.find((t: any) => t.alias === 'A');
    const ab = stub._store.threads.find((t: any) => t.alias === 'A__B');
    const abc = stub._store.threads.find((t: any) => t.alias === 'A__B__C');
    expect(ab.parentId).toBe(a.id);
    expect(abc.parentId).toBe(ab.id);
  });
});
