import { z } from 'zod';
import { LoggerService } from '../services/logger.service';
import type { ContainerEntity } from '../entities/container.entity';
import type { Tool } from '../llloop/types';

export type ToolInvokeCtx = { thread_id?: string; abort_signal?: AbortSignal; caller_agent?: unknown };

export abstract class BaseTool {
  constructor(protected readonly logger: LoggerService) {}
  // LLLoop-native shape: implement invoke + metadata
  abstract name(): string;
  abstract description(): string;
  abstract inputSchema(): z.ZodTypeAny;
  abstract invoke(input: unknown, ctx?: ToolInvokeCtx): Promise<unknown>;
  async destroy(): Promise<void> { /* no-op */ }
  // Optional: for container-backed tools
  getContainerForThread?(threadId: string): Promise<ContainerEntity | undefined>;

  // Helper to expose as LLLoop Tool
  toLLLoopTool(): Tool {
    return {
      name: this.name(),
      description: this.description(),
      schema: this.inputSchema(),
      invoke: async (args, ctx) => this.invoke(args, { thread_id: ctx.threadId, abort_signal: ctx.signal }),
    };
  }
}
