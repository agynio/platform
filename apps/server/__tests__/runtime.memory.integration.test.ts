import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { buildTemplateRegistry } from '../src/templates';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { GraphDefinition } from '../src/graph/types';
import { MemoryService } from '../src/services/memory.service';
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { CallModelNode } from '../src/lgnodes/callModel.lgnode';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { SlackService } from '../src/services/slack.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { MemoryNode } from '../src/nodes/memory.node';
import { MemoryConnectorNode } from '../src/nodes/memoryConnector.node';

class FakeLLM {
  public captured: BaseMessage[] | null = null;
  withConfig(_cfg: any) {
    return {
      invoke: async (messages: BaseMessage[]) => {
        this.captured = messages;
        return new AIMessage('ok');
      },
    } as any;
  }
}

// Patch SimpleAgent to use FakeLLM in CallModelNode
import * as SimpleAgentModule from '../src/agents/simple.agent';
const OriginalSimpleAgent = SimpleAgentModule.SimpleAgent;
const PatchedSimpleAgent = class extends OriginalSimpleAgent {
  init(config: any) {
    super.init(config);
    const anyThis: any = this as any;
    const tools = anyThis.toolsNode ? anyThis.toolsNode['tools'] || [] : [];
    anyThis['callModelNode'] = new CallModelNode(tools, new FakeLLM() as any);
    return this;
  }
};

describe('Live runtime memory integration', () => {
  let db: any;
  const logger = new LoggerService();

  beforeAll(async () => {
    const { makeFakeDb } = await import('./helpers/fakeDb');
    db = makeFakeDb().db;
  });

  afterAll(async () => {
    db = undefined as any;
  });

  it('injects memory system message via connector into CallModel', async () => {
    const reg = buildTemplateRegistry({
      logger,
      containerService: new ContainerService(logger),
      configService: new ConfigService(),
      slackService: new SlackService(logger),
      checkpointerService: new CheckpointerService(logger),
      db,
    });

    const runtime = new LiveGraphRuntime(logger, reg);

    const graph: GraphDefinition = {
      nodes: [
        { id: 'mem', data: { template: 'memoryNode', config: { scope: 'perThread' } } },
        { id: 'conn', data: { template: 'memoryConnector', config: { placement: 'after_system', content: 'full' } } },
        { id: 'agent', data: { template: 'simpleAgent', config: {} } },
      ],
      edges: [
        { source: 'mem', sourceHandle: '$self', target: 'conn', targetHandle: 'memory' },
        { source: 'conn', sourceHandle: '$self', target: 'agent', targetHandle: 'memory' },
      ],
    };

    // Override memoryNode factory to avoid dynamic require in templates
    (reg as any)['factories'].set('memoryNode', (ctx: any) => { const node = new MemoryNode(logger, ctx.nodeId); node.setDb(db); return node; });
    (reg as any)['factories'].set('memoryConnector', (_ctx: any) => new MemoryConnectorNode(logger));

    await runtime.apply(graph);

    // After graph apply, patch the agent's CallModelNode LLM with FakeLLM
    const compiled = (runtime as any).compiledGraphs?.get('default');
    const agentNode: any = (compiled.nodeInstances as any).get('agent');
    const callNode: any = agentNode['callModelNode'];
    const fake = new FakeLLM();
    callNode['llm'] = fake;

    // Seed memory for thread T
    const svc = new MemoryService(db, logger, { nodeId: 'mem', scope: 'perThread', threadResolver: () => 'T' });
    await svc.append('/a', 1);

    // Trigger agent by calling summarize->call_model path via runtime API
    expect(compiled).toBeTruthy();
    const graphRunnable = compiled.graph;

    // Invoke with thread T and a simple message
    await graphRunnable.invoke({ messages: [new AIMessage('hello')] }, { configurable: { thread_id: 'T' } });

    // Inspect LLM captured messages via our fake
    const captured = (fake as any).captured as BaseMessage[];
    expect(captured[0]).toBeInstanceOf(SystemMessage);
    expect(captured[1]).toBeInstanceOf(SystemMessage);
  });
});
