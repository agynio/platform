import { callModel } from './openai/client.js';
import type { EngineRunResult, Message, OpenAIClient, ToolDef, ToolRegistry, Tool, ToolCall } from './types.js';
import type { Logger } from '../types/logger.js';

export type Summarizer = {
  summarize: (messages: Message[], opts: { keepTokens: number; maxTokens: number; note?: string }) => Promise<{ summary?: string; messages: Message[] }>;
};

export type MemoryConnector = {
  getMemoryMessage?: (threadId: string) => Promise<Message | null>;
  updateSummary?: (threadId: string, summary: string) => Promise<void>;
};

export type InvokeCtx = { threadId?: string; runId?: string; abortSignal?: AbortSignal };

export class LLLoop {
  constructor(
    private logger: Logger,
    private deps: { openai: OpenAIClient; tools?: ToolRegistry; summarizer?: Summarizer; memory?: MemoryConnector },
  ) {}

  async invoke(args: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    ctx?: InvokeCtx;
    restriction?: { enabled: boolean; message: string; maxInjections?: number };
    streaming?: boolean;
  }): Promise<EngineRunResult> {
    const { model, messages, ctx, restriction, streaming } = args;

    const threadId = ctx?.threadId;
    const abortSignal = ctx?.abortSignal;

    // 1) Memory integration: prepend memory message (summary) if available
    const working: Message[] = [];
    if (threadId && this.deps.memory?.getMemoryMessage) {
      const mem = await this.deps.memory.getMemoryMessage(threadId);
      if (mem) working.push(mem);
    }
    working.push(...messages);

    // 2) Optional summarization step (token budgeting)
    if (this.deps.summarizer) {
      try {
        const res = await this.deps.summarizer.summarize(working, { keepTokens: 512, maxTokens: 8192 });
        const { summary, messages: trimmed } = res;
        if (summary && threadId && this.deps.memory?.updateSummary) {
          await this.deps.memory.updateSummary(threadId, summary);
          working.length = 0;
          working.push({ role: 'system', contentText: `Summary so far: ${summary}` }, ...trimmed);
        } else {
          // Use trimmed without writing summary
          working.length = 0;
          working.push(...trimmed);
        }
      } catch (e) {
        this.logger.error('summarizer failed', e);
      }
    }

    // Helper to call model once (with optional restriction injection) and process tool calls
    const callOnce = async (): Promise<EngineRunResult> => {
      const res = await callModel({
        client: this.deps.openai,
        model,
        messages: working,
        tools: this.deps.tools?.list().map((t) => ({ name: t.name, schema: { type: 'object' } })) ?? undefined,
        stream: streaming,
        signal: abortSignal,
      });

      const outMessages: Message[] = [res.assistant];
      const toolCalls: ToolCall[] = res.toolCalls;

      // Execute tool calls
      for (const tc of toolCalls) {
        const tool = this.deps.tools?.get(tc.name);
        if (!tool) continue;
        const result = await tool.call(tc.input, { signal: abortSignal, logger: this.logger });
        // Early finish support
        if (typeof result === 'string') {
          outMessages.push({ role: 'tool', contentText: result, toolCallId: tc.id });
          continue;
        }
        if (result && typeof result === 'object' && 'finish' in result) {
          outMessages.push({ role: 'tool', contentJson: result, toolCallId: tc.id });
          return { messages: outMessages, toolCalls, rawRequest: res.rawRequest, rawResponse: res.rawResponse };
        }
        // Default append tool result
        const asObj = result as { outputText?: string; outputJson?: unknown };
        if (asObj.outputText !== undefined)
          outMessages.push({ role: 'tool', contentText: asObj.outputText, toolCallId: tc.id });
        else outMessages.push({ role: 'tool', contentJson: asObj.outputJson, toolCallId: tc.id });
      }

      return { messages: outMessages, toolCalls, rawRequest: res.rawRequest, rawResponse: res.rawResponse };
    };

    // First turn
    let first = await callOnce();

    // Restriction enforcement: if enabled and no tool calls, inject restriction and loop once
    const restrictCfg = restriction;
    const lastAssistant = first.messages.find((m) => m.role === 'assistant');
    if (restrictCfg?.enabled && (!lastAssistant || first.toolCalls.length === 0)) {
      const injections = Math.max(1, Math.min(restrictCfg.maxInjections ?? 1, 1));
      for (let i = 0; i < injections; i++) {
        working.push({ role: 'system', contentText: restrictCfg.message });
      }
      // Loop once more
      const second = await callOnce();
      // Aggregate messages
      return {
        messages: [...first.messages, ...second.messages],
        toolCalls: [...first.toolCalls, ...second.toolCalls],
        rawRequest: second.rawRequest,
        rawResponse: second.rawResponse,
      };
    }

    return first;
  }
}
