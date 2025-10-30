import { describe, it, expect, vi } from 'vitest';
import { GraphController } from '../src/graph/controllers/graph.controller';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('POST /api/graph/nodes/:id/actions', () => {
  function makeController() {
    type TemplateRegistryStub = { toSchema: () => unknown[] };
    type RuntimeStub = { provisionNode: (id: string) => Promise<void>; deprovisionNode: (id: string) => Promise<void> };
    type LoggerStub = { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
    type NodeStateStub = { upsertNodeState: (nodeId: string, state: Record<string, unknown>) => Promise<void> };
    const templateRegistry: TemplateRegistryStub = { toSchema: vi.fn(() => []) };
    const runtime: RuntimeStub = {
      provisionNode: vi.fn(async (_id: string) => {}),
      deprovisionNode: vi.fn(async (_id: string) => {}),
    };
    const logger: LoggerStub = { info: vi.fn(), error: vi.fn() };
    const nodeState: NodeStateStub = { upsertNodeState: vi.fn(async (_id, _state) => {}) };
    // Pass typed stubs; GraphController only uses methods defined above in this test scope
    // Cast to never to satisfy constructor types without using `any` or double unknown casts
    return new GraphController(templateRegistry as never, runtime as never, logger as never, nodeState as never);
  }

  it('returns 204 (null body) for provision and deprovision', async () => {
    const ctrl = makeController();
    const res1 = await ctrl.postNodeAction('n1', { action: 'provision' });
    expect(res1).toBeNull();
    const res2 = await ctrl.postNodeAction('n1', { action: 'deprovision' });
    expect(res2).toBeNull();
  });

  it('returns 400 for invalid action payload', async () => {
    const ctrl = makeController();
    try {
      await ctrl.postNodeAction('n1', { action: 'invalid' });
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
