import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendSlackMessageFunctionTool, SendSlackMessageToolStaticConfigSchema } from './send_slack_message.tool';
import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import { ReferenceResolverService } from '../../../utils/reference-resolver.service';
import { ResolveError } from '../../../utils/references';

@Injectable({ scope: Scope.TRANSIENT })
export class SendSlackMessageNode extends BaseToolNode<z.infer<typeof SendSlackMessageToolStaticConfigSchema>> {
  private toolInstance?: SendSlackMessageFunctionTool;
  private resolvedBotToken: string | null = null;
  constructor(
    @Inject(ReferenceResolverService) @Optional() private readonly referenceResolver?: ReferenceResolverService,
  ) {
    super();
  }

  private ensureBotToken(value: unknown): string {
    if (typeof value !== 'string' || !value.startsWith('xoxb-')) {
      throw new Error('Slack bot token must start with xoxb-');
    }
    return value;
  }

  private async resolveBotToken(value: unknown): Promise<string> {
    if (!this.referenceResolver) {
      return this.ensureBotToken(value);
    }
    try {
      const { output } = await this.referenceResolver.resolve({ bot_token: value }, { basePath: '/slack/tool' });
      return this.ensureBotToken(output.bot_token);
    } catch (err) {
      if (err instanceof ResolveError) {
        throw new Error(`Slack token resolution failed: ${err.message}`);
      }
      throw err;
    }
  }

  async setConfig(cfg: z.infer<typeof SendSlackMessageToolStaticConfigSchema>): Promise<void> {
    this.resolvedBotToken = await this.resolveBotToken(cfg.bot_token);
    await super.setConfig(cfg);
  }

  getBotToken(): string {
    if (!this.resolvedBotToken) throw new Error('SendSlackMessageNode config not set');
    return this.resolvedBotToken;
  }

  getTool(): SendSlackMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendSlackMessageFunctionTool(this);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
