import { SystemMessage } from '@langchain/core/messages';
import { MemoryService } from '../services/memory.service';

export interface MemoryConnectorConfig {
  placement: 'after_system' | 'last_message';
  content: 'full' | 'tree';
  maxChars?: number;
}

export class MemoryConnectorNode {
  constructor(private serviceFactory: (opts: { threadId?: string }) => MemoryService, private config: MemoryConnectorConfig) {}

  setConfig(config: Partial<MemoryConnectorConfig>) {
    this.config = { ...this.config, ...config };
  }

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
