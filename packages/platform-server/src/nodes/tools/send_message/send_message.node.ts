import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { PrismaService } from '../../../core/services/prisma.service';
import { LiveGraphRuntime } from '../../../graph-core/liveGraph.manager';

export const SendMessageToolStaticConfigSchema = z.object({}).strict();

type SendMessageConfig = Record<string, never>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(PrismaService) protected prisma: PrismaService,
    @Inject(LiveGraphRuntime) protected runtime: LiveGraphRuntime,
  ) {
    super();
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) this.toolInstance = new SendMessageFunctionTool(this.prisma, this.runtime);
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
