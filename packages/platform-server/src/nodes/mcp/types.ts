import type { JSONSchema } from '@agyn/json-schema-to-zod';
import type { Reference } from '../../utils/references';

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
  inputSchema: JSONSchema; // JSON Schema for arguments
  outputSchema?: JSONSchema; // JSON Schema for output (optional)
}

export interface McpToolCallResult {
  isError?: boolean;
  content?: string; // textual fallback
  structuredContent?: { [x: string]: unknown } | undefined; // object validated by outputSchema if provided
  raw?: unknown; // full raw SDK result
}

export interface PersistedMcpState {
  tools?: McpTool[];
  toolsUpdatedAt?: string | number; // ISO string or epoch ms
  toolsEtag?: string;
}

export interface McpServerConfig {
  namespace: string;
  command?: string; // default: 'mcp start --stdio'
  workdir?: string;
  env?: Array<{ name: string; value: string | Reference }>;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  heartbeatIntervalMs?: number; // ping interval
  restart?: { maxAttempts: number; backoffMs: number };
}

/**
 * Internal transport interface mirroring what SDK Client expects. We implement a custom WorkspaceExecTransport.
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
  public code?: string;

  constructor(message: string, codeOrOptions?: string | { code?: string; cause?: unknown }) {
    const hasOptionsObject = typeof codeOrOptions === 'object' && codeOrOptions !== null;
    const cause = hasOptionsObject ? (codeOrOptions as { cause?: unknown }).cause : undefined;
    super(message, cause !== undefined ? { cause } : undefined);
    this.code = hasOptionsObject ? (codeOrOptions as { code?: string }).code : codeOrOptions;
    this.name = 'McpError';
  }
}

export const DEFAULT_MCP_COMMAND = 'mcp start --stdio';
