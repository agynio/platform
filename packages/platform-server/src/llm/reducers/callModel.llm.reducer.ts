import { FunctionTool, LLM, Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private llm: LLM) {
    super();
  }

  private tools: FunctionTool[] = [];
  private params: { model: string; systemPrompt: string } = { model: '', systemPrompt: '' };

  init(params: { model: string; systemPrompt: string; tools: FunctionTool[] }) {
    this.params = { model: params.model, systemPrompt: params.systemPrompt };
    this.tools = params.tools || [];
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    const input = [
      SystemMessage.fromText(this.params.systemPrompt), //
      ...state.messages,
    ];

    const response = await withLLM({ context: input.slice(-10) }, async () => {
      try {
        const raw = await this.llm.call({
          model: this.params.model,
          input,
          tools: this.tools,
        });

        return new LLMResponse({
          raw,
          content: raw.text,
          toolCalls: raw.output.filter((m) => m instanceof ToolCallMessage),
        });
      } catch (error) {
        console.error(error);
        throw error;
      }
    });

    const updated: LLMState = {
      ...state,
      messages: [...state.messages, response],
    };
    return updated;
  }
}
