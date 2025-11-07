import { describe, it, expect, vi } from 'vitest';
// Mock Prisma client to avoid generated client requirement in tests
vi.mock('@prisma/client', () => ({
  MessageKind: { user: 'user', system: 'system', assistant: 'assistant', tool: 'tool' },
  RunStatus: { finished: 'finished', running: 'running', terminated: 'terminated' },
  RunMessageType: { input: 'input', output: 'output', injected: 'injected' },
  Prisma: { JsonNull: null },
}));
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { AIMessage, HumanMessage, SystemMessage } from '@agyn/llm';

describe('AgentsPersistenceService summary auto-fill on beginRun', () => {
  it('initializes summary from first HumanMessage, trims and truncates at word boundary', async () => {
    const stub = createPrismaStub();
    const publisher = new NoopGraphEventsPublisher();
    const spy = vi.spyOn(publisher, 'emitThreadUpdated');
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, publisher);
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-1');
    const long = ('# Heading\n' + 'word '.repeat(70)).trim(); // > 250 chars with spaces
    await svc.beginRunThread(tid, [HumanMessage.fromText(long), SystemMessage.fromText('ignored')]);

    const t = stub._store.threads.find((x: any) => x.id === tid);
    expect(t).toBeTruthy();
    expect((t.summary ?? '').length).toBeLessThanOrEqual(250);
    // Should not end with partial word due to truncation by last space
    const reconstructed = t.summary as string;
    expect(reconstructed.endsWith(' ')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite summary on subsequent beginRunThread', async () => {
    const stub = createPrismaStub();
    const publisher = new NoopGraphEventsPublisher();
    const spy = vi.spyOn(publisher, 'emitThreadUpdated');
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, publisher);
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-2');
    await svc.beginRunThread(tid, [HumanMessage.fromText('Hello   ')]);
    const s1 = stub._store.threads.find((x: any) => x.id === tid).summary;
    expect(s1).toBe('Hello');
    await svc.beginRunThread(tid, [HumanMessage.fromText('new summary would be ignored')]);
    const s2 = stub._store.threads.find((x: any) => x.id === tid).summary;
    expect(s2).toBe('Hello');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('falls back to SystemMessage then AIMessage when no HumanMessage', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-3');
    await svc.beginRunThread(tid, [SystemMessage.fromText('  System text  '), AIMessage.fromText('Assistant text')]);
    const s1 = stub._store.threads.find((x: any) => x.id === tid).summary;
    expect(s1).toBe('System text');

    const tid2 = await svc.getOrCreateThreadByAlias('test', 'alias-4');
    await svc.beginRunThread(tid2, [SystemMessage.fromText('   '), AIMessage.fromText('  Assistant text  ')]);
    const s2 = stub._store.threads.find((x: any) => x.id === tid2).summary;
    expect(s2).toBe('Assistant text');
  });

  it('skips empty/whitespace-only messages; later run can initialize when summary is still null', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-5');
    await svc.beginRunThread(tid, [HumanMessage.fromText('   '), SystemMessage.fromText('\n\n')]);
    expect(stub._store.threads.find((x: any) => x.id === tid).summary).toBe(null);
    await svc.beginRunThread(tid, [HumanMessage.fromText('init now')]);
    expect(stub._store.threads.find((x: any) => x.id === tid).summary).toBe('init now');
  });

  it('strips markdown formatting and link/image URLs per rules', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-6');
    const md = `# Title\n**bold** _italics_ ~strike~ \`code\` \n\nText with [label](http://x) and ![alt](http://y).`;
    await svc.beginRunThread(tid, [HumanMessage.fromText(md)]);
    const summary = stub._store.threads.find((x: any) => x.id === tid).summary;
    expect(summary).toBe('Title bold italics strike code Text with label and alt.');
  });

  it('hard-truncates at 250 when no spaces present before limit', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-7');
    const longNoSpaces = 'x'.repeat(260);
    await svc.beginRunThread(tid, [HumanMessage.fromText(longNoSpaces)]);
    const summary = stub._store.threads.find((x: any) => x.id === tid).summary as string;
    expect(summary.length).toBe(250);
    expect(summary).toBe('x'.repeat(250));
  });
});
