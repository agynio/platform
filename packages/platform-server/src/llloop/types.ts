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
}

export interface Tool {
  name: string;
  call(args: unknown, ctx: ToolContext): Promise<{ outputText?: string; outputJson?: unknown } | string>;
}

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): Tool[];
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
export type ToolFinishSignal = { finish: true; reason?: string; data?: unknown };

export type SummarizerConfig = { keepTokens: number; maxTokens: number; note?: string };
export type LoopContext = { threadId?: string; runId?: string; abortSignal?: AbortSignal; summarizerConfig?: SummarizerConfig };

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

export interface LoopRuntime {
  getLLM(): OpenAIClient;
  getTools(): ToolRegistry | undefined;
  getLogger(): Logger;
  getMemory(): MemoryConnector | undefined;
}

export interface Reducer {
  name(): string;
  reduce(state: LoopState, ctx: LoopContext, runtime: LoopRuntime): Promise<ReduceResult>;
}
