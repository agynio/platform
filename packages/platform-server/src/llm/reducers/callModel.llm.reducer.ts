import { FunctionTool, HumanMessage, LLM, Reducer, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMMessage, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super();
  }

  private tools: FunctionTool[] = [];
  private model = '';
  private systemPrompt = '';
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
    this.model = params.model;
    this.systemPrompt = params.systemPrompt;
    this.tools = params.tools || [];
    this.memoryProvider = params.memoryProvider;
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.model || !this.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }
    const system = SystemMessage.fromText(this.systemPrompt);
    const summaryText = state.summary?.trim();
    const summaryMsg = summaryText ? HumanMessage.fromText(summaryText) : null;
    const mem = this.memoryProvider ? await this.memoryProvider(_ctx, state) : null;

    // Assemble input in a single expression using filter(Boolean)
    const input: (SystemMessage | LLMMessage)[] =
      mem?.place === 'after_system'
        ? ([system, summaryMsg, mem?.msg ?? null, ...state.messages].filter(Boolean) as Array<
            SystemMessage | LLMMessage
          >)
        : mem?.place === 'last_message'
          ? ([system, summaryMsg, ...state.messages, mem?.msg ?? null].filter(Boolean) as Array<
              SystemMessage | LLMMessage
            >)
          : ([system, summaryMsg, ...state.messages].filter(Boolean) as Array<SystemMessage | LLMMessage>);

    const response = await withLLM({ context: input.slice(-10) }, async () => {
      try {
        const raw = await this.llm!.call({
          model: this.model,
          input,
          tools: this.tools,
        });

        return new LLMResponse({
          raw,
          content: raw.text,
          toolCalls: raw.output.filter((m) => m instanceof ToolCallMessage),
        });
      } catch (error) {
        this.logger.error('Error occurred while calling LLM', error);
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
