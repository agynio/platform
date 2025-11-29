import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from '../types';
import { TOOL_NAME_HINT } from '../toolNameHint';

function setup(overrides?: Partial<NodePropertiesSidebarProps>) {
  const { config: configOverride, state: stateOverride, onConfigChange: overrideOnConfigChange, ...rest } = overrides ?? {};
  const onConfigChange = overrideOnConfigChange ?? vi.fn();
  const config: NodeConfig = {
    kind: 'Tool',
    title: 'Shell tool',
    template: 'shellTool',
    ...(configOverride as Record<string, unknown> | undefined),
  } as NodeConfig;
  const state: NodeState = {
    status: 'ready',
    ...(stateOverride ?? {}),
  } as NodeState;

  render(
    <NodePropertiesSidebar
      config={config}
      state={state}
      displayTitle={config.title}
      onConfigChange={onConfigChange}
      tools={[]}
      enabledTools={[]}
      {...rest}
    />,
  );

  const input = screen.getByPlaceholderText('shell_command');
  return { input: input as HTMLInputElement, onConfigChange };
}

describe('NodePropertiesSidebar tool name field', () => {
  it('renders canonical placeholder for the tool template', () => {
    const { input } = setup();
    expect(input.placeholder).toBe('shell_command');
  });

  it('shows the name requirements in a tooltip', async () => {
    const user = userEvent.setup();
    setup();

    const tooltipTrigger = screen.getByLabelText(TOOL_NAME_HINT);
    await user.hover(tooltipTrigger);

    await waitFor(() => {
      expect(screen.getAllByText(TOOL_NAME_HINT).length).toBeGreaterThan(0);
    });
  });

  it('emits updates for valid tool names', async () => {
    const user = userEvent.setup();
    const { input, onConfigChange } = setup();

    await user.clear(input);
    onConfigChange.mockClear();
    await user.type(input, 'custom_tool');

    expect(onConfigChange).toHaveBeenCalled();
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toEqual({ name: 'custom_tool' });
    expect(screen.queryByText('Name must match ^[a-z0-9_]{1,64}$')).not.toBeInTheDocument();
  });

  it('trims whitespace before validating and persisting', async () => {
    const user = userEvent.setup();
    const { input, onConfigChange } = setup();

    await user.clear(input);
    onConfigChange.mockClear();
    await user.type(input, '  custom_tool  ');

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalled();
    });
    expect(onConfigChange.mock.calls.at(-1)?.[0]).toEqual({ name: 'custom_tool' });
    expect(screen.queryByText('Name must match ^[a-z0-9_]{1,64}$')).not.toBeInTheDocument();
  });

  it('rejects invalid tool names and shows an error', async () => {
    const user = userEvent.setup();
    const { input, onConfigChange } = setup();

    onConfigChange.mockClear();
    await user.clear(input);
    await user.type(input, 'bad-name');

    const emittedNames = onConfigChange.mock.calls.map((call) => call[0].name);
    expect(emittedNames).not.toContain('bad-name');
    expect(await screen.findByText('Name must match ^[a-z0-9_]{1,64}$')).toBeInTheDocument();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the persisted name when the input is emptied', async () => {
    const user = userEvent.setup();
    const { input, onConfigChange } = setup({
      config: { kind: 'Tool', title: 'Shell tool', name: 'custom_tool' } as NodeConfig,
    });

    onConfigChange.mockClear();
    await user.clear(input);

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith({ name: undefined });
    });
    expect(screen.queryByText('Name must match ^[a-z0-9_]{1,64}$')).not.toBeInTheDocument();
  });

  it('clears the name when the trimmed input is empty', async () => {
    const user = userEvent.setup();
    const { input, onConfigChange } = setup({
      config: { kind: 'Tool', title: 'Shell tool', name: 'custom_tool' } as NodeConfig,
    });

    onConfigChange.mockClear();
    await user.clear(input);
    await user.type(input, '   ');

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith({ name: undefined });
    });
    expect(screen.queryByText('Name must match ^[a-z0-9_]{1,64}$')).not.toBeInTheDocument();
  });
});
