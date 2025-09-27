import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { NodeOutput } from '../types';

export class EnforceRestrictionNode {
  constructor(
    private getRestrictOutput: () => boolean,
    private getRestrictionMessage: () => string,
    private getRestrictionMaxInjections: () => number,
  ) {}

  async action(state: { messages: BaseMessage[]; restrictionInjectionCount?: number }): Promise<NodeOutput> {
    const restrictOutput = this.getRestrictOutput();
    if (!restrictOutput) return {};

    const last = state.messages[state.messages.length - 1];
    const lastAI = last instanceof AIMessage ? last : undefined;
    const hadToolCalls = (lastAI?.tool_calls?.length || 0) > 0;
    if (hadToolCalls) return {};

    const max = this.getRestrictionMaxInjections();
    const count = state.restrictionInjectionCount ?? 0;
    const shouldInject = max === 0 || count < max;
    if (!shouldInject) {
      return { restrictionInjected: false };
    }

    const msg = new SystemMessage(this.getRestrictionMessage());
    return {
      messages: { method: 'append', items: [msg] },
      restrictionInjectionCount: count + 1,
      restrictionInjected: true,
    };
  }
}
