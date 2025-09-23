import { AIMessage, BaseMessage, HumanMessage, SystemMessage, RemoveMessage } from '@langchain/core/messages';
import { trimMessages } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';

export type ChatState = { messages: BaseMessage[]; summary?: string };

export type SummarizationOptions = {
  llm: ChatOpenAI;
  keepLast: number;
  maxTokens: number;
  summarySystemNote?: string;
};

export async function countTokens(llm: ChatOpenAI, messagesOrText: BaseMessage[] | string): Promise<number> {
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

export async function buildContextForModel(state: ChatState, opts: SummarizationOptions): Promise<BaseMessage[]> {
  const recent = opts.keepLast > 0 ? state.messages.slice(-opts.keepLast) : [];
  const summaryText = state.summary && state.summary.trim().length > 0 ? state.summary.trim() : undefined;
  const summarySystem = summaryText
    ? new SystemMessage(`${opts.summarySystemNote ?? 'Conversation summary:'}\n${summaryText}`)
    : undefined;

  const base: BaseMessage[] = summarySystem ? [summarySystem, ...recent] : [...recent];

  // Ensure we stay within budget while keeping potential system summary
  const trimmed = await trimMessages(base, {
    maxTokens: opts.maxTokens,
    tokenCounter: opts.llm as any,
    includeSystem: true,
    strategy: 'last',
  });
  return trimmed;
}

export async function shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> {
  // If nothing to drop, don't summarize
  if (state.messages.length <= (opts.keepLast ?? 0)) return false;

  const recent = opts.keepLast > 0 ? state.messages.slice(-opts.keepLast) : [];
  const summaryText = state.summary && state.summary.trim().length > 0 ? state.summary.trim() : undefined;
  const summarySystem = summaryText
    ? new SystemMessage(`${opts.summarySystemNote ?? 'Conversation summary:'}\n${summaryText}`)
    : undefined;
  const contextForCount: BaseMessage[] = summarySystem ? [summarySystem, ...recent] : [...recent];
  const tokenCount = await countTokens(opts.llm, contextForCount);
  if (tokenCount > opts.maxTokens) return true;

  // First pass: if we have older history and no summary yet
  if (!summaryText && state.messages.length > (opts.keepLast ?? 0) + 2) return true;

  return false;
}

export async function summarizationNode(state: ChatState, opts: SummarizationOptions): Promise<ChatState> {
  const { keepLast, llm } = opts;
  if (state.messages.length <= keepLast) return state;

  const recent = keepLast > 0 ? state.messages.slice(-keepLast) : [];
  const older = keepLast > 0 ? state.messages.slice(0, -keepLast) : state.messages;

  const sys = new SystemMessage(
    'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.',
  );

  const foldLines = older
    .map((m) => `${m._getType().toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n');

  const human = new HumanMessage(
    `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages:\n${foldLines}\n\nReturn only the updated summary.`,
  );

  const res = (await llm.invoke([sys, human])) as AIMessage;
  const newSummary = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);

  // Clear old messages and keep only recent K
  return { summary: newSummary, messages: recent };
}

export class SummarizationNode {
  private keepLast?: number;
  private maxTokens?: number;
  private summarySystemNote?: string;

  constructor(private llm: ChatOpenAI, opts: { keepLast: number; maxTokens: number; summarySystemNote?: string }) {
    this.keepLast = opts.keepLast;
    this.maxTokens = opts.maxTokens;
    this.summarySystemNote = opts.summarySystemNote;
  }

  setOptions(opts: Partial<{ keepLast: number; maxTokens: number; summarySystemNote: string }>): void {
    if (opts.keepLast !== undefined) this.keepLast = opts.keepLast;
    if (opts.maxTokens !== undefined) this.maxTokens = opts.maxTokens;
    if (opts.summarySystemNote !== undefined) this.summarySystemNote = opts.summarySystemNote;
  }

  async action(state: ChatState): Promise<Partial<ChatState>> {
    const keepLast = this.keepLast ?? 0;
    const maxTokens = this.maxTokens ?? 0;
    if (!(keepLast >= 0) || !(maxTokens > 0)) return { summary: state.summary ?? '' };

    const opts: SummarizationOptions = {
      llm: this.llm,
      keepLast,
      maxTokens,
      summarySystemNote: this.summarySystemNote,
    };

    if (await shouldSummarize(state, opts)) {
      const out = await summarizationNode(state, opts);
      return { summary: out.summary, messages: out.messages };
    }

    return { summary: state.summary ?? '' };
  }
}
