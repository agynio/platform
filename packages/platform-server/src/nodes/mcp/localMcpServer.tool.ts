import { FunctionTool } from '@agyn/llm';
import z from 'zod';

// Runtime execution delegate provided by LocalMCPServer node
export interface McpExecDelegate {
  callTool: (
    name: string,
    args: unknown,
  ) => Promise<{ isError?: boolean; content?: string; structuredContent?: unknown; raw?: unknown }>;
  getLogger: () => { debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void }; // minimal logger surface
}

interface LocalMCPServerToolDeps {
  getName: () => string;
  getDescription: () => string;
  getDelegate: () => McpExecDelegate | undefined;
}

export class LocalMCPServerTool extends FunctionTool<z.ZodObject> {
  constructor(
    private deps: LocalMCPServerToolDeps,
    private inputSchema: z.ZodObject<any>,
  ) {
    super();
  }
  get name() {
    return this.deps.getName();
  }
  get description() {
    return this.deps.getDescription();
  }
  get schema() {
    return this.inputSchema;
  }
  async execute(args: z.infer<z.ZodObject>): Promise<string> {
    const delegate = this.deps.getDelegate();
    if (!delegate) throw new Error('MCP delegate not connected');
    const res = await delegate.callTool(this.name, args);
    if (res.isError) {
      return JSON.stringify({ ok: false, error: res.content || 'error' });
    }
    return JSON.stringify({ ok: true, content: res.content, structured: res.structuredContent });
  }
}
