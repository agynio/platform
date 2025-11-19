import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { AgentNode } from '../../agent/agent.node';
import { LoggerService } from '../../../core/services/logger.service';

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
  private readonly workers: { agent: AgentNode }[] = [];

  constructor(
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
    @Inject(LoggerService) protected logger: LoggerService,
  ) {
    super(logger);
  }

  addWorker(agent: AgentNode) {
    const name = this.getAgentTitle(agent);
    const hasDuplicate = this.workers.some((w) => this.getAgentTitle(w.agent) === name);
    if (hasDuplicate) throw new Error(`Worker with title ${name} already exists`);
    this.workers.push({ agent });
    this.ensureUniqueTitles();
  }

  removeWorker(agent: AgentNode) {
    const idx = this.workers.findIndex((w) => w.agent === agent);
    if (idx >= 0) this.workers.splice(idx, 1);
  }

  listWorkers(): string[] {
    this.ensureUniqueTitles();
    return this.workers.map((w) => this.getAgentTitle(w.agent));
  }

  getWorkerAgent(name: string): AgentNode | undefined {
    const title = name?.trim();
    if (!title) return undefined;
    this.ensureUniqueTitles();
    return this.workers.find((w) => this.getAgentTitle(w.agent) === title)?.agent;
  }

  private getAgentTitle(agent: AgentNode): string {
    const rawTitle = agent?.config?.title;
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title) {
      throw new Error('Connected agent must define a non-empty config.title');
    }
    return title;
  }

  private ensureUniqueTitles() {
    const seen = new Map<string, AgentNode>();
    for (const { agent } of this.workers) {
      const title = this.getAgentTitle(agent);
      const existing = seen.get(title);
      if (existing && existing !== agent) {
        throw new Error(`Worker with title ${title} already exists`);
      }
      seen.set(title, agent);
    }
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
