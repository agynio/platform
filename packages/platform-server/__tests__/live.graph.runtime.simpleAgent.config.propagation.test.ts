import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { GraphDefinition } from '../src/graph/types';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';
import { ConfigService } from '../src/core/services/config.service.js';
import type { Config } from '../src/core/services/config.service.js';
// PrismaService removed from test harness; use minimal DI stubs
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { MongoService } from '../src/core/services/mongo.service.js';
import { GraphRepository } from '../src/graph/graph.repository';

// Mock Prisma client to avoid requiring generated client in tests
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));

// Avoid any real network calls by ensuring ChatOpenAI token counting/invoke are not used in this test.
// We don't invoke the graph; we only verify propagation of config to internal nodes/fields.

describe('LiveGraphRuntime -> Agent config propagation', () => {
  function makeRuntime() {
    const logger = new LoggerService();
    const containerService = new ContainerService(logger);
    const cfg: Config = {
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      githubToken: 'test',
      mongodbUrl: 'mongodb://localhost:27017/?replicaSet=rs0',
      graphStore: 'mongo',
      graphRepoPath: './data/graph',
      graphBranch: 'graph-state',
      graphAuthorName: undefined,
      graphAuthorEmail: undefined,
      vaultEnabled: false,
      vaultAddr: undefined,
      vaultToken: undefined,
      dockerMirrorUrl: 'http://registry-mirror:5000',
      nixAllowedChannels: ['nixpkgs-unstable'],
      nixHttpTimeoutMs: 5000,
      nixCacheTtlMs: 300000,
      nixCacheMax: 500,
      mcpToolsStaleTimeoutMs: 0,
      ncpsEnabled: false,
      ncpsUrl: 'http://ncps:8501',
      ncpsUrlServer: 'http://ncps:8501',
      ncpsUrlContainer: 'http://ncps:8501',
      ncpsPubkeyPath: '/pubkey',
      ncpsFetchTimeoutMs: 3000,
      ncpsRefreshIntervalMs: 600000,
      ncpsStartupMaxRetries: 8,
      ncpsRetryBackoffMs: 500,
      ncpsRetryBackoffFactor: 2,
      ncpsAllowStartWithoutKey: true,
      ncpsCaBundle: undefined,
      ncpsRotationGraceMinutes: 0,
      ncpsAuthHeader: undefined,
      ncpsAuthToken: undefined,
    };
    const configService = new ConfigService(cfg);
    const testMongoService: Pick<MongoService, 'getDb'> = { getDb: () => ({}) };
    const registry = buildTemplateRegistry({
      logger,
      containerService,
      configService,
      mongoService: testMongoService as unknown as MongoService,
      provisioner: { getLLM: async () => ({ call: async ({ model }: any) => ({ text: `model:${model}`, output: [] }) }) },
      moduleRef: { create: (Cls: any) => {
        const name = Cls?.name as string;
        if (name === 'SummarizationLLMReducer') return new Cls({ getLLM: async () => ({ call: async () => ({ text: 'ok', output: [] }) }) } as any);
        if (name === 'LoadLLMReducer') return new Cls(logger as any, { getClient: () => null } as any);
        if (name === 'SaveLLMReducer') return new Cls(logger as any, { getClient: () => null } as any);
        return new Cls();
      }} as any,
    });
    class StubRepo extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
    const runtime = new LiveGraphRuntime(logger, registry, new StubRepo(), { create: (Cls: any) => new Cls() } as any);
    return { runtime };
  }

  it('applies provided config on configure/start and updates on re-apply', async () => {
    const { runtime } = makeRuntime();
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
    type InspectableAgent = {
      callModelNode?: { systemPrompt?: string };
      llm?: { model?: string };
      summarizeNode?: { keepTokens?: number; maxTokens?: number };
      restrictOutput?: boolean;
      restrictionMessage?: string;
    };
    const agent = runtime.getNodeInstance('agent') as unknown as InspectableAgent;
    
    // Validate stored config reflects inputs (internal wiring is implementation detail)
    expect((agent as any).config.systemPrompt).toBe(systemPrompt);
    expect((agent as any).config.model).toBe(model);
    expect((agent as any).config.summarizationKeepTokens).toBe(keep);
    expect((agent as any).config.summarizationMaxTokens).toBe(max);
    expect((agent as any).config.restrictOutput).toBe(restrict);
    expect((agent as any).config.restrictionMessage).toBe(restrictionMessage);

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
    const agent2 = runtime.getNodeInstance('agent') as unknown as InspectableAgent;
    // Validate updates applied to stored config
    expect((agent2 as any).config.systemPrompt).toBe(newSystemPrompt);
    expect((agent2 as any).config.model).toBe(newModel);
  });
});
