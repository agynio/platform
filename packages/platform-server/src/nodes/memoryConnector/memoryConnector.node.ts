import { z } from 'zod';
import { MemoryService } from '../../nodes/memory.repository';
import Node from '../base/Node';
import { SystemMessage } from '@agyn/llm';

// Static config exposed to UI for MemoryConnectorNode
export const MemoryConnectorStaticConfigSchema = z
  .object({
    placement: z.enum(['after_system', 'last_message']).default('after_system'),
    content: z.enum(['full', 'tree']).default('tree'),
    maxChars: z.number().int().positive().max(20000).default(4000),
  })
  .strict();
export type MemoryConnectorStaticConfig = z.infer<typeof MemoryConnectorStaticConfigSchema>;

export class MemoryConnectorNode extends Node<MemoryConnectorStaticConfig> {
  constructor(private memoryService: MemoryService) {
    super();
  }

  private config: MemoryConnectorStaticConfig = { placement: 'after_system', content: 'tree', maxChars: 4000 };

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const next: Partial<MemoryConnectorStaticConfig> = {};
    const o = (cfg || {}) as Partial<MemoryConnectorStaticConfig>;
    if (o.placement !== undefined) next.placement = o.placement;
    if (o.content !== undefined) next.content = o.content as any;
    if (o.maxChars !== undefined) next.maxChars = o.maxChars as any;
    this.config = { ...this.config, ...next } as MemoryConnectorStaticConfig;
  }

  getPlacement(): MemoryConnectorStaticConfig['placement'] {
    return this.config.placement;
  }

  private toSystemMessage(text: string | null) {
    return text ? SystemMessage.fromText(text) : null;
  }

  private flattenAll(data: Record<string, string>): string {
    const lines: string[] = [];
    const keys = Object.keys(data).sort();
    for (const k of keys) {
      lines.push(`${k}: ${JSON.stringify(data[k])}`);
    }
    return lines.join('\n');
  }

  private async buildFull(): Promise<string> {
    const data = await this.memoryService.getAll();
    return this.flattenAll(data);
  }

  private async buildTree(path: string = '/'): Promise<string> {
    const children = await this.memoryService.list(path);
    const lines = children
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.kind === 'dir' ? '[D]' : '[F]'} ${c.name}`);
    return `${path}\n${lines.join('\n')}`;
  }

  async renderMessage(opts: { threadId?: string; path?: string }): Promise<SystemMessage | null> {
    const path = opts.path || '/';
    const max = this.config.maxChars ?? 4000;

    let text: string = '';
    if (this.config.content === 'full') {
      text = await this.buildFull();

      if (text.length > max) {
        text = await this.buildTree(path);
      }
    } else {
      text = await this.buildTree(path);
    }

    if (!text || text.trim().length === 0) return null;
    return this.toSystemMessage(`Memory\n${text}`);
  }

  getPortConfig() {
    return {
      targetPorts: { $memory: { kind: 'method', create: 'setMemorySource' } },
      sourcePorts: { $self: { kind: 'instance' } },
    } as const;
  }
}
