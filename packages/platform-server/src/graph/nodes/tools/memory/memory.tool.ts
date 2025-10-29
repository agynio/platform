import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../core/services/logger.service';
import { MemoryService } from '../../../nodes/memory.repository';

export const UnifiedMemoryToolStaticConfigSchema = z
  .object({
    path: z.string().describe('Absolute or relative path; normalized at runtime'),
    // Allow unknown commands to pass pre-validation so tool can return EINVAL envelope
    command: z
      .union([z.enum(['read', 'list', 'append', 'update', 'delete']), z.string()])
      .describe('Memory command to execute'),
    content: z.string().optional().describe('Content for append or update (new content)'),
    oldContent: z.string().optional().describe('Old content to replace for update'),
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

interface UnifiedMemoryFunctionToolDeps {
  getDescription: () => string;
  getName: () => string;
  getMemoryFactory: () => ((opts: { threadId?: string }) => MemoryService) | undefined;
  logger: LoggerService;
}

export class UnifiedMemoryFunctionTool extends FunctionTool<typeof UnifiedMemoryToolStaticConfigSchema> {
  constructor(private deps: UnifiedMemoryFunctionToolDeps) {
    super();
  }
  get name() {
    return this.deps.getName();
  }
  get description() {
    return this.deps.getDescription();
  }
  get schema() {
    return UnifiedMemoryToolStaticConfigSchema;
  }

  private makeEnvelope(
    command: Cmd | string,
    path: string,
    ok: boolean,
    result?: unknown,
    error?: { message: string; code?: string },
  ): string {
    const base: {
      command: string;
      path: string;
      ok: boolean;
      result?: unknown;
      error?: { message: string; code?: string };
    } = {
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

  async execute(raw: z.infer<typeof UnifiedMemoryToolStaticConfigSchema>): Promise<string> {
    // First, attempt to parse; if invalid, return EINVAL envelope instead of throw
    const parsed = UnifiedMemoryToolStaticConfigSchema.safeParse(raw);
    if (!parsed.success) {
      const r: unknown = raw as unknown;
      const obj = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
      const cmd = typeof obj.command === 'string' ? (obj.command as string) : 'unknown';
      const pth = typeof obj.path === 'string' ? (obj.path as string) : '/';
      return this.makeEnvelope(String(cmd), pth || '/', false, undefined, {
        message: 'invalid arguments',
        code: 'EINVAL',
      });
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
      return this.makeEnvelope(command, path || '/', false, undefined, {
        message: err.message || 'invalid path',
        code: 'EINVAL',
      });
    }
    // threadId now derived from args if provided; memory operations generally thread-scoped by node injection
    const threadId = undefined; // leaving undefined; factory may still scope
    const serviceOrEnvelope: MemoryToolService | string = (() => {
      try {
        const factory = this.deps.getMemoryFactory();
        if (!factory) throw new Error('Memory not connected');
        const created: MemoryService = factory({ threadId }) as MemoryService;
        // Strictly assert expected interface
        const svc: MemoryToolService = {
          getDebugInfo: created.getDebugInfo?.bind(created),
          read: created.read.bind(created),
          list: created.list.bind(created),
          append: created.append.bind(created),
          update: created.update.bind(created),
          delete: created.delete.bind(created),
        };
        return svc;
      } catch (e) {
        const err = this.extractError(e);
        return this.makeEnvelope(command, path, false, undefined, {
          message: err.message || 'memory not connected',
          code: 'ENOTMEM',
        });
      }
    })();
    if (typeof serviceOrEnvelope === 'string') return serviceOrEnvelope;
    const service = serviceOrEnvelope as MemoryToolService;
    const logger = this.deps.logger;
    if (isMemoryDebugEnabled()) {
      const dbg = service.getDebugInfo?.();
      logger.debug('memory tool invoke', { command, path, threadId, nodeId: dbg?.nodeId, scope: dbg?.scope });
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
            return this.makeEnvelope(command, path, false, undefined, {
              message: 'content is required for append',
              code: 'EINVAL',
            });
          }
          await service.append(path, args.content);
          return this.makeEnvelope(command, path, true, { status: 'ok' });
        }
        case 'update': {
          if (typeof args.content !== 'string' || typeof args.oldContent !== 'string') {
            return this.makeEnvelope(command, path, false, undefined, {
              message: 'oldContent and content are required for update',
              code: 'EINVAL',
            });
          }
          const replaced = await service.update(path, args.oldContent, args.content);
          return this.makeEnvelope(command, path, true, { replaced });
        }
        case 'delete': {
          const res = await service.delete(path);
          return this.makeEnvelope(command, path, true, { files: res.files, dirs: res.dirs });
        }
        default:
          return this.makeEnvelope(command, path, false, undefined, {
            message: `unknown command: ${String(command)}`,
            code: 'EINVAL',
          });
      }
    } catch (e) {
      const err = this.extractError(e);
      return this.makeEnvelope(command, path, false, undefined, err);
    }
  }
}

// Path normalization runtime helper
function normalizePathRuntime(input: string): string {
  if (!input) throw new Error('path is required');
  let p = input.replace(/\\+/g, '/');
  p = p.replace(/\/+?/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
  if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
  if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
  return p;
}

function isMemoryDebugEnabled(): boolean {
  const v = String(process.env.DEBUG_MEMORY || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
