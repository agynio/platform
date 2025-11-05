import z from 'zod';

import { LoggerService } from '../../../../core/services/logger.service';
import { AgentNode } from '../../agent/agent.node';

import { CallAgentNode, CallAgentToolStaticConfigSchema } from './call_agent.node';
import { FunctionTool, HumanMessage } from '@agyn/llm';
import { LLMContext } from '../../../../llm/types';
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
  constructor(
    private logger: LoggerService,
    private node: CallAgentNode,
  ) {
    super();
  }
  get name() {
    return this.node.config.name ?? 'call_agent';
  }
  get schema() {
    return callAgentInvocationSchema;
  }
  get description() {
    return this.node.config.description ?? 'Call agent';
  }

  async execute(args: z.infer<typeof callAgentInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { input, childThreadId } = args;
    const targetAgent = this.node.agent;
    const responseMode = this.node.config.response;

    const parentThreadId = ctx.threadId;

    this.logger.info('call_agent invoked', { targetAttached: !!targetAgent, responseMode });
    if (!targetAgent) return 'Target agent is not connected';

    const targetThreadId = `${parentThreadId}__${childThreadId}`;

    const message = HumanMessage.fromText(args.input);
    try {
      if (responseMode === 'sync') {
        const res = await targetAgent.invoke(targetThreadId, [message], parentThreadId);
        return res.text;
      }
      // async / ignore: fire and forget
      void targetAgent.invoke(targetThreadId, [message], parentThreadId).catch((err: unknown) => {
        const e = err as { message?: string; stack?: string } | string | undefined;
        this.logger.error('Error calling agent (async/ignore mode)', e);
      });
      return JSON.stringify({ status: 'sent' });
    } catch (err: unknown) {
      const e = err as { message?: string; stack?: string } | string | undefined;
      this.logger.error('Error calling agent', e);
      return `Error calling agent: ${e}`;
    }
  }
}

export { CallAgentToolStaticConfigSchema };
