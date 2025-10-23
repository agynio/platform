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
export function simpleTool<T extends z.ZodTypeAny>(fn: (args: z.infer<T>) => Promise<unknown>, opts: { name: string; description?: string; schema: T }) {
  return lcToolFn(fn as unknown as (input: unknown) => Promise<unknown>, { name: opts.name, description: opts.description || '', schema: opts.schema });
}
