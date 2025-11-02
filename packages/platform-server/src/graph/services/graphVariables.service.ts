import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { GraphRepository } from '../graph.repository';
import type { PersistedGraph } from '../types';

export type VarItem = { key: string; graph: string | null; local: string | null };

// Service encapsulates business logic for graph variables operations
@Injectable()
export class GraphVariablesService {
  constructor(
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    // Inject PrismaService directly (standard Nest DI)
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async list(name = 'main'): Promise<{ items: VarItem[] }> {
    const graph = (await this.graphs.get(name)) || ({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] } as PersistedGraph);
    const prisma = this.prismaService.getClient();
    const locals = await prisma.variableLocal.findMany();
    const itemsMap = new Map<string, VarItem>();
    for (const v of graph.variables || []) itemsMap.set(v.key, { key: v.key, graph: v.value, local: null });
    for (const lv of locals) {
      const existing = itemsMap.get(lv.key);
      if (existing) existing.local = lv.value;
      else itemsMap.set(lv.key, { key: lv.key, graph: null, local: lv.value });
    }
    return { items: Array.from(itemsMap.values()) };
  }

  async create(name: string, key: string, graphValue: string): Promise<{ key: string; graph: string }> {
    const current = (await this.graphs.get(name)) || ({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] } as PersistedGraph);
    const exists = (current.variables || []).some((v) => v.key === key);
    if (exists) {
      const err: any = new Error('Duplicate key');
      err.code = 'DUPLICATE_KEY';
      throw err;
    }
    const next: PersistedGraph = { ...current, version: current.version, variables: [...(current.variables || []), { key, value: graphValue }] };
    try {
      await this.graphs.upsert({ name, version: current.version, nodes: next.nodes, edges: next.edges, variables: next.variables });
    } catch (e: any) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'VERSION_CONFLICT') throw e;
      throw e;
    }
    return { key, graph: graphValue };
  }

  async update(name: string, key: string, req: { graph?: string | null; local?: string | null }): Promise<{ key: string; graph?: string | null; local?: string | null }> {
    // Graph update
    if (req.graph !== undefined) {
      const current = await this.graphs.get(name);
      if (!current) {
        const err: any = new Error('Graph not found');
        err.code = 'GRAPH_NOT_FOUND';
        throw err;
      }
      const idx = (current.variables || []).findIndex((v) => v.key === key);
      if (idx < 0) {
        const err: any = new Error('Key not found');
        err.code = 'KEY_NOT_FOUND';
        throw err;
      }
      const variables = Array.from(current.variables || []);
      variables[idx] = { key, value: req.graph! };
      try {
        await this.graphs.upsert({ name, version: current.version, nodes: current.nodes, edges: current.edges, variables });
      } catch (e: any) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'VERSION_CONFLICT') throw e;
        throw e;
      }
    }
    // Local override update
    if (req.local !== undefined) {
      const prisma = this.prismaService.getClient();
      const val = (req.local ?? '').trim();
      if (!val) await prisma.variableLocal.deleteMany({ where: { key } });
      else await prisma.variableLocal.upsert({ where: { key }, update: { value: val }, create: { key, value: val } });
    }
    const out: { key: string; graph?: string | null; local?: string | null } = { key };
    if (req.graph !== undefined) out.graph = req.graph;
    if (req.local !== undefined) {
      const normalizedLocal = (req.local ?? '').trim();
      out.local = normalizedLocal ? normalizedLocal : null;
    }
    return out;
  }

  async remove(name: string, key: string): Promise<void> {
    const current = await this.graphs.get(name);
    if (current) {
      const variables = (current.variables || []).filter((v) => v.key !== key);
      try {
        await this.graphs.upsert({ name, version: current.version, nodes: current.nodes, edges: current.edges, variables });
      } catch (e: any) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'VERSION_CONFLICT') throw e;
        throw e;
      }
    }
    const prisma = this.prismaService.getClient();
    await prisma.variableLocal.deleteMany({ where: { key } });
  }
}
