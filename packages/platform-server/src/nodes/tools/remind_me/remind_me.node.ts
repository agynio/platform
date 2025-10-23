import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { RemindMeFunctionTool, RemindMeToolStaticConfigSchema } from './remind_me.tool';
import z from 'zod';
import { AgentNode } from '../../agent/agent.node';

export class RemindMeNode extends BaseToolNode {
  private toolInstance?: RemindMeFunctionTool;
  private callerAgent?: AgentNode; // set via port wiring
  private staticCfg: z.infer<typeof RemindMeToolStaticConfigSchema> = {};
  constructor(private logger: LoggerService) {
    super();
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = RemindMeToolStaticConfigSchema.safeParse(cfg || {});
    if (!parsed.success) throw new Error('Invalid RemindMe config');
    this.staticCfg = parsed.data;
    this.toolInstance = undefined;
  }
  getTool(): RemindMeFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new RemindMeFunctionTool(this.logger);
    }
    return this.toolInstance;
  }
}
