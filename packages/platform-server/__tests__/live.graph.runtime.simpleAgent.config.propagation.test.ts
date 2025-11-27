import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { GraphRepository } from '../src/graph/graph.repository';
import type { GraphDefinition } from '../src/shared/types/graph.types';
import { buildTemplateRegistry } from '../src/templates';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { ConfigService } from '../src/core/services/config.service.js';
import type { Config } from '../src/core/services/config.service.js';
// PrismaService removed from test harness; use minimal DI stubs
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { AgentNode } from '../src/nodes/agent/agent.node';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { RunSignalsRegistry } from '../src/agents/run-signals.service';

// Avoid any real network calls by ensuring ChatOpenAI token counting/invoke are not used in this test.
// We don't invoke the graph; we only verify propagation of config to internal nodes/fields.

describe('LiveGraphRuntime -> Agent config propagation', () => {
  function makeRuntime() {
    class StubContainerService extends ContainerService {
      constructor(registry: any) {
        super(registry as any);
      }
    }
    class StubLLMProvisioner extends LLMProvisioner {
      async getLLM() {
        return {
          call: async ({ model }: { model: string }) => ({ text: `model:${model}`, output: [] }),
        };
      }
    }

    const cfg: Config = {
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      githubToken: 'test',
      graphRepoPath: './data/graph',
      graphBranch: 'graph-state',
      graphAuthorName: undefined,
      graphAuthorEmail: undefined,
      graphLockTimeoutMs: 5000,
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
      agentsDatabaseUrl: 'postgres://localhost:5432/test',
      corsOrigins: [],
    };

    return Test.createTestingModule({
      providers: [
        { provide: ContainerService, useClass: StubContainerService },
        { provide: ConfigService, useValue: new ConfigService().init(cfg) },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
        {
          provide: AgentsPersistenceService,
          useValue: {
            beginRunThread: async () => ({ runId: 't' }),
            recordInjected: async () => ({ messageIds: [] }),
            completeRun: async () => {},
            ensureThreadModel: async (_threadId: string, model: string) => model,
          },
        },
        RunSignalsRegistry,
      ],
    })
      .compile()
      .then((module) => {
        const moduleRef = module.get(ModuleRef);
        const registry = buildTemplateRegistry({ moduleRef });
        class StubRepo extends GraphRepository {
          async initIfNeeded(): Promise<void> {}
          async get(): Promise<null> { return null; }
          async upsert(): Promise<never> { throw new Error('not-implemented'); }
          async upsertNodeState(): Promise<void> {}
        }
        const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
        const runtime = new LiveGraphRuntime(registry, new StubRepo(), moduleRef, resolver as any);
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
