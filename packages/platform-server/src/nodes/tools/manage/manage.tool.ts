import z from 'zod';

import { FunctionTool, HumanMessage } from '@agyn/llm';
import { ManageToolNode } from './manage.node';
import { LoggerService } from '../../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';

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

@Injectable({ scope: Scope.TRANSIENT })
export class ManageFunctionTool extends FunctionTool<typeof ManageInvocationSchema> {
  private _node?: ManageToolNode;
  private persistence?: AgentsPersistenceService;

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(AgentsPersistenceService) private readonly injectedPersistence: AgentsPersistenceService,
  ) {
    super();
  }

  init(node: ManageToolNode, options?: { persistence?: AgentsPersistenceService }) {
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
      try {
        const res = await targetAgent.invoke(childThreadId, [HumanMessage.fromText(messageText)]);
        return res?.text;
      } catch (err: unknown) {
        this.logger.error('Manage: send_message failed', {
          worker: targetTitle,
          childThreadId,
          error: (err as { message?: string })?.message || String(err),
        });
        throw err;
      }
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
}
