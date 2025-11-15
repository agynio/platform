import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@agyn/llm';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';
import type { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { LoggerService } from '../src/core/services/logger.service';
import { createRunEventsStub } from './helpers/runEvents.stub';

describe('Agent summarization uses overridden model', () => {
  it('summarization path honors overridden model in reducer', async () => {
    class ProvisionerStub implements LLMProvisioner {
      async getLLM() {
        return {
          call: async ({ model }: { model: string; input: unknown }) => ({ text: `model:${model}`, output: [] }),
        } as any;
      }
    }
    const reducer = await new SummarizationLLMReducer(new ProvisionerStub(), new LoggerService(), createRunEventsStub() as any).init({
      model: 'override-model',
      keepTokens: 1,
      maxTokens: 3,
      systemPrompt: 'Summarize',
    });
    const state = {
      messages: [HumanMessage.fromText('AAAA'), HumanMessage.fromText('BBBB')],
      summary: undefined,
      context: { messageIds: [], memory: [] },
    };
    const out = await reducer.invoke(state, { threadId: 't', runId: 'r', finishSignal: { isActive: false } as any, callerAgent: {} as any });
    expect(out.summary).toBe('model:override-model');
  });
});
