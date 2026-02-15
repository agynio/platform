import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EntityFormDialog } from '../EntityFormDialog';
import type { GraphEntityKind, GraphEntitySummary, TemplateOption } from '@/features/entities/types';
import type { PersistedGraphNode } from '@agyn/shared';
import type { TemplateSchema } from '@/api/types/graph';

vi.mock('@/components/nodeProperties/EmbeddedNodeProperties', () => ({
  EmbeddedNodeProperties: ({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (partial: Record<string, unknown>) => void }) => (
    <div data-testid="embedded-node-properties">
      <label htmlFor="mock-title">Title</label>
      <input
        id="mock-title"
        aria-label="Entity title"
        value={(config.title as string) ?? ''}
        onChange={(event) => onConfigChange?.({ title: event.target.value })}
      />
    </div>
  ),
}));

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
  it('submits sanitized config for create mode', async () => {
    const templates = [createTemplate('workspace-template', 'workspace')];
    const entities = [createEntitySummary()];
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <EntityFormDialog
        open
        mode="create"
        kind="workspace"
        templates={templates}
        entities={entities}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    const templateSelect = screen.getByRole('combobox');
    fireEvent.change(templateSelect, { target: { value: 'workspace-template' } });

    const titleInput = await screen.findByLabelText('Entity title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '  My Workspace  ');

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
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('disables template selection and preserves data for edit mode', async () => {
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
      <EntityFormDialog
        open
        mode="edit"
        kind="agent"
        templates={templates}
        entities={[entity]}
        entity={entity}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    const templateSelect = screen.getByRole('combobox');
    expect(templateSelect).toBeDisabled();

    const titleInput = await screen.findByLabelText('Entity title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Agent');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.template).toBe('agent-template');
    expect(payload.config).toMatchObject({ title: 'Updated Agent' });
  });
});
