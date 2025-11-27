import React, { useState } from 'react';
import { vi } from 'vitest';
import type * as AgynUI from '@agyn/ui';

vi.mock('@agyn/ui', async (importOriginal) => {
  const actual = (await importOriginal()) as AgynUI;
  const PassThrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    ...actual,
    TooltipProvider: PassThrough,
    Tooltip: PassThrough,
    TooltipTrigger: PassThrough,
    TooltipContent: PassThrough,
  };
});

import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@agyn/ui';
import ReferenceEnvField from '../ReferenceEnvField';
import { readEnvList } from '@/components/nodeProperties/utils';

describe('ReferenceEnvField', () => {
  it('adds rows and emits array', () => {
    const initial = readEnvList([{ name: 'FOO', value: '1' }]);
    const latest: { current: ReturnType<typeof readEnvList> } = { current: initial };

    function Harness() {
      const [items, setItems] = useState(initial);
      return (
        <ReferenceEnvField
          value={items}
          onChange={(next) => {
            latest.current = next;
            setItems(next);
          }}
          addLabel="Add env"
        />
      );
    }

    render(
      <TooltipProvider delayDuration={0}>
        <Harness />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByTestId('env-add'));
    fireEvent.change(screen.getByTestId('env-name-1'), { target: { value: 'BAR' } });
    fireEvent.change(screen.getByTestId('env-value-1'), { target: { value: '2' } });
    expect(Array.isArray(latest.current)).toBe(true);
    expect(latest.current[1]).toMatchObject({ name: 'BAR', value: '2', source: 'static' });
  });

  it('renders controls in order and uses icon-only remove', () => {
    const initial = readEnvList([{ name: 'FOO', value: '1' }]);
    function Harness() {
      const [items, setItems] = useState(initial);
      return <ReferenceEnvField value={items} onChange={setItems} />;
    }

    render(
      <TooltipProvider delayDuration={0}>
        <Harness />
      </TooltipProvider>,
    );
    const row = screen.getByTestId('env-name-0').closest('div');
    expect(row).toBeTruthy();
    const inputsAndButtons = row!.querySelectorAll('input, button');
    expect(inputsAndButtons.length).toBeGreaterThanOrEqual(3);
    expect(inputsAndButtons[0]).toBe(screen.getByTestId('env-name-0'));
    expect(inputsAndButtons[1]).toBe(screen.getByTestId('env-value-0'));
    expect(screen.getByTestId('env-source-trigger-0')).toBeTruthy();
    const removeBtn = screen.getByLabelText('Remove variable');
    expect(removeBtn).toBeTruthy();
  });

  it('keyboard a11y: Enter opens menu and Enter selects option', async () => {
    const initial = readEnvList([{ name: 'FOO', value: '', source: 'static' }]);
    function Harness() {
      const [items, setItems] = useState(initial);
      return <ReferenceEnvField value={items} onChange={setItems} />;
    }

    render(
      <TooltipProvider delayDuration={0}>
        <Harness />
      </TooltipProvider>,
    );
    const trigger = screen.getByTestId('env-source-trigger-0');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = await screen.findByTestId('env-source-menu-0');
    const vaultItem = menu.querySelector('[data-testid="env-source-option-vault-0"]') as HTMLElement;
    expect(vaultItem).toBeTruthy();
    vaultItem.focus();
    fireEvent.keyDown(vaultItem, { key: 'Enter' });
    const valueInput = screen.getByTestId('env-value-0') as HTMLInputElement;
    expect(valueInput.placeholder).toBe('mount/path/key');
  });
});
