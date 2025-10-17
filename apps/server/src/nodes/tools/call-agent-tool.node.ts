import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import type { Agent } from '../nodes/agent.node';
import { TriggerMessage } from '../triggers/base.trigger';
import { BaseMessage } from '@langchain/core/messages';

const invocationSchema = z.object({
  input: z.string().min(1).describe('The message to forward to the target agent.'),
  context: z
    .any()
    .optional()
    .describe('Optional structured metadata; forwarded into TriggerMessage.info'),
  childThreadId: z
    .string()
    .min(1)
    .describe(
      'Required child thread identifier used to maintain a persistent conversation with the child agent. Use the same value to continue the same conversation across multiple calls; use a new value to start a separate conversation. The effective child thread is computed as `${parentThreadId}__${childThreadId}`.',
    ),
});

export const CallAgentToolStaticConfigSchema = z.object({
  description: z.string().min(1).optional(), // TODO: make description non optional
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/)
    .optional()
    .describe('Optional tool name (a-z, 0-9, underscore). Default: call_agent'),
  response: z.enum(['sync', 'async', 'ignore']).default('sync'),
});

type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string; caller_agent?: Agent; nodeId?: string; node_id?: string } };

type SentAck = { status: 'sent' };

export class CallAgentTool extends BaseTool {
  private description = 'Call another agent with a message and optional context.';
  private name: string | undefined;
  private targetAgent: Agent | undefined;
  private responseMode: 'sync' | 'async' | 'ignore' = 'sync';

  constructor(logger: LoggerService) { super(logger); }

  setAgent(agent: Agent | undefined): void {
    this.targetAgent = agent;
  }

  async configure(cfg: Record<string, unknown>): Promise<void> {
    const parsed = CallAgentToolStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      throw new Error('Invalid CallAgentTool config');
    }
    this.description = parsed.data.description ?? this.description;
    this.name = parsed.data.name ?? this.name;
    this.responseMode = parsed.data.response ?? this.responseMode;
  }

  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return tool(
      async (raw, runtimeCfg) => {
        const parsed = invocationSchema.parse(raw);
        const hasContext = !!parsed.context;
        this.logger.info('call_agent invoked', { targetAttached: !!this.targetAgent, hasContext, responseMode: this.responseMode });

        if (!this.targetAgent) return 'Target agent is not connected';

        const parentThreadId =
          (runtimeCfg as WithRuntime | undefined)?.configurable?.thread_id ||
          (config as WithRuntime | undefined)?.configurable?.thread_id;
        if (!parentThreadId) {
          throw new Error('thread_id is required');
        }

        const targetThreadId = `${parentThreadId}__${parsed.childThreadId}`;

        const info =
          parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)
            ? (parsed.context as Record<string, unknown>)
            : {};
        const triggerMessage: TriggerMessage = {
          content: parsed.input,
          info,
        };

        try {
          if (this.responseMode === 'sync') {
            const res: BaseMessage | undefined = await this.targetAgent.invoke(targetThreadId, [triggerMessage]);
            if (!res) return '';
            return res.text ?? '';
          }

          // For async/ignore, fire and return immediately
          const promise = this.targetAgent
            .invoke(targetThreadId, [triggerMessage])
            .then(async (res) => {
              if (this.responseMode !== 'async') return; // ignore mode: no callback
              try {
                const caller = (runtimeCfg as WithRuntime | undefined)?.configurable?.caller_agent ||
                  (config as WithRuntime | undefined)?.configurable?.caller_agent;
                if (!caller) {
                  this.logger.error('call_agent async callback skipped: caller_agent missing');
                  return;
                }
                const childText = res?.text ?? '';
                const callbackMsg: TriggerMessage = {
                  content: childText,
                  info: { from: 'agent', childThreadId: parsed.childThreadId },
                };
                await caller.invoke(parentThreadId, [callbackMsg]);
              } catch (err: any) {
                // Best-effort: log only, no error propagation to tool caller
                this.logger.error('Error during async callback to parent agent', err?.message || err, err?.stack);
              }
            })
            .catch((err) => {
              // Log error from child invoke; no error callback to parent for now
              this.logger.error('Error calling agent (async/ignore mode)', err?.message || err, err?.stack);
            });

          // Ensure promise is not unhandled in environments without global handlers
          void promise;
          const ack: SentAck = { status: 'sent' };
          return ack;
        } catch (err: any) {
          this.logger.error('Error calling agent', err?.message || err, err?.stack);
          return `Error calling agent: ${err?.message || String(err)}`;
        }
      },
      {
        name: this.name || 'call_agent',
        description: this.description,
        schema: invocationSchema,
      },
    );
  }
}
