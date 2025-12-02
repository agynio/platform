import { Inject, Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { AgentNode } from '../../agent/agent.node';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { ManageFunctionTool } from './manage.tool';

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
    mode: z.enum(['sync', 'async']).default('sync').describe('Routing mode for worker responses.'),
    syncTimeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(300000)
      .default(15000)
      .describe('Maximum time to wait for worker responses in sync mode (ms).'),
    syncMaxMessages: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(1)
      .describe('Maximum assistant messages to collect before returning in sync mode.'),
    asyncPrefix: z
      .string()
      .max(256)
      .default('From {{agentTitle}}: ')
      .describe('Prefix applied to worker responses forwarded in async mode. Supports {{agentTitle}} placeholder.'),
    showCorrelationInOutput: z
      .boolean()
      .default(false)
      .describe('Include child correlation metadata in tool output or forwarded messages.'),
  })
  .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> {
  private tool?: ManageFunctionTool;
  private toolPromise?: Promise<ManageFunctionTool>;
  private readonly workers: Set<AgentNode> = new Set();

  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {
    super();
    void this.ensureTool();
  }

  async setConfig(cfg: z.input<typeof ManageToolStaticConfigSchema>): Promise<void> {
    const parsed = ManageToolStaticConfigSchema.parse(cfg ?? {});
    await this.ensureTool();
    await super.setConfig(parsed);
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

  private async ensureTool(): Promise<ManageFunctionTool> {
    if (!this.toolPromise) {
      this.toolPromise = this.moduleRef
        .resolve(ManageFunctionTool, undefined, { strict: false })
        .then((tool) => tool.init(this, { persistence: this.persistence }));
    }
    this.tool = await this.toolPromise;
    return this.tool;
  }

  getTool() {
    if (!this.tool) {
      throw new Error('ManageToolNode: tool not initialized');
    }
    return this.tool;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
    } as const;
  }
}
