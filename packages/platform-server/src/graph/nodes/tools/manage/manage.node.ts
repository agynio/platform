import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { AgentNode } from '../../agent/agent.node';
import { LoggerService } from '../../../../core/services/logger.service';

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
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
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
