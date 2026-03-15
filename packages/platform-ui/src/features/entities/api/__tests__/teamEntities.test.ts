import { describe, expect, it } from 'vitest';

import type { TemplateSchema } from '@/api/types/graph';
import type { TeamAgent, TeamAttachment, TeamMemoryBucket, TeamTool, TeamWorkspaceConfiguration } from '@/api/types/team';
import {
  TEAM_ATTACHMENT_KIND,
  buildAgentRequest,
  buildMcpServerRequest,
  buildMemoryBucketRequest,
  buildToolRequest,
  buildWorkspaceRequest,
  diffTeamAttachments,
  mapTeamEntities,
  sanitizeConfigForPersistence,
} from '@/features/entities/api/teamEntities';
import type { GraphEntityUpsertInput } from '@/features/entities/types';

const BASE_META = {
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const templates: TemplateSchema[] = [
  {
    name: 'agent',
    title: 'Agent',
    kind: 'agent',
    sourcePorts: [],
    targetPorts: [],
  },
  {
    name: 'manageTool',
    title: 'Manage Tool',
    kind: 'tool',
    sourcePorts: [],
    targetPorts: [],
  },
  {
    name: 'workspace',
    title: 'Workspace',
    kind: 'service',
    sourcePorts: [],
    targetPorts: [],
  },
  {
    name: 'memory',
    title: 'Memory',
    kind: 'service',
    sourcePorts: [],
    targetPorts: [],
  },
];

describe('teamEntities mapping', () => {
  it('maps team entities to graph summaries with camelCase configs', () => {
    const agent: TeamAgent = {
      id: 'agent-1',
      title: 'Ops Agent',
      description: 'Primary responder',
      config: {
        model: 'gpt-4',
        systemPrompt: 'Be precise.',
        debounceMs: 250,
        whenBusy: 'wait',
        processBuffer: 'oneByOne',
        sendFinalResponseToThread: true,
        summarizationKeepTokens: 120,
        summarizationMaxTokens: 360,
        restrictOutput: true,
        restrictionMessage: 'No secrets.',
        restrictionMaxInjections: 2,
        name: 'Alpha',
        role: 'Navigator',
      },
      ...BASE_META,
    };

    const tool: TeamTool = {
      id: 'tool-1',
      type: 'manage',
      name: 'manage_team',
      description: 'Manage tool',
      config: {},
      ...BASE_META,
    };

    const workspace: TeamWorkspaceConfiguration = {
      id: 'workspace-1',
      title: 'Workspace',
      description: 'Default workspace',
      config: {
        image: 'docker.io/library/node:18',
        cpuLimit: '500m',
        memoryLimit: 1024,
        platform: 'linux/amd64',
        enableDinD: true,
        ttlSeconds: 120,
        volumes: { enabled: true, mountPath: '/workspace' },
      },
      ...BASE_META,
    };

    const memory: TeamMemoryBucket = {
      id: 'memory-1',
      title: 'Memory',
      description: 'Shared memory',
      config: { scope: 'global', collectionPrefix: 'team' },
      ...BASE_META,
    };

    const entities = mapTeamEntities(
      {
        agents: [agent],
        tools: [tool],
        workspaceConfigurations: [workspace],
        memoryBuckets: [memory],
      },
      templates,
    );

    const agentSummary = entities.find((entry) => entry.entityKind === 'agent');
    expect(agentSummary?.config).toEqual(
      expect.objectContaining({
        model: 'gpt-4',
        systemPrompt: 'Be precise.',
        queue: {
          debounceMs: 250,
          whenBusy: 'wait',
          processBuffer: 'oneByOne',
        },
        summarization: {
          keepTokens: 120,
          maxTokens: 360,
        },
        restrictOutput: true,
        restrictionMessage: 'No secrets.',
        restrictionMaxInjections: 2,
        name: 'Alpha',
        role: 'Navigator',
      }),
    );

    const toolSummary = entities.find((entry) => entry.entityKind === 'tool');
    expect(toolSummary?.templateName).toBe('manageTool');
    expect(toolSummary?.toolType).toBe('manage');
    expect(toolSummary?.config).toEqual(expect.objectContaining({ name: 'manage_team' }));

    const workspaceSummary = entities.find((entry) => entry.entityKind === 'workspace');
    expect(workspaceSummary?.config).toEqual(
      expect.objectContaining({
        cpu_limit: '500m',
        memory_limit: 1024,
        platform: 'linux/amd64',
        enableDinD: true,
        ttlSeconds: 120,
        volumes: { enabled: true, mountPath: '/workspace' },
      }),
    );
  });
});

describe('teamEntities request builders', () => {
  it('builds agent requests with camelCase config keys', () => {
    const input: GraphEntityUpsertInput = {
      entityKind: 'agent',
      template: 'agent',
      title: 'Ops Agent',
      config: {
        model: 'gpt-4',
        systemPrompt: 'Stay focused.',
        queue: { debounceMs: 100, whenBusy: 'wait', processBuffer: 'allTogether' },
        sendFinalResponseToThread: true,
        summarization: { keepTokens: 50, maxTokens: 200 },
        restrictOutput: true,
        restrictionMessage: 'No secrets.',
        restrictionMaxInjections: 3,
        name: 'Alpha',
        role: 'Navigator',
      },
    };

    expect(buildAgentRequest(input)).toEqual({
      title: 'Ops Agent',
      description: '',
      config: {
        model: 'gpt-4',
        systemPrompt: 'Stay focused.',
        debounceMs: 100,
        whenBusy: 'wait',
        processBuffer: 'allTogether',
        sendFinalResponseToThread: true,
        summarizationKeepTokens: 50,
        summarizationMaxTokens: 200,
        restrictOutput: true,
        restrictionMessage: 'No secrets.',
        restrictionMaxInjections: 3,
        name: 'Alpha',
        role: 'Navigator',
      },
    });
  });

  it('builds tool, mcp, workspace, and memory requests', () => {
    const toolInput: GraphEntityUpsertInput = {
      entityKind: 'tool',
      template: 'manageTool',
      title: 'Manage tool',
      config: { name: 'manage_team' },
    };
    expect(buildToolRequest(toolInput)).toEqual({
      type: 'manage',
      name: 'manage_team',
      description: 'Manage tool',
      config: { name: 'manage_team' },
    });

    const mcpInput: GraphEntityUpsertInput = {
      entityKind: 'mcp',
      template: 'mcpServer',
      title: 'Filesystem MCP',
      config: {
        namespace: 'fs',
        command: 'fs',
        workdir: '/srv',
        env: [{ name: 'TOKEN', value: 'abc' }],
        requestTimeoutMs: 1000,
        startupTimeoutMs: 2000,
        heartbeatIntervalMs: 3000,
        staleTimeoutMs: 4000,
        restart: { maxAttempts: 3, backoffMs: 500 },
      },
    };
    expect(buildMcpServerRequest(mcpInput)).toEqual({
      title: 'Filesystem MCP',
      description: '',
      config: {
        namespace: 'fs',
        command: 'fs',
        workdir: '/srv',
        env: [{ name: 'TOKEN', value: 'abc' }],
        requestTimeoutMs: 1000,
        startupTimeoutMs: 2000,
        heartbeatIntervalMs: 3000,
        staleTimeoutMs: 4000,
        restart: { maxAttempts: 3, backoffMs: 500 },
      },
    });

    const workspaceInput: GraphEntityUpsertInput = {
      entityKind: 'workspace',
      template: 'workspace',
      title: 'Workspace',
      config: {
        image: 'docker.io/library/node:18',
        initialScript: 'echo ready',
        cpu_limit: '500m',
        memory_limit: '1Gi',
        platform: 'linux/amd64',
        enableDinD: true,
        ttlSeconds: 90,
        volumes: { enabled: true, mountPath: '/workspace' },
      },
    };
    expect(buildWorkspaceRequest(workspaceInput)).toEqual({
      title: 'Workspace',
      description: '',
      config: {
        image: 'docker.io/library/node:18',
        initialScript: 'echo ready',
        cpuLimit: '500m',
        memoryLimit: '1Gi',
        platform: 'linux/amd64',
        enableDinD: true,
        ttlSeconds: 90,
        volumes: { enabled: true, mountPath: '/workspace' },
      },
    });

    const memoryInput: GraphEntityUpsertInput = {
      entityKind: 'memory',
      template: 'memory',
      title: 'Memory',
      config: { scope: 'global', collectionPrefix: 'team' },
    };
    expect(buildMemoryBucketRequest(memoryInput)).toEqual({
      title: 'Memory',
      description: '',
      config: { scope: 'global', collectionPrefix: 'team' },
    });
  });
});

describe('teamEntities attachment diffing', () => {
  it('identifies attachments to create and remove', () => {
    const current: TeamAttachment[] = [
      {
        id: 'att-1',
        kind: TEAM_ATTACHMENT_KIND.agentTool,
        sourceId: 'agent-1',
        targetId: 'tool-1',
        sourceType: 'agent',
        targetType: 'tool',
        ...BASE_META,
      },
      {
        id: 'att-2',
        kind: TEAM_ATTACHMENT_KIND.agentMemoryBucket,
        sourceId: 'agent-1',
        targetId: 'memory-1',
        sourceType: 'agent',
        targetType: 'memoryBucket',
        ...BASE_META,
      },
    ];
    const desired = [
      { kind: TEAM_ATTACHMENT_KIND.agentTool, sourceId: 'agent-1', targetId: 'tool-1' },
      { kind: TEAM_ATTACHMENT_KIND.agentWorkspaceConfiguration, sourceId: 'agent-1', targetId: 'workspace-1' },
    ];

    const { create, remove } = diffTeamAttachments(current, desired);
    expect(create).toEqual([
      { kind: TEAM_ATTACHMENT_KIND.agentWorkspaceConfiguration, sourceId: 'agent-1', targetId: 'workspace-1' },
    ]);
    expect(remove).toEqual([current[1]]);
  });
});

describe('teamEntities config sanitization', () => {
  it('strips non-persisted keys and env sources', () => {
    const config = {
      title: 'Workspace',
      template: 'workspace',
      kind: 'workspace',
      env: [
        { name: 'TOKEN', value: 'abc', source: 'secret', meta: 'keep' },
        { name: 'EMPTY', value: '', source: 'static' },
      ],
      nested: {
        env: [{ name: 'INNER', value: 'xyz', source: 'variable' }],
      },
      count: 2,
      optional: undefined,
    };

    expect(sanitizeConfigForPersistence('workspace', config)).toEqual({
      env: [
        { name: 'TOKEN', value: 'abc', meta: 'keep' },
        { name: 'EMPTY', value: '' },
      ],
      nested: { env: [{ name: 'INNER', value: 'xyz' }] },
      count: 2,
    });
  });
});
