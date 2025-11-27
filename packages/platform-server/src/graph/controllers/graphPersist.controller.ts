import { Controller, Get, Post, Headers, Body, HttpCode, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
// import type { FastifyReply } from 'fastify';
import { TemplateRegistry } from '../../graph-core/templateRegistry';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import { GraphRepository, type GraphAuthor } from '../graph.repository';
import { GraphError } from '../types';
import type {
  GraphDefinition,
  PersistedGraphUpsertRequest,
  PersistedGraphUpsertResponse,
} from '../../shared/types/graph.types';
import { z } from 'zod';
import { GraphErrorCode } from '../errors';
import { GraphGuard } from '../graph.guard';

// Helper to convert persisted graph to runtime GraphDefinition (mirrors src/index.ts)
const toRuntimeGraph = (saved: { nodes: Array<{ id: string; template: string; config?: Record<string, unknown>; state?: Record<string, unknown> }>; edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string }> }): GraphDefinition => {
  return {
    nodes: saved.nodes.map((n) => ({
      id: n.id,
      data: { template: n.template, config: n.config, state: n.state },
    })),
    edges: saved.edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    })),
  } as GraphDefinition;
};

@Controller('api')
export class GraphPersistController {
  private readonly logger = new Logger(GraphPersistController.name);

  constructor(
    @Inject(TemplateRegistry) private readonly templates: TemplateRegistry,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(GraphGuard) private readonly guard: GraphGuard,
  ) {}

  @Get('graph')
  async getGraph(): Promise<{ name: string; version: number; updatedAt: string; nodes: { id: string; template: string; config?: Record<string, unknown>; state?: Record<string, unknown>; position?: { x: number; y: number } }[]; edges: { id?: string; source: string; sourceHandle: string; target: string; targetHandle: string }[]; variables?: Array<{ key: string; value: string }> }> {
    const name = 'main';
    const graph = await this.graphs.get(name);
    if (!graph) {
      return { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] };
    }
    return graph;
  }

@Post('graph')
@HttpCode(200)
async upsertGraph(
  @Body() body: unknown,
  @Headers() headers: Record<string, string | string[] | undefined>,
): Promise<PersistedGraphUpsertResponse | { error: string; current?: unknown }> {
    try {
      const parsedResult = UpsertSchema.safeParse(body);
      if (!parsedResult.success) {
        throw new HttpException({ error: 'BAD_SCHEMA', current: parsedResult.error.format() }, HttpStatus.BAD_REQUEST);
      }
      const parsed = parsedResult.data as PersistedGraphUpsertRequest;
      parsed.name = parsed.name || 'main';
      // Resolve author from headers (support legacy keys)
      const author: GraphAuthor = {
        name: (headers['x-graph-author-name'] || headers['x-author-name']) as string | undefined,
        email: (headers['x-graph-author-email'] || headers['x-author-email']) as string | undefined,
      };
      // Capture previous graph (for change detection / events)
      const before = await this.graphs.get(parsed.name);

      // Guard against unsafe MCP command mutation
      try {
        this.guard.enforceMcpCommandMutationGuard(before, parsed, this.runtime);
      } catch (e: unknown) {
        if (e instanceof GraphError && e?.code === GraphErrorCode.McpCommandMutationForbidden) {
          // 409 with error code body
          const err = { error: GraphErrorCode.McpCommandMutationForbidden } as const;
          throw new HttpException(err, HttpStatus.CONFLICT);
        }
        throw e;
      }

      const saved = await this.graphs.upsert(parsed, author);
      try {
        await this.runtime.apply(toRuntimeGraph(saved));
      } catch {
        this.logger.debug('Failed to apply updated graph to runtime; rolling back persistence');
      }

      // Emit node_config events for any node whose static config changed
      if (before) this.emitNodeConfigChanges(before, saved);
      return saved;
    } catch (e: unknown) {
      // Map known repository errors to status codes and bodies
      const err = e as { code?: string; current?: unknown; message?: string };
      if (err?.code === 'VERSION_CONFLICT') {
        throw new HttpException({ error: 'VERSION_CONFLICT', current: err.current }, HttpStatus.CONFLICT);
      }
      if (err?.code === 'LOCK_TIMEOUT') {
        throw new HttpException({ error: 'LOCK_TIMEOUT' }, HttpStatus.CONFLICT);
      }
      if (err?.code === 'COMMIT_FAILED') {
        throw new HttpException({ error: 'COMMIT_FAILED' }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException({ error: msg || 'Bad Request' }, HttpStatus.BAD_REQUEST);
    }
  }

  private emitNodeConfigChanges(
    before: { nodes: Array<{ id: string; config?: Record<string, unknown> }> },
    saved: { nodes: Array<{ id: string; config?: Record<string, unknown> }>; version: number },
  ): void {
    const beforeStatic = new Map(before.nodes.map((n) => [n.id, JSON.stringify(n.config || {})]));
    for (const n of saved.nodes) {
      const prevS = beforeStatic.get(n.id);
      const currS = JSON.stringify(n.config || {});
      if (prevS !== currS) {
        // Socket.io Gateway not wired in Nest yet; log and TODO
        this.logger.log(
          `node_config changed [TODO: emit via gateway] ${JSON.stringify({ nodeId: n.id, version: saved.version })}`,
        );
      }
    }
  }
}
// Zod schema for upsert body (controller boundary schema)
const UpsertSchema = z
  .object({
    name: z.string().min(1),
    version: z.number().int().nonnegative().optional(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1),
          template: z.string().min(1),
          config: z.record(z.string(), z.unknown()).optional(),
          state: z.record(z.string(), z.unknown()).optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .max(1000),
  edges: z
      .array(
        z.object({
          id: z.string().optional(),
          source: z.string().min(1),
          sourceHandle: z.string().min(1),
          target: z.string().min(1),
          targetHandle: z.string().min(1),
        }),
      )
      .max(2000),
    variables: z
      .array(z.object({ key: z.string().min(1), value: z.string().min(1) }))
      .optional(),
  })
  .strict();
