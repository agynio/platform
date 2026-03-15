import { Controller, Get, Post, Param, Body, HttpCode, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { z } from 'zod';
import { TemplateRegistry } from '../../graph-core/templateRegistry';
import type { TemplateNodeSchema } from '../../shared/types/graph.types';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import type { NodeStatusState } from '../../nodes/base/Node';
import { LocalMCPServerNode } from '../../nodes/mcp/localMcpServer.node';

@Controller('api/graph')
export class GraphController {
  constructor(
    @Inject(TemplateRegistry) private readonly templateRegistry: TemplateRegistry,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
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

  @Post('nodes/:nodeId/discover-tools')
  async discoverTools(
    @Param('nodeId') nodeId: string,
  ): Promise<{ tools: Array<{ name: string; description: string }>; updatedAt?: string }> {
    const node = this.runtime.getNodeInstance(nodeId);
    if (!node) {
      throw new HttpException({ error: 'node_not_found' }, HttpStatus.NOT_FOUND);
    }
    if (!(node instanceof LocalMCPServerNode)) {
      throw new HttpException({ error: 'node_not_mcp' }, HttpStatus.BAD_REQUEST);
    }
    try {
      await node.discoverTools();
      const snapshot = node.getToolsSnapshot();
      return {
        tools: snapshot.tools,
        updatedAt: snapshot.updatedAt ? new Date(snapshot.updatedAt).toISOString() : undefined,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException({ error: msg || 'discover_tools_failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('nodes/:nodeId/actions')
  @HttpCode(204)
  async postNodeAction(@Param('nodeId') nodeId: string, @Body() body: unknown): Promise<null | { error: string }> {
    try {
      const ActionSchema = z.object({ action: z.enum(['provision', 'deprovision']) }).strict();
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
