export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id?: string;
  role: Role;
  contentText?: string | null;
  contentJson?: unknown | null;
  name?: string | null;
  // If this message is a tool result, link to the originating tool call
  toolCallId?: string | null;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolDef {
  name: string;
  description?: string;
  // JSON Schema for input
  schema: object;
}

export interface ToolContext {
  signal?: AbortSignal;
  logger?: import('../types/logger.js').Logger;
  threadId?: string;
}

import type { z } from 'zod';

export type ToolFinishSignal = { finish: true; reason?: string; data?: unknown };
export type ToolResult = { outputText?: string; outputJson?: unknown } | ToolFinishSignal | string;

export interface Tool {
  name: string;
  description?: string;
  schema: z.ZodTypeAny;
  invoke(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
}

export class SimpleToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  register(tool: Tool): void { this.tools.set(tool.name, tool); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
  list(): Tool[] { return Array.from(this.tools.values()); }
}

export interface EngineEvents {
  onMessage?: (msg: Message) => void;
  onToolCall?: (tc: ToolCall) => void;
  onToolResult?: (tc: ToolCall, result: { outputText?: string; outputJson?: unknown }) => void;
  onError?: (err: Error) => void;
}

export interface EngineRunResult {
  messages: Message[];
  toolCalls: ToolCall[];
  // OpenAI raw payloads may be optionally returned to caller for logging
  rawRequest?: unknown;
  rawResponse?: unknown;
}

// Use central Logger type
export type Logger = import('../types/logger.js').Logger;

export interface OpenAIClient {
  responses: {
    create: (
      body: { model: string; input: ResponseInput; tools?: ToolWire[] },
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
  };
}

// Shared wire-level shapes used by the OpenAI Responses API adapter
export type ResponseInputItem = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string };
export type ResponseInput = ResponseInputItem[];
export type ToolWire = { type: 'function'; function: { name: string; description?: string; parameters: object } };

// Summarizer and Memory
export type Summarizer = {
  summarize: (
    messages: Message[],
    opts: { keepTokens: number; maxTokens: number; note?: string },
  ) => Promise<{ summary?: string; messages: Message[] }>;
};

export type MemoryConnector = {
  getMemoryMessage?: (threadId: string) => Promise<Message | null>;
  updateSummary?: (threadId: string, summary: string) => Promise<void>;
};

// Tool finish signal shape and shared reducer state/context

export type SummarizerConfig = { keepTokens: number; maxTokens: number; note?: string };

export type RestrictionConfig = { enabled: boolean; message: string; maxInjections?: number; injections?: number };

export type LoopState = {
  model: string;
  messages: Message[];
  pendingToolCalls?: ToolCall[];
  finish?: boolean;
  finishReason?: string;
  finishData?: unknown;
  restriction?: RestrictionConfig;
  summary?: string;
  rawRequest?: unknown;
  rawResponse?: unknown;
};

export type ReduceResult = { state: LoopState; next: string | null };

// Minimal schema alias for response formatting options
// Lean context exposed to reducers (no operational callbacks)
export type LeanCtx = {
  summarizerConfig?: SummarizerConfig;
  memory?: MemoryConnector;
  threadId?: string;
  runId?: string;
};

export interface Reducer {
  name(): string;
  reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult>;
}
