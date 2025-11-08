import { SocketModeClient } from '@slack/socket-mode';
import { z } from 'zod';
import { LoggerService } from '../../../core/services/logger.service';
import { VaultService } from '../../../vault/vault.service';
import { ReferenceFieldSchema, resolveTokenRef } from '../../../utils/refs';
import Node from '../base/Node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { BufferMessage } from '../agent/messagesBuffer';
import { HumanMessage } from '@agyn/llm';
import { stringify as YamlStringify } from 'yaml';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { PrismaService } from '../../../core/services/prisma.service';
import { SlackAdapter } from '../../../messaging/slack/slack.adapter';
import { ChannelDescriptorSchema, type SendResult } from '../../../messaging/types';

type TriggerHumanMessage = { kind: 'human'; content: string; info?: Record<string, unknown> };
type TriggerListener = { invoke: (thread: string, messages: BufferMessage[]) => Promise<void> };

export const SlackTriggerStaticConfigSchema = z
  .object({
    app_token: ReferenceFieldSchema,
    bot_token: ReferenceFieldSchema,
  })
  .strict();

type SlackTokenRef = { value: string; source: 'static' | 'vault' };
type SlackTriggerConfig = { app_token: SlackTokenRef; bot_token: SlackTokenRef };

@Injectable({ scope: Scope.TRANSIENT })
export class SlackTrigger extends Node<SlackTriggerConfig> {
  private client: SocketModeClient | null = null;

  private botToken: string | null = null;

  constructor(
    @Inject(LoggerService) protected readonly logger: LoggerService,
    @Inject(VaultService) protected readonly vault: VaultService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(SlackAdapter) private readonly slackAdapter: SlackAdapter,
  ) {
    super(logger);
  }

  private async resolveAppToken(): Promise<string> {
    const resolved = await resolveTokenRef(this.config.app_token, {
      expectedPrefix: 'xapp-',
      fieldName: 'app_token',
      vault: this.vault,
    });
    return resolved;
  }
  // Store config only; token resolution happens during provision
  async setConfig(cfg: SlackTriggerConfig): Promise<void> {
    await super.setConfig(cfg);
  }

  private async ensureClient(): Promise<SocketModeClient> {
    this.logger.info('SlackTrigger.ensureClient: entering');
    if (this.client) return this.client;
    const appToken = await this.resolveAppToken();
    const client = new SocketModeClient({ appToken, logLevel: undefined });

    type SlackMessageEvent = {
      type: 'message';
      text?: string;
      user?: string;
      bot_id?: string;
      subtype?: string;
      channel?: string;
      channel_type?: string;
      ts?: string;
      thread_ts?: string;
      client_msg_id?: string;
      event_ts?: string;
      [k: string]: unknown;
    };
    type SlackEventCallbackBody = {
      type: 'event_callback';
      event: SlackMessageEvent | { type: string; [k: string]: unknown };
      [k: string]: unknown;
    };
    type SlackMessageEnvelope = {
      ack: () => Promise<void>;
      envelope_id: string;
      body: SlackEventCallbackBody;
      event?: SlackMessageEvent;
      retry_num?: number;
      retry_reason?: string;
      accepts_response_payload?: boolean;
      [k: string]: unknown;
    };

    const isMessageEvent = (ev: unknown): ev is SlackMessageEvent => {
      return typeof ev === 'object' && ev !== null && (ev as { type?: unknown }).type === 'message';
    };

    client.on('message', async (envelope: SlackMessageEnvelope) => {
      try {
        await envelope.ack();
        const rawEvent = (envelope.body && envelope.body.event) || envelope.event;
        if (!isMessageEvent(rawEvent)) return;
        const event = rawEvent;
        if (event.bot_id) return;
        if (typeof event.subtype === 'string') return;
        const text = typeof event.text === 'string' ? event.text : '';
        if (!text.trim()) return;
        const userPart = typeof event.user === 'string' && event.user ? event.user : 'slack';
        const alias = typeof event.thread_ts === 'string' && event.thread_ts ? `${userPart}_${event.thread_ts}` : userPart;
        const msg: TriggerHumanMessage = {
          kind: 'human',
          content: text,
          info: {
            user: event.user,
            channel: event.channel,
            channel_type: event.channel_type,
            ...(typeof event.thread_ts === 'string' && event.thread_ts ? { thread_ts: event.thread_ts } : {}),
            client_msg_id: event.client_msg_id,
            event_ts: event.event_ts,
          },
        };
        const threadId = await this.persistence.getOrCreateThreadByAlias('slack', alias, text);
        // Persist descriptor only when channel is present; skip otherwise
        if (typeof event.channel === 'string' && event.channel) {
          const descriptor = {
            type: 'slack' as const,
            version: 1,
            identifiers: {
              channel: event.channel,
              ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}),
            },
            meta: { channel_type: event.channel_type, client_msg_id: event.client_msg_id, event_ts: event.event_ts },
            createdBy: 'SlackTrigger',
          };
          await this.persistence.updateThreadChannelDescriptor(threadId, descriptor, 1);
        } else {
          this.logger.warn('SlackTrigger: missing channel in Slack event; not persisting descriptor', {
            threadId,
            alias,
          });
        }
        await this.notify(threadId, [msg]);
      } catch (err) {
        this.logger.error('SlackTrigger handler error', err);
      }
    });
    this.client = client;
    return client;
  }

  protected async doProvision(): Promise<void> {
    this.logger.info('SlackTrigger.doProvision: starting');
    // Resolve bot token during provision/setup only
    try {
      const token = await resolveTokenRef(this.config.bot_token, {
        expectedPrefix: 'xoxb-',
        fieldName: 'bot_token',
        vault: this.vault,
      });
      this.botToken = token;
    } catch (e) {
      let msg = 'invalid_or_missing_bot_token';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      this.logger.error('SlackTrigger.doProvision: bot token resolution failed', { error: msg });
      this.setStatus('provisioning_error');
      throw new Error(msg);
    }
    const client = await this.ensureClient();
    this.logger.info('Starting SlackTrigger (socket mode)');
    try {
      await client.start();
      this.logger.info('SlackTrigger started');
    } catch (e) {
      this.logger.error('SlackTrigger.start failed', e);
      this.setStatus('provisioning_error');
      throw e;
    }
  }
  protected async doDeprovision(): Promise<void> {
    this.logger.info('SlackTrigger.doDeprovision: stopping');
    try {
      await this.client?.disconnect();
    } catch (e) {
      this.logger.error('SlackTrigger.disconnect error', e);
      this.setStatus('deprovisioning_error');
      throw e;
    }
    this.client = null;
    this.logger.info('SlackTrigger stopped');
  }

  private _listeners: TriggerListener[] = [];
  async subscribe(listener: TriggerListener): Promise<void> {
    this._listeners.push(listener);
  }
  async unsubscribe(listener: TriggerListener): Promise<void> {
    this._listeners = this._listeners.filter((l) => l !== listener);
  }
  protected async notify(thread: string, messages: TriggerHumanMessage[]): Promise<void> {
    this.logger.debug(`[SlackTrigger.notify] thread=${thread} messages=${YamlStringify(messages)}`);
    if (!messages.length) return;
    await Promise.all(
      this._listeners.map(async (listener) =>
        listener.invoke(
          thread,
          messages.map((m) =>
            HumanMessage.fromText(`${YamlStringify({ from: m.info })}\n---\n${YamlStringify({ content: m.content })}`),
          ),
        ),
      ),
    );
  }

  public listeners<K>(_eventName?: K): Array<(...args: unknown[]) => unknown> {
    return this._listeners.map((l) => l.invoke as unknown as (...args: unknown[]) => unknown);
  }

  getPortConfig() {
    return { sourcePorts: { subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' } } } as const;
  }

  // Send a text message using stored thread descriptor and this trigger's bot token
  async sendToThread(threadId: string, text: string): Promise<SendResult> {
    try {
      const prisma = this.prismaService.getClient();
      type ThreadChannelRow = { channel: unknown | null };
      const thread = (await prisma.thread.findUnique({ where: { id: threadId }, select: { channel: true } })) as ThreadChannelRow | null;
      if (!thread) {
        this.logger.error('SlackTrigger.sendToThread: missing descriptor', { threadId });
        return { ok: false, error: 'missing_channel_descriptor' };
      }
      // Bot token must be set after provision/setup; do not resolve here
      if (!this.botToken) {
        this.logger.error('SlackTrigger.sendToThread: trigger not provisioned');
        return { ok: false, error: 'slacktrigger_unprovisioned' };
      }
      const channelRaw: unknown = thread.channel as unknown;
      if (channelRaw == null) {
        this.logger.error('SlackTrigger.sendToThread: missing descriptor', { threadId });
        return { ok: false, error: 'missing_channel_descriptor' };
      }
      const parsed = ChannelDescriptorSchema.safeParse(channelRaw);
      if (!parsed.success) {
        this.logger.error('SlackTrigger.sendToThread: invalid descriptor', { threadId });
        return { ok: false, error: 'invalid_channel_descriptor' };
      }
      const descriptor = parsed.data;
      const ids = descriptor.identifiers;
      const res = await this.slackAdapter.sendText({ token: this.botToken!, channel: ids.channel, text, thread_ts: ids.thread_ts });
      return res;
    } catch (e) {
      let msg = 'unknown_error';
      if (typeof e === 'object' && e !== null && 'message' in e) {
        const mVal = (e as { message?: unknown }).message;
        if (typeof mVal === 'string' && mVal) msg = mVal;
      }
      this.logger.error('SlackTrigger.sendToThread failed', { threadId, error: msg });
      return { ok: false, error: msg };
    }
  }
}
