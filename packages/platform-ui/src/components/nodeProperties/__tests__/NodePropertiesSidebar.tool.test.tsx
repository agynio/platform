import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';
import type { TemplateSchema } from '@/api/types/graph';

const latestReferenceProps: { current: any } = { current: null };
const templateStore = new Map<string, TemplateSchema>();

const latestUpdate = (mockFn: ReturnType<typeof vi.fn>, key: string) => {
  const calls = mockFn.mock.calls;
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const payload = calls[index]?.[0];
    if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }
  return undefined;
};

vi.mock('../../ReferenceInput', () => ({
  ReferenceInput: (props: any) => {
    latestReferenceProps.current = props;
    return (
      <input
        data-testid="reference-input"
        value={props.value}
        onChange={(event) => props.onChange?.({ target: { value: event.target.value } })}
        onFocus={() => props.onFocus?.()}
      />
    );
  },
}));

vi.mock('../../Dropdown', () => ({
  Dropdown: (props: any) => {
    const options = Array.isArray(props.options) ? props.options : [];
    return (
      <select
        data-testid={props['data-testid'] ?? 'dropdown'}
        value={props.value ?? ''}
        onChange={(event) => props.onValueChange?.(event.target.value)}
        aria-label={props.label ?? props.placeholder ?? 'dropdown'}
      >
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
}));

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

describe('NodePropertiesSidebar - shell tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
    templateStore.clear();
  });

  it('renders shell tool controls and propagates config updates', async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Shell Tool',
      template: 'shellTool',
      workdir: '/workspace',
      env: [{ id: 'env-1', name: 'TOKEN', value: 'initial', source: 'static' }],
      executionTimeoutMs: 1000,
      idleTimeoutMs: 2000,
      outputLimitChars: 3000,
      chunkCoalesceMs: 40,
      chunkSizeBytes: 4096,
      clientBufferLimitBytes: 1024,
      logToPid1: true,
    } satisfies NodeConfig;
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

    const promptTextarea = screen.getByPlaceholderText('Describe how shell access should be used...') as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: 'Run read-only diagnostics' } });
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Run read-only diagnostics' }),
    );

    const workdirInput = screen.getByPlaceholderText('/workspace') as HTMLInputElement;
    fireEvent.change(workdirInput, { target: { value: '/tmp' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ workdir: '/tmp' }));

    const envInput = screen.getByTestId('reference-input') as HTMLInputElement;
    fireEvent.change(envInput, { target: { value: 'updated' } });

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.arrayContaining([
          expect.objectContaining({ name: 'TOKEN', value: 'updated' }),
        ]),
      }),
    );

    const limitsTrigger = screen.getByRole('button', { name: /limits/i });
    await user.click(limitsTrigger);
    const executionTimeoutInput = screen.getByPlaceholderText('3600000') as HTMLInputElement;
    fireEvent.change(executionTimeoutInput, { target: { value: '2500' } });
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ executionTimeoutMs: 2500 }));

    const logToggle = screen.getByLabelText(/log to pid 1/i);
    await user.click(logToggle);
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ logToPid1: false }));
  });
});

describe('NodePropertiesSidebar - manage tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
    templateStore.clear();
  });

  it('renders prompt preview in fullscreen editor and updates manage tool config', async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Manage Tool',
      template: 'manageTool',
      mode: 'sync',
      timeoutMs: 1500,
      prompt: 'Hello {{#agents}}{{name}} ({{role}}){{/agents}}',
    } satisfies NodeConfig;
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
        nodeId="manage-1"
        graphNodes={[
          {
            id: 'manage-1',
            template: 'manageTool',
            kind: 'Tool',
            title: 'Manage Tool',
            x: 100,
            y: 0,
            status: 'ready',
            config,
            ports: { inputs: [], outputs: [] },
          },
          {
            id: 'agent-1',
            template: 'agent-template',
            kind: 'Agent',
            title: 'Agent One',
            x: 0,
            y: 0,
            status: 'not_ready',
            config: { name: 'Alice', role: 'R&D Lead', systemPrompt: '' },
            ports: { inputs: [], outputs: [] },
          },
        ] as any}
        graphEdges={[
          {
            id: 'manage-1-agent__agent-1-$',
            source: 'manage-1',
            target: 'agent-1',
            sourceHandle: 'agent',
            targetHandle: '$',
          },
        ] as any}
      />,
    );

    expect(screen.queryByText('Hello Alice (R&D Lead)')).not.toBeInTheDocument();

    const promptTextarea = screen.getByPlaceholderText('Coordinate managed agents and assign roles...') as HTMLTextAreaElement;
    expect(promptTextarea.value).toBe('Hello {{#agents}}{{name}} ({{role}}){{/agents}}');

    fireEvent.change(promptTextarea, { target: { value: 'Team summary: {{#agents}}{{name}}{{/agents}}' } });
    expect(latestUpdate(onConfigChange, 'prompt')).toBe('Team summary: {{#agents}}{{name}}{{/agents}}');

    const fullscreenButton = screen.getByTitle('Open fullscreen markdown editor');
    await user.click(fullscreenButton);

    expect(await screen.findByText((content) => content.includes('Hello Alice (R&D Lead)'))).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    const dropdown = screen.getByTestId('dropdown') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'async' } });
    expect(latestUpdate(onConfigChange, 'mode')).toBe('async');

    const timeoutInput = screen.getByPlaceholderText('0') as HTMLInputElement;
    fireEvent.change(timeoutInput, { target: { value: '5000' } });
    expect(latestUpdate(onConfigChange, 'timeoutMs')).toBe(5000);
  });
});

describe('NodePropertiesSidebar - call agent tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
    templateStore.clear();
  });

  it('updates description and response mode', () => {
    const onConfigChange = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Call Agent Tool',
      template: 'callAgentTool',
      response: 'sync',
      description: 'Call another agent.',
    } satisfies NodeConfig;
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

    const promptTextarea = screen.getByPlaceholderText('Describe how this tool should be used...') as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: 'Coordinate escalations' } });
    expect(latestUpdate(onConfigChange, 'prompt')).toBe('Coordinate escalations');

    const descriptionTextarea = screen.getByPlaceholderText('Describe what this tool does...') as HTMLTextAreaElement;
    fireEvent.change(descriptionTextarea, { target: { value: 'New description' } });
    expect(latestUpdate(onConfigChange, 'description')).toBe('New description');

    const dropdown = screen.getByTestId('dropdown') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'ignore' } });
    expect(latestUpdate(onConfigChange, 'response')).toBe('ignore');
  });
});

describe('NodePropertiesSidebar - send slack message tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
  });

  it('updates bot token and ensures secret suggestions are loaded', () => {
    const onConfigChange = vi.fn();
    const ensureSecretKeys = vi.fn();
    const ensureVariableKeys = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Slack Tool',
      template: 'sendSlackMessageTool',
      bot_token: { kind: 'vault', mount: 'secret', path: 'slack', key: 'BOT_TOKEN' },
    } satisfies NodeConfig;
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
        ensureSecretKeys={ensureSecretKeys}
        ensureVariableKeys={ensureVariableKeys}
        secretKeys={['secret/slack/BOT_TOKEN']}
        variableKeys={[]}
      />,
    );

    const promptTextarea = screen.getByPlaceholderText('Describe when to use this Slack tool...') as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: 'Escalate urgent incidents' } });
    expect(latestUpdate(onConfigChange, 'prompt')).toBe('Escalate urgent incidents');

    const tokenInput = screen.getByTestId('reference-input') as HTMLInputElement;
    fireEvent.focus(tokenInput);
    expect(ensureSecretKeys).toHaveBeenCalled();

    fireEvent.change(tokenInput, { target: { value: 'secret/slack/OVERRIDE' } });
    expect(latestUpdate(onConfigChange, 'bot_token')).toEqual({ kind: 'vault', mount: 'secret', path: 'slack', key: 'OVERRIDE' });
  });
});

describe('NodePropertiesSidebar - github clone repo tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
  });

  it('updates token and auth override configuration', () => {
    const onConfigChange = vi.fn();

    const config: NodeConfig = {
      kind: 'Tool',
      title: 'Clone Repo',
      template: 'githubCloneRepoTool',
    } satisfies NodeConfig;
    const state: NodeState = { status: 'ready' };

    let currentConfig: NodeConfig = config;

    const { rerender } = render(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const promptTextarea = screen.getByPlaceholderText(
      'Describe how this repository clone helper should be used...'
    ) as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: 'Clone repositories for analysis' } });
    expect(latestUpdate(onConfigChange, 'prompt')).toBe('Clone repositories for analysis');

    const tokenInput = screen.getByTestId('reference-input') as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: 'ghp_123' } });
    const latestToken = latestUpdate(onConfigChange, 'token') as string;
    expect(latestToken).toBe('ghp_123');
    currentConfig = { ...currentConfig, token: latestToken };
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const dropdown = screen.getByTestId('dropdown') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'env' } });
    const firstAuthUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(firstAuthUpdate).toEqual({ source: 'env' });
    currentConfig = { ...currentConfig, authRef: firstAuthUpdate } as NodeConfig;
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const envInput = screen.getByPlaceholderText('GH_TOKEN') as HTMLInputElement;
    fireEvent.change(envInput, { target: { value: 'MY_GH_TOKEN' } });
    const envAuthUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(envAuthUpdate).toEqual({ source: 'env', envVar: 'MY_GH_TOKEN' });
    currentConfig = { ...currentConfig, authRef: envAuthUpdate } as NodeConfig;
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    fireEvent.change(dropdown, { target: { value: 'vault' } });
    const vaultAuthUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(vaultAuthUpdate).toEqual({ source: 'vault' });
    currentConfig = { ...currentConfig, authRef: vaultAuthUpdate } as NodeConfig;
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    const mountInput = screen.getByPlaceholderText('secret') as HTMLInputElement;
    const pathInput = screen.getByPlaceholderText('github/token') as HTMLInputElement;
    const keyInput = screen.getByPlaceholderText('GH_TOKEN') as HTMLInputElement;
    fireEvent.change(mountInput, { target: { value: 'kv' } });
    const mountUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(mountUpdate).toEqual({ source: 'vault', mount: 'kv' });
    currentConfig = { ...currentConfig, authRef: mountUpdate } as NodeConfig;
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    fireEvent.change(pathInput, { target: { value: 'github/ci' } });
    const pathUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(pathUpdate).toEqual({ source: 'vault', mount: 'kv', path: 'github/ci' });
    currentConfig = { ...currentConfig, authRef: pathUpdate } as NodeConfig;
    rerender(
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        onConfigChange={onConfigChange}
        onProvision={vi.fn()}
        onDeprovision={vi.fn()}
        canProvision={false}
        canDeprovision={true}
        isActionPending={false}
      />,
    );

    fireEvent.change(keyInput, { target: { value: 'TOKEN' } });
    const keyUpdate = latestUpdate(onConfigChange, 'authRef') as Record<string, unknown>;
    expect(keyUpdate).toEqual({ source: 'vault', mount: 'kv', path: 'github/ci', key: 'TOKEN' });
  });
});
