import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@hautech/ui';
import ReferenceEnvField from '../ReferenceEnvField';

describe('ReferenceEnvField', () => {
  it('adds rows and emits array', () => {
    let last: any = null;
    render(
      <TooltipProvider delayDuration={0}>
        <ReferenceEnvField value={{ FOO: '1' }} onChange={(v) => (last = v)} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByTestId('env-add'));
    fireEvent.change(screen.getByTestId('env-key-1'), { target: { value: 'BAR' } });
    fireEvent.change(screen.getByTestId('env-value-1'), { target: { value: '2' } });
    expect(Array.isArray(last)).toBe(true);
    expect(last[1]).toEqual({ key: 'BAR', value: '2', source: 'static' });
  });

  it('renders controls in order and uses icon-only remove', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <ReferenceEnvField value={[{ key: 'FOO', value: '1', source: 'static' }]} onChange={() => {}} />
      </TooltipProvider>,
    );
    const row = screen.getByTestId('env-key-0').closest('div');
    expect(row).toBeTruthy();
    // The order should be: Key input, Value input, Source trigger button, Remove button
    const inputsAndButtons = row!.querySelectorAll('input, button');
    expect(inputsAndButtons.length).toBeGreaterThanOrEqual(3);
    expect(inputsAndButtons[0]).toBe(screen.getByTestId('env-key-0'));
    expect(inputsAndButtons[1]).toBe(screen.getByTestId('env-value-0'));
    expect(screen.getByTestId('env-source-trigger-0')).toBeTruthy();
    const removeBtn = screen.getByLabelText('Remove variable');
    expect(removeBtn).toBeTruthy();
  });


  it('keyboard a11y: Enter opens menu and Enter selects option', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <ReferenceEnvField value={[{ key: 'FOO', value: '', source: 'static' }]} onChange={() => {}} />
      </TooltipProvider>,
    );
    const trigger = screen.getByTestId('env-source-trigger-0');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await screen.findByTestId('env-source-menu-0');
    // After opening, select vault via keyboard
    const vaultItem = screen.getByTestId('env-source-option-vault-0');
    vaultItem.focus();
    fireEvent.keyDown(vaultItem, { key: 'Enter' });
    const valueInput = screen.getByTestId('env-value-0') as HTMLInputElement;
    expect(valueInput.placeholder).toBe('mount/path/key');
  });
});
