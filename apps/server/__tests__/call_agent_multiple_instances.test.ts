import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { CallAgentTool } from '../src/tools/call_agent.tool';
import { LoggerService } from '../src/services/logger.service';

class FakeAgent {
  async invoke(thread: string) {
    return new AIMessage(`ok-${thread}`);
  }
}

describe('CallAgentTool configurable name', () => {
  it('registers different names and routes calls accordingly', async () => {
    const logger = new LoggerService();

    const toolDocs = new CallAgentTool(logger);
    await toolDocs.setConfig({ description: 'docs', name: 'call_agent_docs' });
    toolDocs.setAgent(new FakeAgent() as any);
    const dynDocs = toolDocs.init();

    const toolOps = new CallAgentTool(logger);
    await toolOps.setConfig({ description: 'ops', name: 'call_agent_ops' });
    toolOps.setAgent(new FakeAgent() as any);
    const dynOps = toolOps.init();

    expect(dynDocs.name).toBe('call_agent_docs');
    expect(dynOps.name).toBe('call_agent_ops');

    const out1 = await dynDocs.invoke({ input: 'x', childThreadId: 'docs' }, { configurable: { thread_id: 'p' } } as any);
    const out2 = await dynOps.invoke({ input: 'y', childThreadId: 'ops' }, { configurable: { thread_id: 'p' } } as any);
    expect(out1).toContain('ok-p__docs');
    expect(out2).toContain('ok-p__ops');
  });
});
