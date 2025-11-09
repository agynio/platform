import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SlackTriggerConfigView from '@/components/configViews/SlackTriggerConfigView';

type SlackTriggerCfg = {
  app_token?: { value: string; source?: 'static' | 'vault' };
  bot_token?: { value: string; source?: 'static' | 'vault' };
};

describe('SlackTriggerConfigView', () => {
  it('renders both app_token and bot_token fields and emits normalized shapes', () => {
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

    const sources = screen.getAllByTestId('ref-source') as HTMLSelectElement[];
    const values = screen.getAllByTestId('ref-value') as HTMLInputElement[];

    // Set app token static value
    fireEvent.change(values[0], { target: { value: 'xapp-abc' } });
    // Set bot token static value
    fireEvent.change(values[1], { target: { value: 'xoxb-123' } });

    expect(cfg.app_token).toEqual({ value: 'xapp-abc', source: 'static' });
    expect(cfg.bot_token).toEqual({ value: 'xoxb-123', source: 'static' });

    // Switch bot token to vault and set mount/path/key
    fireEvent.change(sources[1], { target: { value: 'vault' } });
    fireEvent.change(values[1], { target: { value: 'mount/path/key' } });
    expect(cfg.bot_token).toEqual({ value: 'mount/path/key', source: 'vault' });
  });

  it('validates prefixes and vault refs', () => {
    let errors: string[] = [];
    render(
      <SlackTriggerConfigView
        templateName="slackTrigger"
        value={{}}
        onChange={() => {}}
        readOnly={false}
        disabled={false}
        onValidate={(e) => (errors = e)}
      />,
    );

    const sources = screen.getAllByTestId('ref-source') as HTMLSelectElement[];
    const values = screen.getAllByTestId('ref-value') as HTMLInputElement[];

    // Invalid prefixes initially (empty) should report required errors once touched
    fireEvent.change(values[0], { target: { value: 'bad-app' } });
    fireEvent.change(values[1], { target: { value: 'bad-bot' } });
    expect(errors.includes('app_token must start with xapp-')).toBe(true);
    expect(errors.includes('bot_token must start with xoxb-')).toBe(true);

    // Switch to vault and test regex
    fireEvent.change(sources[0], { target: { value: 'vault' } });
    fireEvent.change(values[0], { target: { value: 'mount/app/TOKEN' } });
    expect(errors.some((e) => e.includes('app_token'))).toBe(false);

    fireEvent.change(sources[1], { target: { value: 'vault' } });
    fireEvent.change(values[1], { target: { value: 'bad' } });
    expect(errors.includes('bot_token vault ref must be mount/path/key')).toBe(true);
    fireEvent.change(values[1], { target: { value: 'm/p/k' } });
    expect(errors.includes('bot_token vault ref must be mount/path/key')).toBe(false);

    // No masking behavior asserted (out of scope)
  });
});
