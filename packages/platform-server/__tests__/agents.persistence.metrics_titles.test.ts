import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';

const createLinkingStub = (overrides?: Partial<CallAgentLinkingService>) =>
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
    ...overrides,
  }) as unknown as CallAgentLinkingService;

function createService(
  stub: any,
  overrides?: { metrics?: any; templateRegistry?: any; graphRepo?: any; linking?: CallAgentLinkingService },
) {
  const metrics =
    overrides?.metrics ??
    ({
      getThreadsMetrics: async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { remindersCount: 0, containersCount: 0, activity: 'idle' as const }])),
    } as any);
  const templateRegistry =
    overrides?.templateRegistry ??
    ({
      toSchema: async () => [],
      getMeta: () => undefined,
    } as any);
  const graphRepo =
    overrides?.graphRepo ??
    ({ get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }) } as any);
  const eventsBusStub = createEventsBusStub();
  const svc = new AgentsPersistenceService(
    new StubPrismaService(stub) as any,
    metrics,
    templateRegistry,
    graphRepo,
    createRunEventsStub() as any,
    overrides?.linking ?? createLinkingStub(),
    eventsBusStub,
  );
  return svc;
}

describe('AgentsPersistenceService metrics and agent titles', () => {
  it('merges runs count into thread metrics response', async () => {
    const stub = createPrismaStub();
    const remindersMetrics = {
      getThreadsMetrics: async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { remindersCount: 2, containersCount: 1, activity: 'waiting' as const }])),
    };
    const svc = createService(stub, { metrics: remindersMetrics });

    const threadA = (await stub.thread.create({ data: { alias: 'A' } })).id;
    const threadB = (await stub.thread.create({ data: { alias: 'B' } })).id;

    await stub.run.create({ data: { threadId: threadA, status: 'running' } });
    await stub.run.create({ data: { threadId: threadA, status: 'finished' } });

    const metrics = await svc.getThreadsMetrics([threadA, threadB]);
    expect(metrics[threadA]).toEqual({ remindersCount: 2, containersCount: 1, activity: 'waiting', runsCount: 2 });
    expect(metrics[threadB]).toEqual({ remindersCount: 2, containersCount: 1, activity: 'waiting', runsCount: 0 });
  });

  it('resolves agent titles from config, template, and falls back when missing', async () => {
    const stub = createPrismaStub();
    const templateRegistry = {
      toSchema: async () => [
        { name: 'templateA', title: 'Template A', kind: 'agent', sourcePorts: [], targetPorts: [] },
        { name: 'templateB', title: 'Template B', kind: 'agent', sourcePorts: [], targetPorts: [] },
      ],
      getMeta: (template: string) => {
        if (template === 'templateA') return { title: 'Template A', kind: 'agent' };
        if (template === 'templateB') return { title: 'Template B', kind: 'agent' };
        return undefined;
      },
    };
    const graphRepo = {
      get: async () => ({
        name: 'main',
        version: 1,
        updatedAt: new Date().toISOString(),
        nodes: [
          {
            id: 'agent-configured',
            template: 'templateA',
            config: { title: '  Configured Agent  ', name: '  Casey  ', role: '  Lead Engineer  ' },
          },
          {
            id: 'agent-profile',
            template: 'templateA',
            config: { name: '  Delta  ', role: '  Support  ' },
          },
          { id: 'agent-template', template: 'templateB' },
          { id: 'agent-assigned', template: 'templateA', config: { title: 'Assigned Only' } },
        ],
        edges: [],
      }),
    };
    const threadConfigured = (await stub.thread.create({ data: { alias: 'config' } })).id;
    const threadProfile = (await stub.thread.create({ data: { alias: 'profile' } })).id;
    const threadTemplate = (await stub.thread.create({ data: { alias: 'tmpl' } })).id;
    const threadFallback = (await stub.thread.create({ data: { alias: 'miss' } })).id;
    const threadAssignedOnly = (await stub.thread.create({ data: { alias: 'assigned' } })).id;

    await stub.thread.update({ where: { id: threadConfigured }, data: { assignedAgentNodeId: 'agent-configured' } });
    await stub.thread.update({ where: { id: threadProfile }, data: { assignedAgentNodeId: 'agent-profile' } });
    await stub.thread.update({ where: { id: threadTemplate }, data: { assignedAgentNodeId: 'agent-template' } });
    await stub.thread.update({ where: { id: threadAssignedOnly }, data: { assignedAgentNodeId: 'agent-assigned' } });

    const svc = createService(stub, { templateRegistry, graphRepo });

    const titles = await svc.getThreadsAgentTitles([
      threadConfigured,
      threadProfile,
      threadTemplate,
      threadFallback,
      threadAssignedOnly,
    ]);
    expect(titles[threadConfigured]).toBe('Configured Agent');
    expect(titles[threadProfile]).toBe('Delta (Support)');
    expect(titles[threadTemplate]).toBe('Template B');
    expect(titles[threadFallback]).toBe('(unknown agent)');
    expect(titles[threadAssignedOnly]).toBe('Assigned Only');

    const roles = await svc.getThreadsAgentRoles([
      threadConfigured,
      threadProfile,
      threadTemplate,
      threadFallback,
      threadAssignedOnly,
    ]);
    expect(roles[threadConfigured]).toBe('Lead Engineer');
    expect(roles[threadProfile]).toBe('Support');
    expect(roles[threadTemplate]).toBeUndefined();
    expect(roles[threadFallback]).toBeUndefined();
    expect(roles[threadAssignedOnly]).toBeUndefined();

    const descriptors = await svc.getThreadsAgentDescriptors([
      threadConfigured,
      threadProfile,
      threadTemplate,
      threadFallback,
    ]);
    expect(descriptors[threadConfigured]).toEqual({ title: 'Configured Agent', role: 'Lead Engineer', name: 'Casey' });
    expect(descriptors[threadProfile]).toEqual({ title: 'Delta (Support)', role: 'Support', name: 'Delta' });
    expect(descriptors[threadTemplate]).toEqual({ title: 'Template B' });
    expect(descriptors[threadFallback]).toEqual({ title: '(unknown agent)' });
  });

  it('returns fallback descriptor when assigned agent missing', async () => {
    const stub = createPrismaStub();
    const templateRegistry = {
      toSchema: async () => [
        { name: 'templateA', title: 'Template A', kind: 'agent', sourcePorts: [], targetPorts: [] },
      ],
      getMeta: (template: string) => {
        if (template === 'templateA') return { title: 'Template A', kind: 'agent' };
        return undefined;
      },
    };
    const graphRepo = {
      get: async () => ({
        name: 'main',
        version: 1,
        updatedAt: new Date().toISOString(),
        nodes: [
          {
            id: 'agent-linked',
            template: 'templateA',
            config: { title: '', name: '  Orion  ', role: '  Strategist  ' },
          },
        ],
        edges: [],
      }),
    };

    const threadLinked = (await stub.thread.create({ data: { alias: 'linked' } })).id;

    const linking = createLinkingStub({
      resolveLinkedAgentNodes: async () => {
        throw new Error('resolveLinkedAgentNodes should not be called');
      },
    });

    const svc = createService(stub, { templateRegistry, graphRepo, linking });

    const descriptors = await svc.getThreadsAgentDescriptors([threadLinked]);
    expect(descriptors[threadLinked]).toEqual({ title: '(unknown agent)' });
  });
});
