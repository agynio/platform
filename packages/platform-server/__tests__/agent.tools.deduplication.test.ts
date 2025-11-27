import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { z } from 'zod';

import { AgentNode, type AgentStaticConfig } from '../src/nodes/agent/agent.node';
import { ConfigService } from '../src/core/services/config.service';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { ModuleRef } from '@nestjs/core';
import { FunctionTool } from '@agyn/llm';
import { BaseToolNode } from '../src/nodes/tools/baseToolNode';
import type { LocalMCPServerNode } from '../src/nodes/mcp';
import { FinishNode } from '../src/nodes/tools/finish/finish.node';

class StubProvisioner extends LLMProvisioner {
  async getLLM(): Promise<unknown> {
    throw new Error('getLLM not implemented in tests');
  }
}

class TestFunctionTool extends FunctionTool<z.ZodObject<z.ZodRawShape>> {
  constructor(private readonly toolName: string, private readonly descriptionText?: string) {
    super();
  }

  get name(): string {
    return this.toolName;
  }

  get description(): string {
    return this.descriptionText ?? `${this.toolName} tool`;
  }

  get schema(): z.ZodObject<z.ZodRawShape> {
    return z.object({});
  }

  async execute(): Promise<string> {
    return 'ok';
  }
}

type LoggerStub = {
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

class TestToolNode extends BaseToolNode<unknown> {
  private readonly tool: FunctionTool;

  constructor(logger: LoggerStub, tool: FunctionTool, nodeId: string) {
    super();
    (this as unknown as { logger: LoggerStub }).logger = logger;
    this.tool = tool;
    this.init({ nodeId });
  }

  getTool(): FunctionTool {
    return this.tool;
  }
}

class StubMcpServer extends EventEmitter {
  constructor(
    public namespace: string,
    public nodeId: string,
    private tools: FunctionTool[] = [],
  ) {
    super();
  }

  listTools(): FunctionTool[] {
    return [...this.tools];
  }

  setTools(tools: FunctionTool[]): void {
    this.tools = tools;
    this.emit('mcp.tools_updated');
  }
}

const makeLoggerStub = (): LoggerStub => ({ error: vi.fn(), warn: vi.fn(), log: vi.fn(), debug: vi.fn() });

const createAgent = async () => {
  const logger = makeLoggerStub();
  const configService = {} as ConfigService;
  const provisioner = new StubProvisioner();
  const moduleRef = {
    get: vi.fn(),
    create: vi.fn(async () => undefined),
  } as unknown as ModuleRef;

  const agent = new AgentNode(configService, provisioner, moduleRef);
  (agent as unknown as { logger: LoggerStub }).logger = logger;
  agent.init({ nodeId: 'agent-node' });
  await agent.setConfig({ title: 'Test Agent' } as AgentStaticConfig);

  return { agent, logger };
};

const makeTool = (name: string, description?: string) => new TestFunctionTool(name, description);
const asMcp = (server: StubMcpServer): LocalMCPServerNode => server as unknown as LocalMCPServerNode;
const getRegisteredTool = (agent: AgentNode, name: string): FunctionTool | undefined => {
  const map = (agent as unknown as { toolsByName: Map<string, { tool: FunctionTool }> }).toolsByName;
  return map.get(name)?.tool;
};

const getRegisteredNames = (agent: AgentNode): string[] => {
  const map = (agent as unknown as { toolsByName: Map<string, unknown> }).toolsByName;
  return Array.from(map.keys());
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentNode tool deduplication', () => {
  it('registers unique node tools without collisions', async () => {
    const { agent, logger } = await createAgent();

    agent.addTool(new TestToolNode(logger, makeTool('finish'), 'tool-finish'));
    agent.addTool(new TestToolNode(logger, makeTool('manage'), 'tool-manage'));
    agent.addTool(new TestToolNode(logger, makeTool('memory'), 'tool-memory'));

    expect(getRegisteredNames(agent).sort()).toEqual(['finish', 'manage', 'memory']);
  });

  it('skips duplicate node tool registrations and logs an error', async () => {
    const { agent, logger } = await createAgent();

    const primary = new TestToolNode(logger, makeTool('finish'), 'tool-primary');
    const duplicate = new TestToolNode(logger, makeTool('finish'), 'tool-duplicate');

    agent.addTool(primary);

    const errorSpy = vi.spyOn(logger, 'error');

    agent.addTool(duplicate);

    expect(getRegisteredNames(agent)).toEqual(['finish']);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [message, context] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('[Agent:Test Agent] Duplicate tool name detected: finish. Skipping registration.');
    expect(context).toMatchObject({
      agentNodeId: 'agent-node',
      agentTitle: 'Test Agent',
      toolName: 'finish',
      skipped: {
        sourceType: 'node',
        nodeId: 'tool-duplicate',
        className: 'TestToolNode',
      },
      kept: {
        sourceType: 'node',
        nodeId: 'tool-primary',
        className: 'TestToolNode',
      },
    });
  });

  it('preserves the first tool across interleaved duplicate sources', async () => {
    const { agent, logger } = await createAgent();

    const errorSpy = vi.spyOn(logger, 'error');

    const primary = new TestToolNode(logger, makeTool('alpha'), 'node-primary');
    agent.addTool(primary);
    expect(getRegisteredTool(agent, 'alpha')).toBe(primary.getTool());

    const mcpPrimary = makeTool('alpha');
    const mcpServer = new StubMcpServer('ns', 'mcp-1', [mcpPrimary]);
    await agent.addMcpServer(asMcp(mcpServer));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(getRegisteredTool(agent, 'alpha')).toBe(primary.getTool());

    const duplicateNode = new TestToolNode(logger, makeTool('alpha'), 'node-duplicate');
    agent.addTool(duplicateNode);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(getRegisteredTool(agent, 'alpha')).toBe(primary.getTool());

    agent.removeTool(primary);
    expect(getRegisteredNames(agent)).toEqual([]);
  });

  it('registers overridden tool names and exposes them in definitions', async () => {
    const { agent } = await createAgent();

    const first = new FinishNode();
    first.init({ nodeId: 'finish-1' });
    await first.setConfig({ name: 'finish_alpha' } as Record<string, unknown>);
    agent.addTool(first);

    const second = new FinishNode();
    second.init({ nodeId: 'finish-2' });
    await second.setConfig({ name: 'finish_beta' } as Record<string, unknown>);
    agent.addTool(second);

    const names = agent.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['finish_alpha', 'finish_beta']);

    const definitionNames = agent.tools.map((tool) => tool.definition().name).sort();
    expect(definitionNames).toEqual(['finish_alpha', 'finish_beta']);
  });

  it('deduplicates overridden tool names and logs errors with context', async () => {
    const { agent, logger } = await createAgent();

    const primary = new FinishNode();
    primary.init({ nodeId: 'finish-primary' });
    await primary.setConfig({ name: 'finish_custom' } as Record<string, unknown>);
    agent.addTool(primary);

    const errorSpy = vi.spyOn(logger, 'error');

    const duplicate = new FinishNode();
    duplicate.init({ nodeId: 'finish-duplicate' });
    await duplicate.setConfig({ name: 'finish_custom' } as Record<string, unknown>);
    agent.addTool(duplicate);

    expect(agent.tools.map((tool) => tool.name)).toEqual(['finish_custom']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, context] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('[Agent:Test Agent] Duplicate tool name detected: finish_custom. Skipping registration.');
    expect(context).toMatchObject({
      skipped: {
        sourceType: 'node',
        nodeId: 'finish-duplicate',
      },
      kept: {
        sourceType: 'node',
        nodeId: 'finish-primary',
      },
    });
  });

  it('treats case differences in tool names as distinct', async () => {
    const { agent, logger } = await createAgent();

    const lower = new TestToolNode(logger, makeTool('finish'), 'node-lower');
    const upper = new TestToolNode(logger, makeTool('Finish'), 'node-upper');

    agent.addTool(lower);
    const errorSpy = vi.spyOn(logger, 'error');
    agent.addTool(upper);

    expect(getRegisteredNames(agent).sort()).toEqual(['Finish', 'finish']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs duplicates introduced during MCP runtime sync without replacing the kept tool', async () => {
    const { agent, logger } = await createAgent();

    const initialTool = makeTool('finish');
    const server = new StubMcpServer('ns', 'mcp-1', [initialTool]);
    const errorSpy = vi.spyOn(logger, 'error');

    await agent.addMcpServer(asMcp(server));

    expect(getRegisteredTool(agent, 'finish')).toBe(initialTool);
    expect(errorSpy).not.toHaveBeenCalled();

    const duplicateTool = makeTool('finish', 'duplicate');
    server.setTools([initialTool, duplicateTool]);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, context] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('[Agent:Test Agent] Duplicate tool name detected: finish. Skipping registration.');
    expect(context).toMatchObject({
      toolName: 'finish',
      skipped: {
        sourceType: 'mcp',
        nodeId: 'mcp-1',
        namespace: 'ns',
        className: 'StubMcpServer',
      },
      kept: {
        sourceType: 'mcp',
        nodeId: 'mcp-1',
        namespace: 'ns',
        className: 'StubMcpServer',
      },
    });
    expect(getRegisteredTool(agent, 'finish')).toBe(initialTool);
  });
});
