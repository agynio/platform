import { SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { MemoryService } from '../services/memory.service';
import type { NodeLifecycle } from './types';

export interface MemoryConnectorConfig {
  placement: 'after_system' | 'last_message';
  content: 'full' | 'tree';
  maxChars?: number;
}

// Static config exposed to UI for MemoryConnectorNode
export const MemoryConnectorStaticConfigSchema = z
  .object({
    placement: z.enum(['after_system', 'last_message']).default('after_system'),
    content: z.enum(['full', 'tree']).default('tree'),
    maxChars: z.number().int().positive().max(20000).default(4000),
  })
  .strict();
export type MemoryConnectorStaticConfig = z.infer<typeof MemoryConnectorStaticConfigSchema>;

export class MemoryConnectorNode implements NodeLifecycle<Partial<MemoryConnectorConfig> & Partial<MemoryConnectorStaticConfig>> {
  constructor(private serviceFactory: (opts: { threadId?: string }) => MemoryService) {}

  private config: MemoryConnectorConfig = { placement: 'after_system', content: 'tree', maxChars: 4000 };

  // Allow late injection of a MemoryService source from a MemoryNode instance or a direct factory function.
  setServiceFactory(factoryOrNode: ((opts: { threadId?: string }) => MemoryService) | { getMemoryService: (opts: { threadId?: string }) => MemoryService }) {
    if (typeof factoryOrNode === 'function') {
      this.serviceFactory = factoryOrNode as (opts: { threadId?: string }) => MemoryService;
    } else if (factoryOrNode && typeof (factoryOrNode as any).getMemoryService === 'function') {
      this.serviceFactory = (opts: { threadId?: string }) => (factoryOrNode as any).getMemoryService(opts);
    } else {
      throw new Error('Invalid argument to setServiceFactory');
    }
  }

  // Preferred alias for UI wiring: accepts either MemoryNode-like or factory function.
  setMemorySource(source: ((opts: { threadId?: string }) => MemoryService) | { getMemoryService: (opts: { threadId?: string }) => MemoryService }) {
    this.setServiceFactory(source);
  }

  setConfig(config: Partial<MemoryConnectorConfig> & Partial<MemoryConnectorStaticConfig>) {
    this.configure(config);
  }

  configure(config: Partial<MemoryConnectorConfig> & Partial<MemoryConnectorStaticConfig>) {
    const next: Partial<MemoryConnectorConfig> = { ...this.config };
    if (config.placement !== undefined) next.placement = config.placement as any;
    if (config.content !== undefined) next.content = config.content as any;
    if (config.maxChars !== undefined) next.maxChars = config.maxChars;
    this.config = { ...this.config, ...next } as MemoryConnectorConfig;
  }

  async start(): Promise<void> { /* no-op */ }
  async stop(): Promise<void> { /* no-op */ }
  async delete(): Promise<void> { /* no-op */ }

  getPlacement(): MemoryConnectorConfig['placement'] {
    return this.config.placement;
  }

  private toSystemMessage(text: string | null) {
    return text ? new SystemMessage(text) : null;
  }

  private flattenAll(data: Record<string, string>): string {
    const lines: string[] = [];
    const keys = Object.keys(data).sort();
    for (const k of keys) {
      lines.push(`${k}: ${JSON.stringify(data[k])}`);
    }
    return lines.join('\n');
  }

  private async buildFull(service: MemoryService): Promise<string> {
    const data = await service.getAll();
    return this.flattenAll(data);
  }

  private async buildTree(service: MemoryService, path: string = '/'): Promise<string> {
    const children = await service.list(path);
    const lines = children
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.kind === 'dir' ? '[D]' : '[F]'} ${c.name}`);
    return `${path}\n${lines.join('\n')}`;
  }

  async renderMessage(opts: { threadId?: string; path?: string }): Promise<SystemMessage | null> {
    const path = opts.path || '/';
    const max = this.config.maxChars ?? 4000;

    // Primary service scoped to thread if provided
    const service = this.serviceFactory({ threadId: opts.threadId });

    let text: string = '';
    if (this.config.content === 'full') {
      text = await this.buildFull(service);
      if (!text || text.length === 0) {
        // Fallback to global scope when per-thread memory is empty
        if (opts.threadId) {
          const globalSvc = this.serviceFactory({});
          const fallback = await this.buildFull(globalSvc);
          text = fallback;
        }
      }
      if (text.length > max) {
        text = await this.buildTree(service, path);
        if (text === `${path}\n` && opts.threadId) {
          // Per-thread tree empty (no children); fallback to global tree
          const globalSvc = this.serviceFactory({});
          text = await this.buildTree(globalSvc, path);
        }
      }
    } else {
      text = await this.buildTree(service, path);
      if (text === `${path}\n` && opts.threadId) {
        // Per-thread tree empty (no children); fallback to global tree
        const globalSvc = this.serviceFactory({});
        text = await this.buildTree(globalSvc, path);
      }
    }

    if (!text || text.trim().length === 0) return null;
    return this.toSystemMessage(`Memory\n${text}`);
  }
}
