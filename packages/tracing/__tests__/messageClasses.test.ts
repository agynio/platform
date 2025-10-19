import { describe, it, expect } from 'vitest';
import { BaseMessage, SystemMessage, HumanMessage, AIMessage, ToolMessage, withLLM, init, LLMResponse } from '../src';

// mock fetch
// @ts-ignore
global.fetch = async () => ({ ok: true });

init({ mode: 'extended', endpoints: { extended: '', otlp: '' } });

describe('Message class hierarchy', () => {
  it('creates concrete message instances', () => {
    const sys = new SystemMessage('sys');
    const hum = new HumanMessage('hi');
    const ai = new AIMessage('hello', [{ id: '1', name: 'tool', arguments: { a: 1 } }]);
    const tool = new ToolMessage('1', 'result');
    expect(sys.role).toBe('system');
    expect(hum.role).toBe('human');
    expect(ai.toolCalls?.length).toBe(1);
    expect(tool.toolCallId).toBe('1');
  });

  it('fromLangChain maps user/assistant/tool formats', () => {
    const lcUser = { role: 'user', content: 'hello there' };
    const lcAi = { role: 'assistant', content: 'hi', tool_calls: [{ name: 't', args: { v: 1 } }] } as any;
    const lcTool = { role: 'tool', tool_call_id: 'abc', content: 'done' } as any;
    const m1 = BaseMessage.fromLangChain(lcUser);
    const m2 = BaseMessage.fromLangChain(lcAi);
    const m3 = BaseMessage.fromLangChain(lcTool);
    expect(m1 instanceof HumanMessage).toBe(true);
    expect(m2 instanceof AIMessage).toBe(true);
    expect((m2 as AIMessage).toolCalls?.[0].name).toBe('t');
    expect(m3 instanceof ToolMessage).toBe(true);
  });
});

describe('withLLM context normalization', () => {
  it('accepts raw objects and converts them', async () => {
    const rawContext = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ];
    const res = await withLLM({ context: rawContext as any }, async () => new LLMResponse({ raw: { content: 'ok' }, content: 'ok' }));
    expect(res).toEqual({ content: 'ok' });
  });
});
