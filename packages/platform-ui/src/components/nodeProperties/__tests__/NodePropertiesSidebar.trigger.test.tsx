import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodePropertiesSidebar from '../index';
import type { NodeConfig, NodeState } from '../types';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function renderTriggerSidebar(overrides?: Partial<NodeConfig>) {
  const onConfigChange = vi.fn();
  const config: NodeConfig = {
    kind: 'Trigger',
    title: 'Slack trigger',
    template: 'slackTrigger',
    app_token: { kind: 'vault', mount: 'secret', path: 'slack', key: 'APP_TOKEN' },
    bot_token: { kind: 'var', name: 'SLACK_BOT_TOKEN' },
    ...(overrides as Record<string, unknown>),
  } as NodeConfig;

  const state: NodeState = { status: 'ready' } as NodeState;

  function Harness() {
    const [currentConfig, setCurrentConfig] = useState<NodeConfig>(config);
    const handleConfigChange = (patch: Partial<NodeConfig>) => {
      setCurrentConfig((previous) => ({ ...previous, ...patch }));
      onConfigChange(patch);
    };

    return (
      <NodePropertiesSidebar
        config={currentConfig}
        state={state}
        displayTitle={currentConfig.title}
        onConfigChange={handleConfigChange}
      />
    );
  }

  render(<Harness />);

  const appTokenInput = screen.getByPlaceholderText('Select or enter app token...') as HTMLInputElement;
  const botTokenInput = screen.getByPlaceholderText('Select or enter bot token...') as HTMLInputElement;

  return { onConfigChange, appTokenInput, botTokenInput };
}

function latestUpdate(mock: ReturnType<typeof vi.fn>, key: string) {
  for (let i = mock.mock.calls.length - 1; i >= 0; i -= 1) {
    const payload = mock.mock.calls[i]?.[0] as Record<string, unknown>;
    if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }
  return undefined;
}

describe('NodePropertiesSidebar Slack trigger references', () => {
  it('loads canonical values, preserves round-trip, and supports mode switching', async () => {
    const user = userEvent.setup();
    const { onConfigChange, appTokenInput, botTokenInput } = renderTriggerSidebar();

    expect(appTokenInput).toHaveValue('secret/slack/APP_TOKEN');
    expect(botTokenInput).toHaveValue('SLACK_BOT_TOKEN');

    onConfigChange.mockClear();
    await user.clear(appTokenInput);
    await waitFor(() => expect(appTokenInput).toHaveValue(''));
    fireEvent.change(appTokenInput, { target: { value: 'secret/slack/NEW_APP_TOKEN' } });
    await waitFor(() => expect(appTokenInput).toHaveValue('secret/slack/NEW_APP_TOKEN'));

    await waitFor(() => {
      expect(latestUpdate(onConfigChange, 'app_token')).toEqual({
        kind: 'vault',
        mount: 'secret',
        path: 'slack',
        key: 'NEW_APP_TOKEN',
      });
    });

    onConfigChange.mockClear();
    await user.clear(botTokenInput);
    await waitFor(() => expect(botTokenInput).toHaveValue(''));
    fireEvent.change(botTokenInput, { target: { value: 'SLACK_BOT_TOKEN_UPDATED' } });
    await waitFor(() => expect(botTokenInput).toHaveValue('SLACK_BOT_TOKEN_UPDATED'));

    await waitFor(() => {
      expect(latestUpdate(onConfigChange, 'bot_token')).toEqual({
        kind: 'var',
        name: 'SLACK_BOT_TOKEN_UPDATED',
      });
    });

    const [appSourceTrigger, botSourceTrigger] = screen.getAllByRole('combobox');

    onConfigChange.mockClear();
    await user.click(appSourceTrigger);
    const variableOption = await screen.findByText('Variable');
    await user.click(variableOption);

    await waitFor(() => {
      expect(appTokenInput).toHaveValue('');
      expect(latestUpdate(onConfigChange, 'app_token')).toEqual({ kind: 'var', name: '' });
    });

    onConfigChange.mockClear();
    fireEvent.change(appTokenInput, { target: { value: 'SLACK_APP_TOKEN_VAR' } });
    await waitFor(() => expect(appTokenInput).toHaveValue('SLACK_APP_TOKEN_VAR'));

    await waitFor(() => {
      expect(latestUpdate(onConfigChange, 'app_token')).toEqual({ kind: 'var', name: 'SLACK_APP_TOKEN_VAR' });
    });

    onConfigChange.mockClear();
    await user.click(botSourceTrigger);
    const secretOption = await screen.findByText('Secret');
    await user.click(secretOption);

    await waitFor(() => {
      expect(botTokenInput).toHaveValue('');
      expect(latestUpdate(onConfigChange, 'bot_token')).toEqual({ kind: 'vault', path: '', key: '' });
    });

    onConfigChange.mockClear();
    fireEvent.change(botTokenInput, { target: { value: 'secret/slack/BOT_SECRET' } });
    await waitFor(() => expect(botTokenInput).toHaveValue('secret/slack/BOT_SECRET'));

    await waitFor(() => {
      expect(latestUpdate(onConfigChange, 'bot_token')).toEqual({
        kind: 'vault',
        mount: 'secret',
        path: 'slack',
        key: 'BOT_SECRET',
      });
    });
  });
});
