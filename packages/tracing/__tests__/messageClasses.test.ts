import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage, ToolCallMessage, withLLM, init, LLMResponse } from '../src';
import { ResponseMessage, AIMessage } from '@agyn/llm';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

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
        AIMessage.fromText('hello').toPlain(),
        new ToolCallMessage({ type: 'function_call', call_id: '1', name: 'tool', arguments: JSON.stringify({ a: 1 }) } satisfies ResponseFunctionToolCall).toPlain(),
      ],
    });
    expect(sys.role).toBe('system');
    expect(hum.role).toBe('user');
    const calls = response.output.filter((o) => o instanceof ToolCallMessage) as ToolCallMessage[];
    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe('tool');
  });
});

describe('withLLM context normalization', () => {
  it('accepts ContextMessage instances only', async () => {
    const ctx = [SystemMessage.fromText('sys'), HumanMessage.fromText('hello')];
    const res = await withLLM({ context: ctx }, async () => new LLMResponse({ raw: { content: 'ok' }, content: 'ok' }));
    expect(res).toEqual({ content: 'ok' });
  });
});
