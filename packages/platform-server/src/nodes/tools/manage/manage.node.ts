import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
  })
  .strict();

export interface ManageableAgent {
  // minimal surface used by ManageFunctionTool
  invoke: (thread: string, messages: Array<{ content: string; info?: Record<string, unknown> }> | { content: string; info?: Record<string, unknown> }) => Promise<unknown>;
  listActiveThreads: (prefix?: string) => Promise<string[]> | string[];
  getAgentNodeId?: () => string | undefined;
}

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> {
  private tool?: ManageFunctionTool;
  private readonly workers: { name: string; agent: ManageableAgent }[] = [];

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
  ) {
    super();
  }

  addWorker(name: string, agent: ManageableAgent) {
    const existing = this.workers.find((w) => w.name === name);
    if (existing) throw new Error(`Worker with name ${name} already exists`);
    this.workers.push({ name, agent });
  }

  removeWorker(name: string) {
    const idx = this.workers.findIndex((w) => w.name === name);
    if (idx >= 0) this.workers.splice(idx, 1);
  }

  listWorkers() {
    return [...this.workers];
  }

  protected createTool() {
    return this.manageTool.init(this);
  }

  getTool() {
    if (!this.tool) this.tool = this.createTool();
    return this.tool;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
    } as const;
  }
}
