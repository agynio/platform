import { Reducer, ResponseMessage, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { LoggerService } from '../../services/logger.service';

/**
 * RestrictEnforceLLMReducer decides whether to inject a restriction message
 * (to force a tool call) or end the turn when cap reached/disabled.
 *
 * It updates state.meta:
 * - restrictionInjectionCount: number (per turn)
 * - restrictionInjected: boolean (true when we inject on this pass)
 */
export class RestrictEnforceLLMReducer extends Reducer<LLMState, LLMContext> {
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

    // If restriction disabled or tool call is already present, no-op and mark not injected.
    if (!restrictOutput || lastHasToolCall) {
      return {
        ...state,
        meta: { ...state.meta, restrictionInjected: false },
      };
    }

    const prevCount = state.meta?.restrictionInjectionCount ?? 0;

    // When max=0, unlimited. When max>0 and reached, do not inject.
    if (max > 0 && prevCount >= max) {
      this.logger?.info('Restriction cap reached; ending turn', { prevCount, max });
      return {
        ...state,
        meta: { ...state.meta, restrictionInjected: false },
      };
    }

    // Otherwise inject restriction message as a HumanMessage to steer the model.
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
