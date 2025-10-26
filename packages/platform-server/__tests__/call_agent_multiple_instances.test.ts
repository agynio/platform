import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { CallAgentTool } from '../src/nodes/tools/call_agent/call_agent.node';
import { LoggerService } from '../src/core/services/logger.service.js';

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
    toolDocs.init({ nodeId: 'call-agent-1' });
    toolDocs.setAgent(new FakeAgent() as any);
    // Retrieve tool after init via guarded lookup
    const docs = (toolDocs as any).getTools?.().find((t: any) => t?.name?.includes('docs')) ?? (toolDocs as any).getTool?.('agent-docs') ?? (toolDocs as any).getTool?.();
    expect(docs).toBeTruthy();
    expect(docs!.name).toBeDefined();
    expect(docs!.name).toBe('call_agent_docs');

    const toolOps = new CallAgentTool(logger);
    await toolOps.setConfig({ description: 'ops', name: 'call_agent_ops' });
    toolOps.init({ nodeId: 'call-agent-2' });
    toolOps.setAgent(new FakeAgent() as any);
    const ops = (toolOps as any).getTools?.().find((t: any) => t?.name?.includes('ops')) ?? (toolOps as any).getTool?.('agent-ops') ?? (toolOps as any).getTool?.();
    expect(ops).toBeTruthy();
    expect(ops!.name).toBeDefined();
    expect(ops!.name).toBe('call_agent_ops');

    const out1 = await (docs as any).invoke({ input: 'x', childThreadId: 'docs' }, { configurable: { thread_id: 'p' } } as any);
    const out2 = await (ops as any).invoke({ input: 'y', childThreadId: 'ops' }, { configurable: { thread_id: 'p' } } as any);
    expect(out1).toContain('ok-p__docs');
    expect(out2).toContain('ok-p__ops');
  });
});
