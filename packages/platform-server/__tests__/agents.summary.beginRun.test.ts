import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { HumanMessage, SystemMessage } from '@agyn/llm';

describe('AgentsPersistenceService summary auto-fill on beginRun', () => {
  it('beginRunThread persists input messages without mutating thread summary', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-1');
    const long = 'x'.repeat(250) + '   ';
    await svc.beginRunThread(tid, [HumanMessage.fromText(long), SystemMessage.fromText('ignored')]);

    const t = stub._store.threads.find((x: any) => x.id === tid);
    expect(t).toBeTruthy();
    expect(t.summary).toBe(null);

    // Subsequent beginRunThread on existing thread should not change summary
    await svc.beginRunThread(tid, [HumanMessage.fromText('new summary would be ignored')]);
    const t2 = stub._store.threads.find((x: any) => x.id === tid);
    expect(t2.summary).toBe(null);
  });

  it('recordInjected/completeRun do not change thread summary', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));
    const tid = await svc.getOrCreateThreadByAlias('test', 'alias-2');
    await svc.beginRunThread(tid, [HumanMessage.fromText('Hello   ')]);
    const t = stub._store.threads.find((x: any) => x.id === tid);
    expect(t.summary).toBe(null);
  });
});
