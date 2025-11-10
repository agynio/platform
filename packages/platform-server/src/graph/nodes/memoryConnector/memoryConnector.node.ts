import { z } from 'zod';
import Node from '../base/Node';
import { SystemMessage } from '@agyn/llm';
import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../../../core/services/logger.service';

// Static config exposed to UI for MemoryConnectorNode
export const MemoryConnectorStaticConfigSchema = z
  .object({
    placement: z.enum(['after_system', 'last_message']).default('after_system'),
    content: z.enum(['full', 'tree']).default('tree'),
    maxChars: z.number().int().positive().max(20000).default(4000),
  })
  .strict();
export type MemoryConnectorStaticConfig = z.infer<typeof MemoryConnectorStaticConfigSchema>;

type BoundMemoryService = {
  getAll: () => Promise<Record<string, string>>;
  list: (path?: string) => Promise<Array<{ name: string; kind: 'file' | 'dir' }>>;
};

@Injectable()
export class MemoryConnectorNode extends Node<MemoryConnectorStaticConfig> {
  private getMemoryServiceFn?: (opts: { threadId?: string }) => BoundMemoryService;

  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super(logger);
  }

  init(params: { nodeId: string }): void {
    super.init(params);
  }

  protected _config: MemoryConnectorStaticConfig = {
    placement: 'after_system',
    content: 'tree',
    maxChars: 4000,
  } as MemoryConnectorStaticConfig;

  getPlacement(): MemoryConnectorStaticConfig['placement'] {
    return this._config.placement;
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
    const svc = this.getMemoryServiceFn?.({});
    if (!svc) return '';
    const data = await svc.getAll();
    return this.flattenAll(data);
  }

  private async buildTree(path: string = '/'): Promise<string> {
    const svc = this.getMemoryServiceFn?.({});
    if (!svc) return '';
    const children = await svc.list(path);
    const lines = children
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.kind === 'dir' ? '[D]' : '[F]'} ${c.name}`);
    return `${path}\n${lines.join('\n')}`;
  }

  async renderMessage(opts: { threadId?: string; path?: string }): Promise<SystemMessage | null> {
    const path = opts.path || '/';
    const max = this._config.maxChars ?? 4000;

    let text: string = '';
    if (this._config.content === 'full') {
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
  setMemorySource(
    source:
      | { getMemoryService: (opts: { threadId?: string }) => unknown }
      | ((opts: { threadId?: string }) => unknown),
  ) {
    if (typeof source === 'function')
      this.getMemoryServiceFn = source as (opts: { threadId?: string }) => BoundMemoryService;
    else if (source && typeof (source as { getMemoryService?: unknown }).getMemoryService === 'function')
      this.getMemoryServiceFn = (opts) => (source as { getMemoryService: (opts: { threadId?: string }) => unknown }).getMemoryService(opts) as BoundMemoryService;
    else throw new Error('Invalid memory source');
  }
}
