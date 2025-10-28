import { tool as lcToolFn } from '@langchain/core/tools';
import z from 'zod';
import { LoggerService } from '../../core/services/logger.service';

// Minimal BaseTool interface used by legacy lgnodes (CallModelNode, ToolsNode)
export abstract class BaseTool {
  constructor(protected logger?: LoggerService) {}
  abstract init(config?: unknown): { name: string; description: string; schema: z.ZodTypeAny; invoke: (args: unknown, runtime?: unknown) => Promise<unknown> };
  // Optional container hook for oversized output persistence
  async getContainerForThread(_thread: string): Promise<unknown | undefined> { return undefined; }
}

// Helper to wrap an async function with zod schema using LangChain's tool()
export function simpleTool<T extends z.ZodTypeAny>(
  fn: (args: z.infer<T>) => Promise<unknown>,
  opts: { name: string; description?: string; schema: T },
) {
  const wrapper = async (input: unknown): Promise<unknown> => {
    const parsed = opts.schema.safeParse(input);
    if (!parsed.success) throw parsed.error;
    return await fn(parsed.data as z.infer<T>);
  };
  return lcToolFn(wrapper, { name: opts.name, description: opts.description || '', schema: opts.schema });
}
