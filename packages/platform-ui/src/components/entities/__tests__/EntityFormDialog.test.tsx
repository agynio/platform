import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    ready: true,
    error: null,
    refresh: vi.fn(),
    getTemplate: () => undefined,
  }),
}));

import { EntityFormDialog } from '../EntityFormDialog';
import type { GraphEntityKind, GraphEntitySummary, TemplateOption } from '@/features/entities/types';
import type { PersistedGraphNode } from '@agyn/shared';
import type { TemplateSchema } from '@/api/types/graph';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';

function createTemplate(name: string, kind: GraphEntityKind = 'workspace'): TemplateOption {
  const schema: TemplateSchema = {
    name,
    title: `${name}-title`,
    kind,
    source: 'api',
    description: '',
    inputs: [],
    outputs: [],
    sourcePorts: [],
    targetPorts: [],
    version: 1,
  } as TemplateSchema;

  return {
    name,
    title: `${name}-title`,
    kind,
    source: schema,
  } satisfies TemplateOption;
}

function createEntitySummary(overrides: Partial<GraphEntitySummary> = {}): GraphEntitySummary {
  const node: PersistedGraphNode = {
    id: 'node-1',
    template: 'template-1',
    config: {},
    position: { x: 0, y: 0 },
  } as PersistedGraphNode;

  return {
    id: 'node-1',
    node,
    title: 'Node 1',
    templateName: 'template-1',
    templateTitle: 'Template 1',
    templateKind: 'workspace',
    rawTemplateKind: 'service',
    config: {},
    state: undefined,
    position: { x: 0, y: 0 },
    ports: { inputs: [], outputs: [] },
    relations: { incoming: 0, outgoing: 0 },
    ...overrides,
  } satisfies GraphEntitySummary;
}

function createGraphNode(overrides: Partial<GraphNodeConfig> = {}): GraphNodeConfig {
  return {
    id: overrides.id ?? 'node-graph-1',
    template: overrides.template ?? 'template-1',
    title: overrides.title ?? overrides.id ?? 'Node graph 1',
    kind: overrides.kind ?? 'Workspace',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    status: overrides.status ?? 'ready',
    ports: overrides.ports ?? { inputs: [], outputs: [] },
  } satisfies GraphNodeConfig;
}

function createGraphEdge(overrides: Partial<GraphPersistedEdge> & { source: string; target: string }): GraphPersistedEdge {
  const sourceHandle = overrides.sourceHandle ?? '$self';
  const targetHandle = overrides.targetHandle ?? '$self';
  return {
    id: overrides.id ?? `${overrides.source}-${sourceHandle}__${overrides.target}-${targetHandle}`,
    source: overrides.source,
    sourceHandle,
    target: overrides.target,
    targetHandle,
  } satisfies GraphPersistedEdge;
}

type RelationDialogRenderOptions = {
  kind: GraphEntityKind;
  templateName: string;
  graphNodes: GraphNodeConfig[];
  graphEdges: GraphPersistedEdge[];
  entity?: GraphEntitySummary;
  mode?: 'create' | 'edit';
  templates?: TemplateOption[];
};

function renderRelationDialog(options: RelationDialogRenderOptions) {
  const {
    kind,
    templateName,
    graphNodes,
    graphEdges,
    entity,
    mode = 'edit',
    templates = [createTemplate(templateName, kind)],
  } = options;
  const resolvedEntity =
    entity ??
    createEntitySummary({
      id: `${templateName}-entity`,
      templateName,
      templateKind: kind,
      rawTemplateKind: kind,
      title: `${templateName} entity`,
    });
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntityFormDialog
        open
        mode={mode}
        kind={kind}
        templates={templates}
        entity={mode === 'edit' ? resolvedEntity : undefined}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        graphNodes={graphNodes}
        graphEdges={graphEdges}
      />
    </QueryClientProvider>,
  );

  return { onSubmit };
}

describe('EntityFormDialog', () => {
  it('embeds workspace config fields and submits updated values', async () => {
    const templates = [createTemplate('workspace-template', 'workspace')];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityFormDialog
          open
          mode="create"
          kind="workspace"
          templates={templates}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          isSubmitting={false}
        />
      </QueryClientProvider>,
    );

    const templateSelect = screen.getByLabelText('Template');
    fireEvent.change(templateSelect, { target: { value: 'workspace-template' } });

    const titleInput = await screen.findByLabelText('Entity title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '  My Workspace  ');

    await screen.findByText('Container');
    const imageInput = screen.getByPlaceholderText('docker.io/library/ubuntu:latest');
    await userEvent.clear(imageInput);
    await userEvent.type(imageInput, 'docker.io/library/node:18');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      template: 'workspace-template',
      title: 'My Workspace',
    });
    expect(payload.config).toEqual(expect.objectContaining({
      image: 'docker.io/library/node:18',
    }));
    expect(payload.config).not.toHaveProperty('title');
    expect(payload.config).not.toHaveProperty('template');
    expect(payload.config).not.toHaveProperty('kind');

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('disables template selection and shows agent config fields for edit mode', async () => {
    const templates = [createTemplate('agent-template', 'agent')];
    const entity = createEntitySummary({
      id: 'agent-1',
      templateName: 'agent-template',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Existing Agent',
      config: { title: 'Existing Agent', template: 'agent-template', kind: 'Agent' },
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityFormDialog
          open
          mode="edit"
          kind="agent"
          templates={templates}
          entity={entity}
          onOpenChange={vi.fn()}
          onSubmit={onSubmit}
          isSubmitting={false}
        />
      </QueryClientProvider>,
    );

    const templateSelect = screen.getByLabelText('Template');
    expect(templateSelect).toBeDisabled();

    await screen.findByPlaceholderText('e.g., Casey Quinn');

    const modelInput = screen.getByPlaceholderText('gpt-4');
    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, 'claude-3');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.template).toBe('agent-template');
    expect(payload.config).toMatchObject({ model: 'claude-3' });
  });

  it('falls back to config title and strips env sources before submit', async () => {
    const templates = [createTemplate('worker-service', 'workspace')];
    const entity = createEntitySummary({
      id: 'workspace-1',
      templateName: 'worker-service',
      templateKind: 'workspace',
      rawTemplateKind: 'service',
      title: '',
      config: {
        title: 'Worker Service',
        template: 'worker-service',
        kind: 'Workspace',
        env: [
          {
            id: 'env-1',
            name: 'API_TOKEN',
            value: { kind: 'vault', mount: 'kv', path: 'prod/app', key: 'TOKEN' },
            source: 'vault',
          },
          {
            id: 'env-2',
            name: 'PLAIN',
            value: { kind: 'static', value: 'abc' },
            source: 'valut',
          },
        ],
      },
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityFormDialog
          open
          mode="edit"
          kind="workspace"
          templates={templates}
          entity={entity}
          onOpenChange={vi.fn()}
          onSubmit={onSubmit}
          isSubmitting={false}
        />
      </QueryClientProvider>,
    );

    const titleInput = await screen.findByLabelText('Entity title');
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe('Worker Service');
    expect(payload.config).not.toHaveProperty('title');
    expect(payload.config).not.toHaveProperty('template');
    expect(payload.config).not.toHaveProperty('kind');
    const envEntries = payload.config.env as Array<Record<string, unknown>>;
    expect(envEntries).toHaveLength(2);
    envEntries.forEach((entry) => {
      expect(entry).not.toHaveProperty('source');
    });
  });
});

describe('EntityFormDialog relations', () => {
  it('prefills Slack trigger agent relation and persists edits', async () => {
    const graphNodes = [
      createGraphNode({ id: 'trigger-1', template: 'slackTrigger', kind: 'Trigger', title: 'Slack Trigger' }),
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'agent-2', template: 'support-agent', kind: 'Agent', title: 'Agent Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'trigger-1', sourceHandle: 'subscribe', target: 'agent-1', targetHandle: '$self' }),
    ];
    const entity = createEntitySummary({
      id: 'trigger-1',
      templateName: 'slackTrigger',
      templateKind: 'trigger',
      rawTemplateKind: 'trigger',
      title: 'Slack Trigger',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'trigger',
      templateName: 'slackTrigger',
      graphNodes,
      graphEdges,
      entity,
    });

    const relationSelect = await screen.findByLabelText('Agent destination');
    expect(relationSelect).toHaveValue('agent-1');

    await userEvent.selectOptions(relationSelect, 'agent-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'slackTriggerAgent');
    expect(relation).toMatchObject({
      ownerRole: 'source',
      ownerHandle: 'subscribe',
      peerHandle: '$self',
      selections: ['agent-2'],
    });
  });

  it('updates agent tool relations via multi-select', async () => {
    const graphNodes = [
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'tool-1', template: 'shellTool', kind: 'Tool', title: 'Tool One' }),
      createGraphNode({ id: 'tool-2', template: 'githubCloneRepoTool', kind: 'Tool', title: 'Tool Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'agent-1', sourceHandle: 'tools', target: 'tool-1', targetHandle: '$self' }),
    ];
    const entity = createEntitySummary({
      id: 'agent-1',
      templateName: 'support-agent',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent One',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'agent',
      templateName: 'support-agent',
      graphNodes,
      graphEdges,
      entity,
    });

    const toolsSelect = await screen.findByLabelText('Tools');
    expect(Array.from(toolsSelect.selectedOptions).map((option) => option.value)).toEqual(['tool-1']);
    await userEvent.selectOptions(toolsSelect, ['tool-2']);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const toolsRelation = payload.relations?.find((item) => item.id === 'agentTools');
    expect(toolsRelation).toMatchObject({
      ownerRole: 'source',
      ownerHandle: 'tools',
      selections: expect.arrayContaining(['tool-1', 'tool-2']),
    });
  });

  it('updates agent MCP server relations via multi-select', async () => {
    const graphNodes = [
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'mcp-1', template: 'mcpServer', kind: 'MCP', title: 'MCP One' }),
      createGraphNode({ id: 'mcp-2', template: 'mcpServer', kind: 'MCP', title: 'MCP Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'agent-1', sourceHandle: 'mcp', target: 'mcp-1', targetHandle: '$self' }),
    ];
    const entity = createEntitySummary({
      id: 'agent-1',
      templateName: 'support-agent',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent One',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'agent',
      templateName: 'support-agent',
      graphNodes,
      graphEdges,
      entity,
    });

    const mcpSelect = await screen.findByLabelText('MCP servers');
    expect(Array.from(mcpSelect.selectedOptions).map((option) => option.value)).toEqual(['mcp-1']);
    await userEvent.selectOptions(mcpSelect, ['mcp-2']);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'agentMcpServers');
    expect(relation).toMatchObject({ selections: expect.arrayContaining(['mcp-1', 'mcp-2']) });
  });

  it('updates agent memory connector relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'mc-1', template: 'memoryConnector', kind: 'Workspace', title: 'Connector One' }),
      createGraphNode({ id: 'mc-2', template: 'memoryConnector', kind: 'Workspace', title: 'Connector Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'mc-1', sourceHandle: '$self', target: 'agent-1', targetHandle: 'memory' }),
    ];
    const entity = createEntitySummary({
      id: 'agent-1',
      templateName: 'support-agent',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent One',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'agent',
      templateName: 'support-agent',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText('Memory connector');
    expect(select).toHaveValue('mc-1');
    await userEvent.selectOptions(select, 'mc-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'agentMemoryConnector');
    expect(relation).toMatchObject({
      ownerRole: 'target',
      ownerHandle: 'memory',
      peerHandle: '$self',
      selections: ['mc-2'],
    });
  });

  it('updates shell tool workspace relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'shell-1', template: 'shellTool', kind: 'Tool', title: 'Shell Tool' }),
      createGraphNode({ id: 'workspace-1', template: 'workspace-default', kind: 'Workspace', title: 'Workspace One' }),
      createGraphNode({ id: 'workspace-2', template: 'workspace-other', kind: 'Workspace', title: 'Workspace Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'workspace-1', sourceHandle: '$self', target: 'shell-1', targetHandle: 'workspace' }),
    ];
    const entity = createEntitySummary({
      id: 'shell-1',
      templateName: 'shellTool',
      templateKind: 'tool',
      rawTemplateKind: 'tool',
      title: 'Shell Tool',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'tool',
      templateName: 'shellTool',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText('Workspace');
    expect(select).toHaveValue('workspace-1');
    await userEvent.selectOptions(select, 'workspace-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'shellToolWorkspace');
    expect(relation).toMatchObject({ selections: ['workspace-2'] });
  });

  it('updates manage tool agent selections', async () => {
    const graphNodes = [
      createGraphNode({ id: 'manage-1', template: 'manageTool', kind: 'Tool', title: 'Manage Tool' }),
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'agent-2', template: 'support-agent', kind: 'Agent', title: 'Agent Two' }),
      createGraphNode({ id: 'agent-3', template: 'support-agent', kind: 'Agent', title: 'Agent Three' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'manage-1', sourceHandle: 'agent', target: 'agent-1', targetHandle: '$self' }),
      createGraphEdge({ source: 'manage-1', sourceHandle: 'agent', target: 'agent-2', targetHandle: '$self' }),
    ];
    const entity = createEntitySummary({
      id: 'manage-1',
      templateName: 'manageTool',
      templateKind: 'tool',
      rawTemplateKind: 'tool',
      title: 'Manage Tool',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'tool',
      templateName: 'manageTool',
      graphNodes,
      graphEdges,
      entity,
    });

    const agentsSelect = await screen.findByLabelText('Managed agents');
    expect(Array.from(agentsSelect.selectedOptions).map((option) => option.value)).toEqual(['agent-1', 'agent-2']);
    await userEvent.selectOptions(agentsSelect, ['agent-3']);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'manageToolAgents');
    expect(relation).toMatchObject({ selections: expect.arrayContaining(['agent-1', 'agent-2', 'agent-3']) });
  });

  it('updates call agent tool relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'call-tool-1', template: 'callAgentTool', kind: 'Tool', title: 'Call Agent Tool' }),
      createGraphNode({ id: 'agent-1', template: 'support-agent', kind: 'Agent', title: 'Agent One' }),
      createGraphNode({ id: 'agent-2', template: 'support-agent', kind: 'Agent', title: 'Agent Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'call-tool-1', sourceHandle: 'agent', target: 'agent-1', targetHandle: '$self' }),
    ];
    const entity = createEntitySummary({
      id: 'call-tool-1',
      templateName: 'callAgentTool',
      templateKind: 'tool',
      rawTemplateKind: 'tool',
      title: 'Call Agent Tool',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'tool',
      templateName: 'callAgentTool',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText(/^Agent$/);
    expect(select).toHaveValue('agent-1');
    await userEvent.selectOptions(select, 'agent-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'callAgentToolAgent');
    expect(relation).toMatchObject({ selections: ['agent-2'] });
  });

  it('updates MCP server workspace relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'mcp-1', template: 'mcpServer', kind: 'MCP', title: 'MCP Server' }),
      createGraphNode({ id: 'workspace-1', template: 'workspace-default', kind: 'Workspace', title: 'Workspace One' }),
      createGraphNode({ id: 'workspace-2', template: 'workspace-other', kind: 'Workspace', title: 'Workspace Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'workspace-1', sourceHandle: '$self', target: 'mcp-1', targetHandle: 'workspace' }),
    ];
    const entity = createEntitySummary({
      id: 'mcp-1',
      templateName: 'mcpServer',
      templateKind: 'mcp',
      rawTemplateKind: 'mcp',
      title: 'MCP Server',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'mcp',
      templateName: 'mcpServer',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText('Workspace');
    expect(select).toHaveValue('workspace-1');
    await userEvent.selectOptions(select, 'workspace-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'mcpServerWorkspace');
    expect(relation).toMatchObject({ selections: ['workspace-2'] });
  });

  it('updates memory tool memory relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'memory-tool-1', template: 'memoryTool', kind: 'Tool', title: 'Memory Tool' }),
      createGraphNode({ id: 'memory-1', template: 'memory', kind: 'Workspace', title: 'Memory One' }),
      createGraphNode({ id: 'memory-2', template: 'memory', kind: 'Workspace', title: 'Memory Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'memory-1', sourceHandle: '$self', target: 'memory-tool-1', targetHandle: '$memory' }),
    ];
    const entity = createEntitySummary({
      id: 'memory-tool-1',
      templateName: 'memoryTool',
      templateKind: 'tool',
      rawTemplateKind: 'tool',
      title: 'Memory Tool',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'tool',
      templateName: 'memoryTool',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText('Memory workspace');
    expect(select).toHaveValue('memory-1');
    await userEvent.selectOptions(select, 'memory-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'memoryToolMemory');
    expect(relation).toMatchObject({ selections: ['memory-2'] });
  });

  it('updates memory connector memory relation', async () => {
    const graphNodes = [
      createGraphNode({ id: 'memory-connector-1', template: 'memoryConnector', kind: 'Workspace', title: 'Memory Connector' }),
      createGraphNode({ id: 'memory-1', template: 'memory', kind: 'Workspace', title: 'Memory One' }),
      createGraphNode({ id: 'memory-2', template: 'memory', kind: 'Workspace', title: 'Memory Two' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'memory-1', sourceHandle: '$self', target: 'memory-connector-1', targetHandle: '$memory' }),
    ];
    const entity = createEntitySummary({
      id: 'memory-connector-1',
      templateName: 'memoryConnector',
      templateKind: 'workspace',
      rawTemplateKind: 'workspace',
      title: 'Memory Connector',
    });
    const { onSubmit } = renderRelationDialog({
      kind: 'workspace',
      templateName: 'memoryConnector',
      graphNodes,
      graphEdges,
      entity,
    });

    const select = await screen.findByLabelText('Memory workspace');
    expect(select).toHaveValue('memory-1');
    await userEvent.selectOptions(select, 'memory-2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    const relation = payload.relations?.find((item) => item.id === 'memoryConnectorMemory');
    expect(relation).toMatchObject({ selections: ['memory-2'] });
  });
});
