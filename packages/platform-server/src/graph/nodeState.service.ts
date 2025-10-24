import { LoggerService } from '../core/services/logger.service';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GitGraphService } from './gitGraph.repository';
import { GraphService } from './graphMongo.repository';

/**
 * Centralized service to persist per-node runtime state and reflect changes in the in-memory runtime snapshot.
 * Minimal, non-Nest class to avoid broader DI changes for now.
 */
export class NodeStateService {
  constructor(
    private readonly graphService: GitGraphService | GraphService,
    private readonly runtime: LiveGraphRuntime,
    private readonly logger: LoggerService,
  ) {}

  async upsertNodeState(nodeId: string, state: Record<string, unknown>, name = 'main'): Promise<void> {
    try {
      // Persist via repository (supports both GitGraphService and GraphService)
      const svc: any = this.graphService as any;
      if (typeof svc.upsertNodeState === 'function') {
        await svc.upsertNodeState(name, nodeId, state);
      } else {
        // Fallback: read, patch, and upsert
        const current = await (this.graphService as any).get(name);
        const base =
          current ?? {
            name,
            version: 0,
            updatedAt: new Date().toISOString(),
            nodes: [],
            edges: [],
          };
        const nodes = Array.from(base.nodes || []);
        const idx = nodes.findIndex((n: any) => n.id === nodeId);
        if (idx >= 0) nodes[idx] = { ...nodes[idx], state };
        else nodes.push({ id: nodeId, template: 'unknown', state });
        if (this.graphService instanceof GitGraphService) {
          await (this.graphService as GitGraphService).upsert({ name, version: base.version, nodes, edges: base.edges });
        } else {
          await (this.graphService as GraphService).upsert({ name, version: base.version, nodes, edges: base.edges });
        }
      }
      // Reflect into runtime snapshot with guards
      const s = (this.runtime as any).state;
      const last = s?.lastGraph as { nodes?: Array<{ id: string; data: { state?: Record<string, unknown> } }> } | undefined;
      if (last && Array.isArray(last.nodes)) {
        const node = last.nodes.find((n) => n.id === nodeId);
        if (node) node.data.state = state;
      }
    } catch (e) {
      this.logger.error('NodeStateService: upsertNodeState failed for %s: %s', nodeId, String(e));
    }
  }
}

