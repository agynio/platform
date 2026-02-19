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
import type * as GraphEntitiesModule from '@/features/entities/api/graphEntities';

// Toggle once Slack relation template + handles are finalized.
const RELATION_PLACEHOLDER_TESTS_ENABLED = false as const;

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
    expect(payload.config).toMatchObject({
      template: 'workspace-template',
      title: 'My Workspace',
      kind: 'Workspace',
      image: 'docker.io/library/node:18',
    });

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
});

const describeRelations = RELATION_PLACEHOLDER_TESTS_ENABLED ? describe : describe.skip;

describeRelations('EntityFormDialog relations scaffolding', () => {
  beforeAll(() => {
    vi.resetModules();
    vi.doMock('@/lib/graph/templates.provider', () => ({
      useTemplatesCache: () => ({
        templates: [],
        ready: true,
        error: null,
        refresh: vi.fn(),
        getTemplate: () => undefined,
      }),
    }));
    vi.doMock('@/features/entities/api/graphEntities', async () => {
      const actual = (await vi.importActual('@/features/entities/api/graphEntities')) as GraphEntitiesModule;
      const placeholderDefinition = {
        id: 'slackTriggerAgent',
        label: 'Agent destination',
        description: 'Routes Slack trigger events to an agent.',
        templateNames: ['slackTrigger'],
        sourceHandle: 'agent',
        targetHandle: 'input',
        targetKind: 'agent',
      } as const;
      return {
        ...actual,
        getEntityRelationDefinitions: (templateName?: string) =>
          templateName === 'slackTrigger' ? [placeholderDefinition] : [],
      } satisfies GraphEntitiesModule;
    });
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('renders Slack relation select and persists changes', async () => {
    const { EntityFormDialog: RelationDialog } = await import('../EntityFormDialog');
    const templates = [createTemplate('slackTrigger', 'trigger'), createTemplate('support-agent', 'agent')];
    const entity = createEntitySummary({
      id: 'trigger-1',
      templateName: 'slackTrigger',
      templateKind: 'trigger',
      rawTemplateKind: 'trigger',
      title: 'Slack Trigger',
    });
    const graphNodes: GraphNodeConfig[] = [
      {
        id: 'trigger-1',
        template: 'slackTrigger',
        kind: 'Trigger',
        title: 'Slack Trigger',
        x: 0,
        y: 0,
        status: 'ready',
        ports: { inputs: [], outputs: [] },
      },
      {
        id: 'agent-1',
        template: 'support-agent',
        kind: 'Agent',
        title: 'Agent One',
        x: 100,
        y: 0,
        status: 'ready',
        ports: { inputs: [], outputs: [] },
      },
      {
        id: 'agent-2',
        template: 'support-agent',
        kind: 'Agent',
        title: 'Agent Two',
        x: 200,
        y: 0,
        status: 'ready',
        ports: { inputs: [], outputs: [] },
      },
    ];
    const graphEdges: GraphPersistedEdge[] = [
      { id: 'edge-rel', source: 'trigger-1', sourceHandle: 'agent', target: 'agent-1', targetHandle: 'input' },
    ];
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RelationDialog
          open
          mode="edit"
          kind="trigger"
          templates={templates}
          entity={entity}
          onOpenChange={vi.fn()}
          onSubmit={onSubmit}
          isSubmitting={false}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
        />
      </QueryClientProvider>,
    );

    const relationSelect = await screen.findByLabelText('Agent destination');
    expect(relationSelect).toHaveValue('agent-1');

    await userEvent.selectOptions(relationSelect, 'agent-2');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.relations).toEqual([
      expect.objectContaining({ sourceHandle: 'agent', targetId: 'agent-2', targetHandle: 'input' }),
    ]);
  });
});
