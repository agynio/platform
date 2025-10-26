import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../core/services/logger.service';
import { RemindMeFunctionTool, RemindMeToolStaticConfigSchema } from './remind_me.tool';
import z from 'zod';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class RemindMeNode extends BaseToolNode<z.infer<typeof RemindMeToolStaticConfigSchema>> {
  private toolInstance?: RemindMeFunctionTool;
  private callerAgent?: AgentNode;

  constructor(@Inject(LoggerService) private logger: LoggerService) {
    super();
  }

  getTool(): RemindMeFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new RemindMeFunctionTool(this.logger);
    }
    return this.toolInstance;
  }

  setCallerAgent(agent: AgentNode) {
    this.callerAgent = agent;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { caller: { kind: 'method', create: 'setCallerAgent' } },
    } as const;
  }
}
