import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';

export type VarItem = { key: string; graph: string | null; local: string | null };

// Service encapsulates business logic for graph variables operations
@Injectable()
export class GraphVariablesService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async list(_name = 'main'): Promise<{ items: VarItem[] }> {
    const prisma = this.prismaService.getClient();
    const [graphVars, locals] = await Promise.all([
      prisma.graphVariable.findMany(),
      prisma.variableLocal.findMany(),
    ]);
    const itemsMap = new Map<string, VarItem>();
    for (const v of graphVars) {
      itemsMap.set(v.key, { key: v.key, graph: v.value, local: null });
    }
    for (const lv of locals) {
      const existing = itemsMap.get(lv.key);
      if (existing) existing.local = lv.value;
      else itemsMap.set(lv.key, { key: lv.key, graph: null, local: lv.value });
    }
    return { items: Array.from(itemsMap.values()) };
  }

  async create(_name: string, key: string, graphValue: string): Promise<{ key: string; graph: string }> {
    const prisma = this.prismaService.getClient();
    const existing = await prisma.graphVariable.findUnique({ where: { key } });
    if (existing) throw Object.assign(new Error('Duplicate key'), { code: 'DUPLICATE_KEY' });
    await prisma.graphVariable.create({ data: { key, value: graphValue } });
    return { key, graph: graphValue };
  }

  async update(_name: string, key: string, req: { graph?: string; local?: string | null }): Promise<{ key: string; graph?: string | null; local?: string | null }> {
    const prisma = this.prismaService.getClient();
    if (req.graph !== undefined) {
      const current = await prisma.graphVariable.findUnique({ where: { key } });
      if (!current) throw Object.assign(new Error('Key not found'), { code: 'KEY_NOT_FOUND' });
      await prisma.graphVariable.update({ where: { key }, data: { value: req.graph } });
    }
    // Local override update
    if (req.local !== undefined) {
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

  async remove(_name: string, key: string): Promise<void> {
    const prisma = this.prismaService.getClient();
    await prisma.graphVariable.deleteMany({ where: { key } });
    await prisma.variableLocal.deleteMany({ where: { key } });
  }

  async resolveValue(_graphName: string, key: string): Promise<string | undefined> {
    const prisma = this.prismaService.getClient();
    const local = await prisma.variableLocal.findUnique({ where: { key } });
    const localValue = local?.value ?? null;
    if (typeof localValue === 'string' && localValue.length > 0) return localValue;

    const graphValue = await prisma.graphVariable.findUnique({ where: { key } });
    const value = graphValue?.value ?? null;
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }
}
