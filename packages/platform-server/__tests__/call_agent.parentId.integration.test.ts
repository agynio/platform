import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { CallAgentTool } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { ResponseMessage } from '@agyn/llm';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

class FakeAgentWithPersistence {
  constructor(private persistence: AgentsPersistenceService) {}
  async invoke(thread: string, _messages: any[], parentThreadId?: string | null): Promise<ResponseMessage> {
    await this.persistence.beginRun(thread, [{ role: 'user', text: 'work' }], parentThreadId);
    return ResponseMessage.fromText('OK');
  }
}

describe('call_agent integration: creates child thread with parentId', () => {
  it('creates parent and child threads and sets child.parentId', async () => {
    const stub = createPrismaStub();
    const persistence = new AgentsPersistenceService(new StubPrismaService(stub));
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'sync' });
    // Attach fake agent that persists runs/threads
    // @ts-ignore private for unit/integration
    tool['setAgent'](new FakeAgentWithPersistence(persistence) as any);

    const dynamic = tool.getTool();
    const res = await dynamic.execute({ input: 'do', childThreadId: 'childX' }, { threadId: 'parentX' } as any);
    expect(res).toBe('OK');

    const parent = stub._store.threads.find((t: any) => t.alias === 'parentX');
    const child = stub._store.threads.find((t: any) => t.alias === 'parentX__childX');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
  });
});
