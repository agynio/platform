import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { createUserServiceStub } from './helpers/userService.stub';

const metricsStub = { getThreadsMetrics: async () => ({}) } as any;
const templateRegistryStub = { toSchema: async () => [], getMeta: () => undefined } as any;
const graphRepoStub = {
  get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }),
} as any;

const createLinkingStub = () =>
  ({
    buildInitialMetadata: (params: { tool: 'call_agent' | 'call_engineer'; parentThreadId: string; childThreadId: string }) => ({
      tool: params.tool,
      parentThreadId: params.parentThreadId,
      childThreadId: params.childThreadId,
      childRun: { id: null, status: 'queued', linkEnabled: false, latestMessageId: null },
      childRunId: null,
      childRunStatus: 'queued',
      childRunLinkEnabled: false,
      childMessageId: null,
    }),
    registerParentToolExecution: async () => null,
    onChildRunStarted: async () => null,
    onChildRunMessage: async () => null,
    onChildRunCompleted: async () => null,
    resolveLinkedAgentNodes: async () => ({}),
  }) as unknown as CallAgentLinkingService;

function createService() {
  const prismaStub = createPrismaStub();
  const svc = new AgentsPersistenceService(
    new StubPrismaService(prismaStub) as any,
    metricsStub,
    templateRegistryStub,
    graphRepoStub,
    createRunEventsStub() as any,
    createLinkingStub(),
    createEventsBusStub(),
    createUserServiceStub(),
  );
  return { prismaStub, svc };
}

function makeMetrics(ids: string[]): Record<string, { remindersCount: number; containersCount: number; activity: 'working' | 'waiting' | 'idle'; runsCount: number }> {
  const out: Record<string, { remindersCount: number; containersCount: number; activity: 'working' | 'waiting' | 'idle'; runsCount: number }> = {};
  for (const id of ids) {
    const numeric = Number(id.split('-')[1] ?? '0');
    const activity = numeric % 3 === 0 ? 'working' : numeric % 3 === 1 ? 'waiting' : 'idle';
    out[id] = { remindersCount: numeric, containersCount: numeric + 1, activity, runsCount: numeric + 2 };
  }
  return out;
}

function makeDescriptors(ids: string[]): Record<string, { title: string; role?: string; name?: string }> {
  const out: Record<string, { title: string; role?: string; name?: string }> = {};
  for (const id of ids) {
    out[id] = { title: `Agent ${id}`, role: `Role ${id}`, name: `Name ${id}` };
  }
  return out;
}

describe('AgentsPersistenceService.listThreadsTree', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nested roots, children, and grandchildren with metrics and descriptors', async () => {
    const { prismaStub, svc } = createService();

    const rootA = await prismaStub.thread.create({ data: { alias: 'root-a', parentId: null, summary: 'Root A', status: 'open' } });
    const rootB = await prismaStub.thread.create({ data: { alias: 'root-b', parentId: null, summary: 'Root B', status: 'open' } });

    const childA1 = await prismaStub.thread.create({ data: { alias: 'child-a1', parentId: rootA.id, summary: 'Child A1', status: 'open' } });
    const childA2 = await prismaStub.thread.create({ data: { alias: 'child-a2', parentId: rootA.id, summary: 'Child A2', status: 'open' } });
    const childB1 = await prismaStub.thread.create({ data: { alias: 'child-b1', parentId: rootB.id, summary: 'Child B1', status: 'closed' } });

    const grandA1 = await prismaStub.thread.create({ data: { alias: 'grand-a1', parentId: childA1.id, summary: 'Grand A1', status: 'open' } });
    const grandA2 = await prismaStub.thread.create({ data: { alias: 'grand-a2', parentId: childA1.id, summary: 'Grand A2', status: 'closed' } });
    const grandA3 = await prismaStub.thread.create({ data: { alias: 'grand-a3', parentId: childA2.id, summary: 'Grand A3', status: 'open' } });
    await prismaStub.thread.create({ data: { alias: 'great-a1', parentId: grandA1.id, summary: 'Great A1', status: 'open' } });

    vi.spyOn(svc, 'getThreadsMetrics').mockImplementation(async (ids: string[]) => makeMetrics(ids));
    vi.spyOn(svc as any, 'getThreadsAgentDescriptors').mockImplementation(async (ids: string[]) => makeDescriptors(ids));

    const result = await svc.listThreadsTree({
      status: 'all',
      limit: 10,
      depth: 2,
      includeMetrics: true,
      includeAgentTitles: true,
      childrenStatus: 'all',
      perParentChildrenLimit: 10,
    });

    expect(result.map((node) => node.id)).toEqual([rootB.id, rootA.id]);

    const latestRoot = result[0];
    expect(latestRoot.id).toBe(rootB.id);
    expect(latestRoot.children?.map((child) => child.id)).toEqual([childB1.id]);
    expect(latestRoot.hasChildren).toBe(true);
    expect(latestRoot.metrics).toMatchObject(makeMetrics([rootB.id])[rootB.id]);
    expect(latestRoot.agentTitle).toBe(`Agent ${rootB.id}`);
    expect(latestRoot.agentRole).toBe(`Role ${rootB.id}`);
    expect(latestRoot.agentName).toBe(`Name ${rootB.id}`);

    const root = result[1];
    expect(root.children?.map((child) => child.id)).toEqual([childA2.id, childA1.id]);
    expect(root.hasChildren).toBe(true);
    expect(root.metrics).toMatchObject(makeMetrics([rootA.id])[rootA.id]);
    const child1 = root.children?.find((child) => child.id === childA1.id);
    const child2 = root.children?.find((child) => child.id === childA2.id);
    expect(child2?.children?.map((grand) => grand.id)).toEqual([grandA3.id]);
    expect(child2?.hasChildren).toBe(true);
    expect(child2?.metrics).toMatchObject(makeMetrics([childA2.id])[childA2.id]);
    expect(child2?.agentTitle).toBe(`Agent ${childA2.id}`);
    expect(child2?.agentName).toBe(`Name ${childA2.id}`);
    expect(child2?.agentRole).toBe(`Role ${childA2.id}`);

    expect(child1?.children?.map((grand) => grand.id)).toEqual([grandA2.id, grandA1.id]);
    expect(child1?.hasChildren).toBe(true);
    const grand1 = child1?.children?.find((grand) => grand.id === grandA1.id);
    const grand2 = child1?.children?.find((grand) => grand.id === grandA2.id);
    expect(grand1?.hasChildren).toBe(true);
    expect(grand1?.children).toBeUndefined();
    expect(grand2?.hasChildren).toBe(false);
    expect(grand1?.metrics).toMatchObject(makeMetrics([grandA1.id])[grandA1.id]);
    expect(grand1?.agentTitle).toBe(`Agent ${grandA1.id}`);
    expect(grand2?.agentTitle).toBe(`Agent ${grandA2.id}`);
    expect(grand1?.agentName).toBe(`Name ${grandA1.id}`);
    expect(grand1?.agentRole).toBe(`Role ${grandA1.id}`);
    expect(grand2?.agentName).toBe(`Name ${grandA2.id}`);
    expect(grand2?.agentRole).toBe(`Role ${grandA2.id}`);
  });

  it('respects depth and children status filters', async () => {
    const { prismaStub, svc } = createService();

    const root = await prismaStub.thread.create({ data: { alias: 'root', parentId: null, summary: 'Root', status: 'open' } });
    const openChild1 = await prismaStub.thread.create({ data: { alias: 'open-1', parentId: root.id, summary: 'Open 1', status: 'open' } });
    const openChild2 = await prismaStub.thread.create({ data: { alias: 'open-2', parentId: root.id, summary: 'Open 2', status: 'open' } });
    const closedChild = await prismaStub.thread.create({ data: { alias: 'closed-1', parentId: root.id, summary: 'Closed', status: 'closed' } });

    vi.spyOn(svc, 'getThreadsMetrics').mockImplementation(async () => ({}));
    vi.spyOn(svc as any, 'getThreadsAgentDescriptors').mockImplementation(async (ids: string[]) => makeDescriptors(ids));

    const openOnly = await svc.listThreadsTree({
      status: 'all',
      limit: 5,
      depth: 1,
      includeMetrics: false,
      includeAgentTitles: false,
      childrenStatus: 'open',
      perParentChildrenLimit: 1,
    });

    expect(openOnly).toHaveLength(1);
    const rootNode = openOnly[0];
    expect(rootNode.children?.length).toBe(1);
    expect(rootNode.children?.[0]?.id).toBe(openChild2.id);
    expect(rootNode.hasChildren).toBe(true);
    expect(rootNode.children?.[0]?.hasChildren).toBe(false);
    expect(rootNode.children?.[0]?.agentTitle).toBeUndefined();
    expect(rootNode.children?.[0]?.agentRole).toBe(`Role ${openChild2.id}`);
    expect(rootNode.children?.[0]?.agentName).toBe(`Name ${openChild2.id}`);

    const closedOnly = await svc.listThreadsTree({
      status: 'all',
      limit: 5,
      depth: 1,
      includeMetrics: false,
      includeAgentTitles: true,
      childrenStatus: 'closed',
      perParentChildrenLimit: 5,
    });

    expect(closedOnly[0].children?.map((child) => child.id)).toEqual([closedChild.id]);
    expect(closedOnly[0].hasChildren).toBe(true);

    const none = await svc.listThreadsTree({
      status: 'all',
      limit: 5,
      depth: 0,
      includeMetrics: false,
      includeAgentTitles: false,
      childrenStatus: 'closed',
      perParentChildrenLimit: 5,
    });

    expect(none[0].children).toBeUndefined();
    expect(none[0].hasChildren).toBe(true);
  });
});
