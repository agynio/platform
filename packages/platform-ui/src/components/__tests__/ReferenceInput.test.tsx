import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

import { ReferenceInput } from '../ReferenceInput';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('ReferenceInput', () => {
  const secretKeys = ['secret/app/token', 'secret/app/alt'];
  const variableKeys = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN'];

  function SecretWrapper() {
    const [value, setValue] = useState('');
    return (
      <ReferenceInput
        value={value}
        onChange={(event) => setValue(event.target.value)}
        sourceType="secret"
        secretKeys={secretKeys}
        placeholder="Enter secret"
      />
    );
  }

  function ModeWrapper() {
    const [value, setValue] = useState('');
    const [sourceType, setSourceType] = useState<'text' | 'secret' | 'variable'>('secret');
    return (
      <ReferenceInput
        value={value}
        onChange={(event) => setValue(event.target.value)}
        sourceType={sourceType}
        onSourceTypeChange={setSourceType}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
        placeholder="Select reference"
      />
    );
  }

  it('shows all suggestions on focus for the active source type', async () => {
    const user = userEvent.setup();
    render(<SecretWrapper />);

    const input = screen.getByPlaceholderText('Enter secret');
    await user.click(input);

    expect(await screen.findByText('secret/app/token')).toBeInTheDocument();
    expect(screen.getByText('secret/app/alt')).toBeInTheDocument();
  });

  it('filters suggestions as the user types', async () => {
    const user = userEvent.setup();
    render(<SecretWrapper />);

    const input = screen.getByPlaceholderText('Enter secret');
    await user.click(input);
    await user.type(input, 'alt');

    expect(await screen.findByText('secret/app/alt')).toBeInTheDocument();
    expect(screen.queryByText('secret/app/token')).not.toBeInTheDocument();
  });

  it('switches modes and shows suggestions for the selected source', async () => {
    const user = userEvent.setup();
    render(<ModeWrapper />);

    const input = screen.getByPlaceholderText('Select reference');
    await user.click(input);
    expect(await screen.findByText('secret/app/token')).toBeInTheDocument();

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    const variableOption = await screen.findByText('Variable');
    await user.click(variableOption);

    await user.click(input);

    expect(await screen.findByText('SLACK_APP_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('SLACK_BOT_TOKEN')).toBeInTheDocument();
    expect(screen.queryByText('secret/app/token')).not.toBeInTheDocument();

    await user.type(input, 'bot');
    expect(await screen.findByText('SLACK_BOT_TOKEN')).toBeInTheDocument();
    expect(screen.queryByText('SLACK_APP_TOKEN')).not.toBeInTheDocument();
  });
});
