import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';

const latestReferenceProps: { current: any } = { current: null };

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

describe('NodePropertiesSidebar - shell tool', () => {
  beforeEach(() => {
    latestReferenceProps.current = null;
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
