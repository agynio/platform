import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from '../agents/base.agent';
import { TriggerMessage } from '../triggers/base.trigger';
import { BaseMessage } from '@langchain/core/messages';

const invocationSchema = z.object({
  input: z.string().min(1).describe('The message to forward to the target agent.'),
  context: z.any().optional().describe('Optional structured metadata; forwarded into TriggerMessage.info'),
});

const configSchema = z.object({ description: z.string().min(1).optional() });

type WithThreadId = LangGraphRunnableConfig & { configurable?: { thread_id?: string } };

export class CallAgentTool extends BaseTool {
  private description = 'Call another agent with a message and optional context.';
  private targetAgent: BaseAgent | undefined;

  constructor(private logger: LoggerService) {
    super();
  }

  setAgent(agent: BaseAgent | undefined): void {
    this.targetAgent = agent;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = configSchema.safeParse(cfg);
    if (!parsed.success) {
      throw new Error('Invalid CallAgentTool config: description is required');
    }
    this.description = parsed.data.description;
  }

  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return tool(
      async (raw, runtimeCfg) => {
        const parsed = invocationSchema.parse(raw);
        const hasContext = !!parsed.context;
        this.logger.info('call_agent invoked', { targetAttached: !!this.targetAgent, hasContext });

        if (!this.targetAgent) return 'Target agent is not connected';

        const threadId =
          (runtimeCfg as WithThreadId | undefined)?.configurable?.thread_id ??
          (config as WithThreadId | undefined)?.configurable?.thread_id;
        if (!threadId) {
          throw new Error('thread_id is required');
        }

        const info =
          parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)
            ? (parsed.context as Record<string, unknown>)
            : {};
        const triggerMessage: TriggerMessage = {
          content: parsed.input,
          info,
        };

        try {
          const res: BaseMessage | undefined = await this.targetAgent.invoke(threadId, [triggerMessage]);
          if (!res) return '';
          return res.text ?? '';
        } catch (err: any) {
          this.logger.error('Error calling agent', err?.message || err, err?.stack);
          return `Error calling agent: ${err?.message || String(err)}`;
        }
      },
      {
        name: 'call_agent',
        description: this.description,
        schema: invocationSchema,
      },
    );
  }
}
