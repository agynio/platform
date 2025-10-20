import { z, type ZodSchema } from 'zod';
import type { Tool, ToolContext } from './types.js';

export type ToolFinishSignal = { finish: true; reason?: string; data?: unknown };

export function createTool<TSchema extends ZodSchema>(
  name: string,
  schema: TSchema,
  handler: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<string | object | ToolFinishSignal>,
): Tool {
  return {
    name,
    async call(args: unknown, ctx: ToolContext) {
      const parsed = schema.parse(args) as z.infer<TSchema>;
      const res = await handler(parsed, ctx);
      if (typeof res === 'string') return { outputText: res };
      if (res && typeof res === 'object' && 'finish' in res) return res as ToolFinishSignal;
      return { outputJson: res };
    },
  } satisfies Tool;
}

