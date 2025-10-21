import z from 'zod';

import { LoggerService } from '../../../services/logger.service';
import { AgentNode } from '../../agent/agent.node';
import { TriggerMessage } from '../../slackTrigger';
import { FunctionTool } from '@agyn/llm';

export const manageInvocationSchema = z
  .object({
    command: z.enum(['list', 'send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    parentThreadId: z.string().min(1).describe('Parent thread id (base thread for task coordination).'),
  })
  .strict();

interface ManageFunctionToolDeps {
  getWorkers: () => { name: string; agent: AgentNode }[];
  getDescription: () => string;
  getName: () => string;
  logger: LoggerService;
}

export class ManageFunctionTool extends FunctionTool<typeof manageInvocationSchema> {
  constructor(private deps: ManageFunctionToolDeps) {
    super();
  }
  get name() {
    return this.deps.getName();
  }
  get schema() {
    return manageInvocationSchema;
  }
  get description() {
    return this.deps.getDescription();
  }

  async execute(args: z.infer<typeof manageInvocationSchema>): Promise<string> {
    const { command, worker, message, parentThreadId } = args;
    const workers = this.deps.getWorkers();
    const logger = this.deps.logger;

    if (command === 'list') {
      return JSON.stringify(workers.map((w) => w.name));
    }
    if (command === 'send_message') {
      if (!workers.length) throw new Error('No agents connected');
      if (!worker || !message) throw new Error('worker and message are required for send_message');
      const target = workers.find((w) => w.name === worker);
      if (!target) throw new Error(`Unknown worker: ${worker}`);
      const childThreadId = `${parentThreadId}__${target.name}`;
      const triggerMessage: TriggerMessage = { content: message, info: {} };
      try {
        const res = await target.agent.invoke(childThreadId, [triggerMessage]);
        return res?.text;
      } catch (err: any) {
        logger.error('Manage: send_message failed', {
          worker: target.name,
          childThreadId,
          error: err?.message || String(err),
        });
        throw err;
      }
    }
    if (command === 'check_status') {
      if (!workers.length) return JSON.stringify({ activeTasks: 0, childThreadIds: [] });
      const prefix = `${parentThreadId}__`;
      const ids = new Set<string>();
      for (const w of workers) {
        try {
          const threads = w.agent.listActiveThreads(prefix) || [];
          for (const t of threads) if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
        } catch (err: any) {
          logger.error('Manage: listActiveThreads failed', { worker: w.name, error: err?.message || String(err) });
        }
      }
      return JSON.stringify({ activeTasks: ids.size, childThreadIds: Array.from(ids.values()) });
    }
    return '';
  }
}

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
  })
  .strict();
