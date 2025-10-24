import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../infra/vault/vault.service';
import { SendSlackMessageTool, SendSlackMessageToolStaticConfigSchema, SendSlackMessageToolExposedStaticConfigSchema } from './send_slack_message.tool';

export class SendSlackMessageNode extends BaseToolNode {
  private toolInstance?: SendSlackMessageTool;
  private staticCfg: z.infer<typeof SendSlackMessageToolStaticConfigSchema> | null = null;
  constructor(
    private logger: LoggerService,
    private vault?: VaultService,
  ) {
    super();
  }
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = SendSlackMessageToolStaticConfigSchema.safeParse(cfg || {});
    if (!parsed.success) throw new Error('Invalid SendSlackMessageTool config');
    this.staticCfg = parsed.data;
    this.toolInstance = undefined; // reset so new config applies
  }
  getTool(): SendSlackMessageTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendSlackMessageTool({
        getConfig: () => this.staticCfg,
        vault: this.vault,
        logger: this.logger,
      });
    }
    return this.toolInstance;
  }
}

// Backwards compatibility export name
export { SendSlackMessageNode as SendSlackMessageTool };
export { SendSlackMessageToolStaticConfigSchema, SendSlackMessageToolExposedStaticConfigSchema };
