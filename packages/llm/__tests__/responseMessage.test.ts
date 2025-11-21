import { describe, expect, it } from 'vitest';
import { ResponseMessage } from '../src/messages/responseMessage';
import { AIMessage } from '../src/messages/aiMessage';

describe('ResponseMessage usage tracking', () => {
  it('exposes usage metrics when provided', () => {
    const output = AIMessage.fromText('Hello world').toPlain();
    const usage = {
      input_tokens: 128,
      input_tokens_details: { cached_tokens: 32 },
      output_tokens: 64,
      output_tokens_details: { reasoning_tokens: 8 },
      total_tokens: 192,
    };

    const message = new ResponseMessage({ output: [output], usage });

    expect(message.usage).toEqual(usage);
    expect(message.toPlain()).toEqual({ output: [output], usage });
  });

  it('omits usage when not available', () => {
    const message = ResponseMessage.fromText('No usage data');
    expect(message.usage).toBeUndefined();
    const plain = message.toPlain();
    expect(Array.isArray(plain.output)).toBe(true);
    expect(plain.output[0]).toMatchObject({ type: 'message', role: 'assistant' });
    expect('usage' in plain).toBe(false);
  });

  it('handles usage objects lacking details gracefully', () => {
    const output = AIMessage.fromText('Partial').toPlain();
    const partialUsage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    } as const;

    const message = new ResponseMessage({ output: [output], usage: partialUsage });
    expect(message.usage).toEqual({ ...partialUsage });
    expect(message.toPlain()).toEqual({ output: [output], usage: { ...partialUsage } });
  });
});
