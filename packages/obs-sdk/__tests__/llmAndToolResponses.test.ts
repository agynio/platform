import { describe, it, expect } from 'vitest';
import { withLLM, withToolCall, init, LLMResponse, ToolCallResponse } from '../src';

// Simple fake fetch to avoid network during tests
// @ts-ignore
global.fetch = async () => ({ ok: true });

init({ mode: 'extended', endpoints: { extended: '', otlp: '' } });

describe('LLMResponse & withLLM', () => {
  it('requires LLMResponse and unwraps raw', async () => {
    const raw = { provider: 'fake', content: 'Hello world', tool_calls: [] };
    const result = await withLLM({ context: [{ role: 'human', content: 'Hi' }] as any }, async () =>
      new LLMResponse({ raw, content: 'Hello world', toolCalls: [] }),
    );
    expect(result).toBe(raw);
  });

  it('emits output attributes in completed span upsert', async () => {
    const posted: any[] = [];
    // @ts-ignore override per-test
    global.fetch = async (url: string, init: any) => {
      if (url.includes('/v1/spans/upsert')) {
        try { posted.push(JSON.parse(init.body)); } catch { /* ignore */ }
      }
      return { ok: true } as any;
    };
    const raw = { provider: 'fake', content: 'Result body' };
    await withLLM({ context: [] as any }, async () => new LLMResponse({ raw, content: 'Result body', toolCalls: [{ id: 'tc1', name: 'foo', arguments: {} }] }));
    const completed = posted.find(p => p.state === 'completed');
    expect(completed).toBeTruthy();
    expect(completed.attributes['llm.content']).toBe('Result body');
    expect(Array.isArray(completed.attributes['llm.toolCalls'])).toBe(true);
    expect(completed.attributes.output.content).toBe('Result body');
  });
});

describe('ToolCallResponse & withToolCall', () => {
  it('unwraps ToolCallResponse returning raw value', async () => {
    const raw = { internal: true };
    const output = { value: 42 };
  const r = await withToolCall({ toolCallId: 'tc1', name: 'demo', input: { a: 1 } }, async () => {
      return new ToolCallResponse({ raw, output });
    });
    expect(r).toBe(raw);
  });

  it('handles plain return value', async () => {
  const r = await withToolCall({ toolCallId: 'tc2', name: 'plain', input: {} }, async () => ({ ok: true }));
    expect(r).toEqual({ ok: true });
  });
});
