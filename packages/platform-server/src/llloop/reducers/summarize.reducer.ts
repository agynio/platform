import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';
import type { Logger } from '../../types/logger.js';
import { withSummarize } from '@agyn/tracing';

export class SummarizeReducer implements Reducer {
  constructor(private readonly logger: Logger) {}
  name(): string {
    return 'summarize';
  }

  async reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult> {
    const logger = this.logger;
    const memory = ctx.memory;
    const cfg = ctx.summarizerConfig;
    if (!cfg) return { state: { ...state }, next: 'call_model' };

    // 1) Remove existing summary system message if present; we'll re-generate it
    const msgs = stripExistingSummary(state.messages);

    // 2) Build groups and compute tail by token budget
    const groups = groupMessages(msgs);
    const { head, tail } = splitHeadTailByTokens(groups, Math.max(0, Math.floor(cfg.keepTokens)));

    // 3) Produce summary lines for head; rebuild messages with optional system summary + tail
    const summary = await withSummarize(
      { keepTokens: cfg.maxTokens, context: state.messages as any },
      async () => summarizeGroups(head, cfg.maxTokens),
    );
    const rebuilt = rebuildWithSummaryAndTail(summary, tail);

    const out: LoopState = { ...state, messages: rebuilt, summary: summary ?? state.summary };
    try {
      if (summary && ctx.threadId && memory?.updateSummary) {
        await memory.updateSummary(ctx.threadId, summary);
      }
    } catch (e) {
      logger.error('summarize reducer: memory update failed', e);
    }
    return { state: out, next: 'call_model' };
  }
}

// Remove previously injected summary system message
function stripExistingSummary(msgs: LoopState['messages']): LoopState['messages'] {
  return msgs.filter((m) => !(m.role === 'system' && typeof m.contentText === 'string' && m.contentText.startsWith('Summary so far:')));
}

type Group = { messages: LoopState['messages']; tokenEstimate: number };

// Group assistant messages with following tool results; others standalone
function groupMessages(msgs: LoopState['messages']): Group[] {
  const groups: Group[] = [];
  let i = 0;
  const n = msgs.length;
  while (i < n) {
    const g: LoopState['messages'] = [msgs[i]!];
    if (msgs[i]!.role === 'assistant') {
      let j = i + 1;
      while (j < n && msgs[j]!.role === 'tool') {
        g.push(msgs[j]!);
        j++;
      }
      i = j;
    } else {
      i++;
    }
    groups.push({ messages: g, tokenEstimate: estimateTokensForGroup(g) });
  }
  return groups;
}

function splitHeadTailByTokens(groups: Group[], keepTokens: number): { head: Group[]; tail: Group[] } {
  const tail: Group[] = [];
  let acc = 0;
  for (let k = groups.length - 1; k >= 0; k--) {
    const t = groups[k]!.tokenEstimate;
    if (acc + t > keepTokens && tail.length > 0) break;
    acc += t;
    tail.unshift(groups[k]!);
  }
  return { head: groups.slice(0, groups.length - tail.length), tail };
}

function rebuildWithSummaryAndTail(summary: string | undefined, tail: Group[]): LoopState['messages'] {
  const rebuilt: LoopState['messages'] = [];
  if (summary) rebuilt.push({ role: 'system', contentText: `Summary so far: ${summary}` });
  for (const g of tail) rebuilt.push(...g.messages);
  return rebuilt;
}

// Approximate token count (chars/4) per message
function estimateTokensForMessage(m: LoopState['messages'][number]): number {
  const text = m.contentText ?? (m.contentJson ? safeStringify(m.contentJson) : '');
  const len = typeof text === 'string' ? text.length : 0;
  return Math.max(1, Math.ceil(len / 4));
}

function estimateTokensForGroup(msgs: LoopState['messages']): number {
  let t = 0;
  for (const m of msgs) t += estimateTokensForMessage(m);
  return t;
}

function summarizeGroups(groups: { messages: LoopState['messages'] }[], maxTokens: number): string {
  // Deterministic heuristic: produce brief per-group lines within maxTokens budget
  const lines: string[] = [];
  let tokens = 0;
  for (const g of groups) {
    const first = g.messages[0]!;
    const roles = Array.from(new Set(g.messages.map((m) => m.role))).join('+');
    const snippet = (first.contentText ?? safeStringify(first.contentJson) ?? '').slice(0, 160);
    const line = `${roles}: ${snippet}`.trim();
    const lineTokens = Math.ceil(line.length / 4) + 1;
    if (tokens + lineTokens > maxTokens && lines.length > 0) break;
    tokens += lineTokens;
    lines.push(line);
  }
  return lines.join('\n');
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}
