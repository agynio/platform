import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Put } from '@nestjs/common';
import { GraphRepository } from '../graph.repository';
import { PrismaService } from '../../core/services/prisma.service';
import type { PersistedGraph } from '../types';
import type { PrismaClient } from '@prisma/client';

type VarItem = { key: string; graph: string | null; local: string | null };

@Controller('api/graph/variables')
export class GraphVariablesController {
  constructor(
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  @Get()
  async list(): Promise<{ items: VarItem[] }> {
    const name = 'main';
    const graph = (await this.graphs.get(name)) || ({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] } as PersistedGraph);
    const prisma = this.prisma();
    const locals = await prisma.variableLocal.findMany();
    const itemsMap = new Map<string, VarItem>();
    for (const v of graph.variables || []) {
      itemsMap.set(v.key, { key: v.key, graph: v.value, local: null });
    }
    for (const lv of locals) {
      const existing = itemsMap.get(lv.key);
      if (existing) existing.local = lv.value;
      else itemsMap.set(lv.key, { key: lv.key, graph: null, local: lv.value });
    }
    return { items: Array.from(itemsMap.values()) };
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<{ key: string; graph: string }> {
    const parsed = parseCreateBody(body);
    const name = 'main';
    const current = (await this.graphs.get(name)) || ({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] } as PersistedGraph);
    const exists = (current.variables || []).some((v) => v.key === parsed.key);
    if (exists) {
      throw new HttpException({ error: 'DUPLICATE_KEY' }, HttpStatus.CONFLICT);
    }
    const next: PersistedGraph = {
      ...current,
      version: current.version,
      variables: [...(current.variables || []), { key: parsed.key, value: parsed.graph }],
    };
    try {
      await this.graphs.upsert({ name, version: current.version, nodes: next.nodes, edges: next.edges, variables: next.variables });
    } catch (e) {
      if ((e as any)?.code === 'VERSION_CONFLICT') {
        throw new HttpException({ error: 'VERSION_CONFLICT', current: (e as any)?.current }, HttpStatus.CONFLICT);
      }
      throw e;
    }
    // return created variable
    return { key: parsed.key, graph: parsed.graph };
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: unknown): Promise<{ key: string; graph?: string | null; local?: string | null }> {
    const parsed = parseUpdateBody(body);
    const name = 'main';
    // Graph update
    if (parsed.graph !== undefined) {
      const current = await this.graphs.get(name);
      if (!current) throw new HttpException({ error: 'GRAPH_NOT_FOUND' }, HttpStatus.NOT_FOUND);
      const idx = (current.variables || []).findIndex((v) => v.key === key);
      if (idx < 0) throw new HttpException({ error: 'KEY_NOT_FOUND' }, HttpStatus.NOT_FOUND);
      const variables = Array.from(current.variables || []);
      variables[idx] = { key, value: parsed.graph! };
      try {
        await this.graphs.upsert({ name, version: current.version, nodes: current.nodes, edges: current.edges, variables });
      } catch (e) {
        if ((e as any)?.code === 'VERSION_CONFLICT') {
          throw new HttpException({ error: 'VERSION_CONFLICT', current: (e as any)?.current }, HttpStatus.CONFLICT);
        }
        throw e;
      }
    }
    // Local override update
    if (parsed.local !== undefined) {
      const prisma = this.prisma();
      const val = parsed.local ?? '';
      if (!val) {
        // delete override if exists
        try {
          await prisma.variableLocal.delete({ where: { key } });
        } catch {
          /* ignore missing */
        }
      } else {
        await prisma.variableLocal.upsert({ where: { key }, update: { value: val }, create: { key, value: val } });
      }
    }
    const out: { key: string; graph?: string | null; local?: string | null } = { key };
    if (parsed.graph !== undefined) out.graph = parsed.graph;
    if (parsed.local !== undefined) out.local = parsed.local ?? null;
    return out;
  }

  @Delete(':key')
  @HttpCode(204)
  async remove(@Param('key') key: string): Promise<void> {
    const name = 'main';
    const current = await this.graphs.get(name);
    if (current) {
      const variables = (current.variables || []).filter((v) => v.key !== key);
      try {
        await this.graphs.upsert({ name, version: current.version, nodes: current.nodes, edges: current.edges, variables });
      } catch (e) {
        if ((e as any)?.code === 'VERSION_CONFLICT') {
          throw new HttpException({ error: 'VERSION_CONFLICT', current: (e as any)?.current }, HttpStatus.CONFLICT);
        }
        throw e;
      }
    }
    // Delete local override if present
    const prisma = this.prisma();
    try {
      await prisma.variableLocal.delete({ where: { key } });
    } catch {
      /* ignore missing */
    }
  }

  private prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
}

function parseCreateBody(body: unknown): { key: string; graph: string } {
  if (!body || typeof body !== 'object') throw new HttpException({ error: 'BAD_SCHEMA' }, HttpStatus.BAD_REQUEST);
  const obj = body as Record<string, unknown>;
  const keyRaw = obj['key'];
  const graphRaw = obj['graph'];
  if (typeof keyRaw !== 'string') throw new HttpException({ error: 'BAD_KEY' }, HttpStatus.BAD_REQUEST);
  if (typeof graphRaw !== 'string') throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  const key = keyRaw.trim();
  const graph = graphRaw.trim();
  if (!key) throw new HttpException({ error: 'BAD_KEY' }, HttpStatus.BAD_REQUEST);
  if (!graph) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  return { key, graph };
}

function parseUpdateBody(body: unknown): { graph?: string | null; local?: string | null } {
  if (!body || typeof body !== 'object') throw new HttpException({ error: 'BAD_SCHEMA' }, HttpStatus.BAD_REQUEST);
  const obj = body as Record<string, unknown>;
  const out: { graph?: string | null; local?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(obj, 'graph')) {
    const v = obj['graph'];
    if (v == null) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    if (typeof v !== 'string') throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    const trimmed = v.trim();
    if (!trimmed) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    out.graph = trimmed;
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'local')) {
    const v = obj['local'];
    if (v == null) { out.local = null; }
    else if (typeof v === 'string') { out.local = v; }
    else throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  }
  return out;
}
