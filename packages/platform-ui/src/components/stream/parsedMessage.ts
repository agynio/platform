export type ParsedMessageType = 'human' | 'ai' | 'tool' | 'unknown';

export interface ToolCall {
  name: string;
  args?: unknown;
  raw: unknown;
}

export interface ParsedMessage {
  kind: ParsedMessageType;
  content: string | null;
  info?: Record<string, unknown> | null;
  toolCalls?: ToolCall[];
  raw: unknown;
}