import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { ChipsMultiSelect, type ChipsMultiSelectOption } from '../ChipsMultiSelect';

const options: ChipsMultiSelectOption[] = [
  { value: 'tool-1', label: 'Tool One' },
  { value: 'tool-2', label: 'Tool Two' },
  { value: 'tool-3', label: 'Tool Three' },
];

function ControlledMultiSelect({ initialValues = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initialValues);
  return (
    <ChipsMultiSelect
      id="tools"
      label="Tools"
      value={value}
      options={options}
      onChange={setValue}
      helperText="Pick one or more tools."
    />
  );
}

describe('ChipsMultiSelect', () => {
  it('adds chips when options are selected', async () => {
    render(<ControlledMultiSelect />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('option', { name: 'Tool One' }));
    expect(screen.getByLabelText('Remove Tool One')).toBeVisible();

    await user.click(screen.getByRole('option', { name: 'Tool Two' }));
    expect(screen.getByLabelText('Remove Tool Two')).toBeVisible();
  });

  it('removes a chip when clicking the remove button', async () => {
    render(<ControlledMultiSelect />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('option', { name: 'Tool One' }));
    const removeButton = screen.getByLabelText('Remove Tool One');
    await user.click(removeButton);

    expect(screen.queryByLabelText('Remove Tool One')).not.toBeInTheDocument();
  });

  it('removes the last chip when pressing Backspace with an empty query', async () => {
    render(<ControlledMultiSelect initialValues={['tool-1', 'tool-2']} />);
    const user = userEvent.setup();

    const input = screen.getByLabelText('Filter options');
    input.focus();
    await user.keyboard('{Backspace}');

    expect(screen.queryByLabelText('Remove Tool Two')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Remove Tool One')).toBeVisible();
  });
});
