import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { SendSlackMessageFunctionTool, SendSlackMessageToolStaticConfigSchema } from './send_slack_message.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class SendSlackMessageNode extends BaseToolNode<z.infer<typeof SendSlackMessageToolStaticConfigSchema>> {
  private toolInstance?: SendSlackMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(VaultService) protected vault: VaultService,
  ) {
    super(logger);
  }

  getTool(): SendSlackMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendSlackMessageFunctionTool(this, this.logger, this.vault);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
