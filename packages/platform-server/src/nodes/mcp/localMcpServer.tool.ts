import { FunctionTool } from '@agyn/llm';
import z from 'zod';
import { LocalMCPServerNode } from './localMcpServer.node';
import { LLMContext } from '../../llm/types';
import { buildMcpToolError } from './errorUtils';
import { McpError } from './types';

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
    private _inputSchema: z.ZodObject<z.ZodRawShape>,
    private _node: LocalMCPServerNode,
  ) {
    super();
  }
  get name() {
    return this.node.config.namespace ? `${this.node.config.namespace}_${this._name}` : this._name;
  }
  get rawName() {
    return this._name;
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

  async execute(args: z.infer<z.ZodObject<z.ZodRawShape>>, ctx: LLMContext): Promise<string> {
    const res = await this.node.callTool(this._name, args, { threadId: ctx.threadId });
    if (res.isError) {
      const { message, cause } = buildMcpToolError(res);
      throw new McpError(message, { cause });
    }

    if (res.structuredContent !== undefined && res.structuredContent !== null) {
      return JSON.stringify(res.structuredContent);
    }

    return res.content ?? '';
  }
}
