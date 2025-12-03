import React, { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from '../types';

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
