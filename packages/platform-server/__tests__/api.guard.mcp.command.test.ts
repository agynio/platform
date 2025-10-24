import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/core/services/container.service.js';
import { ConfigService } from '../src/core/services/config.service.js';
// CheckpointerService removed in refactor; tests relying on it should drop usage.
// Avoid real Mongo connections; stub minimal service
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GitGraphRepository } from '../src/graph/gitGraph.repository';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

describe('API guard: MCP command mutation forbidden', () => {
  it('returns 409 when mutating MCP command while provisioned', async () => {
    const logger = new LoggerService();
    const config = new ConfigService({
      githubAppId: '1', githubAppPrivateKey: 'k', githubInstallationId: 'i', openaiApiKey: 'k', githubToken: 't', mongodbUrl: 'mongodb://x',
      graphStore: 'git', graphRepoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'graph-')), graphBranch: 'graph-state', nixAllowedChannels: ['x'], nixHttpTimeoutMs: 1, nixCacheTtlMs: 1, nixCacheMax: 1, dockerMirrorUrl: 'http://x',
      mcpToolsStaleTimeoutMs: 0,
    } as any);
    const checkpointer = new CheckpointerService(logger);
    const containerService = new ContainerService(logger);
    const mongoStub = { getDb: () => ({}) } as any;
    const templateRegistry = buildTemplateRegistry({ logger, containerService, configService: config, checkpointerService: checkpointer, mongoService: mongoStub });
    class StubRepo extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
    const runtime = new LiveGraphRuntime(logger, templateRegistry, new StubRepo());
    const graphService = new GitGraphRepository(config, logger, templateRegistry);
    await graphService.initIfNeeded();
    // Seed graph with mcp node
    await graphService.upsert({ name: 'main', version: 0, nodes: [{ id: 'm1', template: 'mcpServer', config: { command: 'a' } } as any], edges: [] });
    await runtime.apply({ nodes: [{ id: 'm1', data: { template: 'mcpServer', config: { command: 'a' } } }], edges: [] });
    // Mark provisioned by patching runtime node status
    const inst = (runtime as any).getNodeInstance('m1');
    if (inst && typeof (inst as any).getProvisionStatus === 'function') {
      // Force provision status to ready
      (inst as any)._provStatus = { state: 'ready' };
    }

    const fastify = Fastify();
    // minimal POST handler simulation importing guard
    fastify.post('/api/graph', async (request, reply) => {
      const parsed = request.body as any;
      const before = await graphService.get('main');
      const { enforceMcpCommandMutationGuard } = await import('../src/graph/graph.guard');
      try {
        enforceMcpCommandMutationGuard(before, parsed, runtime);
      } catch (e: any) {
        reply.code(409);
        const { GraphErrorCode } = await import('../src/graph/errors');
        return { error: e.code || GraphErrorCode.McpCommandMutationForbidden };
      }
      return { ok: true };
    });

    const res = await fastify.inject({ method: 'POST', url: '/api/graph', payload: { name: 'main', version: 1, nodes: [{ id: 'm1', template: 'mcpServer', config: { command: 'b' } }], edges: [] } });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    const { GraphErrorCode } = await import('../src/graph/errors');
    expect(body.error).toBe(GraphErrorCode.McpCommandMutationForbidden);
  });
});
