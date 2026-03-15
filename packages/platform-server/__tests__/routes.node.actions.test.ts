import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { GraphController } from '../src/graph/controllers/graph.controller';
import { HttpException, HttpStatus } from '@nestjs/common';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LocalMCPServerTool } from '../src/nodes/mcp/localMcpServer.tool';

type TemplateRegistryStub = { toSchema: () => unknown[] };
type GraphRepositoryStub = {
  initIfNeeded: () => Promise<void>;
  get: () => Promise<unknown>;
  upsert: () => Promise<unknown>;
};
type RuntimeStub = {
  provisionNode: (id: string) => Promise<void>;
  deprovisionNode: (id: string) => Promise<void>;
  getNodeInstance: (id: string) => unknown;
};

function makeController(runtimeOverrides: Partial<RuntimeStub> = {}) {
  const templateRegistry: TemplateRegistryStub = { toSchema: vi.fn(() => []) };
  const runtime: RuntimeStub = {
    provisionNode: vi.fn(async (_id: string) => {}),
    deprovisionNode: vi.fn(async (_id: string) => {}),
    getNodeInstance: vi.fn(),
    ...runtimeOverrides,
  };
  const graphRepository: GraphRepositoryStub = {
    initIfNeeded: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    upsert: vi.fn(async () => ({ name: 'main', version: 1, updatedAt: new Date().toISOString(), nodes: [], edges: [] })),
  };
  return {
    controller: new GraphController(templateRegistry as never, runtime as never, graphRepository as never),
    runtime,
  };
}

describe('POST /api/graph/nodes/:id/actions', () => {
  it('returns 204 (null body) for provision and deprovision', async () => {
    const { controller } = makeController();
    const res1 = await controller.postNodeAction('n1', { action: 'provision' });
    expect(res1).toBeNull();
    const res2 = await controller.postNodeAction('n1', { action: 'deprovision' });
    expect(res2).toBeNull();
  });

  it('returns 400 for invalid action payload', async () => {
    const { controller } = makeController();
    try {
      await controller.postNodeAction('n1', { action: 'invalid' });
      // Should not reach
      expect(false).toBe(true);
    } catch (e) {
      if (e instanceof HttpException) {
        expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      } else {
        // Unexpected error type
        expect(false).toBe(true);
      }
    }
  });
});

describe('POST /api/graph/nodes/:id/discover-tools', () => {
  it('returns tool snapshot for MCP nodes', async () => {
    const envStub = { resolveEnvItems: vi.fn(), resolveProviderEnv: vi.fn() } as any;
    const node = new LocalMCPServerNode(envStub, {} as any);
    node.init({ nodeId: 'node-1' });
    await node.setConfig({ namespace: 'ns' } as any);
    (node as any).toolsCache = [new LocalMCPServerTool('alpha', 'A', z.object({}).strict(), node)];
    (node as any).lastToolsUpdatedAt = 1700000000000;
    const discoverSpy = vi.spyOn(node, 'discoverTools').mockResolvedValue((node as any).toolsCache);

    const { controller } = makeController({ getNodeInstance: vi.fn(() => node) });
    const res = await controller.discoverTools('node-1');
    expect(discoverSpy).toHaveBeenCalled();
    expect(res.tools).toEqual([{ name: 'ns_alpha', description: 'A' }]);
    expect(res.updatedAt).toBe(new Date(1700000000000).toISOString());
  });

  it('returns 404 when node is missing', async () => {
    const { controller } = makeController({ getNodeInstance: vi.fn(() => undefined) });
    try {
      await controller.discoverTools('missing');
      expect(false).toBe(true);
    } catch (e) {
      if (e instanceof HttpException) {
        expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      } else {
        expect(false).toBe(true);
      }
    }
  });

  it('returns 400 when node is not MCP', async () => {
    const { controller } = makeController({ getNodeInstance: vi.fn(() => ({}) as any) });
    try {
      await controller.discoverTools('n1');
      expect(false).toBe(true);
    } catch (e) {
      if (e instanceof HttpException) {
        expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      } else {
        expect(false).toBe(true);
      }
    }
  });
});
