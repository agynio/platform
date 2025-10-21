import { FunctionTool } from '@agyn/llm';
import z from 'zod';

// Runtime execution delegate provided by LocalMCPServer node
export interface McpExecDelegate {
  callTool: (
    name: string,
    args: any,
  ) => Promise<{ isError?: boolean; content?: string; structuredContent?: unknown; raw?: unknown }>;
  getLogger: () => { debug: (...a: any[]) => void; error: (...a: any[]) => void }; // minimal logger surface
}

// We keep schema open (any args) because remote MCP tools provide JSONSchema, not zod. Conversion can be added later.
export const GenericMcpInvocationSchema = z
  .object({
    arguments: z.any().optional().describe('Arguments passed to the MCP tool (shape defined by remote tool schema).'),
  })
  .strict();

interface LocalMCPServerToolDeps {
  getName: () => string;
  getDescription: () => string;
  getDelegate: () => McpExecDelegate | undefined;
}

export class LocalMCPServerTool extends FunctionTool<typeof GenericMcpInvocationSchema> {
  constructor(
    private deps: LocalMCPServerToolDeps,
    private inputSchema?: z.ZodObject<any>,
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
    return this.inputSchema || GenericMcpInvocationSchema;
  }
  async execute(args: z.infer<typeof GenericMcpInvocationSchema>): Promise<string> {
    const delegate = this.deps.getDelegate();
    if (!delegate) throw new Error('MCP delegate not connected');
    const payload = (args && typeof args === 'object' ? (args as any).arguments : undefined) ?? args;
    const res = await delegate.callTool(this.name, payload);
    if (res.isError) {
      return JSON.stringify({ ok: false, error: res.content || 'error' });
    }
    return JSON.stringify({ ok: true, content: res.content, structured: res.structuredContent });
  }
}
