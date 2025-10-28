import z from 'zod';

import { LoggerService } from '../../../core/services/logger.service';
import { AgentNode } from '../../agent/agent.node';

import { CallAgentToolStaticConfigSchema } from './call_agent.node';
import { FunctionTool } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
type TriggerMessage = { content: string; info?: Record<string, unknown> };

export const callAgentInvocationSchema = z.object({
  input: z.string().min(1).describe('Message to forward to the target agent.'),
  childThreadId: z
    .string()
    .min(1)
    .describe('Child thread suffix. Effective child thread = `${parentThreadId}__${childThreadId}`.'),
});

interface CallAgentFunctionToolDeps {
  getTargetAgent: () => AgentNode | undefined;
  getDescription: () => string;
  getName: () => string;
  getResponseMode: () => 'sync' | 'async' | 'ignore';
  logger: LoggerService;
}

export class CallAgentFunctionTool extends FunctionTool<typeof callAgentInvocationSchema> {
  constructor(private deps: CallAgentFunctionToolDeps) {
    super();
  }
  get name() {
    return this.deps.getName();
  }
  get schema() {
    return callAgentInvocationSchema;
  }
  get description() {
    return this.deps.getDescription();
  }

  async execute(args: z.infer<typeof callAgentInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { input, childThreadId } = args;
    const targetAgent = this.deps.getTargetAgent();
    const responseMode = this.deps.getResponseMode();
    const logger = this.deps.logger;

    const parentThreadId = ctx.threadId;

    logger.info('call_agent invoked', { targetAttached: !!targetAgent, responseMode });
    if (!targetAgent) return 'Target agent is not connected';

    const targetThreadId = `${parentThreadId}__${childThreadId}`;

    const triggerMessage: TriggerMessage = { content: input, info: {} };
    try {
      if (responseMode === 'sync') {
        const res = await targetAgent.invoke(targetThreadId, [triggerMessage]);
        return res.text;
      }
      // async / ignore: fire and forget
      void targetAgent.invoke(targetThreadId, [triggerMessage]).catch((err: unknown) => {
        const e = err as { message?: string; stack?: string } | string | undefined;
        logger.error('Error calling agent (async/ignore mode)', e);
      });
      return JSON.stringify({ status: 'sent' });
    } catch (err: unknown) {
      const e = err as { message?: string; stack?: string } | string | undefined;
      logger.error('Error calling agent', e);
      return `Error calling agent: ${e}`;
    }
  }
}

export { CallAgentToolStaticConfigSchema };
