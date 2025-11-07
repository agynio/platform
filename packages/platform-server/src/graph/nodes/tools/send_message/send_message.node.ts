import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { LoggerService } from '../../../../core/services/logger.service';
import { VaultService } from '../../../../vault/vault.service';
import { PrismaService } from '../../../../core/services/prisma.service';
import { ConfigService } from '../../../../core/services/config.service';

export const SendMessageToolStaticConfigSchema = z.object({}).strict();

type SendMessageConfig = Record<string, never>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(VaultService) protected vault: VaultService,
    @Inject(PrismaService) protected prisma: PrismaService,
    @Inject(ConfigService) protected config: ConfigService,
  ) {
    super(logger);
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new SendMessageFunctionTool(this.logger, this.vault, this.prisma, this.config);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
