// NOTE: SDK does not presently expose a stable top-level type for JSONRPCMessage we can import without
// triggering resolution issues in this monorepo build setup. We define a minimal structural type here.
// If upstream exports JSONRPCMessage directly later, replace this with that import.
export type JSONRPCMessage = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

/**
 * Core MCP Tool description mirrored (subset) from SDK listTools result for internal registration.
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any; // JSON Schema for arguments
  outputSchema?: any; // Optional schema for structuredContent
}

export interface McpToolCallResult {
  isError?: boolean;
  content?: string; // textual fallback
  structuredContent?: any; // object validated by outputSchema if provided
  raw?: any; // full raw SDK result
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
  listTools(force?: boolean): Promise<McpTool[]>;
  callTool(name: string, args: any, options?: { timeoutMs?: number; threadId?: string }): Promise<McpToolCallResult>;
  on(event: 'ready' | 'exit' | 'error' | 'restarted', handler: (...a: any[]) => void): this;
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
  onerror?: (err: any) => void;
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
