import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SlackTriggerConfigView from '@/components/configViews/SlackTriggerConfigView';

vi.mock('@/features/secrets/utils/flatVault', () => ({
  listAllSecretPaths: () => Promise.resolve(['kv/prod/app', 'kv/prod/bot']),
}));

vi.mock('@/features/variables/api', () => ({
  listVariables: () =>
    Promise.resolve([
      { key: 'SLACK_APP_TOKEN' },
      { key: 'SLACK_BOT_TOKEN' },
    ]),
}));

const pointerProto = Element.prototype as unknown as {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

type SlackTriggerCfg = {
  app_token?: unknown;
  bot_token?: unknown;
};

describe('SlackTriggerConfigView', () => {
  it('renders both app_token and bot_token fields and emits normalized shapes', async () => {
    const user = userEvent.setup();
    let cfg: SlackTriggerCfg = {};
    render(
      <SlackTriggerConfigView
        templateName="slackTrigger"
        value={{}}
        onChange={(v) => (cfg = v)}
        readOnly={false}
        disabled={false}
      />,
    );

    // Ensure labels are present
    expect(screen.getByText('App token')).toBeInTheDocument();
    expect(screen.getByText('Bot token')).toBeInTheDocument();

    const appField = screen.getByText('App token').parentElement as HTMLElement;
    const botField = screen.getByText('Bot token').parentElement as HTMLElement;
    const appInput = within(appField).getAllByRole('textbox')[0];
    const botInput = within(botField).getAllByRole('textbox')[0];
    const appTrigger = within(appField).getAllByRole('combobox')[0];
    const botTrigger = within(botField).getAllByRole('combobox')[0];

    // Set app token static value
    await user.type(appInput, 'xapp-abc');
    // Set bot token static value
    await user.type(botInput, 'xoxb-123');

    expect(cfg.app_token).toBe('xapp-abc');
    expect(cfg.bot_token).toBe('xoxb-123');

    // Switch bot token to vault and set mount/path/key
    await user.click(botTrigger);
    const botListbox = await screen.findByRole('listbox');
    const secretOption = within(botListbox).getByRole('option', { name: /secret/i });
    await user.click(secretOption);
    await user.clear(botInput);
    fireEvent.change(botInput, { target: { value: 'mount/path/key' } });
    expect(cfg.bot_token).toMatchObject({ kind: 'vault', mount: 'mount', path: 'path', key: 'key' });

    // Ensure switching back to text works and placeholder updates automatically
    await user.click(appTrigger);
    const appListbox = await screen.findByRole('listbox');
    const textOption = within(appListbox).getByRole('option', { name: /plain text/i });
    await user.click(textOption);
    await user.clear(appInput);
    await user.type(appInput, 'xapp-xyz');
    expect(cfg.app_token).toBe('xapp-xyz');
  });

  it('validates prefixes and vault refs', async () => {
    const user = userEvent.setup();
    let errors: string[] = [];
    const history: string[][] = [];
    render(
      <SlackTriggerConfigView
        templateName="slackTrigger"
        value={{}}
        onChange={() => {}}
        readOnly={false}
        disabled={false}
        onValidate={(e) => {
          errors = e;
          history.push(e);
        }}
      />,
    );

    const appField = screen.getByText('App token').parentElement as HTMLElement;
    const botField = screen.getByText('Bot token').parentElement as HTMLElement;
    const appInput = within(appField).getAllByRole('textbox')[0];
    const botInput = within(botField).getAllByRole('textbox')[0];
    const appTrigger = within(appField).getAllByRole('combobox')[0];
    const botTrigger = within(botField).getAllByRole('combobox')[0];

    // Invalid prefixes initially (empty) should report required errors once touched
    await user.type(appInput, 'bad-app');
    await waitFor(() => {
      expect(history.some((batch) => batch.includes('app_token must start with xapp-'))).toBe(true);
    });

    await user.type(botInput, 'bad-bot');
    await waitFor(() => {
      expect(history.some((batch) => batch.includes('bot_token must start with xoxb-'))).toBe(true);
    });

    // Switch to vault and test regex
    await user.click(appTrigger);
    const appListbox = await screen.findByRole('listbox');
    const secretOption = within(appListbox).getByRole('option', { name: /secret/i });
    await user.click(secretOption);
    await user.clear(appInput);
    fireEvent.change(appInput, { target: { value: 'mount/app/TOKEN' } });
    await waitFor(() => {
      expect(errors.some((e) => e.includes('app_token must start'))).toBe(false);
      expect(errors.some((e) => e.includes('app_token vault ref'))).toBe(false);
    });

    await user.click(botTrigger);
    const botListbox = await screen.findByRole('listbox');
    const botSecretOption = within(botListbox).getByRole('option', { name: /secret/i });
    await user.click(botSecretOption);
    await user.clear(botInput);
    fireEvent.change(botInput, { target: { value: 'bad' } });
    await waitFor(() => {
      expect(history.some((batch) => batch.includes('bot_token vault ref must be mount/path/key'))).toBe(true);
    });
    await user.clear(botInput);
    fireEvent.change(botInput, { target: { value: 'm/p/k' } });
    await waitFor(() => {
      expect(errors.includes('bot_token vault ref must be mount/path/key')).toBe(false);
    });

    // No masking behavior asserted (out of scope)
  });

  it('surfaces secret and variable suggestions after focus', async () => {
    const user = userEvent.setup();
    render(
      <SlackTriggerConfigView
        templateName="slackTrigger"
        value={{}}
        onChange={() => {}}
        readOnly={false}
        disabled={false}
      />,
    );

    const appField = screen.getByText('App token').parentElement as HTMLElement;
    const appInput = within(appField).getAllByRole('textbox')[0];
    const appTrigger = within(appField).getAllByRole('combobox')[0];

    await user.click(appTrigger);
    const appListbox = await screen.findByRole('listbox');
    const secretOption = within(appListbox).getByRole('option', { name: /secret/i });
    await user.click(secretOption);

    await user.click(appInput);
    await screen.findByText('kv/prod/app');

    const botField = screen.getByText('Bot token').parentElement as HTMLElement;
    const botInput = within(botField).getAllByRole('textbox')[0];
    const botTrigger = within(botField).getAllByRole('combobox')[0];

    await user.click(botTrigger);
    const botListbox = await screen.findByRole('listbox');
    const variableOption = within(botListbox).getByRole('option', { name: /variable/i });
    await user.click(variableOption);

    await user.click(botInput);
    await screen.findByText('SLACK_BOT_TOKEN');
  });
});
