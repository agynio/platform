import { Inject, Injectable } from '@nestjs/common';
import type { GraphRepository } from '../graph/graph.repository';
import type { VariableGraphItem, VariableViewItem, VariablesState } from './variables.types';
import { PrismaService } from '../core/services/prisma.service';

@Injectable()
export class VariablesService {
  constructor(
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  // init(): reserved for future non-DI params

  async getVariables(name: string): Promise<VariableViewItem[]> {
    const g = await this.graphs.get(name);
    const items: VariableGraphItem[] = g?.variables?.items ?? [];
    // merge local values from DB for source=local
    const prisma = this.prismaService.getClient();
    const out: VariableViewItem[] = [];
    if (!prisma) {
      // persistence disabled -> return graph/vault items; local without value
      for (const it of items) out.push({ key: it.key, source: it.source, value: it.value, vaultRef: it.vaultRef });
      return out;
    }
    const locals = await prisma.variable.findMany({ where: { graphName: name } });
    const localMap = new Map(locals.map((v) => [v.key, v.value] as const));
    for (const it of items) {
      if (it.source === 'local') {
        const val = localMap.get(it.key);
        out.push({ key: it.key, source: 'local', value: val ?? '' });
      } else {
        out.push({ key: it.key, source: it.source, value: it.value ?? '', vaultRef: it.vaultRef ?? '' });
      }
    }
    return out;
  }

  // Stubs for upsert and transitions; to be fully implemented in follow-ups
  async createVariable(_name: string, _item: VariableGraphItem, _expectedVersion?: number): Promise<void> {
    // TODO: implement optimistic locking and transitions
  }

  async updateVariable(_name: string, _key: string, _next: VariableGraphItem, _expectedVersion?: number): Promise<void> {
    // TODO: implement transitions and optimistic locking
  }

  async deleteVariable(_name: string, _key: string, _expectedVersion?: number): Promise<void> {
    // TODO: implement deletion and transitions
  }
}

