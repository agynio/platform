import { describe, expect, it } from 'vitest';
import type { Response } from 'openai/resources/responses/responses.mjs';
import { LLM, ReasoningOnlyZeroUsageError } from '../src/llm';
import { HumanMessage } from '../src/messages/humanMessage';
import { AIMessage } from '../src/messages/aiMessage';
import { ResponseMessage } from '../src/messages/responseMessage';

function createReasoningOnlyResponse(usage: Response['usage']): Response {
  return {
    id: 'resp_123',
    created_at: 0,
    output_text: '',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: 'gpt-4o-mini',
    object: 'response',
    output: [
      {
        id: 'reasoning_1',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'thinking' }],
        content: [{ type: 'reasoning_text', text: 'step-by-step' }],
        status: 'completed',
      },
    ],
    usage,
  } as unknown as Response;
}

function createMessageResponse(usage: Response['usage']): Response {
  return {
    id: 'resp_456',
    created_at: 0,
    output_text: 'hello',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: 'gpt-4o-mini',
    object: 'response',
    output: [AIMessage.fromText('hello world').toPlain()],
    usage,
  } as unknown as Response;
}

function createMixedResponse(usage: Response['usage']): Response {
  return {
    id: 'resp_789',
    created_at: 0,
    output_text: 'hello',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: 'gpt-4o-mini',
    object: 'response',
    output: [
      {
        id: 'reasoning_1',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'thinking' }],
        content: [{ type: 'reasoning_text', text: 'step-by-step' }],
        status: 'completed',
      },
      AIMessage.fromText('finished').toPlain(),
    ],
    usage,
  } as unknown as Response;
}

function buildUsage(tokens: { input: number; output: number; total: number; cached?: number; reasoning?: number }): Response['usage'] {
  return {
    input_tokens: tokens.input,
    input_tokens_details: { cached_tokens: tokens.cached ?? 0 },
    output_tokens: tokens.output,
    output_tokens_details: { reasoning_tokens: tokens.reasoning ?? 0 },
    total_tokens: tokens.total,
  };
}

describe('LLM reasoning-only zero usage validation', () => {
  const baseInput = [HumanMessage.fromText('Hello there')];

  function createLLMFor(response: Response): LLM {
    return new LLM({
      responses: {
        create: async () => response,
      },
    } as unknown as Parameters<typeof LLM.prototype.constructor>[0]);
  }

  it('throws ReasoningOnlyZeroUsageError with raw response preserved', async () => {
    const rawResponse = createReasoningOnlyResponse(
      buildUsage({ input: 0, output: 0, total: 0, cached: 0, reasoning: 0 }),
    );

    const llm = createLLMFor(rawResponse);

    const promise = llm.call({ model: 'gpt-4o', input: baseInput });

    await expect(promise).rejects.toBeInstanceOf(ReasoningOnlyZeroUsageError);
    const error = await promise.catch((err) => err as ReasoningOnlyZeroUsageError);
    expect(error.rawResponse).toBe(rawResponse);
    expect(error.message).toContain('reasoning-only response');
  });

  it('throws when usage details are missing but totals are zero', async () => {
    const rawResponse = createReasoningOnlyResponse(
      {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      } as unknown as Response['usage'],
    );

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).rejects.toBeInstanceOf(
      ReasoningOnlyZeroUsageError,
    );
  });

  it('does not throw when assistant message is present even if usage totals zero', async () => {
    const rawResponse = createMessageResponse(buildUsage({ input: 0, output: 0, total: 0 }));

    const llm = createLLMFor(rawResponse);

    const result = await llm.call({ model: 'gpt-4o', input: baseInput });
    expect(result.text).toBe('hello world');
  });

  it('does not throw when usage includes non-zero tokens for reasoning output', async () => {
    const rawResponse = createReasoningOnlyResponse(
      buildUsage({ input: 1, output: 0, total: 1, reasoning: 0 }),
    );

    const llm = createLLMFor(rawResponse);

    const result = await llm.call({ model: 'gpt-4o', input: baseInput });
    expect(result.text).toBe('');
  });

  it('does not throw when output mixes reasoning with assistant message', async () => {
    const rawResponse = createMixedResponse(buildUsage({ input: 0, output: 0, total: 0 }));

    const llm = createLLMFor(rawResponse);

    const result = await llm.call({ model: 'gpt-4o', input: baseInput });
    expect(result.text).toBe('finished');
  });

  it('does not throw when usage fields are missing', async () => {
    const partialUsage = {
      input_tokens_details: {},
      output_tokens_details: {},
    } as unknown as Response['usage'];

    const rawResponse = createReasoningOnlyResponse(partialUsage);

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });

  it('does not treat NaN usage values as zero', async () => {
    const rawResponse = createReasoningOnlyResponse(
      buildUsage({ input: Number.NaN, output: 0, total: Number.NaN, cached: 0, reasoning: 0 }),
    );

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });

  it('does not treat infinite usage values as zero', async () => {
    const rawResponse = createReasoningOnlyResponse(
      buildUsage({ input: Number.POSITIVE_INFINITY, output: 0, total: Number.POSITIVE_INFINITY, cached: 0, reasoning: 0 }),
    );

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });

  it('does not treat non-finite detail counters as zero', async () => {
    const rawResponse = createReasoningOnlyResponse(
      buildUsage({ input: 0, output: 0, total: 0, cached: Number.POSITIVE_INFINITY, reasoning: Number.NaN }),
    );

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });

  it('does not throw when output array is empty', async () => {
    const rawResponse = createReasoningOnlyResponse(buildUsage({ input: 0, output: 0, total: 0 }));
    (rawResponse as { output: unknown }).output = [];

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });

  it('does not throw when output item lacks type discriminator', async () => {
    const rawResponse = createReasoningOnlyResponse(buildUsage({ input: 0, output: 0, total: 0 }));
    (rawResponse as { output: unknown }).output = [{}];

    const llm = createLLMFor(rawResponse);

    await expect(llm.call({ model: 'gpt-4o', input: baseInput })).resolves.toBeInstanceOf(ResponseMessage);
  });
});
