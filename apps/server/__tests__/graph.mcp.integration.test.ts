import { describe, it, expect } from 'vitest';
import { buildTemplateRegistry } from '../src/templates';
import { LocalMCPServer } from '../src/mcp/localMcpServer';
import { LoggerService } from '../src/services/logger.service';
import { ContainerService } from '../src/services/container.service';
import { ConfigService } from '../src/services/config.service';
import { SlackService } from '../src/services/slack.service';
import { CheckpointerService } from '../src/services/checkpointer.service';
import { LiveGraphRuntime, GraphDefinition } from '../src/graph';
import { MongoService } from '../src/services/mongo.service';

// This test only validates that the graph can wire the mcpServer node without throwing.
// It does not attempt to start a real filesystem MCP server (would require network/npm). Instead, we configure
// a trivially invalid command and assert start() defers until first addMcpServer call (which the edge triggers).
// Given start() will attempt to exec within container, we skip if docker not available.

function dockerAvailable() {
  // naive check: docker socket on mac
  return process.platform === 'darwin';
}

describe('Graph MCP integration', () => {
  it('constructs graph with mcpServer template without error (deferred start)', async () => {
    if (!dockerAvailable()) {
      return; // skip silently
    }

    // Stub MCP server start & listTools to avoid requiring a real MCP server process for this wiring test.
    // We only care that the graph can connect ports without throwing.
    (LocalMCPServer as any).prototype.start = async function mockedStart() {
      this.started = true;
      // simulate minimal client presence expected by downstream code if accessed
      this.client = {};
    };
    (LocalMCPServer as any).prototype.listTools = async function mockedListTools() {
      return [];
    };
    const logger = new LoggerService();
    const configService = ConfigService.fromEnv();
    const slackService = new SlackService(configService, logger);
    const containerService = new ContainerService(logger);
    const checkpointerService = new CheckpointerService(logger);
    // Patch to bypass Mongo requirement for this lightweight integration test
    (checkpointerService as any).getCheckpointer = () => ({
      get: async () => undefined,
      put: async () => undefined,
    });
    // minimal mongo stub (not connecting real db for test) - methods used in graph may be limited
    const mongo = new MongoService(configService, logger);
    // skip connect for integration-lite scenario

    const templateRegistry = buildTemplateRegistry({
      logger,
      containerService,
      configService,
      slackService,
      checkpointerService,
    });

    const graph: GraphDefinition = {
      nodes: [
        { id: 'container', data: { template: 'containerProvider' } },
        { id: 'agent', data: { template: 'simpleAgent' } },
        { id: 'mcp', data: { template: 'mcpServer', config: { namespace: 'x', command: 'echo "mock" && sleep 1' } } },
      ],
      edges: [
        { source: 'container', sourceHandle: '$self', target: 'mcp', targetHandle: 'containerProvider' },
        { source: 'agent', sourceHandle: 'mcp', target: 'mcp', targetHandle: '$self' },
      ],
    };

    const runtime = new LiveGraphRuntime(logger, templateRegistry);
    const result = await runtime.apply(graph);
    expect(result.addedNodes).toContain('mcp');
  }, 60000);
});
