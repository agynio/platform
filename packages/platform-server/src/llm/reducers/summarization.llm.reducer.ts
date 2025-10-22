import { SummarizeResponse, withSummarize } from '@agyn/tracing';
import { LLMContext, LLMMessage, LLMState } from '../types';

import { HumanMessage, LLM, Reducer, ResponseMessage, SystemMessage, ToolCallOutputMessage } from '@agyn/llm';
import { stringify } from 'yaml';

export class SummarizationLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(
    private llm: LLM,
    private params: { model: string; keepTokens: number; maxTokens: number; systemPrompt: string },
  ) {
    super();
  }

  // Token counting for raw string summary text.
  private countTokensFromString(text: string): number {
    return text.length;
  }

  // Token counting for arrays of LLMMessage objects.
  private async countTokensFromMessages(messages: LLMMessage[]): Promise<number> {
    const contents = messages.map((m) => {
      return JSON.stringify(m);
    });
    return contents.reduce((acc, cur) => acc + cur.length, 0);
  }

  /**
   * Group messages: assistant function_call grouped with subsequent function_call_output items.
   * We rely on shape from OpenAI responses API: type === 'function_call' / 'function_call_output'.
   */
  private groupMessages(messages: LLMMessage[]): LLMMessage[][] {
    const groups: LLMMessage[][] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m instanceof ResponseMessage) {
        const group: LLMMessage[] = [m];
        // Find all subsequent ToolCallOutputMessage with matching callId
        const callIds = Array.isArray(m.output)
          ? m.output.filter((msg: any) => msg instanceof ToolCallOutputMessage).map((msg: any) => msg.callId)
          : [];
        i++;
        while (i < messages.length) {
          const next = messages[i];
          if (next instanceof ToolCallOutputMessage && callIds.includes(next.callId)) {
            group.push(next);
            i++;
            continue;
          }
          break;
        }
        groups.push(group);
        continue;
      }
      if (m instanceof ToolCallOutputMessage) {
        // Ignore orphan ToolCallOutputMessage
        i++;
        continue;
      }
      if (m instanceof HumanMessage || m instanceof SystemMessage) {
        groups.push([m]);
        i++;
        continue;
      }
      // Fallback: treat as singleton
      groups.push([m]);
      i++;
    }
    return groups;
  }

  private async groupsTokenCounts(groups: LLMMessage[][]): Promise<number[]> {
    return Promise.all(groups.map((g) => this.countTokensFromMessages(g)));
  }

  private async shouldSummarize(state: LLMState): Promise<boolean> {
    const { maxTokens } = this.params;
    if (!(maxTokens > 0)) return false;
    const groups = this.groupMessages(state.messages);
    if (groups.length <= 1) return false;
    const messagesTokens = await this.countTokensFromMessages(state.messages);
    const summaryTokens = state.summary ? this.countTokensFromString(state.summary) : 0;
    return messagesTokens + summaryTokens > maxTokens;
  }

  private async summarize(state: LLMState): Promise<LLMState> {
    const { keepTokens, model, systemPrompt } = this.params;
    const groups = this.groupMessages(state.messages);
    if (!groups.length) return state;

    // Tail selection based on token budget (mirrors lgnode impl)
    const tail: LLMMessage[][] = [];
    if (keepTokens > 0) {
      const counts = await this.groupsTokenCounts(groups);
      let used = 0;
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        const cost = counts[i];
        if (used + cost > keepTokens && tail.length) break;
        if (used + cost > keepTokens && !tail.length) {
          tail.unshift(g);
          break;
        }
        used += cost;
        tail.unshift(g);
      }
    }
    const tailStartIndex = groups.length - tail.length;
    const olderGroups = groups.slice(0, tailStartIndex);
    if (!olderGroups.length) {
      return { ...state, messages: tail.flat() };
    }

    const olderMessages = olderGroups.flat();

    const foldLines = stringify(olderMessages);

    const userPrompt = `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`;

    // Prepare tracing oldContext by mapping all current messages
    const task = await withSummarize(
      {
        oldContext: state.messages,
      },
      async () => {
        const response = await this.llm.call({
          model,
          input: [
            SystemMessage.fromText(systemPrompt), //
            HumanMessage.fromText(userPrompt),
          ],
        });

        const newSummary = response.text.trim();
        const newContext = tail.flat();
        
        return new SummarizeResponse({
          raw: { summary: newSummary, newContext: tail.flat() },
          summary: newSummary,
          newContext,
        });
      },
    );

    return { summary: task.summary, messages: tail.flat() };
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!(this.params.maxTokens > 0)) return state; // disabled summarization

    let working: LLMState = { ...state };
    const doSummarize = await this.shouldSummarize(working);
    if (doSummarize) {
      working = await this.summarize(working);
    }

    return working;
  }
}
