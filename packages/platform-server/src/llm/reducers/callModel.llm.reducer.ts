import { FunctionTool, LLM, Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { LLMResponse, withLLM } from '@agyn/tracing';

export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    private llm: LLM,
    private tools: FunctionTool[],
    private params: { model: string; systemPrompt: string },
  ) {
    super();
  }

  async invoke(state: LLMState): Promise<LLMState> {
    const response = await withLLM({ context: state.messages }, async () => {
      const raw = await this.llm.call({
        model: this.params.model,
        input: [
          SystemMessage.fromText(this.params.systemPrompt), //
          ...state.messages,
        ],
        tools: this.tools,
      });

      return new LLMResponse({
        raw,
        content: raw.text,
        toolCalls: raw.output.filter((m) => m instanceof ToolCallMessage),
      });
    });

    return {
      ...state,
      messages: [...state.messages, response],
    };
  }
}
