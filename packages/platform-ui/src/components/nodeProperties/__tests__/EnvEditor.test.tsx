import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EnvEditorProps } from '../EnvEditor';
import { EnvEditor } from '../EnvEditor';
import { readEnvList } from '../utils';

const latestReferenceProps: { current: any } = { current: null };

vi.mock('../../ReferenceInput', () => ({
  ReferenceInput: (props: any) => {
    latestReferenceProps.current = props;
    return (
      <input data-testid="reference-input" value={props.value} onChange={props.onChange} onFocus={props.onFocus} />
    );
  },
}));

describe('nodeProperties/EnvEditor', () => {
  const baseEnv: EnvEditorProps = {
    title: 'Environment Variables',
    isOpen: true,
    onOpenChange: vi.fn(),
    envVars: readEnvList([{ name: 'API_KEY', value: 'secret/data', source: 'vault' }]),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onNameChange: vi.fn(),
    onValueChange: vi.fn(),
    onValueFocus: vi.fn(),
    onSourceTypeChange: vi.fn(),
    secretSuggestions: ['secret/data'],
    variableSuggestions: ['API_TOKEN'],
  };

  beforeEach(() => {
    latestReferenceProps.current = null;
  });

  it('emits callbacks for env mutations', async () => {
    const props = {
      ...baseEnv,
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onNameChange: vi.fn(),
      onValueChange: vi.fn(),
      onValueFocus: vi.fn(),
      onSourceTypeChange: vi.fn(),
    } satisfies EnvEditorProps;

    render(<EnvEditor {...props} />);

    const trigger = screen.getByRole('button', { name: /environment variables/i });
    await userEvent.click(trigger);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    const nameInput = screen.getByPlaceholderText('VARIABLE_NAME');
    fireEvent.change(nameInput, { target: { value: 'NEW_KEY' } });
    expect(props.onNameChange).toHaveBeenCalledWith(0, 'NEW_KEY');

    const referenceInput = screen.getByTestId('reference-input');
    fireEvent.focus(referenceInput);
    expect(props.onValueFocus).toHaveBeenCalledWith(0);

    fireEvent.change(referenceInput, { target: { value: 'secret/updated' } });
    expect(props.onValueChange).toHaveBeenCalledWith(0, 'secret/updated');

    expect(typeof latestReferenceProps.current?.onSourceTypeChange).toBe('function');
    latestReferenceProps.current.onSourceTypeChange?.('variable');
    expect(props.onSourceTypeChange).toHaveBeenCalledWith(0, 'variable');

    const removeButton = screen.getByRole('button', { name: /remove variable/i });
    await userEvent.click(removeButton);
    expect(props.onRemove).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByRole('button', { name: /add variable/i }));
    expect(props.onAdd).toHaveBeenCalled();
  });
});
