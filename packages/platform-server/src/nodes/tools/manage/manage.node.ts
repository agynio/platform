import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { AgentNode } from '../../agent/agent.node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

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

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> {
  private tool?: ManageFunctionTool;
  private readonly workers: { name: string; agent: AgentNode }[] = [];

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    private readonly module: ModuleRef,
  ) {
    super();
  }

  addWorker(name: string, agent: AgentNode) {
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
    const tool = this.module.get(ManageFunctionTool, { strict: false } as any);
    if (!tool) throw new Error('ManageFunctionTool provider not found');
    return tool.init(this);
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
