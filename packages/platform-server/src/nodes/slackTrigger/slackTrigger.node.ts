import { SocketModeClient } from '@slack/socket-mode';
import { z } from 'zod';
import { ReferenceResolverService } from '../../utils/reference-resolver.service';
import { ResolveError } from '../../utils/references';
import Node from '../base/Node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { BufferMessage } from '../agent/messagesBuffer';
import { HumanMessage } from '@agyn/llm';
import { stringify as YamlStringify } from 'yaml';
import { AgentsPersistenceService } from '../../agents/agents.persistence.service';
import { PrismaService } from '../../core/services/prisma.service';
import { SlackAdapter } from '../../messaging/slack/slack.adapter';
import { ChannelDescriptorSchema, type SendResult, type ChannelDescriptor } from '../../messaging/types';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import type { LiveNode } from '../../graph/liveGraph.types';
import { TemplateRegistry } from '../../graph-core/templateRegistry';
import { isAgentLiveNode } from '../../agents/agent-node.utils';
import { SecretReferenceSchema, VariableReferenceSchema } from '../../utils/reference-schemas';

type TriggerHumanMessage = {
  kind: 'human';
  content: string;
  info?: {
    user?: string;
    channel?: string;
    channel_type?: string;
    thread_ts?: string;
    client_msg_id?: string;
    event_ts?: string;
  };
};
type TriggerListener = { invoke: (thread: string, messages: BufferMessage[]) => Promise<void> };

const SlackAppTokenSchema = z.union([
  z.string().min(1).startsWith('xapp-', { message: 'Slack app token must start with xapp-' }),
  SecretReferenceSchema,
  VariableReferenceSchema,
]);

const SlackBotTokenSchema = z.union([
  z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }),
  SecretReferenceSchema,
  VariableReferenceSchema,
]);

export const SlackTriggerStaticConfigSchema = z
  .object({
    app_token: SlackAppTokenSchema,
    bot_token: SlackBotTokenSchema,
  })
  .strict();

type SlackTriggerConfig = z.infer<typeof SlackTriggerStaticConfigSchema>;

@Injectable({ scope: Scope.TRANSIENT })
export class SlackTrigger extends Node<SlackTriggerConfig> {
  private client: SocketModeClient | null = null;

  private botToken: string | null = null;
  private resolvedTokens: { app: string; bot: string } | null = null;

  constructor(
    @Inject(ReferenceResolverService)
    private readonly referenceResolver: ReferenceResolverService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(SlackAdapter) private readonly slackAdapter: SlackAdapter,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
  ) {
    super();
  }

  private resolveAssignedAgentNodeId(): string | null {
    try {
      const nodeId = this.nodeId;
      const outbound = this.runtime.getOutboundNodeIds(nodeId);
      if (outbound.length === 0) return null;
      const liveNodes = new Map(this.runtime.getNodes().map((node) => [node.id, node]));
      const agentCandidates = outbound
        .map((id) => liveNodes.get(id))
        .filter((node): node is LiveNode => isAgentLiveNode(node, this.templateRegistry));
      if (agentCandidates.length === 0) return null;
      agentCandidates.sort((a, b) => a.id.localeCompare(b.id));
      return agentCandidates[0]?.id ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SlackTrigger.resolveAssignedAgentNodeId failed: ${msg}`);
      return null;
    }
  }

  private ensureToken(value: unknown, expectedPrefix: string, fieldName: 'app_token' | 'bot_token'): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Slack ${fieldName} is required`);
    if (!value.startsWith(expectedPrefix)) {
      const label = fieldName === 'bot_token' ? 'bot token' : 'app token';
      throw new Error(`Slack ${label} must start with ${expectedPrefix}`);
    }
    return value;
  }

  private async resolveTokens(cfg: SlackTriggerConfig): Promise<{ app: string; bot: string }> {
    try {
      const { output } = await this.referenceResolver.resolve(cfg, {
        basePath: '/slack',
        strict: true,
      });
      const app = this.ensureToken(output.app_token, 'xapp-', 'app_token');
      const bot = this.ensureToken(output.bot_token, 'xoxb-', 'bot_token');
      return { app, bot };
    } catch (err) {
      if (err instanceof ResolveError) {
        throw new Error(`Slack token resolution failed: ${err.message}`);
      }
      throw err;
    }
  }

  private async resolveAppToken(): Promise<string> {
    if (!this.resolvedTokens) throw new Error('SlackTrigger config not set');
    return this.resolvedTokens.app;
  }
  // Store config only; token resolution happens during provision
  async setConfig(cfg: SlackTriggerConfig): Promise<void> {
    this.resolvedTokens = await this.resolveTokens(cfg);
    await super.setConfig(cfg);
  }

  private async ensureClient(): Promise<SocketModeClient> {
    this.logger.log('SlackTrigger.ensureClient: entering');
    if (this.client) return this.client;
    const appToken = await this.resolveAppToken();
    const client = new SocketModeClient({ appToken, logLevel: undefined });

    const SlackMessageEventSchema = z.object({
      type: z.literal('message'),
      text: z.string().optional(),
      user: z.string().optional(),
      bot_id: z.string().optional(),
      subtype: z.string().optional(),
      channel: z.string().optional(),
      channel_type: z.string().optional(),
      ts: z.string().optional(),
      thread_ts: z.string().optional(),
      client_msg_id: z.string().optional(),
      event_ts: z.string().optional(),
    });
    type SlackEventCallbackBody = { type: 'event_callback'; event?: unknown };
    type SlackEventsApiBody = { type: 'events_api'; payload?: { event?: unknown } };
    type SlackMessageEnvelope = {
      ack: () => Promise<void>;
      envelope_id: string;
      body?: SlackEventCallbackBody | SlackEventsApiBody;
      event?: unknown;
      retry_num?: number;
      retry_reason?: string;
      accepts_response_payload?: boolean;
    };

    client.on('message', async (envelope: SlackMessageEnvelope) => {
      try {
        // Slack expects an ACK within 3 seconds; acknowledge immediately to avoid retries and treat downstream handling as at-most-once.
        await envelope.ack();
        const rawEvent =
          envelope.body?.type === 'event_callback'
            ? envelope.body.event
            : envelope.body?.type === 'events_api'
              ? envelope.body.payload?.event
              : envelope.event;
        const parsedEvent = SlackMessageEventSchema.safeParse(rawEvent);
        if (!parsedEvent.success) {
          this.logger.warn(`SlackTrigger: received non-message event or invalid event: ${parsedEvent.error}`);
          return;
        }

        const event = parsedEvent.data;
        if (event.bot_id) return;
        if (typeof event.subtype === 'string') return;
        const text = typeof event.text === 'string' ? event.text : '';
        if (!text.trim()) return;
        const userPart = typeof event.user === 'string' && event.user ? event.user : 'slack';
        const rootTs =
          typeof event.thread_ts === 'string' && event.thread_ts
            ? event.thread_ts
            : typeof event.ts === 'string' && event.ts
              ? event.ts
              : null;
        const alias = rootTs ? `${userPart}_${rootTs}` : userPart;
        const msg: TriggerHumanMessage = {
          kind: 'human',
          content: text,
          info: {
            user: event.user,
            channel: event.channel,
            channel_type: event.channel_type,
            ...(rootTs ? { thread_ts: rootTs } : {}),
            client_msg_id: event.client_msg_id,
            event_ts: event.event_ts,
          },
        };
        const threadId = await this.persistence.getOrCreateThreadByAlias('slack', alias, text, {
          channelNodeId: this.nodeId,
        });
        const assignedAgentNodeId = this.resolveAssignedAgentNodeId();
        if (assignedAgentNodeId) {
          await this.persistence.ensureAssignedAgent(threadId, assignedAgentNodeId);
        }
        // Persist descriptor only when channel present and event is top-level (no thread_ts)
        if (typeof event.channel === 'string' && event.channel) {
          if (!event.thread_ts && rootTs) {
            const descriptor: ChannelDescriptor = {
              type: 'slack',
              version: 1,
              identifiers: {
                channel: event.channel,
                thread_ts: rootTs,
              },
              meta: {
                channel_type: event.channel_type,
                client_msg_id: event.client_msg_id,
                event_ts: event.event_ts,
              },
              createdBy: 'SlackTrigger',
            };
            await this.persistence.updateThreadChannelDescriptor(threadId, descriptor);
          }
        } else {
          this.logger.warn(
            `SlackTrigger: missing channel in Slack event; not persisting descriptor threadId=${threadId} alias=${alias}`,
          );
        }
        await this.notify(threadId, [msg]);
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`SlackTrigger handler error: ${errMessage}`);
      }
    });
    this.client = client;
    return client;
  }

  protected async doProvision(): Promise<void> {
    this.logger.log('SlackTrigger.doProvision: starting');
    // Resolve bot token during provision/setup only
    try {
      if (!this.resolvedTokens) throw new Error('SlackTrigger config not set');
      this.botToken = this.resolvedTokens.bot;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'invalid_or_missing_bot_token';
      this.logger.error(`SlackTrigger.doProvision: bot token resolution failed error=${msg}`);
      this.setStatus('provisioning_error');
      throw new Error(msg);
    }
    const client = await this.ensureClient();
    this.logger.log('Starting SlackTrigger (socket mode)');
    try {
      await client.start();
      this.logger.log('SlackTrigger started');
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      this.logger.error(`SlackTrigger.start failed: ${errMessage}`);
      this.setStatus('provisioning_error');
      throw e;
    }
  }
  protected async doDeprovision(): Promise<void> {
    this.logger.log('SlackTrigger.doDeprovision: stopping');
    try {
      await this.client?.disconnect();
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      this.logger.error(`SlackTrigger.disconnect error: ${errMessage}`);
      this.setStatus('deprovisioning_error');
      throw e;
    }
    this.client = null;
    this.logger.log('SlackTrigger stopped');
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
          messages.map((m) => HumanMessage.fromText(`From User:\n${m.content}`)),
        ),
      ),
    );
  }

  public listeners(): Array<(thread: string, messages: BufferMessage[]) => Promise<void>> {
    return this._listeners.map((l) => async (thread: string, messages: BufferMessage[]) => l.invoke(thread, messages));
  }

  getPortConfig() {
    return { sourcePorts: { subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' } } } as const;
  }

  // Send a text message using stored thread descriptor and this trigger's bot token
  async sendToChannel(threadId: string, text: string): Promise<SendResult> {
    try {
      const prisma = this.prismaService.getClient();
      type ThreadChannelRow = { channel: unknown | null };
      const thread = (await prisma.thread.findUnique({
        where: { id: threadId },
        select: { channel: true },
      })) as ThreadChannelRow | null;
      if (!thread) {
        this.logger.error(`SlackTrigger.sendToChannel: missing descriptor threadId=${threadId}`);
        return { ok: false, error: 'missing_channel_descriptor' };
      }
      // Bot token must be set after provision/setup; do not resolve here
      if (!this.botToken) {
        this.logger.error('SlackTrigger.sendToChannel: trigger not provisioned');
        return { ok: false, error: 'slacktrigger_unprovisioned' };
      }
      const channelRaw: unknown = thread.channel as unknown;
      if (channelRaw == null) {
        this.logger.error(`SlackTrigger.sendToChannel: missing descriptor threadId=${threadId}`);
        return { ok: false, error: 'missing_channel_descriptor' };
      }
      const parsed = ChannelDescriptorSchema.safeParse(channelRaw);
      if (!parsed.success) {
        this.logger.error(`SlackTrigger.sendToChannel: invalid descriptor threadId=${threadId}`);
        return { ok: false, error: 'invalid_channel_descriptor' };
      }
      const descriptor = parsed.data;
      const ids = descriptor.identifiers;
      const res = await this.slackAdapter.sendText({
        token: this.botToken!,
        channel: ids.channel,
        text,
        thread_ts: ids.thread_ts,
      });
      return res;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'unknown_error';
      this.logger.error(`SlackTrigger.sendToChannel failed threadId=${threadId} error=${msg}`);
      return { ok: false, error: msg };
    }
  }
}
