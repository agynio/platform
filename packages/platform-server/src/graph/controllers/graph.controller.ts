import { Controller, Get, Post, Param, Body, HttpCode, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { z } from 'zod';
import { TemplateRegistry } from '../templateRegistry';
import type { TemplateNodeSchema } from '../types';
import { LiveGraphRuntime } from '../liveGraph.manager';
import { LoggerService } from '../../core/services/logger.service';
import type { NodeStatusState } from '../../nodes/base/Node';

@Controller('api/graph')
export class GraphController {
  constructor(
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  @Get('templates')
  async getTemplates(): Promise<TemplateNodeSchema[]> {
    return this.templateRegistry.toSchema();
  }

  @Get('nodes/:nodeId/status')
  async getNodeStatus(@Param('nodeId') nodeId: string): Promise<{ provisionStatus?: NodeStatusState }> {
    return this.runtime.getNodeStatus(nodeId);
  }

  @Post('nodes/:nodeId/actions')
  @HttpCode(204)
  async postNodeAction(@Param('nodeId') nodeId: string, @Body() body: unknown): Promise<null | { error: string }> {
    try {
      const ActionSchema = z.object({ action: z.enum(['provision', 'deprovision']) });
      const parsed = ActionSchema.safeParse(body);
      if (!parsed.success) throw new HttpException({ error: 'bad_action_payload' }, HttpStatus.BAD_REQUEST);
      const action = parsed.data.action;
      switch (action) {
        case 'provision':
          await this.runtime.provisionNode(nodeId);
          // readinessWatcher omitted per scope
          break;
        case 'deprovision':
          await this.runtime.deprovisionNode(nodeId);
          // readinessWatcher omitted per scope
          break;
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
}
