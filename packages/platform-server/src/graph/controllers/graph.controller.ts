import { Controller, Get, Post, Put, Param, Body, HttpCode, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { z } from 'zod';
import { TemplateRegistry } from '../../graph-core/templateRegistry';
import type { TemplateNodeSchema } from '../../shared/types/graph.types';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import { LoggerService } from '../../core/services/logger.service';
import type { NodeStatusState } from '../../nodes/base/Node';
import { NodeStateService } from '../nodeState.service';

@Controller('api/graph')
export class GraphController {
  constructor(
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(NodeStateService) private readonly nodeState: NodeStateService,
  ) {}

  @Get('templates')
  async getTemplates(): Promise<TemplateNodeSchema[]> {
    return this.templateRegistry.toSchema();
  }

  @Get('nodes/:nodeId/status')
  async getNodeStatus(
    @Param('nodeId') nodeId: string,
  ): Promise<{ provisionStatus?: { state: NodeStatusState; details?: unknown } }> {
    return this.runtime.getNodeStatus(nodeId);
  }

  // Node state endpoints (strict schemas)
  @Get('nodes/:nodeId/state')
  async getNodeState(@Param('nodeId') nodeId: string): Promise<{ state: Record<string, unknown> }> {
    const state = this.runtime.getNodeStateSnapshot(nodeId) || {};
    return { state };
  }

  @Put('nodes/:nodeId/state')
  async putNodeState(
    @Param('nodeId') nodeId: string,
    @Body() body: unknown,
  ): Promise<{ state: Record<string, unknown> }> {
    const BodySchema = z.object({ state: z.record(z.string(), z.unknown()) }).strict();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'bad_state_payload' }, HttpStatus.BAD_REQUEST);
    }
    const next = parsed.data.state;
    await this.nodeState.upsertNodeState(nodeId, next);
    return { state: next };
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
