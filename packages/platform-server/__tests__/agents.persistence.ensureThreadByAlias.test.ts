import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';

const metricsStub = { getThreadsMetrics: async () => ({}) } as any;
const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createService = (stub: any) =>
  new AgentsPersistenceService(
    new StubPrismaService(stub) as any,
    new LoggerService(),
    metricsStub,
    new NoopGraphEventsPublisher(),
    templateRegistryStub,
    graphRepoStub,
    createRunEventsStub() as any,
  );

describe('AgentsPersistenceService: alias resolution helpers', () => {
  it('getOrCreateThreadByAlias creates a root thread with summary', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const id = await svc.getOrCreateThreadByAlias('test', 'root', 'Root summary');
    expect(typeof id).toBe('string');
    expect(stub._store.threads.length).toBe(1);
    expect(stub._store.threads[0].alias).toBe('root');
    expect(stub._store.threads[0].parentId).toBeNull();
    expect(stub._store.threads[0].summary).toBe('Root summary');
  });

  it('getOrCreateSubthreadByAlias creates child thread under parent and sets parentId', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentA', 'Parent A');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child1', parentId, 'Child 1');
    expect(typeof childId).toBe('string');
    expect(stub._store.threads.length).toBe(2);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentA');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
    expect(child.summary).toBe('Child 1');
  });

  it('supports nested subthreads via explicit parent linkage', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentB', 'Parent B');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child2', parentId, 'Child 2');
    const leafId = await svc.getOrCreateSubthreadByAlias('manage', 'leafX', childId, 'Leaf X');
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
    expect(leaf.summary).toBe('Leaf X');
  });

  it('getOrCreateThreadByAlias is idempotent for existing alias', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const aId1 = await svc.getOrCreateThreadByAlias('test', 'A', 'first');
    const aId2 = await svc.getOrCreateThreadByAlias('test', 'A', 'second');
    expect(aId1).toBe(aId2);
    const childId1 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1, 'child first');
    const childId2 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1, 'child second');
    expect(childId1).toBe(childId2);
    const root = stub._store.threads.find((t: any) => t.alias === 'A');
    expect(root.summary).toBe('first');
    const composed = `manage:${aId1}:B`;
    const child = stub._store.threads.find((t: any) => t.alias === composed);
    expect(child.summary).toBe('child first');
  });

  it('trims and crops summary to 256 characters for root threads', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const input = `   ${'abc'.repeat(100)}   `;
    const expected = input.trim().slice(0, 256);
    const id = await svc.getOrCreateThreadByAlias('test', 'root-trim', input);
    const t = stub._store.threads.find((tt: any) => tt.id === id);
    expect(t.summary).toBe(expected);
    expect((t.summary ?? '').length).toBeLessThanOrEqual(256);
  });

  it('crops summary to 256 characters for subthreads', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const parentId = await svc.getOrCreateThreadByAlias('test', 'root-crop', 'Root summary');
    const input = 'x'.repeat(300);
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child-crop', parentId, input);
    const child = stub._store.threads.find((tt: any) => tt.id === childId);
    expect(child.summary).toBe(input.slice(0, 256));
    expect((child.summary ?? '').length).toBe(256);
  });

  it('beginRunThread does not mutate Thread.summary', async () => {
    const stub = createPrismaStub();
    const svc = createService(stub);
    const id = await svc.getOrCreateThreadByAlias('test', 'root-nochange', 'Initial summary');
    await svc.beginRunThread(id, []);
    const t = stub._store.threads.find((tt: any) => tt.id === id);
    expect(t.summary).toBe('Initial summary');
  });
});
