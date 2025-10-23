import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { FinishFunctionTool } from './finish.tool';

export const FinishToolStaticConfigSchema = z.object({}).strict();

export class FinishNode extends BaseToolNode {
  private toolInstance?: FinishFunctionTool;
  constructor(private logger: LoggerService) {
    super();
  }
  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    // Validation retained even if empty
    const parsed = FinishToolStaticConfigSchema.safeParse(_cfg);
    if (!parsed.success) throw new Error('Invalid FinishTool config');
  }
  getTool(): FinishFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new FinishFunctionTool({ logger: this.logger });
    }
    return this.toolInstance;
  }
}

// Backwards compatibility export
export { FinishNode as FinishTool };
