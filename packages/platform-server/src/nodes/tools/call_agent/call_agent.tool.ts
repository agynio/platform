import z from 'zod';

import { LoggerService } from '../../../core/services/logger.service';

import { CallAgentNode, CallAgentToolStaticConfigSchema } from './call_agent.node';
import { FunctionTool, HumanMessage } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { CallAgentLinkingService, type CallAgentLinkMetadata } from '../../../agents/call-agent-linking.service';

export const callAgentInvocationSchema = z.object({
  input: z.string().min(1).describe('Message to forward to the target agent.'),
  threadAlias: z.string().min(1).describe('Child thread alias to resolve under current parent thread.'),
  summary: z.string().min(1).describe('Initial summary for the child thread.'),
});

type CallAgentPreparedContext = {
  targetThreadId: string;
};

// Interface removed (unused)

export class CallAgentFunctionTool extends FunctionTool<typeof callAgentInvocationSchema> {
  constructor(
    private logger: LoggerService,
    private node: CallAgentNode,
    private persistence: AgentsPersistenceService,
    private linking: CallAgentLinkingService,
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

  async prepareToolExecution(params: { input: z.infer<typeof callAgentInvocationSchema>; ctx: LLMContext }): Promise<{ metadata: CallAgentLinkMetadata; sourceSpanId: string; prepared: CallAgentPreparedContext }> {
    const { input, ctx } = params;
    const parentThreadId = ctx.threadId;
    const targetThreadId = await this.persistence.getOrCreateSubthreadByAlias('call_agent', input.threadAlias, parentThreadId, input.summary);
    const toolName = this.name;
    const metadata = this.linking.buildInitialMetadata({ toolName, parentThreadId, childThreadId: targetThreadId });
    return {
      metadata,
      sourceSpanId: targetThreadId,
      prepared: { targetThreadId },
    };
  }

  async execute(args: z.infer<typeof callAgentInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { threadAlias } = args;
    const targetAgent = this.node.agent;
    const responseMode = this.node.config.response;

    const parentThreadId = ctx.threadId;
    const prepared = ctx.toolExecution?.prepared as CallAgentPreparedContext | undefined;
    let targetThreadId = prepared?.targetThreadId;
    if (!targetThreadId) {
      targetThreadId = await this.persistence.getOrCreateSubthreadByAlias('call_agent', threadAlias, parentThreadId, args.summary);
    }

    this.logger.info('call_agent invoked', { targetAttached: !!targetAgent, responseMode });
    if (!targetAgent) return 'Target agent is not connected';

    // Resolve subthread UUID by alias under parent UUID

    const message = HumanMessage.fromText(args.input);
    try {
      if (responseMode === 'sync') {
        const res = await targetAgent.invoke(targetThreadId, [message]);
        return res.text;
      }
      // async / ignore: fire and forget
      void targetAgent.invoke(targetThreadId, [message]).catch((err: unknown) => {
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
