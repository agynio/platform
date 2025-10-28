import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../../core/services/logger.service';
import { FinishFunctionTool } from './finish.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

export const FinishToolStaticConfigSchema = z.object({}).strict();

@Injectable({ scope: Scope.TRANSIENT })
export class FinishNode extends BaseToolNode<z.infer<typeof FinishToolStaticConfigSchema>> {
  private toolInstance?: FinishFunctionTool;
  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super(logger);
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

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}

// Backwards compatibility export
export { FinishNode as FinishTool };
