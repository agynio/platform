// Back-compat adapter exposing RemindMeTool symbol at old path
import { RemindMeFunctionTool } from './tools/remind_me/remind_me.tool';
import { LoggerService } from '../core/services/logger.service';

export class RemindMeTool {
  private instance: RemindMeFunctionTool | undefined;
  constructor(private logger: LoggerService) {}
  init(): ReturnType<RemindMeFunctionTool['init']> {
    if (!this.instance) this.instance = new RemindMeFunctionTool(this.logger);
    return this.instance.init();
  }
  // Expose testing helpers via instance when present
  getActiveReminders() { return (this.instance as any)?.getActiveReminders?.(); }
  async destroy() { return (this.instance as any)?.destroy?.(); }
}

export { RemindMeToolStaticConfigSchema } from './tools/remind_me/remind_me.tool';

