import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from '../agents/base.agent';
import { TriggerMessage } from '../triggers/base.trigger';

const invocationSchema = z.object({
  command: z.enum(['list', 'send_message', 'check_status']).describe('Command to execute.'),
  worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
  message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
});

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z.string().regex(/^[a-z0-9_]{1,64}$/).optional().describe('Optional tool name. Default: Manage'),
  })
  .strict();

type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string } };

type Worker = { name: string; agent: BaseAgent };

export class ManageTool extends BaseTool {
  private description = 'Manage connected agents: list, send messages, and check status within the current thread.';
  private name: string | undefined;
  private workers: Worker[] = [];
  private fallbackCounter = 0;

  constructor(logger: LoggerService) {
    super(logger);
  }

  addAgent(agent: BaseAgent | undefined): void {
    if (!agent) return;
    const nodeId = agent.getAgentNodeId();
    let name: string;
    if (nodeId && !this.workers.some((w) => w.name === nodeId)) name = nodeId;
    else name = `agent_${++this.fallbackCounter}`;
    this.workers.push({ name, agent });
    this.logger.info('Manage: agent added', { name, hasNodeId: !!nodeId });
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = ManageToolStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new Error('Invalid ManageTool config');
    this.description = parsed.data.description ?? this.description;
    this.name = parsed.data.name ?? this.name;
  }

  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return tool(
      async (raw, runtimeCfg) => {
        const parsed = invocationSchema.parse(raw);
        const parentThreadId =
          (runtimeCfg as WithRuntime | undefined)?.configurable?.thread_id ||
          (config as WithRuntime | undefined)?.configurable?.thread_id;
        if (!parentThreadId) throw new Error('thread_id is required');

        // Commands behavior
        if (parsed.command === 'list') {
          const names = this.workers.map((w) => w.name);
          return names;
        }

        if (parsed.command === 'send_message') {
          if (!this.workers.length) throw new Error('No agents connected');
          if (!parsed.worker || !parsed.message) throw new Error('worker and message are required for send_message');
          const worker = this.workers.find((w) => w.name === parsed.worker);
          if (!worker) throw new Error(`Unknown worker: ${parsed.worker}`);
          const childThreadId = `${parentThreadId}__${worker.name}`;
          const triggerMessage: TriggerMessage = { content: parsed.message, info: {} };
          try {
            const res = await worker.agent.invoke(childThreadId, [triggerMessage]);
            return res?.text ?? '';
          } catch (err: any) {
            this.logger.error('Manage: error sending message', err?.message || err, err?.stack);
            return `Error: ${err?.message || String(err)}`;
          }
        }

        if (parsed.command === 'check_status') {
          if (!this.workers.length) return { activeTasks: 0, childThreadIds: [] as string[] };
          const prefix = `${parentThreadId}__`;
          const ids = new Set<string>();
          for (const w of this.workers) {
            try {
              const threads = w.agent.listActiveThreads(prefix) || [];
              for (const t of threads) {
                if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
              }
            } catch {}
          }
          const childThreadIds = Array.from(ids.values());
          return { activeTasks: childThreadIds.length, childThreadIds };
        }

        // Should not reach
        return '';
      },
      {
        name: this.name || 'Manage',
        description: this.description,
        schema: invocationSchema,
      },
    );
  }
}

