import { Controller, Get, Inject } from '@nestjs/common';
import { GraphRepository } from '../graph.repository';

@Controller('api')
export class GraphPersistController {
  constructor(@Inject(GraphRepository) private readonly graphs: GraphRepository) {}

  @Get('graph')
  async getGraph(): Promise<{ name: string; version: number; updatedAt: string; nodes: { id: string; template: string; config?: Record<string, unknown>; state?: Record<string, unknown>; position?: { x: number; y: number } }[]; edges: { id?: string; source: string; sourceHandle: string; target: string; targetHandle: string }[]; variables?: Array<{ key: string; value: string }> }> {
    const name = 'main';
    const graph = await this.graphs.get(name);
    if (!graph) {
      return { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [], variables: [] };
    }
    return graph;
  }
}
