// Lightweight summarization helpers compatible with legacy tests

export type ChatState = { messages: any[]; summary?: string };
export type SummarizationOptions = { llm: { getNumTokens(text: string | any[]): Promise<number> }; keepTokens: number; maxTokens: number };

export async function countTokens(llm: { getNumTokens(text: string | any[]): Promise<number> }, input: string | any[]): Promise<number> {
  if (typeof input === 'string') return llm.getNumTokens(input);
  // Approximate count by concatenating message content
  const text = input
    .map((m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((c: any) => c?.text || '').join('') : ''))
    .join('');
  return llm.getNumTokens(text);
}

export async function shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> {
  const msgsTokens = await countTokens(opts.llm, state.messages);
  const summaryTokens = await countTokens(opts.llm, state.summary || '');
  const total = msgsTokens + summaryTokens;
  return total > opts.maxTokens;
}

export class SummarizationNode {
  constructor(private llm: SummarizationOptions['llm'], private opts: Omit<SummarizationOptions, 'llm'>) {}

  // Group consecutive messages; attach tool outputs to preceding AI message when tool_call_id matches
  groupMessages(messages: any[]): any[][] {
    const groups: any[][] = [];
    let current: any[] = [];
    const flush = () => { if (current.length) groups.push(current), (current = []); };
    const isAiWithTools = (m: any) => {
      const tc = (m?.additional_kwargs?.tool_calls || m?.tool_calls) as any[] | undefined;
      return Array.isArray(tc) && tc.length > 0;
    };
    const toolCallIds = new Set<string>();
    for (const m of messages) {
      const isTool = typeof m?.tool_call_id === 'string';
      if (isTool) {
        // attach to current group if previous AI had tool_calls
        if (current.length && isAiWithTools(current[current.length - 1])) {
          current.push(m);
          continue;
        }
        // Orphan tool message: skip (legacy behavior)
        continue;
      }
      // New group boundary on human/system messages when current has entries
      if (current.length && (m?.role === 'human' || m?.role === 'system')) flush();
      current.push(m);
      const tcs = (m?.additional_kwargs?.tool_calls || m?.tool_calls) as any[] | undefined;
      if (Array.isArray(tcs)) tcs.forEach((t) => toolCallIds.add(t?.id));
    }
    flush();
    return groups;
  }
}

export async function summarizationNode(state: ChatState, opts: SummarizationOptions): Promise<{ summary: string; messages: any[] }> {
  // Simple summarization: produce a short summary string and retain tail within keepTokens budget
  const concatenated = state.messages
    .map((m) => (typeof m?.content === 'string' ? m.content : (m?.content?.find?.((c: any) => c.type === 'input_text')?.text ?? '')))
    .join(' ');
  const summary = concatenated.slice(0, Math.max(1, Math.min(100, opts.keepTokens)));
  // Retain tail messages roughly fitting keepTokens by char length
  const out: any[] = [];
  let budget = opts.keepTokens;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    const text = typeof m?.content === 'string' ? m.content : (m?.content?.find?.((c: any) => c.type === 'input_text')?.text ?? '');
    const len = (text || '').length;
    if (budget - len < 0) break;
    budget -= len;
    out.unshift(m);
  }
  return { summary, messages: out.length ? out : state.messages.slice(-1) };
}

