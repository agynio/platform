import { describe, it, expect, vi } from 'vitest';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';
import { Signal } from '../src/signal';
import { DeveloperMessage, HumanMessage } from '@agyn/llm';

class ProvisionerStub {
  getLLM = vi.fn(async () => ({ call: vi.fn(async () => ({ text: 'summary', output: [] })) }));
}

describe('SummarizationLLMReducer termination handling', () => {
  it('skips summarization when terminateSignal is active', async () => {
    const provisioner = new ProvisionerStub();
    const runEvents = {
      recordSummarization: vi.fn(),
      publishEvent: vi.fn(),
      createContextItems: vi.fn(async () => []),
    };
    const eventsBus = { publishEvent: vi.fn(), subscribeToRunEvents: vi.fn(() => vi.fn()) };

    const reducer = new SummarizationLLMReducer(provisioner as any, runEvents as any, eventsBus as any);
    await reducer.init({ model: 'summary-test', keepTokens: 100, maxTokens: 200, systemPrompt: 'Summarize' });

    const state = {
      messages: [DeveloperMessage.fromText('S'), HumanMessage.fromText('H')],
      summary: 'Old summary',
      context: { messageIds: [], memory: [] },
    } as any;

    const terminateSignal = new Signal();
    terminateSignal.activate();

    const result = await reducer.invoke(state, {
      threadId: 'thread',
      runId: 'run',
      finishSignal: new Signal(),
      terminateSignal,
      callerAgent: { getAgentNodeId: () => 'agent' } as any,
    });

    expect(result).toBe(state);
    expect(runEvents.recordSummarization).not.toHaveBeenCalled();
    expect(provisioner.getLLM).toHaveBeenCalledTimes(1);
  });
});
