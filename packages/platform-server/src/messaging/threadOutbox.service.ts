import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { AGENTS_PERSISTENCE_WRITER } from '../agents/tokens';
import { ChannelRouter } from './channelRouter.service';
import type { SendResult, ThreadOutboxSendRequest, ThreadOutboxSource } from './types';

const isThreadOutboxSource = (value: unknown): value is ThreadOutboxSource =>
  value === 'send_message' || value === 'auto_response' || value === 'manage_forward';

@Injectable()
export class ThreadOutboxService {
  private readonly logger = new Logger(ThreadOutboxService.name);

  constructor(
    @Inject(AGENTS_PERSISTENCE_WRITER)
    private readonly persistence: Pick<AgentsPersistenceService, 'recordOutboxMessage'>,
    @Inject(ChannelRouter) private readonly channelRouter: ChannelRouter,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private ensureOutboxSource(value: unknown, context: Record<string, unknown>): ThreadOutboxSource | null {
    if (!isThreadOutboxSource(value)) {
      this.logger.warn(
        `ThreadOutboxService: invalid outbox source${this.format({ ...context, source: value })}`,
      );
      return null;
    }
    return value;
  }

  async send(request: ThreadOutboxSendRequest & { role?: 'assistant' | 'user' }): Promise<SendResult> {
    const threadId = request.threadId;
    const source = this.ensureOutboxSource(request.source, { threadId });
    if (!source) {
      return { ok: false, error: 'invalid_outbox_source' } satisfies SendResult;
    }
    const text = request.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'empty_message' } satisfies SendResult;
    }

    const role = request.role ?? 'assistant';
    const runId = request.runId ?? null;

    try {
      await this.persistence.recordOutboxMessage({
        threadId,
        text,
        role,
        source,
        runId,
      });
    } catch (error) {
      this.logger.error(
        `ThreadOutboxService: persistence failed${this.format({
          threadId,
          source,
          runId,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { error },
        })}`,
      );
      return {
        ok: false,
        error: error instanceof Error && error.message ? error.message : 'outbox_persistence_failed',
      } satisfies SendResult;
    }

    const adapter = await this.channelRouter.getAdapter(threadId);
    if (!adapter) {
      this.logger.warn(`ThreadOutboxService: missing channel adapter${this.format({ threadId, source })}`);
      return { ok: false, error: 'missing_channel_adapter' } satisfies SendResult;
    }

    return adapter.sendText({
      threadId,
      text,
      source,
      prefix: request.prefix,
      runId,
    });
  }
}
