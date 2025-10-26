import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage, ToolCallMessage, withLLM, init, LLMResponse } from '../src';
import { ResponseMessage } from '@agyn/llm';

// mock fetch
// @ts-ignore
global.fetch = async () => ({ ok: true });

init({ mode: 'extended', endpoints: { extended: '', otlp: '' } });

describe('Message classes via @agyn/llm', () => {
  it('creates concrete message instances', () => {
    const sys = SystemMessage.fromText('sys');
    const hum = HumanMessage.fromText('hi');
    const response = new ResponseMessage({
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'input_text', text: 'hello' }] },
        new ToolCallMessage({ type: 'function_call', call_id: '1', name: 'tool', arguments: JSON.stringify({ a: 1 }) } as any).toPlain(),
      ],
    } as any);
    expect(sys.role).toBe('system');
    expect(hum.role).toBe('user');
    const calls = response.output.filter((o) => o instanceof ToolCallMessage) as ToolCallMessage[];
    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe('tool');
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
