import { tool as lcToolFn } from '@langchain/core/tools';
import z from 'zod';

// Factory re-export used by AgentNode for MCP dynamic tools
export function lcTool(impl: (input: any, config?: any) => Promise<any>, opts: { name: string; description?: string; schema?: z.ZodTypeAny }) {
  const schema = opts.schema || z.object({}).passthrough();
  return lcToolFn(async (raw: any) => impl(raw), { name: opts.name, description: opts.description || '', schema });
}
