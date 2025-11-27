import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { LLM } from '../src/llm';
import { DeveloperMessage, HumanMessage } from '../src/messages';

describe('LLM developer role fallback', () => {
  it('retries without developer role when provider rejects developer messages', async () => {
    const createMock = vi
      .fn()
      .mockRejectedValueOnce({ error: { message: 'Invalid role developer' } })
      .mockResolvedValue({ output: [], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });

    const client = { responses: { create: createMock } } as unknown as OpenAI;
    const llm = new LLM(client);

    const developer = DeveloperMessage.fromText('Follow developer instructions.');
    const human = HumanMessage.fromText('Hello');

    await llm.call({ model: 'gpt-test', input: [developer, human] });

    expect(createMock).toHaveBeenCalledTimes(2);
    const firstCallInput = createMock.mock.calls[0][0].input?.[0];
    const secondCallInput = createMock.mock.calls[1][0].input?.[0];
    expect(firstCallInput?.role).toBe('developer');
    expect(secondCallInput?.role).toBe('system');
  });
});
