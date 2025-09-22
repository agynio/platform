import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from './base.tool';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from '../agents/base.agent';
import { TriggerMessage } from '../triggers/base.trigger';

const invocationSchema = z.object({
  input: z.string().min(1).describe('The message to forward to the target agent.'),
  context: z
    .any()
    .optional()
    .describe('Optional structured metadata; forwarded into TriggerMessage.info'),
});

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
    const desc = (cfg as any)?.description; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (typeof desc !== 'string' || desc.trim().length === 0) {
      throw new Error('Invalid CallAgentTool config: description is required');
    }
    this.description = desc;
  }

  init(config?: LangGraphRunnableConfig): DynamicStructuredTool {
    return tool(
      async (raw, runtimeCfg) => {
        // parse args provided by the LLM
        const parsed = invocationSchema.parse(raw);
        const hasContext = !!parsed.context;
        this.logger.info('call_agent invoked', { targetAttached: !!this.targetAgent, hasContext });

        if (!this.targetAgent) return 'Target agent is not connected';

        const threadId = (runtimeCfg?.configurable as any)?.thread_id ||
          (config?.configurable as any)?.thread_id ||
          'default';

        const info = parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)
          ? (parsed.context as Record<string, unknown>)
          : {};
        const triggerMessage: TriggerMessage = {
          content: parsed.input,
          info,
        };

        try {
          const res = await this.targetAgent.invoke(threadId, [triggerMessage]);
          if (!res) return '';
          const anyRes: any = res as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (typeof anyRes.text === 'string' && anyRes.text.length > 0) return anyRes.text;
          try {
            return JSON.stringify(anyRes);
          } catch {
            return String(anyRes);
          }
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
