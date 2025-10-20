import type { Tool, ToolRegistry, ToolContext } from '../types.js';
import type { BaseTool } from '../../tools/base.tool.js';
import type { Logger } from '../../types/logger.js';
import { randomUUID } from 'node:crypto';
import { createSingleFileTar } from '../../utils/archive.js';

// Adapter that wraps existing BaseTool instances and exposes them as LLLoop Tool(s)
// Namespacing is preserved by passing fully qualified names captured from upstream.
export class BaseToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  constructor(private readonly logger: Logger) {}

  // Register a BaseTool with a given public name (namespaced if desired)
  register(name: string, base: BaseTool): void {
    const tool: Tool = {
      name,
      call: async (args: unknown, ctx: ToolContext) => {
        // Delegate to BaseTool.init().invoke() path; BaseTool decides how to run with its own config
        // We implement large-output saving here when output is a string exceeding MAX.
        try {
          // Use the logger provided to BaseTool at construction time; we only use ours for errors
          const output = await base.init({ configurable: { thread_id: ctx.threadId, abort_signal: ctx.signal } } as any).invoke(args as any);
          // If tool returns a TerminateResponse or non-string object, just forward JSON
          if (typeof output === 'string') {
            const MAX = 50_000;
            if (output.length > MAX) {
              const pointer = await this.saveOversize(base, ctx.threadId, output);
              return { outputText: pointer };
            }
            return { outputText: output };
          }
          return { outputJson: output };
        } catch (e) {
          // Honor abort signal
          if (e instanceof Error && e.name === 'AbortError') throw e;
          this.logger.error(`BaseToolRegistry tool '${name}' failed`, e as Error);
          let errStr = 'Unknown error';
          if (e instanceof Error) errStr = `${e.name}: ${e.message}`;
          else {
            try { errStr = JSON.stringify(e); } catch { errStr = String(e); }
          }
          return { outputText: `Error executing tool '${name}': ${errStr}` };
        }
      },
    };
    this.tools.set(name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Attempt to save oversized output to /tmp in the same container where BaseTool is bound
  private async saveOversize(base: BaseTool, threadId: string | undefined, content: string): Promise<string> {
    if (!threadId || typeof base.getContainerForThread !== 'function') {
      return `Output too long (${content.length} chars). Saved to /tmp/<file>`;
    }
    try {
      const container = await base.getContainerForThread(threadId);
      if (!container || typeof (container as any).putArchive !== 'function') return `Output too long (${content.length} chars). Saved to /tmp/<file>`;
      const uuid = randomUUID();
      const filename = `${uuid}.txt`;
      const tarBuf = await createSingleFileTar(filename, content);
      await (container as any).putArchive(tarBuf, { path: '/tmp' });
      return `Output too long (${content.length} chars). Saved to /tmp/${filename}`;
    } catch (e) {
      this.logger.error('BaseToolRegistry: failed saving oversized output', e as Error);
      return `Error (output too long: ${content.length} characters).`;
    }
  }
}

