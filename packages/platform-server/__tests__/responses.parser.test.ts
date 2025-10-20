import { describe, it, expect, vi } from 'vitest';
import { OpenAIResponsesService } from '../src/services/openai.responses';

const make = (segments: any[]) => ({ id: 'resp_1', output: [{ type: 'message', role: 'assistant', content: segments }] });

describe('Responses parser', () => {
  it('parses reasoning + output_text', () => {
    const raw = make([
      { type: 'reasoning', text: 'thinking' },
      { type: 'output_text', text: 'hello' },
    ]);
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('hello');
    expect(res.toolCalls.length).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reasoning-only sequence warns, no throw, empty content', () => {
    const raw = make([{ type: 'reasoning', text: 'thinking' }]);
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('top-level output_text fallback populates content when no assistant segments', () => {
    const raw = { id: 'x', output: [], output_text: 'hello-top' } as any;
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('hello-top');
  });

  it('skips unknown content item type gracefully', () => {
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const raw = make([{ type: 'unknown_type', whatever: true }]);
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('');
    expect(logger.debug).toHaveBeenCalled();
  });

  it('ToolMessage mapping supports JSON and string tool_result values', () => {
    // The toResponsesPayload handles ToolMessage to tool_result mapping; we exercise parseResponse tolerance
    const raw = make([
      { type: 'output_text', text: 'before' },
      { type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' },
      { type: 'tool_result', tool_use_id: 't2', content: 'plain string' },
      { type: 'output_text', text: 'after' },
    ]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('before\nafter');
  });

  it('Round-trip mapping: AIMessage tool_calls -> Responses payload -> parse back toolCalls', () => {
    const ai = new (require('@langchain/core/messages').AIMessage)({
      content: 'x',
      tool_calls: [
        { id: 'a1', name: 'sum', args: { a: 1 } },
        { id: 'a2', name: 'sub', args: { b: 2 } },
      ],
    });
    const { messages } = OpenAIResponsesService.toResponsesPayload([ai], [] as any);
    // Simulate a minimal response echoing back tool_use items
    const raw = { id: 'r', output: [{ type: 'message', role: 'assistant', content: messages[0].content }] } as any;
    const parsed = OpenAIResponsesService.parseResponse(raw);
    expect(parsed.toolCalls).toEqual([
      { id: 'a1', name: 'sum', arguments: { a: 1 } },
      { id: 'a2', name: 'sub', arguments: { b: 2 } },
    ]);
  });

  it('parses tool_use only', () => {
    const raw = make([{ type: 'tool_use', id: 't1', name: 'do', input: { a: 1 } }]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('');
    expect(res.toolCalls[0]).toEqual({ id: 't1', name: 'do', arguments: { a: 1 } });
  });

  it('reasoning followed by tool_use (no output_text) warns and preserves toolCalls', () => {
    const raw = make([
      { type: 'reasoning', text: 'think' },
      { type: 'tool_use', id: 't2', name: 'calc', input: { n: 2 } },
    ]);
    const logger = { warn: vi.fn(), debug: vi.fn() } as any;
    const res = OpenAIResponsesService.parseResponse(raw, logger);
    expect(res.content).toBe('');
    expect(res.toolCalls[0]).toEqual({ id: 't2', name: 'calc', arguments: { n: 2 } });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('concatenates multiple output_text segments', () => {
    const raw = make([
      { type: 'output_text', text: 'part1' },
      { type: 'output_text', text: 'part2' },
    ]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('part1\npart2');
  });

  it('tool_result round-trip scenario ignored in output parsing', () => {
    const raw = make([
      { type: 'output_text', text: 'before' },
      { type: 'tool_result', tool_use_id: 't1', content: { ok: true } },
      { type: 'output_text', text: 'after' },
    ]);
    const res = OpenAIResponsesService.parseResponse(raw);
    expect(res.content).toBe('before\nafter');
    expect(res.toolCalls.length).toBe(0);
  });
});
