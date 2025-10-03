import { z } from 'zod';
import { BaseTrigger } from './base.trigger';
import { LoggerService } from '../services/logger.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DebugHttpService } from '../services/debugHttp.service';

export const DebugToolTriggerStaticConfigSchema = z
  .object({
    path: z.string().default('/debug/tool'),
    method: z.enum(['POST']).default('POST'),
    authToken: z.string().optional(),
  })
  .strict();

export class DebugToolTrigger extends BaseTrigger {
  private unregisterRoute: (() => void) | null = null;
  private tool: DynamicStructuredTool | null = null;
  private cfg: z.infer<typeof DebugToolTriggerStaticConfigSchema> = { path: '/debug/tool', method: 'POST' } as any;

  constructor(private logger: LoggerService) { super(); }

  setTool(tool: DynamicStructuredTool | undefined) {
    this.tool = tool || null;
  }

  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = DebugToolTriggerStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) throw new Error('Invalid DebugToolTrigger config');
    this.cfg = parsed.data;
    // If running, rebind route
    if (this.unregisterRoute) await this.rebindRoute();
  }

  protected async doProvision(): Promise<void> {
    if (this.unregisterRoute) return; // already provisioned
    await this.rebindRoute();
  }
  protected async doDeprovision(): Promise<void> {
    if (this.unregisterRoute) {
      try { this.unregisterRoute(); } catch {}
      this.unregisterRoute = null;
    }
  }

  private async rebindRoute(): Promise<void> {
    const path = this.normalizePath(this.cfg.path);
    // Remove existing binding if present
    if (this.unregisterRoute) {
      try { this.unregisterRoute(); } catch {}
      this.unregisterRoute = null;
    }
    const method = this.cfg.method;
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (this.cfg.authToken) {
          const token = (request.headers as any)['x-debug-token'];
          if (token !== this.cfg.authToken) {
            reply.code(401);
            return { error: 'unauthorized' };
          }
        }
        if (!this.tool) {
          reply.code(400);
          return { error: 'tool_not_connected' };
        }
        const body = (request as any).body as any;
        const input = body?.input;
        if (input === undefined) {
          reply.code(400);
          return { error: 'invalid_body', message: 'expected { input: <args> }' };
        }
        const result = await this.tool.invoke(input, { configurable: { thread_id: 'debug' } } as any);
        return { ok: true, result };
      } catch (err: unknown) {
        const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as any).message) : String(err);
        this.logger.error('[DebugToolTrigger] request error', msg);
        reply.code(500);
        return { error: 'internal_error', message: msg };
      }
    };
    const service = DebugHttpService(this.logger);
    this.unregisterRoute = await service.register({ method, path, handler });
    this.logger.info(`[DebugToolTrigger] bound ${method} ${path}`);
  }

  private normalizePath(p: string): string {
    if (!p.startsWith('/')) return '/' + p;
    return p;
  }
}
