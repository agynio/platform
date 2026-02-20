import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { EnvEditorProps } from '../EnvEditor';
import { EnvEditor } from '../EnvEditor';
import { readEnvList, serializeEnvVars } from '../utils';

const latestReferenceProps: { current: any } = { current: null };

vi.mock('../../ReferenceInput', async () => {
  const actual = await vi.importActual('../../ReferenceInput');
  return {
    ReferenceInput: (props: any) => {
      latestReferenceProps.current = props;
      return <actual.ReferenceInput {...props} />;
    },
  };
});

const noop = () => {};

function ControlledEnvEditor() {
  const [configRecord, setConfigRecord] = React.useState<{ env?: Array<Record<string, unknown>> }>(() => ({
    env: [{ name: 'API_KEY', value: '', source: 'static' }],
  }));
  const envVars = React.useMemo(() => readEnvList(configRecord.env), [configRecord.env]);

  const handleValueChange = React.useCallback((index: number, value: string) => {
    const next = envVars.map((envVar, idx) => (idx === index ? { ...envVar, value } : envVar));
    setConfigRecord((prev) => ({
      ...prev,
      env: serializeEnvVars(next),
    }));
  }, [envVars]);

  return (
    <EnvEditor
      title="Environment Variables"
      isOpen
      onOpenChange={noop}
      envVars={envVars}
      onAdd={noop}
      onRemove={noop}
      onNameChange={noop}
      onValueChange={handleValueChange}
      onValueFocus={noop}
      onSourceTypeChange={noop}
      secretSuggestions={['secret/data']}
      variableSuggestions={['API_TOKEN']}
    />
  );
}

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

  beforeAll(() => {
    if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    }
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

    const referenceInput = screen.getByPlaceholderText('Value or reference...');
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

  it('keeps the value input focused across multi-character typing', () => {
    render(<ControlledEnvEditor />);

    const valueInput = screen.getByPlaceholderText('Value or reference...') as HTMLInputElement;
    valueInput.focus();
    expect(document.activeElement).toBe(valueInput);

    fireEvent.change(valueInput, { target: { value: 'A' } });
    expect(document.activeElement).toBe(valueInput);

    fireEvent.change(valueInput, { target: { value: 'AB' } });
    expect(document.activeElement).toBe(valueInput);
  });

  it('prevents backspace events from reaching an outer delete handler', () => {
    const outerHandler = vi.fn();
    render(
      <div onKeyDown={outerHandler}>
        <EnvEditor {...baseEnv} />
      </div>,
    );

    const valueInput = screen.getByPlaceholderText('Value or reference...');
    valueInput.focus();
    fireEvent.keyDown(valueInput, { key: 'Backspace', code: 'Backspace' });

    expect(outerHandler).not.toHaveBeenCalled();
  });
});
