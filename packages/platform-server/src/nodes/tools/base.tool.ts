import z from 'zod';
import { Logger } from '@nestjs/common';

// Minimal BaseTool interface used by legacy lgnodes (CallModelNode, ToolsNode)
export abstract class BaseTool {
  protected readonly logger = new Logger(this.constructor.name);
  abstract init(config?: unknown): {
    name: string;
    description: string;
    schema: z.ZodTypeAny;
    invoke: (args: unknown, runtime?: unknown) => Promise<unknown>;
  };
}
