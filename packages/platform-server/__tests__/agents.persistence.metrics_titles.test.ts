import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';

function createService(stub: any, overrides?: { metrics?: any; templateRegistry?: any; graphRepo?: any }) {
  const metrics =
    overrides?.metrics ??
    ({
      getThreadsMetrics: async (ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, { remindersCount: 0, containersCount: 0, activity: 'idle' as const }])),
    } as any);
  const templateRegistry = overrides?.templateRegistry ?? ({ toSchema: async () => [] } as any);
  const graphRepo =
    overrides?.graphRepo ??
    ({ get: async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] }) } as any);
  return new AgentsPersistenceService(
    new StubPrismaService(stub) as any,
    new LoggerService(),
    metrics,
    new NoopGraphEventsPublisher(),
    templateRegistry,
    graphRepo,
  );
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
          { id: 'agent-configured', template: 'templateA', config: { title: '  Configured Agent  ' } },
          { id: 'agent-template', template: 'templateB' },
        ],
        edges: [],
      }),
    };
    const svc = createService(stub, { templateRegistry, graphRepo });

    const threadConfigured = (await stub.thread.create({ data: { alias: 'config' } })).id;
    const threadTemplate = (await stub.thread.create({ data: { alias: 'tmpl' } })).id;
    const threadFallback = (await stub.thread.create({ data: { alias: 'miss' } })).id;

    stub.conversationState._push({ threadId: threadConfigured, nodeId: 'agent-configured', state: {}, updatedAt: new Date('2024-04-02T00:00:00Z') });
    // Older state should be ignored in favour of more recent entry
    stub.conversationState._push({ threadId: threadConfigured, nodeId: 'agent-template', state: {}, updatedAt: new Date('2023-01-01T00:00:00Z') });
    stub.conversationState._push({ threadId: threadTemplate, nodeId: 'agent-template', state: {}, updatedAt: new Date('2024-03-01T00:00:00Z') });

    const titles = await svc.getThreadsAgentTitles([threadConfigured, threadTemplate, threadFallback]);
    expect(titles[threadConfigured]).toBe('Configured Agent');
    expect(titles[threadTemplate]).toBe('Template B');
    expect(titles[threadFallback]).toBe('(unknown agent)');
  });
});
