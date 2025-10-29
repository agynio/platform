import z from 'zod';
import { LoggerService } from '../../../core/services/logger.service';

// Minimal BaseTool interface used by legacy lgnodes (CallModelNode, ToolsNode)
export abstract class BaseTool {
  constructor(protected logger?: LoggerService) {}
  abstract init(config?: unknown): {
    name: string;
    description: string;
    schema: z.ZodTypeAny;
    invoke: (args: unknown, runtime?: unknown) => Promise<unknown>;
  };
}
