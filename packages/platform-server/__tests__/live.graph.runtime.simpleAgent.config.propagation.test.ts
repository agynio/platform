import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { GraphDefinition } from '../src/graph/types';
import { buildTemplateRegistry } from '../src/templates';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import type { Config } from '../src/services/config.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

// Avoid any real network calls by ensuring ChatOpenAI token counting/invoke are not used in this test.
// We don't invoke the graph; we only verify propagation of config to internal nodes/fields.

describe('LiveGraphRuntime -> SimpleAgent config propagation', () => {
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
      ncpsPublicKey: undefined,
    };
    const configService = new ConfigService(cfg);
    const checkpointerService = new CheckpointerService(logger);
    // Typed fake checkpointer via vi.spyOn
    const fakeCheckpointer = {
      async getTuple() { return undefined; },
      async *list() { /* no-op */ },
      async put(_config: unknown, _checkpoint: unknown, _metadata: unknown) { return { configurable: { thread_id: 't' } }; },
      async putWrites() { /* no-op */ },
      getNextVersion() { return '1'; },
    };
    vi.spyOn(checkpointerService, 'getCheckpointer').mockImplementation(
      () => fakeCheckpointer as unknown as ReturnType<CheckpointerService['getCheckpointer']>,
    );
    const testMongoService: Pick<MongoService, 'getDb'> = { getDb: () => ({}) };
    const registry = buildTemplateRegistry({
      logger,
      containerService,
      configService,
      checkpointerService,
      mongoService: testMongoService as unknown as MongoService,
    });
    const runtime = new LiveGraphRuntime(logger, registry);
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
            template: 'simpleAgent',
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
    
    // Validate propagation into internal nodes/fields
    expect(agent.callModelNode?.systemPrompt).toBe(systemPrompt);
    expect(agent.llm?.model).toBe(model);
    expect(agent.summarizeNode?.keepTokens).toBe(keep);
    expect(agent.summarizeNode?.maxTokens).toBe(max);
    expect(agent.restrictOutput).toBe(restrict);
    expect(agent.restrictionMessage).toBe(restrictionMessage);

    // Update config live and re-apply
    const newSystemPrompt = 'You are Even Stricter.';
    const newModel = 'gpt-9x-test';
    const graph2: GraphDefinition = {
      nodes: [
        {
          id: 'agent',
          data: {
            template: 'simpleAgent',
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
    // Validate updates applied
    expect(agent2.callModelNode?.systemPrompt).toBe(newSystemPrompt);
    expect(agent2.llm?.model).toBe(newModel);
  });
});
