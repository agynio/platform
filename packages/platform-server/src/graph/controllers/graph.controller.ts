import { Controller, Get, Post, Param, Body, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { TemplateRegistry } from '../templateRegistry';
import { LiveGraphRuntime } from '../liveGraph.manager';
import { LoggerService } from '../../core/services/logger.service';

@Controller('graph')
export class GraphController {
  constructor(
    private readonly templateRegistry: TemplateRegistry,
    private readonly runtime: LiveGraphRuntime,
    private readonly logger: LoggerService,
  ) {}

  @Get('templates')
  async getTemplates(): Promise<ReturnType<TemplateRegistry['toSchema']>> {
    return this.templateRegistry.toSchema();
  }

  @Get('nodes/:nodeId/status')
  async getNodeStatus(@Param('nodeId') nodeId: string): Promise<{ isPaused?: boolean; provisionStatus?: unknown; dynamicConfigReady?: boolean }> {
    return this.runtime.getNodeStatus(nodeId);
  }

  @Post('nodes/:nodeId/actions')
  @HttpCode(204)
  async postNodeAction(
    @Param('nodeId') nodeId: string,
    @Body() body: unknown,
  ): Promise<null | { error: string }> {
    try {
      const ActionSchema = z.object({ action: z.enum(['pause', 'resume', 'provision', 'deprovision', 'refresh_mcp_tools']) });
      const parsed = ActionSchema.safeParse(body);
      if (!parsed.success) throw new HttpException({ error: 'bad_action_payload' }, HttpStatus.BAD_REQUEST);
      const action = parsed.data.action;
      switch (action) {
        case 'pause': {
          // Prefer pausable interface if implemented; otherwise use fallback set
          const inst = this.runtime.getNodeInstance<{ pause?: () => Promise<void> }>(nodeId);
          if (inst && typeof inst.pause === 'function') await inst.pause();
          break;
        }
        case 'resume': {
          const inst = this.runtime.getNodeInstance<{ resume?: () => Promise<void> }>(nodeId);
          if (inst && typeof inst.resume === 'function') await inst.resume();
          break;
        }
        case 'provision':
          await this.runtime.provisionNode(nodeId);
          // readinessWatcher omitted per scope
          break;
        case 'deprovision':
          await this.runtime.deprovisionNode(nodeId);
          // readinessWatcher omitted per scope
          break;
        case 'refresh_mcp_tools': {
          const inst = this.runtime.getNodeInstance<unknown>(nodeId);
          const hasDiscover = !!inst && typeof (inst as Record<string, unknown>)['discoverTools'] === 'function';
          if (!hasDiscover) {
            throw new HttpException({ error: 'not_mcp_node' }, HttpStatus.BAD_REQUEST);
          }
          const inFlight = !!inst && typeof (inst as Record<string, unknown>)['pendingStart'] !== 'undefined';
          if (inFlight) {
            throw new HttpException({ error: 'discovery_in_flight' }, HttpStatus.CONFLICT);
          }
          try {
            const fn = (inst as Record<string, unknown>)['discoverTools'] as () => Promise<unknown>;
            await fn.call(inst);
            const onFn = (inst as Record<string, unknown>)['on'];
            if (typeof onFn === 'function') onFn.call(inst as object, 'ready', () => {});
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new HttpException({ error: msg || 'refresh_failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
          }
          break;
        }
        default: {
          throw new HttpException({ error: 'unknown_action' }, HttpStatus.BAD_REQUEST);
        }
      }
      // emitStatus omitted; return 204 with null body
      return null;
    } catch (e: unknown) {
      // Preserve 500 { error: 'action_failed' } on unexpected errors
      if (e instanceof HttpException) throw e; // already HttpException
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException({ error: msg || 'action_failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('nodes/:nodeId/dynamic-config/schema')
  async getDynamicConfigSchema(@Param('nodeId') nodeId: string): Promise<{ ready: boolean; schema?: unknown } | { error: string }> {
    try {
      const inst = (this.runtime as unknown as { getNodeInstance?: (id: string) => unknown }).getNodeInstance?.(nodeId);
      if (!inst) {
        throw new HttpException({ error: 'node_not_found' }, HttpStatus.NOT_FOUND);
      }
      const ready = typeof (inst as Record<string, unknown>)['isDynamicConfigReady'] === 'function'
        ? !!(inst as { isDynamicConfigReady: () => boolean }).isDynamicConfigReady()
        : false;
      const schema = ready && typeof (inst as Record<string, unknown>)['getDynamicConfigSchema'] === 'function'
        ? (inst as { getDynamicConfigSchema: () => unknown }).getDynamicConfigSchema()
        : undefined;
      return { ready, schema } as const;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException({ error: msg || 'dynamic_config_schema_error' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
