import { BaseToolNode } from '../baseToolNode';
import { PrismaService } from '../../../core/services/prisma.service';
import { RemindMeFunctionTool, RemindMeToolStaticConfigSchema } from './remind_me.tool';
import z from 'zod';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { EventsBusService } from '../../../events/events-bus.service';

@Injectable({ scope: Scope.TRANSIENT })
export class RemindMeNode extends BaseToolNode<z.infer<typeof RemindMeToolStaticConfigSchema>> {
  private toolInstance?: RemindMeFunctionTool;
  private callerAgent?: AgentNode;

  constructor(
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {
    super();
  }

  getTool(): RemindMeFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new RemindMeFunctionTool(this.prismaService);
      // Wire registry change callback to socket gateway emission
      this.toolInstance.setOnRegistryChanged((count: number, atMs?: number, threadId?: string) => {
        const id = this._nodeId; // emit only when initialized
        if (!id) return;
        this.eventsBus.emitReminderCount({ nodeId: id, count, updatedAtMs: atMs, threadId });
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
    // Ensure tool timers are cleared; rely on tool.destroy() to emit count=0
    await this.toolInstance?.destroy();
  }
}
