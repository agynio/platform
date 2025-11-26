import z from 'zod';
import { Logger } from '@nestjs/common';

import { CallAgentNode, CallAgentToolStaticConfigSchema } from './call_agent.node';
import { FunctionTool, HumanMessage } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { CallAgentLinkingService } from '../../../agents/call-agent-linking.service';

export const callAgentInvocationSchema = z.object({
  input: z.string().min(1).describe('Message to forward to the target agent.'),
  threadAlias: z.string().min(1).describe('Child thread alias to resolve under current parent thread.'),
  summary: z.string().min(1).describe('Initial summary for the child thread.'),
});

export class CallAgentFunctionTool extends FunctionTool<typeof callAgentInvocationSchema> {
  private readonly logger = new Logger(CallAgentFunctionTool.name);

  constructor(
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

  async execute(args: z.infer<typeof callAgentInvocationSchema>, ctx: LLMContext): Promise<string> {
    const { threadAlias } = args;
    const targetAgent = this.node.agent;
    const responseMode = this.node.config.response;

    const parentThreadId = ctx.threadId;
    const targetThreadId = await this.persistence.getOrCreateSubthreadByAlias('call_agent', threadAlias, parentThreadId, args.summary);

    try {
      await this.linking.registerParentToolExecution({
        runId: ctx.runId,
        parentThreadId,
        childThreadId: targetThreadId,
        toolName: this.name,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to register call_agent parent link runId=${ctx.runId} parentThreadId=${parentThreadId} childThreadId=${targetThreadId} err=${err instanceof Error && err.message ? err.message : String(err)}`,
      );
    }

    this.logger.log(`call_agent invoked targetAttached=${!!targetAgent} responseMode=${responseMode}`);
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
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
        this.logger.error(`Error calling agent (async/ignore mode): ${msg}`);
      });
      return JSON.stringify({ status: 'sent' });
    } catch (err: unknown) {
      const e = err as { message?: string; stack?: string } | string | undefined;
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
      this.logger.error(`Error calling agent: ${msg}`);
      return `Error calling agent: ${msg}`;
    }
  }
}

export { CallAgentToolStaticConfigSchema };
