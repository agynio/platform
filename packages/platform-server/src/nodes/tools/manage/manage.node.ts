import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import { AgentNode } from '../../agent/agent.node';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';

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
  private readonly workers: Set<AgentNode> = new Set();

  constructor(
    @Inject(ManageFunctionTool) private readonly manageTool: ManageFunctionTool,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {
    super();
  }

  addWorker(agent: AgentNode): void {
    if (!agent) throw new Error('ManageToolNode: agent instance is required');
    if (this.workers.has(agent)) return;
    const title = this.resolveAgentTitle(agent);
    const existing = this.getWorkerByTitle(title);
    if (existing && existing !== agent) {
      throw new Error(`ManageToolNode: worker with title "${title}" already exists`);
    }
    this.workers.add(agent);
  }

  removeWorker(agent: AgentNode): void {
    if (!agent) return;
    this.workers.delete(agent);
  }

  listWorkers(): string[] {
    return Array.from(this.workers).map((worker) => this.resolveAgentTitle(worker));
  }

  getWorkers(): AgentNode[] {
    return Array.from(this.workers);
  }

  getWorkerByTitle(title: string): AgentNode | undefined {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return undefined;
    for (const agent of this.workers) {
      if (this.resolveAgentTitle(agent) === trimmedTitle) return agent;
    }
    return undefined;
  }

  private resolveAgentTitle(agent: AgentNode): string {
    let config: AgentNode['config'];
    try {
      config = agent.config;
    } catch (_err) {
      throw new Error('ManageToolNode: worker agent missing configuration');
    }

    const normalize = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

    const title = normalize(config.title);
    if (title) return title;

    const name = normalize(config.name);
    const role = normalize(config.role);

    if (name && role) return `${name} (${role})`;
    if (name) return name;
    if (role) return role;

    throw new Error('ManageToolNode: worker agent requires non-empty title');
  }

  protected createTool() {
    return this.manageTool.init(this, { persistence: this.persistence });
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
