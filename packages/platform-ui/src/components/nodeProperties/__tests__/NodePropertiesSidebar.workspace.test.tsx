import React, { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from '../types';

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

function WorkspaceSidebarHarness({
  initialConfig,
  stateOverride,
  onConfigChange,
  extraProps,
}: {
  initialConfig?: Partial<NodeConfig>;
  stateOverride?: Partial<NodeState>;
  onConfigChange: (updates: Partial<NodeConfig>) => void;
  extraProps?: Partial<NodePropertiesSidebarProps>;
}) {
  const [config, setConfig] = useState<NodeConfig>(
    {
      kind: 'Workspace',
      title: 'Workspace Node',
      image: 'ubuntu:latest',
      ...(initialConfig as Record<string, unknown> | undefined),
    } as NodeConfig,
  );

  const handleConfigChange = useCallback(
    (updates: Partial<NodeConfig>) => {
      setConfig((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined) {
            delete next[key];
          } else {
            next[key] = value;
          }
        }
        return next as NodeConfig;
      });
      onConfigChange(updates);
    },
    [onConfigChange],
  );

  const state: NodeState = {
    status: 'ready',
    ...(stateOverride ?? {}),
  } as NodeState;

  return (
    <NodePropertiesSidebar
      config={config}
      state={state}
      displayTitle={config.title}
      onConfigChange={handleConfigChange}
      tools={[]}
      enabledTools={[]}
      {...extraProps}
    />
  );
}

function renderWorkspaceSidebar(overrides?: Partial<NodePropertiesSidebarProps>) {
  const { config: configOverride, state: stateOverride, onConfigChange: overrideOnConfigChange, ...rest } = overrides ?? {};
  const onConfigChange = overrideOnConfigChange ?? vi.fn();

  render(
    <WorkspaceSidebarHarness
      initialConfig={configOverride as Partial<NodeConfig> | undefined}
      stateOverride={stateOverride as Partial<NodeState> | undefined}
      onConfigChange={onConfigChange}
      extraProps={rest}
    />,
  );

  const cpuInput = screen.getByPlaceholderText('0.5 or 500m') as HTMLInputElement;
  const memoryInput = screen.getByPlaceholderText('512Mi') as HTMLInputElement;
  return { onConfigChange, cpuInput, memoryInput };
}

function renderWorkspaceTemplateSidebar(template: string, overrides?: Partial<NodeConfig>) {
  const onConfigChange = vi.fn();
  render(
    <WorkspaceSidebarHarness
      initialConfig={{ template, ...(overrides ?? {}) } as Partial<NodeConfig>}
      onConfigChange={onConfigChange}
    />,
  );
  return { onConfigChange };
}

describe('NodePropertiesSidebar workspace limits', () => {
  it('renders persisted workspace limit values', () => {
    const { cpuInput, memoryInput } = renderWorkspaceSidebar({
      config: {
        kind: 'Workspace',
        title: 'Workspace Node',
        cpu_limit: '750m',
        memory_limit: 2048,
      } as NodeConfig,
    });

    expect(cpuInput.value).toBe('750m');
    expect(memoryInput.value).toBe('2048');
  });

  it('emits config updates when editing CPU and memory limits', async () => {
    const user = userEvent.setup();
    const { onConfigChange, cpuInput, memoryInput } = renderWorkspaceSidebar();

    onConfigChange.mockClear();
    await user.clear(cpuInput);
    await user.type(cpuInput, ' 500m ');
    await waitFor(() => {
      const cpuCalls = onConfigChange.mock.calls.filter((call) =>
        Object.prototype.hasOwnProperty.call(call[0], 'cpu_limit'),
      );
      expect(cpuCalls.at(-1)?.[0]).toEqual({ cpu_limit: '500m' });
    });

    onConfigChange.mockClear();
    await user.clear(cpuInput);
    await waitFor(() => {
      const cpuCalls = onConfigChange.mock.calls.filter((call) =>
        Object.prototype.hasOwnProperty.call(call[0], 'cpu_limit'),
      );
      expect(cpuCalls.at(-1)?.[0]).toEqual({ cpu_limit: undefined });
    });

    onConfigChange.mockClear();
    await user.clear(memoryInput);
    await user.type(memoryInput, ' 1Gi ');
    await waitFor(() => {
      const memoryCalls = onConfigChange.mock.calls.filter((call) =>
        Object.prototype.hasOwnProperty.call(call[0], 'memory_limit'),
      );
      expect(memoryCalls.at(-1)?.[0]).toEqual({ memory_limit: '1Gi' });
    });

    onConfigChange.mockClear();
    await user.clear(memoryInput);
    await waitFor(() => {
      const memoryCalls = onConfigChange.mock.calls.filter((call) =>
        Object.prototype.hasOwnProperty.call(call[0], 'memory_limit'),
      );
      expect(memoryCalls.at(-1)?.[0]).toEqual({ memory_limit: undefined });
    });
  });
});

describe('NodePropertiesSidebar workspace template overrides', () => {
  it('renders the memory template view with scope control and persists changes', async () => {
    const user = userEvent.setup();
    const { onConfigChange } = renderWorkspaceTemplateSidebar('memory', {
      scope: 'global',
      staticConfig: {
        scope: 'perThread',
      },
    } as Partial<NodeConfig>);

    expect(screen.queryByText('Memory workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/static configuration/i)).not.toBeInTheDocument();

    const dropdown = screen.getByTestId('dropdown') as HTMLSelectElement;
    expect(dropdown.value).toBe('global');

    await user.selectOptions(dropdown, 'perThread');

    expect(onConfigChange).toHaveBeenCalledWith({ scope: 'perThread' });
    await waitFor(() => {
      expect(dropdown.value).toBe('perThread');
    });
  });

  it('falls back to static config scope when node config omits scope', () => {
    renderWorkspaceTemplateSidebar('memory', {
      staticConfig: {
        scope: 'perThread',
      },
    } as Partial<NodeConfig>);

    const dropdown = screen.getByTestId('dropdown') as HTMLSelectElement;
    expect(dropdown.value).toBe('perThread');
  });

  it('renders the memory connector template view with static config values', () => {
    renderWorkspaceTemplateSidebar('memoryConnector', {
      staticConfig: {
        placement: 'after_system',
        content: 'tree',
        maxChars: 4096,
      },
    } as Partial<NodeConfig>);

    expect(screen.getByText('Memory connector')).toBeInTheDocument();
    expect(screen.getByText('after_system')).toBeInTheDocument();
    expect(screen.getByText('tree')).toBeInTheDocument();
    expect(screen.getByText('4,096')).toBeInTheDocument();
  });
});
