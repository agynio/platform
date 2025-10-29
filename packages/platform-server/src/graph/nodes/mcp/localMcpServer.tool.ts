import { FunctionTool } from '@agyn/llm';
import z from 'zod';
import { LocalMCPServerNode } from './localMcpServer.node';
import { LLMContext } from '../../../llm/types';

// Runtime execution delegate provided by LocalMCPServer node
export interface McpExecDelegate {
  callTool: (
    name: string,
    args: unknown,
  ) => Promise<{
    isError?: boolean;
    content?: string;
    structuredContent?: { [x: string]: unknown } | undefined;
    raw?: unknown;
  }>;
  getLogger: () => { debug: (...a: unknown[]) => void; error: (...a: unknown[]) => void }; // minimal logger surface
}

export class LocalMCPServerTool extends FunctionTool<z.ZodObject> {
  constructor(
    private _name: string,
    private _description: string,
    private _inputSchema: z.ZodObject<any>,
    private _node: LocalMCPServerNode,
  ) {
    super();
  }
  get name() {
    return `${this.node.config.namespace}_${this._name}`;
  }
  get description() {
    return this._description;
  }
  get schema() {
    return this._inputSchema;
  }
  get node() {
    return this._node;
  }

  async execute(args: z.infer<z.ZodObject>, ctx: LLMContext): Promise<string> {
    const res = await this.node.callTool(this._name, args, { threadId: ctx.threadId });
    if (res.isError) {
      return JSON.stringify({ ok: false, error: res.content || 'error' });
    }
    return JSON.stringify({ ok: true, content: res.content, structured: res.structuredContent });
  }
}
