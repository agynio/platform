import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const pointerProto = Element.prototype as typeof Element.prototype & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  scrollIntoView?: (opts?: ScrollIntoViewOptions | boolean) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!pointerProto.scrollIntoView) {
  pointerProto.scrollIntoView = () => {};
}

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    ready: true,
    error: null,
    refresh: vi.fn(),
    getTemplate: () => undefined,
  }),
}));

import { EntityUpsertForm } from '../EntityUpsertForm';
import type { GraphEntityKind, GraphEntitySummary, TemplateOption } from '@/features/entities/types';
import type { PersistedGraphNode } from '@agyn/shared';
import type { TemplateSchema } from '@/api/types/graph';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { TEAM_ATTACHMENT_KIND } from '@/features/entities/api/teamEntities';

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
    entityKind: 'workspace',
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

const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });
describe('EntityUpsertForm', () => {
  it('embeds workspace config fields and submits updated values', async () => {
    const templates = [createTemplate('workspace-template', 'workspace')];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = setupUser();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="create"
          kind="workspace"
          templates={templates}
          onSubmit={onSubmit}
          isSubmitting={false}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const templateSelect = screen.getByRole('combobox', { name: /template/i });
    await user.click(templateSelect);
    await user.click(await screen.findByRole('option', { name: 'workspace-template-title' }));

    const titleInput = await screen.findByLabelText('Entity title');
    await user.clear(titleInput);
    await user.type(titleInput, '  My Workspace  ');

    await screen.findByText('Container');
    const imageInput = screen.getByPlaceholderText('docker.io/library/ubuntu:latest');
    await user.clear(imageInput);
    await user.type(imageInput, 'docker.io/library/node:18');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      entityKind: 'workspace',
      template: 'workspace-template',
      title: 'My Workspace',
    });
    expect(payload.config).toEqual(expect.objectContaining({
      image: 'docker.io/library/node:18',
    }));
    expect(payload.config).not.toHaveProperty('title');
    expect(payload.config).not.toHaveProperty('template');
    expect(payload.config).not.toHaveProperty('kind');
  });

  it('disables template selection and shows agent config fields for edit mode', async () => {
    const templates = [createTemplate('agent-template', 'agent')];
    const entity = createEntitySummary({
      id: 'agent-1',
      entityKind: 'agent',
      templateName: 'agent-template',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent 1',
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="edit"
          kind="agent"
          templates={templates}
          entity={entity}
          onSubmit={vi.fn()}
          isSubmitting={false}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const templateSelect = await screen.findByLabelText('Template');
    expect(templateSelect).toBeDisabled();
    expect(templateSelect).toHaveTextContent('agent-template-title');

    await screen.findByText('Profile');
  });

  it('includes attachment relations for agent selections', async () => {
    const templates = [createTemplate('agent-template', 'agent')];
    const entity = createEntitySummary({
      id: 'agent-1',
      entityKind: 'agent',
      templateName: 'agent-template',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent 1',
    });
    const graphNodes = [
      createGraphNode({ id: 'tool-1', kind: 'Tool', template: 'manageTool', title: 'Manage tool' }),
      createGraphNode({ id: 'mcp-1', kind: 'MCP', template: 'mcpServer', title: 'Filesystem MCP' }),
      createGraphNode({ id: 'workspace-1', kind: 'Workspace', template: 'workspace', title: 'Worker Pool' }),
      createGraphNode({ id: 'memory-1', kind: 'Workspace', template: 'memory', title: 'Global Memory' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'agent-1', sourceHandle: 'tools', target: 'tool-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'mcp', target: 'mcp-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'workspace', target: 'workspace-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'memory', target: 'memory-1' }),
    ];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = setupUser();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="edit"
          kind="agent"
          templates={templates}
          entity={entity}
          onSubmit={onSubmit}
          isSubmitting={false}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const templateSelect = screen.getByRole('combobox', { name: 'Template' });
    expect(templateSelect).toBeDisabled();

    await screen.findByPlaceholderText('e.g., Casey Quinn');

    const modelInput = screen.getByPlaceholderText('gpt-4');
    await user.clear(modelInput);
    await user.type(modelInput, 'claude-3');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.entityKind).toBe('agent');
    expect(payload.template).toBe('agent-template');
    expect(payload.title).toBe(entity.title);
    expect(payload.config).toMatchObject({ model: 'claude-3' });
    expect(payload.config).not.toHaveProperty('title');
    expect(payload.config).not.toHaveProperty('template');
    expect(payload.config).not.toHaveProperty('kind');
    const relations = payload.relations ?? [];
    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agentTools', selections: ['tool-1'], attachmentKind: 'agent_tool' }),
        expect.objectContaining({
          id: 'agentMcpServers',
          selections: ['mcp-1'],
          attachmentKind: 'agent_mcpServer',
        }),
        expect.objectContaining({
          id: 'agentWorkspaceConfiguration',
          selections: ['workspace-1'],
          attachmentKind: 'agent_workspaceConfiguration',
        }),
        expect.objectContaining({
          id: 'agentMemoryBuckets',
          selections: ['memory-1'],
          attachmentKind: 'agent_memoryBucket',
        }),
      ]),
    );

    await user.clear(modelInput);
    await user.type(modelInput, 'qwen-plus');
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    const secondPayload = onSubmit.mock.calls[1][0];
    expect(secondPayload.title).toBe(entity.title);
    expect(secondPayload.config).toMatchObject({ model: 'qwen-plus' });
    expect(secondPayload.config).not.toHaveProperty('title');
    expect(secondPayload.config).not.toHaveProperty('template');
    expect(secondPayload.config).not.toHaveProperty('kind');
  });

  it('includes attachment relations for agent selections', async () => {
    const templates = [createTemplate('agent-template', 'agent')];
    const entity = createEntitySummary({
      id: 'agent-1',
      entityKind: 'agent',
      templateName: 'agent-template',
      templateKind: 'agent',
      rawTemplateKind: 'agent',
      title: 'Agent 1',
    });
    const graphNodes = [
      createGraphNode({ id: 'tool-1', kind: 'Tool', template: 'manageTool', title: 'Manage tool' }),
      createGraphNode({ id: 'mcp-1', kind: 'MCP', template: 'mcpServer', title: 'Filesystem MCP' }),
      createGraphNode({ id: 'workspace-1', kind: 'Workspace', template: 'workspace', title: 'Worker Pool' }),
      createGraphNode({ id: 'memory-1', kind: 'Workspace', template: 'memory', title: 'Global Memory' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'agent-1', sourceHandle: 'tools', target: 'tool-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'mcp', target: 'mcp-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'workspace', target: 'workspace-1' }),
      createGraphEdge({ source: 'agent-1', sourceHandle: 'memory', target: 'memory-1' }),
    ];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = setupUser();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="edit"
          kind="agent"
          templates={templates}
          entity={entity}
          onSubmit={onSubmit}
          isSubmitting={false}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const submitButton = await screen.findByRole('button', { name: /save changes/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    const relations = payload.relations ?? [];
    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agentTools',
          selections: ['tool-1'],
          attachmentKind: TEAM_ATTACHMENT_KIND.agentTool,
        }),
        expect.objectContaining({
          id: 'agentMcpServers',
          selections: ['mcp-1'],
          attachmentKind: TEAM_ATTACHMENT_KIND.agentMcpServer,
        }),
        expect.objectContaining({
          id: 'agentWorkspaceConfiguration',
          selections: ['workspace-1'],
          attachmentKind: TEAM_ATTACHMENT_KIND.agentWorkspaceConfiguration,
        }),
        expect.objectContaining({
          id: 'agentMemoryBuckets',
          selections: ['memory-1'],
          attachmentKind: TEAM_ATTACHMENT_KIND.agentMemoryBucket,
          attachmentKind: TEAM_ATTACHMENT_KIND.agentMemoryBucket,
        }),
      ]),
    );
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
    const user = setupUser();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="edit"
          kind="workspace"
          templates={templates}
          entity={entity}
          onSubmit={onSubmit}
          isSubmitting={false}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const titleInput = await screen.findByLabelText('Entity title');
    await user.clear(titleInput);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

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

  it('includes workspace attachment for MCP servers', async () => {
    const templates = [createTemplate('mcp-template', 'mcp')];
    const entity = createEntitySummary({
      id: 'mcp-1',
      entityKind: 'mcp',
      templateName: 'mcp-template',
      templateKind: 'mcp',
      rawTemplateKind: 'mcp',
      title: 'Filesystem MCP',
    });
    const graphNodes = [
      createGraphNode({ id: 'workspace-1', kind: 'Workspace', template: 'workspace', title: 'Workspace One' }),
      createGraphNode({ id: 'memory-1', kind: 'Workspace', template: 'memory', title: 'Memory Bucket' }),
    ];
    const graphEdges = [
      createGraphEdge({ source: 'mcp-1', sourceHandle: 'workspace', target: 'workspace-1' }),
    ];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = setupUser();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EntityUpsertForm
          mode="edit"
          kind="mcp"
          templates={templates}
          entity={entity}
          onSubmit={onSubmit}
          isSubmitting={false}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const submitButton = await screen.findByRole('button', { name: /save changes/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    const relations = payload.relations ?? [];
    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mcpServerWorkspace',
          selections: ['workspace-1'],
          attachmentKind: TEAM_ATTACHMENT_KIND.mcpServerWorkspaceConfiguration,
=======
          attachmentKind: 'agent_memoryBucket',
>>>>>>> e9a06cd8 (fix(platform-ui): align team api contracts)
        }),
      ]),
    );
  });
});
