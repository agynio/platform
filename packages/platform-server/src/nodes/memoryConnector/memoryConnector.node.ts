import { z } from 'zod';
import Node from '../base/Node';
import { DeveloperMessage, SystemMessage } from '@agyn/llm';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../core/services/config.service';

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
  list: (path?: string) => Promise<Array<{ name: string; hasSubdocs: boolean }>>;
};

@Injectable()
export class MemoryConnectorNode extends Node<MemoryConnectorStaticConfig> {
  private readonly useDeveloperRole: boolean;
  private getMemoryServiceFn?: (opts: { threadId?: string }) => BoundMemoryService;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    super();
    this.useDeveloperRole = configService.llmUseDeveloperRole;
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

  private toInstructionMessage(text: string | null): SystemMessage | DeveloperMessage | null {
    if (!text) return null;
    return this.useDeveloperRole ? DeveloperMessage.fromText(text) : SystemMessage.fromText(text);
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
      .map((c) => `${c.hasSubdocs ? '[+]' : '[ ]'} ${c.name}`);
    return `${path}\n${lines.join('\n')}`;
  }

  async renderMessage(opts: { threadId?: string; path?: string }): Promise<SystemMessage | DeveloperMessage | null> {
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
    return this.toInstructionMessage(`Memory\n${text}`);
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
