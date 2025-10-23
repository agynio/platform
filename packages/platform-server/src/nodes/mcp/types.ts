import { FunctionTool } from '@agyn/llm';
import z from 'zod';
import { JSONSchema } from 'zod/v4/core';

// If upstream exports JSONRPCMessage directly later, replace this with that import.
export type JSONRPCMessage = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/**
 * Core MCP Tool description mirrored (subset) from SDK listTools result for internal registration.
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema.BaseSchema; // JSON Schema for arguments
  outputSchema: JSONSchema.BaseSchema; // JSON Schema for output
}

export interface McpToolCallResult {
  isError?: boolean;
  content?: string; // textual fallback
  structuredContent?: unknown; // object validated by outputSchema if provided
  raw?: unknown; // full raw SDK result
}

// Minimal internal type for persisted MCP state
export interface PersistedMcpState {
  tools?: McpTool[];
  toolsUpdatedAt?: string | number; // ISO string or epoch ms
  toolsEtag?: string;
}

export interface McpServerConfig {
  namespace: string;
  command?: string; // default: 'mcp start --stdio'
  workdir?: string;
  env?: Array<{ key: string; value: string; source?: 'static' | 'vault' }>;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  heartbeatIntervalMs?: number; // ping interval
  restart?: { maxAttempts: number; backoffMs: number };
}

export interface McpServer {
  readonly namespace: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  listTools(force?: boolean): FunctionTool[];
  callTool(name: string, args: unknown, options?: { timeoutMs?: number; threadId?: string }): Promise<McpToolCallResult>;
  on(event: 'ready', handler: (...a: unknown[]) => void): this;
  on(event: 'exit', handler: (...a: unknown[]) => void): this;
  on(event: 'error', handler: (...a: unknown[]) => void): this;
  on(event: 'restarted', handler: (...a: unknown[]) => void): this;
  on(event: 'mcp.tools_updated', handler: (payload: { tools: FunctionTool[]; updatedAt: number }) => void): this;
}

export interface DockerExecStreams {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  close: () => Promise<{ exitCode: number }>;
  execId: string;
}

/**
 * Internal transport interface mirroring what SDK Client expects. We implement a custom DockerExecTransport.
 */
export interface JsonRpcTransport {
  onmessage?: (msg: JSONRPCMessage) => void;
  onerror?: (err: unknown) => void;
  onclose?: () => void;
  start(): Promise<void>;
  send(msg: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  sessionId?: string; // optional for reconnect semantics (unused for now)
}

export class McpError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const DEFAULT_MCP_COMMAND = 'mcp start --stdio';
