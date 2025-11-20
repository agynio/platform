import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { SendSlackMessageFunctionTool, SendSlackMessageToolStaticConfigSchema } from './send_slack_message.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class SendSlackMessageNode extends BaseToolNode<z.infer<typeof SendSlackMessageToolStaticConfigSchema>> {
  private toolInstance?: SendSlackMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
  }

  async setConfig(cfg: z.infer<typeof SendSlackMessageToolStaticConfigSchema>): Promise<void> {
    if (typeof cfg?.bot_token !== 'string' || !cfg.bot_token.startsWith('xoxb-')) {
      throw new Error('SendSlackMessageNode config requires resolved bot_token');
    }
    await super.setConfig(cfg);
  }

  getTool(): SendSlackMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendSlackMessageFunctionTool(this, this.logger);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
