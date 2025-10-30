import { FunctionTool, LLM, Reducer, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMMessage, LLMState } from '../types';

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor() {
    super();
  }

  private tools: FunctionTool[] = [];
  private params: { model: string; systemPrompt: string } = { model: '', systemPrompt: '' };
  private llm?: LLM;
  private memoryProvider?: (
    ctx: LLMContext,
    state: LLMState,
  ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;

  init(params: {
    llm: LLM;
    model: string;
    systemPrompt: string;
    tools: FunctionTool[];
    memoryProvider?: (
      ctx: LLMContext,
      state: LLMState,
    ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;
  }) {
    this.llm = params.llm;
    this.params = { model: params.model, systemPrompt: params.systemPrompt };
    this.tools = params.tools || [];
    this.memoryProvider = params.memoryProvider;
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.params.model || !this.params.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }
    const system = SystemMessage.fromText(this.params.systemPrompt);
    const inputBase: (SystemMessage | LLMMessage)[] = [system, ...state.messages];
    const mem = this.memoryProvider ? await this.memoryProvider(_ctx, state) : null;
    let input: (SystemMessage | LLMMessage)[] = inputBase;
    if (mem && mem.msg) {
      if (mem.place === 'after_system') {
        input = [system, mem.msg, ...state.messages];
      } else {
        input = [...inputBase, mem.msg];
      }
    }

    const response = await withLLM({ context: input.slice(-10) }, async () => {
      try {
        const raw = await this.llm!.call({
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
