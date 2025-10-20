import type OpenAI from 'openai';

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
  logger?: Logger;
}

export interface Tool {
  name: string;
  call(args: unknown, ctx: ToolContext): Promise<{ outputText?: string; outputJson?: unknown } | string>;
}

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): Tool[];
}

export interface EngineOptions {
  model: string;
  restriction?: { enabled: boolean; message: string; maxInjections?: number };
  streaming?: boolean;
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

export interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  debug?: (msg: string, ...args: unknown[]) => void;
}

export interface OpenAIClient {
  responses: OpenAI['responses'];
}

