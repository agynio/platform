import z from 'zod';

import { FunctionTool, HumanMessage } from '@agyn/llm';
import { ManageToolNode } from './manage.node';
import { LoggerService } from '../../../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext } from '../../../../llm/types';
import { AgentsPersistenceService } from '../../../../agents/agents.persistence.service';
type TriggerMessage = { content: string; info?: Record<string, unknown> };

export const ManageInvocationSchema = z
  .object({
    command: z.enum(['list', 'send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    threadAlias: z.string().min(1).describe('Child thread alias'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class ManageFunctionTool extends FunctionTool<typeof ManageInvocationSchema> {
  private _node?: ManageToolNode;

  constructor(@Inject(LoggerService) private readonly logger: LoggerService, @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService) {
    super();
  }

  init(node: ManageToolNode) {
    this._node = node;
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

  async execute(args: z.infer<typeof ManageInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { command, worker, message, threadAlias } = args;
    const parentThreadId = ctx.threadId;
    const workers = this.node.listWorkers();

    if (command === 'list') {
      return JSON.stringify(workers.map((w) => w.name));
    }
    if (command === 'send_message') {
      if (!workers.length) throw new Error('No agents connected');
      if (!worker || !message) throw new Error('worker and message are required for send_message');
      const target = workers.find((w) => w.name === worker);
      if (!target) throw new Error(`Unknown worker: ${worker}`);
      const childThreadId = await this.persistence.getOrCreateSubthreadByAlias('manage', threadAlias, parentThreadId);
      try {
        const res = await target.agent.invoke(childThreadId, [HumanMessage.fromText(message)]);
        return res?.text;
      } catch (err: unknown) {
        this.logger.error('Manage: send_message failed', {
          worker: target.name,
          childThreadId,
          error: (err as { message?: string })?.message || String(err),
        });
        throw err;
      }
    }
    if (command === 'check_status') {
      if (!workers.length) return JSON.stringify({ activeTasks: 0, childThreadIds: [] });
      const prefix = `${parentThreadId}__`;
      const ids = new Set<string>();
      const promises = workers.map(async (w) => {
        try {
          // const res = await Promise.resolve(w.agent.listActiveThreads(prefix));
          // const threads = Array.isArray(res) ? res : [];
          // for (const t of threads) if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
        } catch (err: unknown) {
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
