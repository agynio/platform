import { describe, it, expect } from 'vitest';
import { enforceMcpCommandMutationGuard } from '../src/graph/graph.guard';
import { GraphErrorCode } from '../src/graph/errors';
import type { PersistedGraph, PersistedGraphUpsertRequest } from '../src/graph/types';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

describe('API guard: MCP command mutation forbidden', () => {
  it('returns 409 when mutating MCP command while provisioned', async () => {
    // Previous persisted graph with MCP server command 'a'
    const before: PersistedGraph = {
      name: 'main',
      version: 0,
      updatedAt: new Date().toISOString(),
      nodes: [{ id: 'm1', template: 'mcpServer', config: { command: 'a' } }],
      edges: [],
    };
    // Next request attempting to change command to 'b'
    const next: PersistedGraphUpsertRequest = {
      name: 'main',
      version: 1,
      nodes: [{ id: 'm1', template: 'mcpServer', config: { command: 'b' } }],
      edges: [],
    };
    // Runtime stub: report node as provisioned (ready)
    const runtime: Pick<LiveGraphRuntime, 'getNodeStatus'> = {
      getNodeStatus: (_id: string) => ({ provisionStatus: { state: 'ready' } }),
    } as LiveGraphRuntime;

    try {
      enforceMcpCommandMutationGuard(before, next, runtime as LiveGraphRuntime);
      // Should not reach here
      expect(false).toBe(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      expect(code).toBe(GraphErrorCode.McpCommandMutationForbidden);
    }
  });
});
