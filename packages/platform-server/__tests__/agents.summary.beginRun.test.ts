import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';
import { HumanMessage, SystemMessage } from '@agyn/llm';

describe('AgentsPersistenceService summary auto-fill on beginRun', () => {
  it('sets summary only on thread creation from first input message (trim end, truncate 200)', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));

    const long = 'x'.repeat(250) + '   ';
    await svc.beginRun('alias-1', [HumanMessage.fromText(long), SystemMessage.fromText('ignored')]);

    const t = stub._store.threads.find((x: any) => x.alias === 'alias-1');
    expect(t).toBeTruthy();
    expect(t.summary).toBe('x'.repeat(200));

    // Subsequent beginRun on existing thread should not change summary
    await svc.beginRun('alias-1', [HumanMessage.fromText('new summary would be ignored')]);
    const t2 = stub._store.threads.find((x: any) => x.alias === 'alias-1');
    expect(t2.summary).toBe('x'.repeat(200));
  });

  it('does not set or change summary in recordInjected/completeRun', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub));

    await svc.beginRun('alias-2', [HumanMessage.fromText('Hello   ')]);
    const t = stub._store.threads.find((x: any) => x.alias === 'alias-2');
    expect(t.summary).toBe('Hello');
  });
});

