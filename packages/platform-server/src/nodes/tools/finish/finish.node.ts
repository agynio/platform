import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { FinishFunctionTool } from './finish.tool';
import { Injectable, Scope } from '@nestjs/common';

const TOOL_INSTANCE_NAME_REGEX = /^[a-z0-9_]{1,64}$/;

export const FinishToolStaticConfigSchema = z
  .object({
    name: z
      .string()
      .regex(TOOL_INSTANCE_NAME_REGEX, { message: 'Tool name must match ^[a-z0-9_]{1,64}$' })
      .optional()
      .describe('Optional override for the tool name (lowercase letters, digits, underscore).'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class FinishNode extends BaseToolNode<z.infer<typeof FinishToolStaticConfigSchema>> {
  private toolInstance?: FinishFunctionTool;
  constructor() {
    super();
  }
  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    // Validation retained even if empty
    const parsed = FinishToolStaticConfigSchema.safeParse(_cfg);
    if (!parsed.success) throw new Error('Invalid FinishTool config');
    await super.setConfig(parsed.data);
  }
  getTool(): FinishFunctionTool {
    if (!this.toolInstance) {
      this.toolInstance = new FinishFunctionTool(this);
    }
    return this.toolInstance;
  }

  getPortConfig() {
    return { targetPorts: { $self: { kind: 'instance' } } } as const;
  }
}

// Backwards compatibility export
export { FinishNode as FinishTool };
