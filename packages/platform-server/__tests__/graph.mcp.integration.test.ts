import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { buildTemplateRegistry } from '../src/templates';
import { LocalMCPServerNode } from '../src/graph/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';
import { ConfigService } from '../src/core/services/config.service.js';
import { LiveGraphRuntime, GraphDefinition } from '../src/graph';
import { EnvService } from '../src/env/env.service';
import { VaultService } from '../src/vault/vault.service';
import { NodeStateService } from '../src/graph/nodeState.service';
import { MongoService } from '../src/core/services/mongo.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { NcpsKeyService } from '../src/infra/ncps/ncpsKey.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { ModuleRef } from '@nestjs/core';
import { AgentRunService } from '../src/graph/nodes/agentRun.repository';

class StubContainerService extends ContainerService {
  override async start(): Promise<any> {
    return { id: 'cid', exec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })) } as any;
  }
}
class StubConfigService extends ConfigService {
  constructor() {
    super({
      githubAppId: 'test',
      githubAppPrivateKey: 'test',
      githubInstallationId: 'test',
      openaiApiKey: 'test',
      githubToken: 'test',
      slackBotToken: 'xoxb-test',
      slackAppToken: 'xapp-test',
      mongodbUrl: 'mongodb://localhost:27017/?replicaSet=rs0',
    } as any);
  }
}
class StubVaultService extends VaultService { override async getSecret(): Promise<string | undefined> { return undefined; } }
class StubMongoService extends MongoService { override getDb(): any { return {}; } }
class StubLLMProvisioner extends LLMProvisioner { async getLLM(): Promise<any> { return { call: async () => ({ text: 'ok', output: [] }) }; } }

describe('Graph MCP integration', () => {
  it('constructs graph with mcpServer template without error (deferred start)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LoggerService,
        { provide: ContainerService, useClass: StubContainerService },
        { provide: ConfigService, useClass: StubConfigService },
        EnvService,
        { provide: VaultService, useClass: StubVaultService },
        { provide: MongoService, useClass: StubMongoService },
        { provide: LLMProvisioner, useClass: StubLLMProvisioner },
        { provide: NcpsKeyService, useValue: { getKeysForInjection: () => [] } },
        { provide: ContainerRegistry, useValue: { updateLastUsed: async () => {}, registerStart: async () => {}, markStopped: async () => {} } },
        { provide: NodeStateService, useValue: { upsertNodeState: async () => {}, getSnapshot: () => undefined } },
        { provide: AgentRunService, useValue: { startRun: async () => {}, markTerminated: async () => {}, list: async () => [] } },
      ],
    }).compile();

    const logger = module.get(LoggerService);
    const containerService = module.get(ContainerService);
    const configService = module.get(ConfigService);
    const mongoService = module.get(MongoService);
    const provisioner = module.get(LLMProvisioner);
    const moduleRef = module.get(ModuleRef);

    const templateRegistry = buildTemplateRegistry({ logger, containerService, configService, mongoService, provisioner, moduleRef });

    const graph: GraphDefinition = {
      nodes: [
        { id: 'container', data: { template: 'workspace' } },
        { id: 'agent', data: { template: 'agent' } },
        { id: 'mcp', data: { template: 'mcpServer', config: { namespace: 'x', command: 'echo "mock" && sleep 1' } } },
      ],
      edges: [
        { source: 'container', sourceHandle: '$self', target: 'mcp', targetHandle: 'workspace' },
        { source: 'agent', sourceHandle: 'mcp', target: 'mcp', targetHandle: '$self' },
      ],
    };

    const runtime = new LiveGraphRuntime(
      logger,
      templateRegistry as any,
      { initIfNeeded: async () => {}, get: async () => null, upsert: async () => { throw new Error('not-implemented'); }, upsertNodeState: async () => {} } as any,
      moduleRef,
    );
    const result = await runtime.apply(graph);
    expect(result.addedNodes).toContain('mcp');
  }, 60000);
});
