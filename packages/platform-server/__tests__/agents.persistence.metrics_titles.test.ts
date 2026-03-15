import { describe, it, expect } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { createRunEventsStub } from './helpers/runEvents.stub';
import { createEventsBusStub } from './helpers/eventsBus.stub';
import { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import { AgentConfigSchema, AgentSchema } from '../src/proto/gen/agynio/api/teams/v1/teams_pb';
import { createTeamsClientStub } from './helpers/teamsGrpc.stub';

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
  overrides?: { metrics?: any; teamsClient?: ReturnType<typeof createTeamsClientStub>; linking?: CallAgentLinkingService },
) {
  const metrics =
    overrides?.metrics ??
    ({
      getThreadsMetrics: async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { remindersCount: 0, containersCount: 0, activity: 'idle' as const }])),
    } as any);
  const teamsClient = overrides?.teamsClient ?? createTeamsClientStub();
  const eventsBusStub = createEventsBusStub();
  const svc = new AgentsPersistenceService(
    new StubPrismaService(stub) as any,
    metrics,
    teamsClient,
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

  it('resolves agent titles from Teams config and falls back when missing', async () => {
    const stub = createPrismaStub();
    const teamsClient = createTeamsClientStub({
      agents: [
        create(AgentSchema, {
          meta: { id: 'agent-configured' },
          title: '  Configured Agent  ',
          description: '',
          config: create(AgentConfigSchema, { name: '  Casey  ', role: '  Lead Engineer  ' }),
        }),
        create(AgentSchema, {
          meta: { id: 'agent-profile' },
          title: '',
          description: '',
          config: create(AgentConfigSchema, { name: '  Delta  ', role: '  Support  ' }),
        }),
        create(AgentSchema, { meta: { id: 'agent-template' }, title: '', description: '' }),
        create(AgentSchema, { meta: { id: 'agent-assigned' }, title: 'Assigned Only', description: '' }),
      ],
    });
    const threadConfigured = (await stub.thread.create({ data: { alias: 'config' } })).id;
    const threadProfile = (await stub.thread.create({ data: { alias: 'profile' } })).id;
    const threadTemplate = (await stub.thread.create({ data: { alias: 'tmpl' } })).id;
    const threadFallback = (await stub.thread.create({ data: { alias: 'miss' } })).id;
    const threadAssignedOnly = (await stub.thread.create({ data: { alias: 'assigned' } })).id;

    await stub.thread.update({ where: { id: threadConfigured }, data: { assignedAgentNodeId: 'agent-configured' } });
    await stub.thread.update({ where: { id: threadProfile }, data: { assignedAgentNodeId: 'agent-profile' } });
    await stub.thread.update({ where: { id: threadTemplate }, data: { assignedAgentNodeId: 'agent-template' } });
    await stub.thread.update({ where: { id: threadAssignedOnly }, data: { assignedAgentNodeId: 'agent-assigned' } });

    const svc = createService(stub, { teamsClient });

    const titles = await svc.getThreadsAgentTitles([
      threadConfigured,
      threadProfile,
      threadTemplate,
      threadFallback,
      threadAssignedOnly,
    ]);
    expect(titles[threadConfigured]).toBe('Configured Agent');
    expect(titles[threadProfile]).toBe('Delta (Support)');
    expect(titles[threadTemplate]).toBe('(unknown agent)');
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
    expect(descriptors[threadTemplate]).toEqual({ title: '(unknown agent)' });
    expect(descriptors[threadFallback]).toEqual({ title: '(unknown agent)' });
  });

  it('returns fallback descriptor when assigned agent missing', async () => {
    const stub = createPrismaStub();
    const threadLinked = (await stub.thread.create({ data: { alias: 'linked' } })).id;
    await stub.thread.update({ where: { id: threadLinked }, data: { assignedAgentNodeId: 'agent-linked' } });

    const linking = createLinkingStub({
      resolveLinkedAgentNodes: async () => {
        throw new Error('resolveLinkedAgentNodes should not be called');
      },
    });

    const svc = createService(stub, { linking });

    const descriptors = await svc.getThreadsAgentDescriptors([threadLinked]);
    expect(descriptors[threadLinked]).toEqual({ title: '(unknown agent)' });
  });
});
