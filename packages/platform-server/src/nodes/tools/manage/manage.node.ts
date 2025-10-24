import z from 'zod';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool, ManageToolStaticConfigSchema } from './manage.tool';
import { LoggerService } from '../../../core/services/logger.service';
import { AgentNode } from '../../agent/agent.node';
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode {
  private tool?: ManageFunctionTool;
  private readonly workers: { name: string; agent: AgentNode }[] = [];

  constructor(
    private readonly logger: LoggerService,
  ) {
    super();
  }

  // runtime setter for static config
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = ManageToolStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new Error('Invalid ManageTool static config');
    this.staticConfig = this.staticConfig || {};
    this.staticConfig.name = parsed.data.name || this.staticConfig.name;
    this.staticConfig.description = parsed.data.description || this.staticConfig.description;
    this.tool = undefined;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    // Accept same static config schema as tool-level schema
    const parsed = ManageToolStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new Error('Invalid ManageTool static config');
    this.staticConfig.name = parsed.data.name || this.staticConfig.name;
    this.staticConfig.description = parsed.data.description || this.staticConfig.description;
    // Recreate tool instance to reflect new name/description
    this.tool = undefined;
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
    return new ManageFunctionTool({
      getWorkers: () => this.listWorkers(),
      getName: () => this.staticConfig.name || 'Manage',
      getDescription: () =>
        this.staticConfig.description || 'Manage connected agents: list, send_message, check_status',
      logger: this.logger,
    });
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
