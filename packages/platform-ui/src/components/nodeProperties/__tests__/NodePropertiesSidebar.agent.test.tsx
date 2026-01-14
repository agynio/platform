import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';
import type { TemplateSchema } from '@/api/types/graph';

const templateStore = new Map<string, TemplateSchema>();

vi.mock('@/lib/graph/templates.provider', async () => {
  const actual = await vi.importActual<any>('@/lib/graph/templates.provider');
  return {
    ...actual,
    useTemplatesCache: () => ({
      templates: Array.from(templateStore.values()),
      ready: true,
      error: null,
      refresh: vi.fn(),
      getTemplate: (name: string | null | undefined) => {
        if (!name) return undefined;
        return templateStore.get(name) ?? undefined;
      },
    }),
  };
});

describe('NodePropertiesSidebar - agent', () => {
  beforeEach(() => {
    templateStore.clear();
  });

  it('renders profile inputs and applies default title fallback', () => {
    const onConfigChange = vi.fn();
    const config: NodeConfig = {
      kind: 'Agent',
      title: 'Custom Dispatch',
      template: 'agent',
      name: 'Casey Quinn',
      role: 'Lead Planner',
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      restrictOutput: false,
      restrictionMessage: 'Use at least one tool before finishing.',
      restrictionMaxInjections: 0,
      queue: { debounceMs: 1000, whenBusy: 'wait', processBuffer: 'allTogether' },
      summarization: { keepTokens: 200, maxTokens: 600, prompt: 'Summaries go here.' },
    } as NodeConfig;

    const state: NodeState = { status: 'ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const expectedPlaceholder = 'Casey Quinn (Lead Planner)';
    expect(screen.getByText(expectedPlaceholder)).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue('Custom Dispatch') as HTMLInputElement;
    expect(titleInput.placeholder).toBe(expectedPlaceholder);
    expect(titleInput.value).toBe('Custom Dispatch');
    expect(screen.queryByText('Custom Dispatch')).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g., Casey Quinn') as HTMLInputElement;
    expect(nameInput.value).toBe('Casey Quinn');
    fireEvent.change(nameInput, { target: { value: '  Delta  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Delta' }));

    const roleInput = screen.getByPlaceholderText('e.g., Incident Commander') as HTMLInputElement;
    expect(roleInput.value).toBe('Lead Planner');
    fireEvent.change(roleInput, { target: { value: '  Support  ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'Support' }));

    fireEvent.change(titleInput, { target: { value: '   ' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ title: '' }));
  });

  it('uses combined name and role placeholder when title empty', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: 'Casey Quinn',
      role: 'Lead Planner',
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={vi.fn()}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={false}
        isActionPending={false}
      />,
    );

    const titleInput = screen.getByPlaceholderText('Casey Quinn (Lead Planner)') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('uses name-only placeholder when role missing', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: 'Nova',
      role: undefined,
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={vi.fn()}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={false}
        isActionPending={false}
      />,
    );

    const titleInput = screen.getByPlaceholderText('Nova') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('uses role-only placeholder when name missing', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: undefined,
      role: 'Navigator',
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={vi.fn()}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={false}
        isActionPending={false}
      />,
    );

    const titleInput = screen.getByPlaceholderText('Navigator') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('falls back to Agent placeholder when profile empty', () => {
    const config: NodeConfig = {
      kind: 'Agent',
      title: '',
      template: 'agent',
      name: undefined,
      role: undefined,
    } as NodeConfig;

    const state: NodeState = { status: 'not_ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={vi.fn()}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={false}
        isActionPending={false}
      />,
    );

    const titleInput = screen.getByPlaceholderText('Agent') as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('renders system prompt preview with connected tools', async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();

    templateStore.set('callAgentTool', {
      name: 'callAgentTool',
      title: 'Call Agent',
      kind: 'tool',
      description: 'Coordinate escalations',
      sourcePorts: {},
      targetPorts: {},
    });

    templateStore.set('shellTool', {
      name: 'shellTool',
      title: 'Shell Tool',
      kind: 'tool',
      description: 'Execute shell commands',
      sourcePorts: {},
      targetPorts: {},
    });

    const config: NodeConfig = {
      kind: 'Agent',
      title: 'Incident Lead',
      template: 'agent',
      systemPrompt: 'Available tools:\n{{#tools}}{{title}} - {{prompt}} :: {{description}}\n{{/tools}}',
    } as NodeConfig;

    const state: NodeState = { status: 'ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
        nodeId="agent-node"
        graphNodes={[
          {
            id: 'agent-node',
            template: 'agent',
            kind: 'Agent',
            title: 'Incident Lead',
            x: 0,
            y: 0,
            status: 'ready',
            config: {},
            ports: { inputs: [], outputs: [] },
          },
          {
            id: 'tool-1',
            template: 'callAgentTool',
            kind: 'Tool',
            title: 'Call Agent Tool',
            x: 100,
            y: 200,
            status: 'ready',
            config: { name: 'call_agent_custom', description: 'Escalate immediately' },
            ports: { inputs: [], outputs: [] },
          },
          {
            id: 'tool-2',
            template: 'shellTool',
            kind: 'Tool',
            title: 'Shell Tool',
            x: 200,
            y: 300,
            status: 'ready',
            config: {},
            ports: { inputs: [], outputs: [] },
          },
        ] as any}
        graphEdges={[
          {
            id: 'agent-tools-edge-1',
            source: 'agent-node',
            target: 'tool-1',
            sourceHandle: 'tools',
            targetHandle: '$',
          },
          {
            id: 'agent-tools-edge-2',
            source: 'agent-node',
            target: 'tool-2',
            sourceHandle: 'tools',
            targetHandle: '$',
          },
        ] as any}
      />,
    );

    const promptTextarea = screen.getByPlaceholderText('You are a helpful assistant...') as HTMLTextAreaElement;
    expect(promptTextarea.value).toBe('Available tools:\n{{#tools}}{{title}} - {{prompt}} :: {{description}}\n{{/tools}}');

    const fullscreenButton = screen.getByTitle('Open fullscreen markdown editor');
    await user.click(fullscreenButton);

    await screen.findByText('Edit your content with live markdown preview');
    expect(document.body).toHaveTextContent(/Call Agent - Escalate immediately :: Escalate immediately/);
    expect(document.body).toHaveTextContent(/Shell Tool - Execute shell commands :: Execute shell commands/);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
  });

  it('renders manage tool prompts using worker agent system prompts', async () => {
    const user = userEvent.setup();

    templateStore.set('manageTool', {
      name: 'manageTool',
      title: 'Manage Tool',
      kind: 'Tool',
      description: 'Coordinate managed agents',
      sourcePorts: {},
      targetPorts: {},
      staticConfigSchema: {},
    } as TemplateSchema);

    const config: NodeConfig = {
      kind: 'Agent',
      title: 'Manager Agent',
      template: 'agent',
      name: 'Manager',
      model: 'gpt-4',
      systemPrompt: 'Context: {{#tools}}{{prompt}}{{/tools}}',
    } as NodeConfig;
    const state: NodeState = { status: 'ready' };

    render(
      <NodePropertiesSidebar
        config={config}
        state={state}
        onConfigChange={vi.fn()}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
        nodeId="agent-1"
        graphNodes={[
          {
            id: 'agent-1',
            template: 'agent',
            kind: 'Agent',
            title: 'Manager Agent',
            x: 0,
            y: 0,
            status: 'ready',
            config,
            ports: { inputs: [], outputs: [] },
          },
          {
            id: 'manage-1',
            template: 'manageTool',
            kind: 'Tool',
            title: 'Manage Tool',
            x: 100,
            y: 0,
            status: 'ready',
            config: { prompt: 'Workers: {{#agents}}{{name}} => {{prompt}};{{/agents}}' },
            ports: { inputs: [], outputs: [] },
          },
          {
            id: 'worker-1',
            template: 'agent',
            kind: 'Agent',
            title: 'Worker Agent',
            x: 200,
            y: 0,
            status: 'ready',
            config: { name: 'Worker', systemPrompt: 'Worker summary' },
            ports: { inputs: [], outputs: [] },
          },
        ] as any}
        graphEdges={[
          {
            id: 'edge-agent-manage',
            source: 'agent-1',
            target: 'manage-1',
            sourceHandle: 'tools',
            targetHandle: '$',
          },
          {
            id: 'edge-manage-worker',
            source: 'manage-1',
            target: 'worker-1',
            sourceHandle: 'agent',
            targetHandle: '$',
          },
        ] as any}
      />,
    );

    const fullscreenButton = screen.getByTitle('Open fullscreen markdown editor');
    await user.click(fullscreenButton);

    expect(
      await screen.findByText((content) => content.includes('Workers: Worker => Worker summary;')),
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
  });
});
