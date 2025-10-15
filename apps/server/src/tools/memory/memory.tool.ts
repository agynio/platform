import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryToolBase, normalizePathRuntime, isMemoryDebugEnabled } from './memory_tool_base';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

export const UnifiedMemoryToolStaticConfigSchema = z
  .object({
    path: z.string().describe('Absolute or relative path; normalized at runtime'),
    // Allow unknown commands to pass pre-validation so tool can return EINVAL envelope
    command: z.union([z.enum(['read', 'list', 'append', 'update', 'delete']), z.string()]).describe('Memory command to execute'),
    content: z.string().optional().describe('Content for append or update (new content)'),
    oldContent: z.string().optional().describe('Old content to replace for update'),
  })
  .strict();

// Node-level static config for the tool instance (UI). Mirrors call_agent pattern.
export const UnifiedMemoryToolNodeStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional().describe('Optional description for tool metadata.'),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name (a-z, 0-9, underscore). Default: memory'),
    title: z.string().min(1).optional().describe('UI-only title for the node.'),
  })
  .strict();

type Cmd = z.infer<typeof UnifiedMemoryToolStaticConfigSchema>['command'];

// Minimal service surface used by the tool
type MemoryToolService = {
  getDebugInfo?: () => { nodeId: string; scope: string; threadId?: string };
  read: (path: string) => Promise<string>;
  list: (path?: string) => Promise<Array<{ name: string; kind: 'file' | 'dir' }>>;
  append: (path: string, content: string) => Promise<void>;
  update: (path: string, oldContent: string, content: string) => Promise<number>;
  delete: (path: string) => Promise<{ files: number; dirs: number }>;
};

export class UnifiedMemoryTool extends MemoryToolBase {
  constructor(logger: LoggerService) {
    super(logger);
  }

  // Default metadata; can be overridden by setConfig
  private description: string = 'Unified Memory tool: read, list, append, update, delete';
  private name: string | undefined;
  // UI-only; stored for completeness
  private title: string | undefined;

  private makeEnvelope(
    command: Cmd | string,
    path: string,
    ok: boolean,
    result?: unknown,
    error?: { message: string; code?: string },
  ): string {
    const base: { command: string; path: string; ok: boolean; result?: unknown; error?: { message: string; code?: string } } = {
      command: String(command),
      path,
      ok,
    };
    if (ok) base.result = result;
    else if (error) base.error = error;
    return JSON.stringify(base);
  }

  // Narrow error to message/code if present; prefer explicit code property then message parse.
  private extractError(err: unknown): { message: string; code?: string } {
    let message = 'error';
    let code: string | undefined;
    if (err && typeof err === 'object') {
      const anyErr = err as { message?: string; code?: unknown };
      if (typeof anyErr.message === 'string') message = anyErr.message;
      if (typeof anyErr.code === 'string') code = anyErr.code;
    }
    if (!code) {
      if (/ENOENT/.test(message)) code = 'ENOENT';
      else if (/EISDIR/.test(message)) code = 'EISDIR';
    }
    return { message, code };
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = UnifiedMemoryToolNodeStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      throw new Error('Invalid Memory tool config');
    }
    const { name, description, title } = parsed.data;
    if (description) this.description = description;
    if (name) this.name = name;
    if (title) this.title = title;
  }

  init(_config?: LangGraphRunnableConfig): DynamicStructuredTool {
    const schema = UnifiedMemoryToolStaticConfigSchema;
    return tool(
      async (raw, runtimeCfg) => {
        // First, attempt to parse; if invalid, return EINVAL envelope instead of throw
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          const r: unknown = raw as unknown;
          const obj = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
          const cmd = typeof obj.command === 'string' ? (obj.command as string) : 'unknown';
          const pth = typeof obj.path === 'string' ? (obj.path as string) : '/';
          return this.makeEnvelope(String(cmd), pth || '/', false, undefined, { message: 'invalid arguments', code: 'EINVAL' });
        }
        const args = parsed.data;
        const command = args.command as Cmd;
        let path = args.path;
        // Special-case: list treats empty path as '/'
        if (command === 'list' && (!path || path === '')) path = '/';
        try {
          path = normalizePathRuntime(path);
        } catch (e) {
          const err = this.extractError(e);
          return this.makeEnvelope(command, path || '/', false, undefined, { message: err.message || 'invalid path', code: 'EINVAL' });
        }

        const threadId = runtimeCfg?.configurable?.thread_id;
        let service: MemoryToolService;
        try {
          const factory = this.requireFactory();
          service = factory({ threadId }) as unknown as MemoryToolService;
        } catch (e) {
          const err = this.extractError(e);
          return this.makeEnvelope(command, path, false, undefined, { message: err.message || 'memory not connected', code: 'ENOTMEM' });
        }

        if (isMemoryDebugEnabled()) {
          const dbg = service.getDebugInfo?.();
          this.logger.debug('memory tool invoke', { command, path, threadId, nodeId: dbg?.nodeId, scope: dbg?.scope });
        }

        try {
          switch (command) {
            case 'read': {
              const content = await service.read(path);
              return this.makeEnvelope(command, path, true, { content });
            }
            case 'list': {
              const entries = await service.list(path || '/');
              return this.makeEnvelope(command, path, true, { entries });
            }
            case 'append': {
              if (typeof args.content !== 'string') {
                return this.makeEnvelope(command, path, false, undefined, { message: 'content is required for append', code: 'EINVAL' });
              }
              await service.append(path, args.content);
              return this.makeEnvelope(command, path, true, { status: 'ok' });
            }
            case 'update': {
              if (typeof args.content !== 'string' || typeof args.oldContent !== 'string') {
                return this.makeEnvelope(command, path, false, undefined, { message: 'oldContent and content are required for update', code: 'EINVAL' });
              }
              const replaced = await service.update(path, args.oldContent, args.content);
              return this.makeEnvelope(command, path, true, { replaced });
            }
            case 'delete': {
              const res = await service.delete(path);
              return this.makeEnvelope(command, path, true, { files: res.files, dirs: res.dirs });
            }
            default:
              return this.makeEnvelope(command, path, false, undefined, { message: `unknown command: ${String(command)}`, code: 'EINVAL' });
          }
        } catch (e) {
          const err = this.extractError(e);
          return this.makeEnvelope(command, path, false, undefined, err);
        }
      },
      { name: this.name || 'memory', description: this.description, schema },
    );
  }
}
