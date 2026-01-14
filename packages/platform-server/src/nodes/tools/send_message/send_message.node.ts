import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { SendMessageFunctionTool } from './send_message.tool';
import { ThreadTransportService } from '../../../messaging/threadTransport.service';

export const SendMessageToolStaticConfigSchema = z
  .object({
    prompt: z
      .string()
      .max(8192)
      .optional()
      .describe('Optional prompt metadata shared with the parent agent.'),
  })
  .strict();

type SendMessageConfig = z.infer<typeof SendMessageToolStaticConfigSchema>;

@Injectable({ scope: Scope.TRANSIENT })
export class SendMessageNode extends BaseToolNode<SendMessageConfig> {
  private toolInstance?: SendMessageFunctionTool;
  constructor(@Inject(ThreadTransportService) private readonly transport: ThreadTransportService) {
    super();
  }

  getTool(): SendMessageFunctionTool {
    if (!this.toolInstance) this.toolInstance = new SendMessageFunctionTool(this.transport);
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}
