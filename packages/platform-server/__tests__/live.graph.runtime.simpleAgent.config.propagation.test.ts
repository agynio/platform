import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import type { GraphDefinition } from '../src/graph/types';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ConfigService } from '../src/core/services/config.service.js';
import type { Config } from '../src/core/services/config.service.js';
// PrismaService removed from test harness; use minimal DI stubs
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentNode } from '../src/graph/nodes/agent/agent.node';
import { MongoService } from '../src/core/services/mongo.service.js';

// Avoid any real network calls by ensuring ChatOpenAI token counting/invoke are not used in this test.
// We don't invoke the graph; we only verify propagation of config to internal nodes/fields.

describe('LiveGraphRuntime -> Agent config propagation', () => {
  function makeRuntime() {
    class StubContainerService extends ContainerService {
      constructor(logger: LoggerService, registry: any) { super(logger, registry as any); }
    }
    class StubMongoService { getDb() { return {}; } }
    class StubLLMProvisioner extends LLMProvisioner { async getLLM() { return { call: async ({ model }: { model: string }) => ({ text: `model:${model}`, output: [] }) }; } }

    const cfg: Config = {
      githubAppId: 'test', githubAppPrivateKey: 'test', githubInstallationId: 'test', openaiApiKey: 'test', githubToken: 'test',
      mongodbUrl: 'mongodb://localhost:27017/?replicaSet=rs0', graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
      graphAuthorName: undefined, graphAuthorEmail: undefined, vaultEnabled: false, vaultAddr: undefined, vaultToken: undefined,
      dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: ['nixpkgs-unstable'], nixHttpTimeoutMs: 5000,
      nixCacheTtlMs: 300000, nixCacheMax: 500, mcpToolsStaleTimeoutMs: 0, ncpsEnabled: false, ncpsUrl: 'http://ncps:8501',
      ncpsUrlServer: 'http://ncps:8501', ncpsUrlContainer: 'http://ncps:8501', ncpsPubkeyPath: '/pubkey', ncpsFetchTimeoutMs: 3000,
      ncpsRefreshIntervalMs: 600000, ncpsStartupMaxRetries: 8, ncpsRetryBackoffMs: 500, ncpsRetryBackoffFactor: 2,
      ncpsAllowStartWithoutKey: true, ncpsCaBundle: undefined, ncpsRotationGraceMinutes: 0, ncpsAuthHeader: undefined, ncpsAuthToken: undefined,
    };

    return Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ContainerService, useClass: StubContainerService },
        { provide: ConfigService, useValue: new ConfigService(cfg) },
        { provide: MongoService, useClass: StubMongoService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
      ],
    })
      .compile()
      .then((module) => {
        const logger = module.get(LoggerService);
        const containerService = module.get(ContainerService);
        const configService = module.get(ConfigService);
        const mongoService = module.get(MongoService);
        const provisioner = module.get(LLMProvisioner);
        const moduleRef = module.get(ModuleRef);
        const registry = buildTemplateRegistry({ logger, containerService, configService, mongoService, provisioner, moduleRef });
        class StubRepo extends GraphRepository {
          async initIfNeeded(): Promise<void> {}
          async get(): Promise<null> { return null; }
          async upsert(): Promise<never> { throw new Error('not-implemented'); }
          async upsertNodeState(): Promise<void> {}
        }
        const runtime = new LiveGraphRuntime(logger, registry, new StubRepo(), moduleRef);
        return { runtime };
      });
  }

  it('applies provided config on configure/start and updates on re-apply', async () => {
    const { runtime } = await makeRuntime();
    const systemPrompt = 'You are Strict.';
    const model = 'gpt-9-test';
    const keep = 123;
    const max = 456;
    const restrict = true;
    const restrictionMessage = 'Always call a tool first.';

    const graph1: GraphDefinition = {
      nodes: [
        {
          id: 'agent',
          data: {
            template: 'agent',
            config: {
              systemPrompt,
              model,
              summarizationKeepTokens: keep,
              summarizationMaxTokens: max,
              restrictOutput: restrict,
              restrictionMessage,
            },
          },
        },
      ],
      edges: [],
    };

    await runtime.apply(graph1);
    const agent = runtime.getNodeInstance('agent');
    expect(agent).toBeInstanceOf(AgentNode);
    const cfg = (agent as AgentNode).config;
    expect(cfg?.systemPrompt).toBe(systemPrompt);
    expect(cfg?.model).toBe(model);
    expect(cfg?.summarizationKeepTokens).toBe(keep);
    expect(cfg?.summarizationMaxTokens).toBe(max);
    expect(cfg?.restrictOutput).toBe(restrict);
    expect(cfg?.restrictionMessage).toBe(restrictionMessage);

    // Update config live and re-apply
    const newSystemPrompt = 'You are Even Stricter.';
    const newModel = 'gpt-9x-test';
    const graph2: GraphDefinition = {
      nodes: [
        {
          id: 'agent',
          data: {
            template: 'agent',
            config: {
              systemPrompt: newSystemPrompt,
              model: newModel,
              summarizationKeepTokens: keep,
              summarizationMaxTokens: max,
              restrictOutput: restrict,
              restrictionMessage,
            },
          },
        },
      ],
      edges: [],
    };

    await runtime.apply(graph2);
    const agent2 = runtime.getNodeInstance('agent');
    expect(agent2).toBeInstanceOf(AgentNode);
    const cfg2 = (agent2 as AgentNode).config;
    expect(cfg2?.systemPrompt).toBe(newSystemPrompt);
    expect(cfg2?.model).toBe(newModel);
  });
});
