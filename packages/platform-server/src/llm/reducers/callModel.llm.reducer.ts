import { FunctionTool, LLM, Reducer, SystemMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';

export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    private llm: LLM,
    private tools: FunctionTool[],
    private params: { model: string; systemPrompt: string },
  ) {
    super();
  }

  async invoke(state: LLMState): Promise<LLMState> {
    const response = await this.llm.call({
      model: this.params.model,
      input: [
        SystemMessage.fromText(this.params.systemPrompt), //
        ...state.messages,
      ],
      tools: this.tools,
    });

    return {
      ...state,
      messages: [...state.messages, response],
    };
  }
}
