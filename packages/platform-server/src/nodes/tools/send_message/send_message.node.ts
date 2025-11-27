import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { PrismaService } from '../../../core/services/prisma.service';
import { LiveGraphRuntime } from '../../../graph-core/liveGraph.manager';
import { LoggerService } from '../../../core/services/logger.service';

const TOOL_INSTANCE_NAME_REGEX = /^[a-z0-9_]{1,64}$/;

export const SendMessageToolStaticConfigSchema = z
  .object({
    name: z
      .string()
      .regex(TOOL_INSTANCE_NAME_REGEX, { message: 'Tool name must match ^[a-z0-9_]{1,64}$' })
      .optional()
      .describe('Optional override for the tool name (lowercase letters, digits, underscore).'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<z.infer<typeof SendMessageToolStaticConfigSchema>> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(PrismaService) protected prisma: PrismaService,
    @Inject(LiveGraphRuntime) protected runtime: LiveGraphRuntime,
  ) {
    super();
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance)
      this.toolInstance = new SendMessageFunctionTool(this.loggerService, this.prisma, this.runtime, this);
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
