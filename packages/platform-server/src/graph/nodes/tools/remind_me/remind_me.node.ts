import { BaseToolNode } from '../baseToolNode';
import { LoggerService } from '../../../../core/services/logger.service';
import { RemindMeFunctionTool, RemindMeToolStaticConfigSchema } from './remind_me.tool';
import z from 'zod';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { GraphSocketGateway } from '../../../../gateway/graph.socket.gateway';

@Injectable({ scope: Scope.TRANSIENT })
export class RemindMeNode extends BaseToolNode<z.infer<typeof RemindMeToolStaticConfigSchema>> {
  private toolInstance?: RemindMeFunctionTool;
  private callerAgent?: AgentNode;

  constructor(
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(GraphSocketGateway) private readonly gateway: GraphSocketGateway,
  ) {
    super(logger);
  }

  getTool(): RemindMeFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new RemindMeFunctionTool(this.logger);
      // Wire registry change callback to socket gateway emission
      this.toolInstance.setOnRegistryChanged((count: number, atMs?: number) => {
        const id = this._nodeId; // emit only when initialized
        if (!id) return;
        // Emit count change via socket gateway
        this.gateway.emitReminderCount(id, count, atMs);
      });
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

  protected async doDeprovision(): Promise<void> {
    // Ensure tool timers are cleared and count=0 emitted
    await this.toolInstance?.destroy();
    const id = this._nodeId;
    if (id) this.gateway.emitReminderCount(id, 0);
  }
}
