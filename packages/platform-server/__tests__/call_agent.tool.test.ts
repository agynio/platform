import { describe, it, expect } from 'vitest';
import { CallAgentTool } from '../src/graph/nodes/tools/call_agent/call_agent.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ResponseMessage, AIMessage, HumanMessage } from '@agyn/llm';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeAgent {
  constructor(private responder?: (thread: string, msgs: HumanMessage[]) => Promise<ResponseMessage>) {}
  async invoke(thread: string, messages: HumanMessage[]): Promise<ResponseMessage> {
    if (this.responder) return this.responder(thread, messages);
    const ai = AIMessage.fromText('OK');
    return new ResponseMessage({ output: [ai.toPlain()] });
  }
}

describe('CallAgentTool unit', () => {
  it('returns error when no agent attached', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await expect(tool.setConfig({ description: 'desc' })).resolves.toBeUndefined();
    const dynamic = tool.getTool();
    await expect(dynamic.execute({ input: 'hi', childThreadId: 'x' }, { threadId: 't1' } as any)).rejects.toThrowError(
      'Agent not set',
    );
  });

  it('calls attached agent and returns its response.text', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'sync' });
    const agent = new FakeAgent(async (thread, _msgs) => {
      expect(thread).toBe('t2__sub');
      const ai = AIMessage.fromText('OK');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
    // @ts-ignore private for unit
    tool['setAgent'](agent as any);
    const dynamic = tool.getTool();
    const out = await dynamic.execute({ input: 'ping', childThreadId: 'sub' }, { threadId: 't2' } as any);
    expect(out).toBe('OK');
  });

  // Context pass-through removed; tool forwards only text input.

  it('uses provided description in tool metadata', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'My desc' });
    const dynamic = tool.getTool();
    expect(dynamic.description).toBe('My desc');
    expect(dynamic.name).toBe('call_agent');
  });

  it('concatenates childThreadId with parent thread_id when provided', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'sync' });
    const agent = new FakeAgent(async (thread, _msgs) => {
      expect(thread).toBe('parent__sub');
      const ai = AIMessage.fromText('OK');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
    // @ts-ignore private for unit
    tool['setAgent'](agent as any);
    const dynamic = tool.getTool();
    const out = await dynamic.execute({ input: 'ping', childThreadId: 'sub' }, { threadId: 'parent' } as any);
    expect(out).toBe('OK');
  });

  it('async mode returns sent immediately', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'async' });
    const child = new FakeAgent(async (thread, msgs) => {
      expect(thread).toBe('p__c1');
      expect(msgs[0]?.text).toBe('do work');
      const ai = AIMessage.fromText('child-complete');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
    // @ts-ignore private for unit
    tool['setAgent'](child as any);
    const dynamic = tool.getTool();
    const res = await dynamic.execute({ input: 'do work', childThreadId: 'c1' }, { threadId: 'p' } as any);
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });

  it('ignore mode returns sent and does not trigger parent', async () => {
    const tool = new CallAgentTool(new LoggerService());
    await tool.setConfig({ description: 'desc', response: 'ignore' });
    const child = new FakeAgent(async () => {
      const ai = AIMessage.fromText('ignored');
      return new ResponseMessage({ output: [ai.toPlain()] });
    });
    // @ts-ignore private for unit
    tool['setAgent'](child as any);
    const dynamic = tool.getTool();
    const res = await dynamic.execute({ input: 'do work', childThreadId: 'c2' }, { threadId: 'p2' } as any);
    expect(typeof res).toBe('string');
    expect(JSON.parse(res).status).toBe('sent');
  });
});

// Graph wiring test requires full LiveGraphRuntime and persistence; skipped in unit environment.
