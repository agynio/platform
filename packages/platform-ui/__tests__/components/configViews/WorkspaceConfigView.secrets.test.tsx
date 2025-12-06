import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, vi } from 'vitest';

vi.mock('@/features/secrets/utils/flatVault', () => ({
  listAllSecretPaths: () => Promise.resolve(['kv/workspace/db', 'kv/workspace/api']),
}));

vi.mock('@/features/variables/api', () => ({
  listVariables: () => Promise.resolve([]),
}));

import WorkspaceConfigView from '@/components/configViews/WorkspaceConfigView';
import { TooltipProvider } from '@/components/ui/tooltip';

const pointerTargets: Array<Partial<Record<string, unknown>>> = [
  Element.prototype as Partial<Record<string, unknown>>,
  HTMLElement.prototype as Partial<Record<string, unknown>>,
  Document.prototype as Partial<Record<string, unknown>>,
];

if (typeof SVGElement !== 'undefined') {
  pointerTargets.push(SVGElement.prototype as Partial<Record<string, unknown>>);
}

if (typeof Window !== 'undefined') {
  pointerTargets.push(Window.prototype as Partial<Record<string, unknown>>);
}

pointerTargets.forEach((proto) => {
  if (!('setPointerCapture' in proto)) {
    Object.defineProperty(proto, 'setPointerCapture', {
      value: () => {},
      configurable: true,
      writable: true,
    });
  }

  if (!('releasePointerCapture' in proto)) {
    Object.defineProperty(proto, 'releasePointerCapture', {
      value: () => {},
      configurable: true,
      writable: true,
    });
  }

  if (!('hasPointerCapture' in proto)) {
    Object.defineProperty(proto, 'hasPointerCapture', {
      value: () => false,
      configurable: true,
      writable: true,
    });
  }
});

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('WorkspaceConfigView secret suggestions', () => {
  it('selects a secret suggestion and preserves canonical value', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    let cfg: Record<string, unknown> = {};

    render(
      <TooltipProvider delayDuration={0}>
        <WorkspaceConfigView
          templateName="workspace"
          value={{}}
          onChange={(v) => (cfg = v)}
          readOnly={false}
          disabled={false}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByText('Add env'));
    fireEvent.change(screen.getByTestId('env-name-0'), { target: { value: 'DB_SECRET' } });

    const envField = screen.getByTestId('env-value-0').parentElement?.parentElement;
    if (!envField) throw new Error('Env field container not found');
    const sourceTrigger = within(envField).getByRole('combobox');
    sourceTrigger.focus();
    await user.keyboard('{ArrowDown}');
    const secretOption = await screen.findByRole('option', { name: /secret/i });
    await user.click(secretOption);

    const valueInput = screen.getByTestId('env-value-0');
    await user.click(valueInput);
    const suggestion = await screen.findByText('kv/workspace/db');
    await user.click(suggestion);

    expect(cfg.env?.[0]).toMatchObject({
      name: 'DB_SECRET',
      source: 'vault',
    });
    expect(cfg.env?.[0]?.value).toEqual({ kind: 'vault', mount: 'kv', path: 'workspace', key: 'db' });
  });
});
