import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { TeamsGraphSource } from '../src/graph/teamsGraph.source';
import { edgeKey } from '../src/graph/graph.utils';
import { createTeamsClientStub } from './helpers/teamsGrpc.stub';
import {
  AgentConfigSchema,
  AgentSchema,
  AttachmentKind,
  AttachmentSchema,
  EntityType,
  McpServerSchema,
  MemoryBucketConfigSchema,
  MemoryBucketScope,
  MemoryBucketSchema,
  ToolSchema,
  ToolType,
  WorkspaceConfigSchema,
  WorkspaceConfigurationSchema,
  WorkspacePlatform,
} from '../src/proto/gen/agynio/api/teams/v1/teams_pb';

describe('TeamsGraphSource', () => {
  it('maps Teams entities and attachments into graph nodes/edges', async () => {
    const agent = create(AgentSchema, {
      meta: { id: 'agent-1' },
      title: ' Agent One ',
      description: '',
      config: create(AgentConfigSchema, { name: ' Casey ', role: ' Lead ', model: 'gpt-4' }),
    });
    const tool = create(ToolSchema, {
      meta: { id: 'tool-shell' },
      name: ' Shell Tool ',
      description: 'ignored',
      type: ToolType.SHELL_COMMAND,
      config: { mode: 'fast' },
    });
    const mcp = create(McpServerSchema, {
      meta: { id: 'mcp-1' },
      title: ' MCP Server ',
      config: { namespace: 'tools', command: 'run', workdir: '/srv', env: [{ name: 'TOKEN', value: 'secret' }] },
    });
    const detachedMcp = create(McpServerSchema, {
      meta: { id: 'mcp-2' },
      title: ' Detached MCP ',
      config: { namespace: 'detached', command: 'run2' },
    });
    const workspace = create(WorkspaceConfigurationSchema, {
      meta: { id: 'workspace-1' },
      title: ' Workspace ',
      config: create(WorkspaceConfigSchema, {
        image: 'ubuntu',
        platform: WorkspacePlatform.LINUX_AMD64,
        initialScript: 'echo hi',
      }),
    });
    const detachedWorkspace = create(WorkspaceConfigurationSchema, {
      meta: { id: 'workspace-2' },
      title: ' Workspace Two ',
      config: create(WorkspaceConfigSchema, {
        image: 'debian',
        platform: WorkspacePlatform.LINUX_ARM64,
      }),
    });
    const memoryBucket = create(MemoryBucketSchema, {
      meta: { id: 'memory-1' },
      title: ' Memory ',
      config: create(MemoryBucketConfigSchema, {
        scope: MemoryBucketScope.GLOBAL,
        collectionPrefix: 'agents',
      }),
    });
    const attachments = [
      create(AttachmentSchema, {
        meta: { id: 'attach-agent-tool' },
        kind: AttachmentKind.AGENT_TOOL,
        sourceId: 'agent-1',
        targetId: 'tool-shell',
        sourceType: EntityType.AGENT,
        targetType: EntityType.TOOL,
      }),
      create(AttachmentSchema, {
        meta: { id: 'attach-agent-mcp' },
        kind: AttachmentKind.AGENT_MCP_SERVER,
        sourceId: 'agent-1',
        targetId: 'mcp-1',
        sourceType: EntityType.AGENT,
        targetType: EntityType.MCP_SERVER,
      }),
      create(AttachmentSchema, {
        meta: { id: 'attach-agent-memory' },
        kind: AttachmentKind.AGENT_MEMORY_BUCKET,
        sourceId: 'agent-1',
        targetId: 'memory-1',
        sourceType: EntityType.AGENT,
        targetType: EntityType.MEMORY_BUCKET,
      }),
      create(AttachmentSchema, {
        meta: { id: 'attach-agent-workspace' },
        kind: AttachmentKind.AGENT_WORKSPACE_CONFIGURATION,
        sourceId: 'agent-1',
        targetId: 'workspace-1',
        sourceType: EntityType.AGENT,
        targetType: EntityType.WORKSPACE_CONFIGURATION,
      }),
      create(AttachmentSchema, {
        meta: { id: 'attach-mcp-workspace' },
        kind: AttachmentKind.MCP_SERVER_WORKSPACE_CONFIGURATION,
        sourceId: 'mcp-1',
        targetId: 'workspace-1',
        sourceType: EntityType.MCP_SERVER,
        targetType: EntityType.WORKSPACE_CONFIGURATION,
      }),
      create(AttachmentSchema, {
        meta: { id: 'attach-mcp-workspace-detached' },
        kind: AttachmentKind.MCP_SERVER_WORKSPACE_CONFIGURATION,
        sourceId: 'mcp-2',
        targetId: 'workspace-2',
        sourceType: EntityType.MCP_SERVER,
        targetType: EntityType.WORKSPACE_CONFIGURATION,
      }),
    ];

    const teamsClient = createTeamsClientStub({
      agents: [agent],
      tools: [tool],
      mcps: [mcp, detachedMcp],
      workspaces: [workspace, detachedWorkspace],
      memoryBuckets: [memoryBucket],
      attachments,
    });
    const source = new TeamsGraphSource(teamsClient);

    const { nodes, edges } = await source.load();

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    expect(nodesById.get('agent-1')).toMatchObject({
      template: 'agent',
      config: { title: 'Agent One', model: 'gpt-4', name: 'Casey', role: 'Lead' },
    });
    expect(nodesById.get('tool-shell')).toMatchObject({
      template: 'shellTool',
      config: { title: 'Shell Tool', mode: 'fast' },
    });
    expect(nodesById.get('mcp-1')).toMatchObject({
      template: 'mcpServer',
      config: {
        title: 'MCP Server',
        namespace: 'tools',
        command: 'run',
        workdir: '/srv',
        env: [{ name: 'TOKEN', value: 'secret' }],
      },
    });
    expect(nodesById.get('mcp-2')).toMatchObject({
      template: 'mcpServer',
      config: { title: 'Detached MCP', namespace: 'detached', command: 'run2' },
    });
    expect(nodesById.get('workspace-1')).toMatchObject({
      template: 'workspace',
      config: { title: 'Workspace', image: 'ubuntu', platform: 'linux/amd64', initialScript: 'echo hi' },
    });
    expect(nodesById.get('workspace-2')).toMatchObject({
      template: 'workspace',
      config: { title: 'Workspace Two', image: 'debian', platform: 'linux/arm64' },
    });
    expect(nodesById.get('memory-1')).toMatchObject({
      template: 'memory',
      config: { title: 'Memory', scope: 'global', collectionPrefix: 'agents' },
    });
    expect(nodesById.get('memoryConnector:agent-1:memory-1')).toMatchObject({ template: 'memoryConnector' });

    const edgeKeys = edges.map(edgeKey);
    const expectedEdges = [
      edgeKey({ source: 'agent-1', sourceHandle: 'tools', target: 'tool-shell', targetHandle: '$self' }),
      edgeKey({ source: 'agent-1', sourceHandle: 'mcp', target: 'mcp-1', targetHandle: '$self' }),
      edgeKey({ source: 'memory-1', sourceHandle: '$self', target: 'memoryConnector:agent-1:memory-1', targetHandle: '$memory' }),
      edgeKey({ source: 'memoryConnector:agent-1:memory-1', sourceHandle: '$self', target: 'agent-1', targetHandle: 'memory' }),
      edgeKey({ source: 'workspace-1', sourceHandle: '$self', target: 'mcp-1', targetHandle: 'workspace' }),
      edgeKey({ source: 'workspace-1', sourceHandle: '$self', target: 'tool-shell', targetHandle: 'workspace' }),
      edgeKey({ source: 'workspace-2', sourceHandle: '$self', target: 'mcp-2', targetHandle: 'workspace' }),
    ];

    expect(nodes).toHaveLength(8);
    expect(edgeKeys).toHaveLength(expectedEdges.length);
    expect(edgeKeys).toEqual(expect.arrayContaining(expectedEdges));
  });
});
