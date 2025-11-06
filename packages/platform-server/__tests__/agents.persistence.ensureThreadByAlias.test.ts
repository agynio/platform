import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

describe('AgentsPersistenceService: alias resolution helpers', () => {
  it('getOrCreateThreadByAlias creates a root thread', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const id = await svc.getOrCreateThreadByAlias('test', 'root');
    expect(typeof id).toBe('string');
    expect(stub._store.threads.length).toBe(1);
    expect(stub._store.threads[0].alias).toBe('root');
    expect(stub._store.threads[0].parentId).toBeNull();
  });

  it('getOrCreateSubthreadByAlias creates child thread under parent and sets parentId', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentA');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child1', parentId);
    expect(typeof childId).toBe('string');
    expect(stub._store.threads.length).toBe(2);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentA');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });

  it('supports nested subthreads via explicit parent linkage', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentB');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child2', parentId);
    const leafId = await svc.getOrCreateSubthreadByAlias('manage', 'leafX', childId);
    expect(typeof leafId).toBe('string');
    expect(stub._store.threads.length).toBe(3);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentB');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    const leaf = stub._store.threads.find((t: any) => t.parentId === child.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(leaf).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
    expect(leaf.parentId).toBe(child.id);
  });

  it('getOrCreateThreadByAlias is idempotent for existing alias', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const aId1 = await svc.getOrCreateThreadByAlias('test', 'A');
    const aId2 = await svc.getOrCreateThreadByAlias('test', 'A');
    expect(aId1).toBe(aId2);
    const childId1 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1);
    const childId2 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1);
    expect(childId1).toBe(childId2);
  });
});
