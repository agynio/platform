import { describe, expect, it } from 'vitest';
import { computeTailNewIndices, type ContextMessage } from '../llmContextDiff';

const baseMessage = (overrides: Partial<ContextMessage> = {}): ContextMessage => ({
  role: 'assistant',
  content: 'Hello there',
  ...overrides,
});

describe('computeTailNewIndices', () => {
  it('marks every message as new when there is no previous context', () => {
    const current = [baseMessage(), baseMessage({ role: 'user', content: 'Ping' })];

    expect(computeTailNewIndices([], current)).toEqual([0, 1]);
    expect(computeTailNewIndices(undefined, current)).toEqual([0, 1]);
  });

  it('returns an empty array when contexts are identical', () => {
    const previous = [baseMessage(), baseMessage({ role: 'user', content: 'Question?' })];
    const current = [...previous];

    expect(computeTailNewIndices(previous, current)).toEqual([]);
  });

  it('flags only appended messages even if earlier entries differ', () => {
    const previous = [
      baseMessage({ role: 'user', content: 'Initial prompt' }),
      baseMessage({ role: 'assistant', content: 'Response A' }),
    ];

    const current = [
      baseMessage({ role: 'user', content: 'Modified prompt' }),
      baseMessage({ role: 'assistant', content: 'Response B' }),
      baseMessage({ role: 'assistant', content: 'Follow up 1' }),
      baseMessage({ role: 'assistant', content: 'Follow up 2' }),
    ];

    expect(computeTailNewIndices(previous, current)).toEqual([2, 3]);
  });

  it('ignores replacements when no extra tail items exist', () => {
    const previous = [
      baseMessage({ role: 'user', content: 'Original' }),
      baseMessage({ role: 'assistant', content: 'Reply' }),
    ];

    const current = [
      baseMessage({ role: 'user', content: 'Summarized original' }),
      baseMessage({ role: 'assistant', content: 'Reply' }),
    ];

    expect(computeTailNewIndices(previous, current)).toEqual([]);
  });

  it('treats tool call payloads with different key order as equal', () => {
    const toolCallA = [{
      id: 'call-1',
      function: { name: 'lookup', arguments: { query: 'status', limit: 1 } },
    }];

    const toolCallB = [{
      function: { arguments: { limit: 1, query: 'status' }, name: 'lookup' },
      id: 'call-1',
    }];

    const previous = [
      baseMessage({
        role: 'assistant',
        tool_calls: toolCallA,
      }),
    ];

    const current = [
      baseMessage({
        role: 'assistant',
        tool_calls: toolCallB,
      }),
    ];

    expect(computeTailNewIndices(previous, current)).toEqual([]);
  });

  it('marks duplicate entries appended to the tail as new', () => {
    const previous = [baseMessage({ role: 'assistant', content: 'Reminder' })];
    const current = [
      baseMessage({ role: 'assistant', content: 'Reminder' }),
      baseMessage({ role: 'assistant', content: 'Reminder' }),
    ];

    expect(computeTailNewIndices(previous, current)).toEqual([1]);
  });

  it('handles empty current context', () => {
    const previous = [baseMessage({ role: 'user', content: 'Prompt' })];

    expect(computeTailNewIndices(previous, [])).toEqual([]);
  });
});
