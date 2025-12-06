import React, { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodePropertiesSidebarProps, NodeState } from '../types';
import { TooltipProvider } from '@/components/ui/tooltip';

const pointerProto = Element.prototype as unknown as {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}

if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function WorkspaceEnvHarness({
  initialConfig,
  onConfigChange,
  extraProps,
}: {
  initialConfig?: Partial<NodeConfig>;
  onConfigChange: (updates: Partial<NodeConfig>) => void;
  extraProps?: Partial<NodePropertiesSidebarProps>;
}) {
  const [config, setConfig] = useState<NodeConfig>(
    {
      kind: 'Workspace',
      title: 'Workspace Node',
      env: [
        {
          id: 'env-1',
          name: 'DB_SECRET',
          value: 'kv/prod/app/TOKEN',
          source: 'vault',
        },
      ],
      ...(initialConfig as Record<string, unknown>),
    } as NodeConfig,
  );

  const handleConfigChange = useCallback(
    (updates: Partial<NodeConfig>) => {
      setConfig((prev) => ({ ...prev, ...updates } as NodeConfig));
      onConfigChange(updates);
    },
    [onConfigChange],
  );

  const state: NodeState = { status: 'ready' } as NodeState;

  return (
    <TooltipProvider delayDuration={0}>
      <NodePropertiesSidebar
        config={config}
        state={state}
        displayTitle={config.title}
        onConfigChange={handleConfigChange}
        tools={[]}
        enabledTools={[]}
        {...extraProps}
      />
    </TooltipProvider>
  );
}

describe('NodePropertiesSidebar workspace env suggestions', () => {
  it('shows secret suggestions on focus and emits canonical values', async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    const ensureSecretKeys = vi.fn().mockResolvedValue(['kv/prod/app/TOKEN', 'kv/prod/app/ALT']);

    render(
      <WorkspaceEnvHarness
        onConfigChange={onConfigChange}
        extraProps={{
          secretKeys: ['kv/prod/app/TOKEN', 'kv/prod/app/ALT'],
          ensureSecretKeys,
        }}
      />,
    );

    const valueInput = screen.getAllByPlaceholderText('Value or reference...')[0];
    await user.click(valueInput);

    await waitFor(() => expect(ensureSecretKeys).toHaveBeenCalled());
    const suggestion = await screen.findByText('kv/prod/app/ALT');
    await user.click(suggestion);

    const envCalls = onConfigChange.mock.calls.filter((call) => Array.isArray(call[0]?.env));
    const lastEnvCall = envCalls.at(-1)?.[0].env as Array<Record<string, unknown>> | undefined;
    expect(lastEnvCall?.[0]).toMatchObject({
      name: 'DB_SECRET',
      source: 'vault',
      value: {
        kind: 'vault',
        mount: 'kv',
        path: 'prod/app',
        key: 'ALT',
      },
    });
  });
});
