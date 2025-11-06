import { Inject, Injectable, Scope } from '@nestjs/common';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { LoggerService } from '../core/services/logger.service';
import { ChannelInfo } from './types';
import { SlackChannelAdapter } from './slack.adapter';

export type SendMessageParams = { text: string; broadcast?: boolean; ephemeral_user?: string | null };
export type SendMessageResult = { ok: boolean; ref?: unknown; error?: string; attempts: number };

@Injectable({ scope: Scope.TRANSIENT })
export class ChannelRegistry {
  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(SlackChannelAdapter) private readonly slack: SlackChannelAdapter,
  ) {}

  async resolve(threadId: string): Promise<ChannelInfo | null> {
    return this.persistence.getThreadChannel(threadId);
  }

  async send(threadId: string, params: SendMessageParams): Promise<SendMessageResult> {
    const info = await this.resolve(threadId);
    if (!info) return { ok: false, error: 'channel_info_missing', attempts: 0 };
    switch (info.type) {
      case 'slack': {
        const res = await this.slack.send(info, params);
        return { ok: res.ok, ref: res.ref, error: res.error, attempts: res.attempts };
      }
      default: {
        this.logger.warn('ChannelRegistry: unsupported channel type');
        return { ok: false, error: 'unsupported_channel', attempts: 0 };
      }
    }
  }
}
