import type { RunnableConfig } from '@langchain/core/runnables';
import { SystemMessage } from '@langchain/core/messages';
import { LoggerService } from '../services/logger.service';
import { MemoryService } from '../services/memory.service';

export type MemoryPlacement = 'after_system' | 'last_message';
export type MemoryContent = 'full' | 'tree';

const DEFAULT_SIZE_CAP = 20_000;

export class MemoryConnectorNode {
  private config: { placement: MemoryPlacement; content: MemoryContent; maxChars?: number } = {
    placement: 'after_system',
    content: 'full',
  };
  private memoryService?: MemoryService;

  constructor(private logger: LoggerService) {}

  setConfig(cfg: { placement: MemoryPlacement; content: MemoryContent; maxChars?: number }): void {
    this.config = { ...this.config, ...cfg };
  }

  setMemoryService(ms: unknown): void {
    this.memoryService = ms as MemoryService;
  }

  clearMemoryService(): void {
    this.memoryService = undefined;
  }

  getConfig(): { placement: MemoryPlacement; content: MemoryContent; maxChars?: number } {
    return this.config;
  }

  private async buildTree(prefix = '/'): Promise<string> {
    if (!this.memoryService) return '';
    const items = await this.memoryService.list(prefix);
    const lines: string[] = [];
    for (const it of items) {
      lines.push(`${it.type === 'dir' ? '[dir] ' : '[file] '}${it.name}`);
    }
    return `<memory-tree>\n${lines.join('\n')}\n</memory-tree>`;
  }

  private async buildFull(): Promise<string> {
    if (!this.memoryService) return '';
    // Walk recursively from root and produce key paths with values
    const walk = async (path: string, acc: Record<string, any>) => {
      const stat = await this.memoryService!.stat(path);
      if (!stat.exists) return;
      if (stat.kind === 'dir') {
        const items = await this.memoryService!.list(path);
        for (const it of items) {
          const childPath = path === '/' ? `/${it.name}` : `${path}/${it.name}`;
          await walk(childPath, acc);
        }
      } else {
        const value = await this.memoryService!.read(path);
        const normalized = path === '/' ? '' : this.memoryService!._normalizePath(path);
        acc[normalized] = value;
      }
    };
    const acc: Record<string, any> = {};
    await walk('/', acc);
    return `<memory>${JSON.stringify(acc)}</memory>`;
  }

  async renderMessage(_config: RunnableConfig): Promise<SystemMessage | null> {
    if (!this.memoryService) return null;

    const mode = this.config.content;
    let content = '';
    if (mode === 'tree') {
      content = await this.buildTree('/');
    } else {
      content = await this.buildFull();
      const cap = this.config.maxChars ?? DEFAULT_SIZE_CAP;
      if (content.length > cap) {
        const tree = await this.buildTree('/');
        content = `Memory content truncated; showing tree only\n${tree}`;
      }
    }

    return new SystemMessage(content);
  }
}
