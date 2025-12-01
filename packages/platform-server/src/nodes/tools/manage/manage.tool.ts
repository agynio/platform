import z from 'zod';

import { FunctionTool, HumanMessage } from '@agyn/llm';
import { ManageToolNode, ManageToolStaticConfigSchema } from './manage.node';
import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { EventsBusService, type MessageBroadcast } from '../../../events/events-bus.service';

export const ManageInvocationSchema = z
  .object({
    command: z.enum(['send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    threadAlias: z
      .string()
      .min(1)
      .optional()
      .describe('Optional child thread alias; defaults per worker title.'),
  })
  .strict();

type ManageToolConfig = z.infer<typeof ManageToolStaticConfigSchema>;
type WorkerAgent = ReturnType<ManageToolNode['getWorkers']>[number];

@Injectable({ scope: Scope.TRANSIENT })
export class ManageFunctionTool extends FunctionTool<typeof ManageInvocationSchema> {
  private _node?: ManageToolNode;
  private persistence?: AgentsPersistenceService;
  private readonly logger = new Logger(ManageFunctionTool.name);

  constructor(
    @Inject(AgentsPersistenceService) private readonly injectedPersistence: AgentsPersistenceService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {
    super();
    if (!eventsBus) {
      throw new Error(
        'Manage: EventsBusService not available; ensure EventsModule is imported and service exported',
      );
    }
  }

  init(node: ManageToolNode, options?: { persistence?: AgentsPersistenceService }) {
    if (!this.eventsBus) {
      throw new Error(
        'Manage: EventsBusService not available; ensure EventsModule is imported and service exported',
      );
    }
    this._node = node;
    this.persistence = options?.persistence ?? this.injectedPersistence;
    return this;
  }

  get node() {
    if (!this._node) throw new Error('ManageFunctionTool: node not initialized');
    return this._node;
  }

  get name() {
    return this.node.config.name ?? 'manage';
  }
  get schema() {
    return ManageInvocationSchema;
  }
  get description() {
    return this.node.config.description ?? 'Manage tool';
  }

  private getPersistence(): AgentsPersistenceService | undefined {
    return this.persistence ?? this.injectedPersistence;
  }

  private getConfig(): ManageToolConfig {
    const raw = (this.node.config ?? {}) as Record<string, unknown>;
    return ManageToolStaticConfigSchema.parse(raw);
  }

  private sanitizeAlias(raw: string | undefined): string {
    const normalized = (raw ?? '').toLowerCase();
    const withHyphen = normalized.replace(/\s+/g, '-');
    const cleaned = withHyphen.replace(/[^a-z0-9._-]/g, '');
    const collapsed = cleaned.replace(/-+/g, '-');
    const truncated = collapsed.slice(0, 64);
    if (!truncated || !/[a-z0-9]/.test(truncated)) {
      throw new Error('Manage: invalid or empty threadAlias');
    }
    return truncated;
  }

  async execute(args: z.infer<typeof ManageInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { command, worker, message, threadAlias } = args;
    const parentThreadId = ctx.threadId;
    if (!parentThreadId) throw new Error('Manage: missing threadId in LLM context');
    const config = this.getConfig();
    const workerTitles = this.node.listWorkers();
    if (command === 'send_message') {
      if (!workerTitles.length) throw new Error('No agents connected');
      const targetTitle = worker?.trim();
      if (!targetTitle) throw new Error('worker is required for send_message');
      const messageText = message?.trim() ?? '';
      if (!messageText) throw new Error('message is required for send_message');
      const targetAgent = this.node.getWorkerByTitle(targetTitle);
      if (!targetAgent) throw new Error(`Unknown worker: ${targetTitle}`);
      const persistence = this.getPersistence();
      if (!persistence) throw new Error('Manage: persistence unavailable');
      const alias =
        typeof threadAlias === 'string'
          ? (() => {
              const trimmed = threadAlias.trim();
              if (!trimmed) throw new Error('Manage: invalid or empty threadAlias');
              return trimmed;
            })()
          : this.sanitizeAlias(targetTitle);
      const childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', alias, parentThreadId, '');
      await persistence.updateThreadChannelDescriptor(childThreadId, {
        type: 'manage',
        version: 1,
        identifiers: { parentThreadId },
        meta: {
          agentTitle: targetTitle,
          mode: config.mode ?? 'sync',
          asyncPrefix: config.asyncPrefix,
          showCorrelationInOutput: config.showCorrelationInOutput,
        },
        createdBy: 'manage-tool',
      });
      if ((config.mode ?? 'sync') === 'async') {
        return this.dispatchAsync({
          agent: targetAgent,
          childThreadId,
          messageText,
          workerTitle: targetTitle,
          alias,
          showCorrelation: config.showCorrelationInOutput ?? false,
        });
      }

      return this.dispatchSync({
        agent: targetAgent,
        childThreadId,
        messageText,
        workerTitle: targetTitle,
        alias,
        timeoutMs: config.syncTimeoutMs,
        maxMessages: config.syncMaxMessages,
        showCorrelation: config.showCorrelationInOutput ?? false,
      });
    }
    if (command === 'check_status') {
      const workers = this.node.getWorkers();
      if (!workers.length) return JSON.stringify({ activeTasks: 0, childThreadIds: [] });
      const _prefix = `${parentThreadId}__`;
      const ids = new Set<string>();
      const promises = workers.map(async (_agent) => {
        try {
          // const res = await Promise.resolve(w.agent.listActiveThreads(prefix));
          // const threads = Array.isArray(res) ? res : [];
          // for (const t of threads) if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
        } catch (_err: unknown) {
          // this.logger.error('Manage: listActiveThreads failed', {
          //   worker: w.name,
          //   error: (err as { message?: string })?.message || String(err),
          // });
        }
      });
      await Promise.all(promises);
      return JSON.stringify({ activeTasks: ids.size, childThreadIds: Array.from(ids.values()) });
    }
    return '';
  }

  private dispatchAsync(params: {
    agent: WorkerAgent;
    childThreadId: string;
    messageText: string;
    workerTitle: string;
    alias: string;
    showCorrelation: boolean;
  }): string {
    const { agent, childThreadId, messageText, workerTitle, alias, showCorrelation } = params;
    void agent.invoke(childThreadId, [HumanMessage.fromText(messageText)]).catch((err: unknown) => {
      this.logger.error('Manage: send_message failed', {
        worker: workerTitle,
        childThreadId,
        error: (err as { message?: string })?.message || String(err),
      });
    });
    const correlation = showCorrelation ? ` [alias=${alias}; thread=${childThreadId}]` : '';
    return `Message dispatched to ${workerTitle}; responses will arrive asynchronously.${correlation}`;
  }

  private async dispatchSync(params: {
    agent: WorkerAgent;
    childThreadId: string;
    messageText: string;
    workerTitle: string;
    alias: string;
    timeoutMs: number;
    maxMessages: number;
    showCorrelation: boolean;
  }): Promise<string> {
    const { agent, childThreadId, messageText, workerTitle, alias, timeoutMs, maxMessages, showCorrelation } = params;
    const collector = this.createChildMessageCollector(childThreadId, { timeoutMs, maxMessages });
    const waitForMessages = collector.wait();
    try {
      await agent.invoke(childThreadId, [HumanMessage.fromText(messageText)]);
    } catch (err: unknown) {
      collector.cancel(err);
      this.logger.error('Manage: send_message failed', {
        worker: workerTitle,
        childThreadId,
        error: (err as { message?: string })?.message || String(err),
      });
      throw err;
    }

    const result = await waitForMessages;
    return this.formatSyncResponse({
      workerTitle,
      alias,
      childThreadId,
      showCorrelation,
      messages: result.messages,
    });
  }

  private formatSyncResponse(params: {
    workerTitle: string;
    alias: string;
    childThreadId: string;
    showCorrelation: boolean;
    messages: Array<{ text: string }>;
  }): string {
    const { workerTitle, alias, childThreadId, showCorrelation, messages } = params;
    const header = showCorrelation
      ? `Response from: ${workerTitle} [alias=${alias}; thread=${childThreadId}]`
      : `Response from: ${workerTitle}`;
    const chunks = messages
      .map((m) => m.text)
      .filter((text) => typeof text === 'string' && text.length > 0);
    if (chunks.length === 0) return header;
    return `${header}\n${chunks.join('\n\n')}`;
  }

  private createChildMessageCollector(
    childThreadId: string,
    options: { timeoutMs: number; maxMessages: number },
  ): {
    wait: () => Promise<{ messages: Array<{ id: string; text: string; runId?: string; createdAt: Date }> }>;
    cancel: (reason: unknown) => void;
  } {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, Math.trunc(options.timeoutMs)) : 0;
    const maxMessages = Math.max(1, Math.trunc(options.maxMessages ?? 1));
    const collected: Array<{ id: string; text: string; runId?: string; createdAt: Date }> = [];
    const seenIds = new Set<string>();
    let settled = false;
    let cleanup: () => void = () => {};
    let rejectRef: (reason: unknown) => void = () => {};

    const promise = new Promise<{ messages: Array<{ id: string; text: string; runId?: string; createdAt: Date }> }>((resolve, reject) => {
      rejectRef = (reason: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(reason);
      };

      const finish = (messages: typeof collected) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ messages });
      };

      const unsubscribe = this.eventsBus.subscribeToMessageCreated(({ threadId, message }: { threadId: string; message: MessageBroadcast }) => {
        if (threadId !== childThreadId) return;
        if (message.kind !== 'assistant') return;
        if (message.id && seenIds.has(message.id)) return;
        if (message.id) seenIds.add(message.id);

        const text = typeof message.text === 'string' ? message.text : '';
        collected.push({
          id: message.id,
          text,
          runId: typeof message.runId === 'string' ? message.runId : undefined,
          createdAt: message.createdAt,
        });

        if (collected.length >= maxMessages) {
          finish([...collected]);
        }
      });

      const timeoutHandle = setTimeout(() => {
        if (collected.length > 0) {
          finish([...collected]);
        } else {
          rejectRef(new Error('Manage: timed out waiting for worker response'));
        }
      }, timeoutMs);

      cleanup = () => {
        clearTimeout(timeoutHandle);
        unsubscribe();
      };
    });

    const cancel = (reason: unknown) => {
      rejectRef(reason ?? new Error('Manage: cancelled'));
    };

    return {
      wait: () => promise,
      cancel,
    };
  }
}
