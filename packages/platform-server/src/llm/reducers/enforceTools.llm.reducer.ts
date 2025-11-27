import { DeveloperMessage, Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';

/**
 * EnforceToolsLLMReducer injects a restriction message when the model
 * attempts to finish a turn without calling any tools. It also manages
 * per-turn enforcement counters via state.meta.
 */
@Injectable()
export class EnforceToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  private readonly useDeveloperRole: boolean;

  constructor(
    @Inject(LoggerService) private readonly logger?: LoggerService,
    @Inject(ConfigService) config?: ConfigService,
  ) {
    super();
    this.useDeveloperRole = config?.llmUseDeveloperRole ?? false;
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    const agent = ctx.callerAgent;
    const cfg = agent?.config ?? {};
    const restrictOutput = cfg.restrictOutput === true;
    const max = cfg.restrictionMaxInjections ?? 0; // 0 = unlimited
    let restrictionMessage = cfg.restrictionMessage ?? '';

    const last = state.messages.at(-1);
    const lastHasToolCall = last instanceof ResponseMessage && last.output.some((o) => o instanceof ToolCallMessage);

    if (!restrictOutput || lastHasToolCall) {
      return { ...state, meta: { ...state.meta, restrictionInjected: false } };
    }

    const prevCount = state.meta?.restrictionInjectionCount ?? 0;

    if (max > 0 && prevCount >= max) {
      this.logger?.info('Restriction cap reached; ending turn', { prevCount, max });
      return { ...state, meta: { ...state.meta, restrictionInjected: false } };
    }

    if (!restrictionMessage || !restrictionMessage.trim()) {
      this.logger?.info('Restriction message blank; using default.');
      restrictionMessage = 'Please use a tool to proceed before responding.';
    }
    this.logger?.info('Enforcing restrictOutput: injecting restriction message');
    const msg = this.instructionFromText(restrictionMessage);

    return {
      ...state,
      messages: [...state.messages, msg],
      meta: {
        ...state.meta,
        restrictionInjectionCount: prevCount + 1,
        restrictionInjected: true,
      },
    };
  }

  private instructionFromText(text: string): SystemMessage | DeveloperMessage {
    return this.useDeveloperRole ? DeveloperMessage.fromText(text) : SystemMessage.fromText(text);
  }
}
