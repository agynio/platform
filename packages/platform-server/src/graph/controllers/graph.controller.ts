import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
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
    @Body() body: { action?: string },
  ): Promise<null | { error: string }> {
    try {
      switch (body?.action) {
        case 'pause':
          await this.runtime.pauseNode(nodeId);
          break;
        case 'resume':
          await this.runtime.resumeNode(nodeId);
          break;
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
            const { HttpException, HttpStatus } = await import('@nestjs/common');
            throw new HttpException({ error: 'not_mcp_node' }, HttpStatus.BAD_REQUEST);
          }
          const inFlight = !!inst && typeof (inst as Record<string, unknown>)['pendingStart'] !== 'undefined';
          if (inFlight) {
            const { HttpException, HttpStatus } = await import('@nestjs/common');
            throw new HttpException({ error: 'discovery_in_flight' }, HttpStatus.CONFLICT);
          }
          try {
            const fn = (inst as Record<string, unknown>)['discoverTools'] as () => Promise<unknown>;
            await fn.call(inst);
            const onFn = (inst as Record<string, unknown>)['on'];
            if (typeof onFn === 'function') (onFn as Function).call(inst, 'ready', () => {});
          } catch (e: any) {
            const { HttpException, HttpStatus } = await import('@nestjs/common');
            throw new HttpException({ error: e?.message || 'refresh_failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
          }
          break;
        }
        default: {
          const { HttpException, HttpStatus } = await import('@nestjs/common');
          throw new HttpException({ error: 'unknown_action' }, HttpStatus.BAD_REQUEST);
        }
      }
      // emitStatus omitted; return 204 with null body
      return null;
    } catch (e: any) {
      // Preserve 500 { error: 'action_failed' } on unexpected errors
      if (e && e instanceof Error && (e as any).status) throw e; // already HttpException with a status
      const { HttpException, HttpStatus } = await import('@nestjs/common');
      throw new HttpException({ error: e?.message || 'action_failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('nodes/:nodeId/dynamic-config/schema')
  async getDynamicConfigSchema(@Param('nodeId') nodeId: string): Promise<{ ready: boolean; schema?: unknown } | { error: string }> {
    try {
      const inst = (this.runtime as any).getNodeInstance?.(nodeId) || (this.runtime as any)['getNodeInstance']?.(nodeId);
      if (!inst) {
        const { HttpException, HttpStatus } = await import('@nestjs/common');
        throw new HttpException({ error: 'node_not_found' }, HttpStatus.NOT_FOUND);
      }
      const ready = typeof (inst as any).isDynamicConfigReady === 'function' ? !!(inst as any).isDynamicConfigReady() : false;
      const schema = ready && typeof (inst as any).getDynamicConfigSchema === 'function' ? (inst as any).getDynamicConfigSchema() : undefined;
      return { ready, schema } as const;
    } catch (e: any) {
      const { HttpException, HttpStatus } = await import('@nestjs/common');
      throw new HttpException({ error: e?.message || 'dynamic_config_schema_error' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
