import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { withSummarize, SummarizeResponse, BaseMessage as ObsBaseMessage } from '@hautech/obs-sdk';
import { trimMessages } from '@langchain/core/messages';
import { NodeOutput } from '../types';

export type ChatState = { messages: BaseMessage[]; summary?: string };

export type SummarizationOptions = {
  llm: ChatOpenAI;
  keepTokens: number;
  maxTokens: number;
  summarySystemNote?: string;
};

export class SummarizationNode {
  // Token budget for verbatim tail (formerly keepLast (count of messages))
  private keepTokens?: number;
  private maxTokens?: number;
  private summarySystemNote?: string;

  constructor(
    private llm: ChatOpenAI,
    opts: { keepTokens: number; maxTokens: number; summarySystemNote?: string },
  ) {
    this.keepTokens = opts.keepTokens;
    this.maxTokens = opts.maxTokens;
    this.summarySystemNote = opts.summarySystemNote;
  }

  setOptions(opts: Partial<{ keepTokens: number; maxTokens: number; summarySystemNote: string }>): void {
    if (opts.keepTokens !== undefined) this.keepTokens = opts.keepTokens;
    if (opts.maxTokens !== undefined) this.maxTokens = opts.maxTokens;
    if (opts.summarySystemNote !== undefined) this.summarySystemNote = opts.summarySystemNote;
  }

  async action(state: ChatState): Promise<NodeOutput> {
    const keepTokens = this.keepTokens ?? 0;
    const maxTokens = this.maxTokens ?? 0;
    if (!(keepTokens >= 0) || !(maxTokens > 0)) return { summary: state.summary ?? '' };

    const opts: SummarizationOptions = {
      llm: this.llm,
      keepTokens,
      maxTokens,
      summarySystemNote: this.summarySystemNote,
    };

    let working: ChatState = { messages: state.messages, summary: state.summary };

    // Summarize only if base context tokens exceed budget and there is a tail (older groups)
    if (await this.shouldSummarize(working, opts)) {
      working = await this.summarize(working, opts);
    }

    const toolCallIds = new Set(working.messages.filter((m) => m instanceof ToolMessage).map((m) => m.tool_call_id));
    const omitAiWithoutToolCalls = working.messages.filter((m) => {
      if (!(m instanceof AIMessage)) return true;
      if (!m.tool_calls || m.tool_calls.length === 0) return true;

      const keep = m.tool_calls.every((tc) => toolCallIds.has(tc.id ?? ''));
      if (!keep) {
        console.error(`Omitting AI message without matching ToolMessages: ${m.id}`);
      }
      return keep;
    });

    return { summary: working.summary ?? '', messages: { method: 'replace', items: omitAiWithoutToolCalls } };
  }

  async countTokens(llm: ChatOpenAI, messagesOrText: BaseMessage[] | string): Promise<number> {
    if (typeof messagesOrText === 'string') {
      try {
        return await llm.getNumTokens(messagesOrText);
      } catch {
        return messagesOrText.length;
      }
    }
    let total = 0;
    for (const m of messagesOrText) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      try {
        total += await llm.getNumTokens(content);
      } catch {
        total += content.length;
      }
    }
    return total;
  }

  // Group messages so that an AIMessage with tool_calls gets grouped with its subsequent ToolMessages.
  groupMessages(messages: BaseMessage[]): BaseMessage[][] {
    const groups: BaseMessage[][] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m instanceof AIMessage && (m.tool_calls?.length || 0) > 0) {
        const group: BaseMessage[] = [m];
        i++;
        while (i < messages.length) {
          const next = messages[i];
          if (next instanceof ToolMessage && (next as any).tool_call_id) {
            group.push(next);
            i++;
            continue;
          }
          break;
        }
        groups.push(group);
      } else if (m instanceof ToolMessage) {
        // Orphan ToolMessage (no preceding AI with tool_calls) -> ignore
        i++;
        continue;
      } else {
        groups.push([m]);
        i++;
      }
    }
    return groups;
  }

  async groupsTokenCounts(llm: ChatOpenAI, groups: BaseMessage[][]): Promise<number[]> {
    return Promise.all(groups.map((g) => this.countTokens(llm, g)));
  }

  async shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> {
    const groups = this.groupMessages(state.messages);
    if (groups.length <= 1) return false; // nothing meaningful to fold
    const messagesTokens = await this.countTokens(opts.llm, state.messages);
    const summaryTokens = state.summary ? await this.countTokens(opts.llm, state.summary) : 0;
    const total = messagesTokens + summaryTokens;
    return total > opts.maxTokens;
  }

  async summarize(state: ChatState, opts: SummarizationOptions): Promise<ChatState> {
    const { keepTokens, llm } = opts;
    const groups = this.groupMessages(state.messages);
    if (!groups.length) return state;

    // TODO: use trim instead of custom groups/token counting
    // const trimmed = await trimMessages({
    //   strategy: 'last',
    //   tokenCounter: this.llm,
    //   maxTokens: maxTokens,
    //   startOn: ['human', 'ai'],
    //   endOn: ['human', 'ai', 'tool'],
    //   allowPartial: false,
    // }).invoke(working.messages);

    // Calculate tail groups to keep verbatim within keepTokens budget (from end backwards)
    const tail: BaseMessage[][] = [];
    if (keepTokens > 0) {
      const groupTokenCounts = await this.groupsTokenCounts(llm, groups);
      let used = 0;
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        const cost = groupTokenCounts[i];
        if (used + cost > keepTokens && tail.length) break; // stop once exceeding after at least one group
        if (used + cost > keepTokens && !tail.length) {
          // Include oversize first group to avoid empty tail context
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
      // Nothing to summarize
      return { messages: tail.flat(), summary: state.summary };
    }

    const olderMessages = olderGroups.flat();
    const sys = new SystemMessage(
      'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.',
    );

    const foldLines = olderMessages
      .map(
        (m) =>
          `${m._getType().toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`,
      )
      .join('\n');

    const human = new HumanMessage(
      `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`,
    );

    const task = await withSummarize(
      { oldContext: state.messages.map((m) => ObsBaseMessage.fromLangChain(m)) },
      async () => {
        const invocation = (await llm.invoke([sys, human])) as AIMessage;
        const summary =
          typeof invocation.content === 'string' ? invocation.content : JSON.stringify(invocation.content);

        // Computation of newContext supposed to be fully inside withSummarize
        const newContext = tail.flat();

        return new SummarizeResponse({
          raw: { summary, newContext },
          summary: summary,
          newContext: newContext.map((m) => ObsBaseMessage.fromLangChain(m)),
        });
      },
    );

    return { summary: task.summary, messages: task.newContext };
  }
}

// --- Helper / legacy-compatible functional API exports ---
// These replicate previous named exports for tests & external callers expecting functions.

export async function countTokens(llm: ChatOpenAI, messagesOrText: BaseMessage[] | string): Promise<number> {
  const helper = new SummarizationNode(llm, { keepTokens: 0, maxTokens: 1 });
  return helper.countTokens(llm, messagesOrText);
}

export async function shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> {
  // Map legacy keepLast (message count) roughly into token budget tail heuristic by treating each message length as tokens.
  const node = new SummarizationNode(opts.llm, {
    keepTokens: opts.keepTokens ?? 0,
    maxTokens: opts.maxTokens,
    summarySystemNote: opts.summarySystemNote,
  });
  return node.shouldSummarize(state, opts);
}

export async function summarizationNode(
  state: ChatState,
  opts: SummarizationOptions,
): Promise<{ summary: string; messages: BaseMessage[] }> {
  const node = new SummarizationNode(opts.llm, {
    keepTokens: opts.keepTokens ?? 0,
    maxTokens: opts.maxTokens,
    summarySystemNote: opts.summarySystemNote,
  });
  const res = await node.action(state);
  return { summary: res.summary || '', messages: res.messages?.items || [] };
}
