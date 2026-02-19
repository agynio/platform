import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MultiSelectDropdown, type MultiSelectDropdownOption } from '../MultiSelectDropdown';

const options: MultiSelectDropdownOption[] = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' },
];

function ControlledDropdown({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <MultiSelectDropdown
      aria-label="Related items"
      value={value}
      options={options}
      onChange={setValue}
      placeholder="Select related items"
    />
  );
}

describe('MultiSelectDropdown', () => {
  it('opens the dropdown, toggles selections, and renders chips inline', async () => {
    const user = userEvent.setup();
    render(<ControlledDropdown />);

    const trigger = screen.getByRole('combobox', { name: 'Related items' });
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByLabelText('Remove Alpha')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove Beta')).toBeInTheDocument();

    expect(listbox).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.queryByLabelText('Remove Alpha')).not.toBeInTheDocument();
  });

  it('allows Backspace removal when the dropdown is closed', async () => {
    const user = userEvent.setup();
    render(<ControlledDropdown initial={['alpha', 'beta']} />);

    const trigger = screen.getByRole('combobox', { name: 'Related items' });
    trigger.focus();

    await user.keyboard('{Backspace}');
    await waitFor(() => expect(screen.queryByLabelText('Remove Beta')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Remove Alpha')).toBeInTheDocument();
  });

  it('supports keyboard navigation for option toggling', async () => {
    const user = userEvent.setup();
    render(<ControlledDropdown />);

    const trigger = screen.getByRole('combobox', { name: 'Related items' });
    trigger.focus();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByLabelText('Remove Alpha')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByLabelText('Remove Beta')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
