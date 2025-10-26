import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../vault/vault.service';
import {
  SendSlackMessageFunctionTool,
  SendSlackMessageToolStaticConfigSchema,
  SendSlackMessageToolExposedStaticConfigSchema,
} from './send_slack_message.tool';
import { Inject, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class SendSlackMessageNode extends BaseToolNode<z.infer<typeof SendSlackMessageToolStaticConfigSchema>> {
  private toolInstance?: SendSlackMessageFunctionTool;
  private staticCfg: z.infer<typeof SendSlackMessageToolStaticConfigSchema> | null = null;
  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(VaultService) private vault?: VaultService,
  ) {
    super();
  }
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = SendSlackMessageToolStaticConfigSchema.safeParse(cfg || {});
    if (!parsed.success) throw new Error('Invalid SendSlackMessageTool config');
    this.staticCfg = parsed.data;
    this.toolInstance = undefined; // reset so new config applies
  }
  getTool(): SendSlackMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendSlackMessageFunctionTool({
        getConfig: () => this.staticCfg,
        vault: this.vault,
        logger: this.logger,
      });
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}

// Backwards compatibility export name
export { SendSlackMessageNode as SendSlackMessageTool };
export { SendSlackMessageToolStaticConfigSchema, SendSlackMessageToolExposedStaticConfigSchema };
