import { Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';

/**
 * EnforceToolsLLMReducer injects a restriction message when the model
 * attempts to finish a turn without calling any tools. It also manages
 * per-turn enforcement counters via state.meta.
 */
export class EnforceToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(private logger?: LoggerService) {
    super();
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
    const msg = SystemMessage.fromText(restrictionMessage);

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
}

