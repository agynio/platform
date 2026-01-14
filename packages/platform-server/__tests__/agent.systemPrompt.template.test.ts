import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { AgentNode } from '../src/nodes/agent/agent.node';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import { FunctionTool } from '@agyn/llm';
import { BaseToolNode } from '../src/nodes/tools/baseToolNode';
import type { TemplatePortConfig } from '../src/graph/ports.types';
import { ManageToolNode } from '../src/nodes/tools/manage/manage.node';
import type { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import type { CallAgentLinkingService } from '../src/agents/call-agent-linking.service';
import type { TemplateRegistry } from '../src/graph-core/templateRegistry';

const EmptySchema = z.object({});

class StaticFunctionTool extends FunctionTool<typeof EmptySchema> {
  private readonly schemaImpl = EmptySchema;

  constructor(private readonly meta: { name: string; description: string }) {
    super();
  }

  get name(): string {
    return this.meta.name;
  }

  get schema(): typeof EmptySchema {
    return this.schemaImpl;
  }

  get description(): string {
    return this.meta.description;
  }

  async execute(): Promise<never> {
    throw new Error('not implemented');
  }
}

class StubToolNode extends BaseToolNode<Record<string, unknown>> {
  constructor(cfg: Record<string, unknown>) {
    super();
    this._config = cfg as Record<string, unknown>;
  }

  getTool(): FunctionTool {
    throw new Error('not implemented');
  }

  getPortConfig(): TemplatePortConfig {
    return { sourcePorts: {}, targetPorts: {} } as TemplatePortConfig;
  }
}

const createAgentHarness = async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService().init(
          configSchema.parse({
            llmProvider: 'openai',
            agentsDatabaseUrl: 'postgres://localhost/agents',
            litellmBaseUrl: 'http://localhost:4000',
            litellmMasterKey: 'sk-test',
          }),
        ),
      },
      {
        provide: LLMProvisioner,
        useValue: { getLLM: vi.fn() },
      },
      AgentNode,
    ],
  }).compile();

  const agent = await moduleRef.resolve(AgentNode);
  agent.init({ nodeId: 'agent-test' });

  return { moduleRef, agent };
};

describe('AgentNode system prompt templating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tool context inside the system prompt', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    await agent.setConfig({ systemPrompt: 'Available tools:\n{{#tools}}- {{name}} :: {{prompt}}\n{{/tools}}' });

    const tools = [
      new StaticFunctionTool({ name: 'alpha', description: 'alpha description' }),
      new StaticFunctionTool({ name: 'beta', description: 'beta description' }),
    ];

    const effective = (agent as unknown as { buildEffectiveConfig: (model: string, tools: FunctionTool[]) => any }).buildEffectiveConfig(
      'gpt-test',
      tools,
    );

    expect(effective.prompts.system).toContain('- alpha :: alpha description');
    expect(effective.prompts.system).toContain('- beta :: beta description');

    await moduleRef.close();
  });

  it('omits section when no tools are registered', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    await agent.setConfig({ systemPrompt: 'Tools list:{{#tools}} {{name}}{{/tools}} end.' });

    const effective = (agent as unknown as { buildEffectiveConfig: (model: string, tools: FunctionTool[]) => any }).buildEffectiveConfig(
      'gpt-test',
      [],
    );

    expect(effective.prompts.system).toBe('Tools list: end.');

    await moduleRef.close();
  });

  it('surfaces configured prompt, title, and description in tool context', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    const tool = new StaticFunctionTool({ name: 'manager', description: 'fallback description' });
    const stubNode = new StubToolNode({ title: 'Manager Tool', description: 'Config description', prompt: 'Config prompt' });

    const internals = agent as unknown as {
      toolsByName: Map<
        string,
        {
          tool: FunctionTool;
          source: { sourceType: 'node'; nodeRef: BaseToolNode<unknown>; className?: string; nodeId?: string };
        }
      >;
    };
    internals.toolsByName.clear();
    internals.toolsByName.set(tool.name, {
      tool,
      source: { sourceType: 'node', nodeRef: stubNode, className: 'StubToolNode' },
    });

    await agent.setConfig({ systemPrompt: '{{#tools}}{{title}} :: {{prompt}} :: {{description}}{{/tools}}' });

    const effective = (agent as unknown as { buildEffectiveConfig: (model: string, tools: FunctionTool[]) => any }).buildEffectiveConfig(
      'gpt-test',
      [tool],
    );

    expect(effective.prompts.system).toBe('Manager Tool :: Config prompt :: Config description');

    internals.toolsByName.clear();
    await moduleRef.close();
  });

  it('uses configured description when prompt is absent', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    const tool = new StaticFunctionTool({ name: 'alpha', description: '' });
    const stubNode = new StubToolNode({ title: 'Alpha Tool', description: 'Config description' });

    const internals = agent as unknown as {
      toolsByName: Map<
        string,
        {
          tool: FunctionTool;
          source: { sourceType: 'node'; nodeRef: BaseToolNode<unknown>; className?: string; nodeId?: string };
        }
      >;
    };
    internals.toolsByName.clear();
    internals.toolsByName.set(tool.name, {
      tool,
      source: { sourceType: 'node', nodeRef: stubNode, className: 'StubToolNode' },
    });

    await agent.setConfig({ systemPrompt: '{{#tools}}{{prompt}}{{/tools}}' });

    const effective = (agent as unknown as {
      buildEffectiveConfig: (model: string, tools: FunctionTool[]) => { prompts: { system: string } };
    }).buildEffectiveConfig('gpt-test', [tool]);

    expect(effective.prompts.system).toBe('Config description');

    internals.toolsByName.clear();
    await moduleRef.close();
  });

  it('uses template description when config prompt and description are absent', async () => {
    const { moduleRef, agent } = await createAgentHarness();
    const tool = new StaticFunctionTool({ name: 'beta', description: '' });
    const stubNode = new StubToolNode({ title: 'Beta Tool' });

    const registryMock = {
      findTemplateByCtor: vi.fn().mockReturnValue('stub-template'),
      getMeta: vi.fn().mockImplementation((template: string) =>
        template === 'stub-template'
          ? { title: 'Stub Template', kind: 'tool', description: 'Template description' }
          : undefined,
      ),
    } as unknown as TemplateRegistry;

    const agentWithRegistry = agent as unknown as { getTemplateRegistry: () => TemplateRegistry | null };
    const originalGetRegistry = agentWithRegistry.getTemplateRegistry;
    agentWithRegistry.getTemplateRegistry = vi.fn(() => registryMock);

    const internals = agent as unknown as {
      toolsByName: Map<
        string,
        {
          tool: FunctionTool;
          source: { sourceType: 'node'; nodeRef: BaseToolNode<unknown>; className?: string; nodeId?: string };
        }
      >;
    };
    internals.toolsByName.clear();
    internals.toolsByName.set(tool.name, {
      tool,
      source: { sourceType: 'node', nodeRef: stubNode, className: 'StubToolNode' },
    });

    await agent.setConfig({ systemPrompt: '{{#tools}}{{prompt}}{{/tools}}' });

    const effective = (agent as unknown as {
      buildEffectiveConfig: (model: string, tools: FunctionTool[]) => { prompts: { system: string } };
    }).buildEffectiveConfig('gpt-test', [tool]);

    expect(effective.prompts.system).toBe('Template description');

    internals.toolsByName.clear();
    agentWithRegistry.getTemplateRegistry = originalGetRegistry;
    await moduleRef.close();
  });

  it('resolves manage tool prompts using worker system prompts', async () => {
    const { moduleRef, agent: manager } = await createAgentHarness();
    const worker = await moduleRef.resolve(AgentNode);
    worker.init({ nodeId: 'worker-agent' });
    await worker.setConfig({ name: 'Worker', systemPrompt: 'Worker summary' });

    const manageNode = new ManageToolNode({} as AgentsPersistenceService, {} as CallAgentLinkingService);
    manageNode.init({ nodeId: 'manage-node' });
    await manageNode.setConfig({ prompt: 'Workers: {{#agents}}{{name}} => {{prompt}};{{/agents}}' });
    manageNode.addWorker(worker);

    const manageTool = manageNode.getTool();

    const internals = manager as unknown as {
      toolsByName: Map<
        string,
        {
          tool: FunctionTool;
          source: { sourceType: 'node'; nodeRef: BaseToolNode<unknown>; className?: string; nodeId?: string };
        }
      >;
    };
    internals.toolsByName.clear();
    internals.toolsByName.set(manageTool.name, {
      tool: manageTool,
      source: { sourceType: 'node', nodeRef: manageNode, className: 'ManageToolNode' },
    });

    await manager.setConfig({ name: 'Manager', systemPrompt: 'Context: {{#tools}}{{prompt}}{{/tools}}' });

    const effective = (manager as unknown as {
      buildEffectiveConfig: (model: string, tools: FunctionTool[]) => { prompts: { system: string } };
    }).buildEffectiveConfig('gpt-test', [manageTool]);

    expect(effective.prompts.system).toBe('Context: Workers: Worker => Worker summary;');

    internals.toolsByName.clear();
    await moduleRef.close();
  });

  it('avoids recursive loops when manage references the parent agent', async () => {
    const { moduleRef, agent: manager } = await createAgentHarness();
    await manager.setConfig({ name: 'Manager', systemPrompt: 'Manager instructions: {{#tools}}{{prompt}}{{/tools}}' });

    const worker = await moduleRef.resolve(AgentNode);
    worker.init({ nodeId: 'worker-agent' });
    await worker.setConfig({ name: 'Worker', systemPrompt: 'Worker summary' });

    const manageNode = new ManageToolNode({} as AgentsPersistenceService, {} as CallAgentLinkingService);
    manageNode.init({ nodeId: 'manage-node' });
    await manageNode.setConfig({ prompt: '{{#agents}}{{name}} => {{prompt}};{{/agents}}' });
    manageNode.addWorker(worker);
    manageNode.addWorker(manager);

    const manageTool = manageNode.getTool();

    const internals = manager as unknown as {
      toolsByName: Map<
        string,
        {
          tool: FunctionTool;
          source: { sourceType: 'node'; nodeRef: BaseToolNode<unknown>; className?: string; nodeId?: string };
        }
      >;
    };
    internals.toolsByName.clear();
    internals.toolsByName.set(manageTool.name, {
      tool: manageTool,
      source: { sourceType: 'node', nodeRef: manageNode, className: 'ManageToolNode' },
    });

    const effective = (manager as unknown as {
      buildEffectiveConfig: (model: string, tools: FunctionTool[]) => { prompts: { system: string } };
    }).buildEffectiveConfig('gpt-test', [manageTool]);

    expect(effective.prompts.system).toContain('Worker => Worker summary;');
    expect(effective.prompts.system).toContain('Manager => Manager instructions: {{#tools}}{{prompt}}{{/tools}};');

    internals.toolsByName.clear();
    await moduleRef.close();
  });
});
