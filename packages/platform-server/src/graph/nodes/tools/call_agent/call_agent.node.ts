import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../../core/services/logger.service';

import { CallAgentFunctionTool } from './call_agent.tool';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';

export const CallAgentToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name (a-z, 0-9, underscore). Default: call_agent'),
    response: z.enum(['sync', 'async', 'ignore']).default('sync'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class CallAgentNode extends BaseToolNode<z.infer<typeof CallAgentToolStaticConfigSchema>> {
  private description = 'Call another agent with a message and optional context.';
  private name: string | undefined;
  private targetAgent: AgentNode | undefined;
  private responseMode: 'sync' | 'async' | 'ignore' = 'sync';
  private toolInstance?: CallAgentFunctionTool;
  constructor(@Inject(LoggerService) private logger: LoggerService) {
    super();
  }

  setAgent(agent: AgentNode | undefined) {
    this.targetAgent = agent;
  }

  getTool(): CallAgentFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new CallAgentFunctionTool({
        getTargetAgent: () => this.targetAgent,
        getDescription: () => this.description,
        getName: () => this.name || 'call_agent',
        getResponseMode: () => this.responseMode,
        logger: this.logger,
      });
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'setAgent' } },
    } as const;
  }
}

// Backwards compatibility export
export { CallAgentNode as CallAgentTool };
