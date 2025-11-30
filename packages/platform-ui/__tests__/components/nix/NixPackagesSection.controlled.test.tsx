import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from '../../integration/testUtils';
import NixPackagesSection from '@/components/nix/NixPackagesSection';
import type { NixPackageSelection } from '@/components/nix/types';

function Harness() {
  const [value, setValue] = useState<NixPackageSelection[]>([]);
  return (
    <TestProviders>
      <NixPackagesSection value={value} onChange={setValue} />
      <pre data-testid="nix-value">{JSON.stringify(value)}</pre>
    </TestProviders>
  );
}

describe('NixPackagesSection (controlled)', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('adds, selects channel, and removes packages via onChange', async () => {
    render(<Harness />);

    const input = screen.getByLabelText('Search Nix packages') as HTMLInputElement;
    // Focus is required for the listbox to open (component checks document.activeElement)
    input.focus();
    fireEvent.change(input, { target: { value: 'gi' } });

    // Wait for suggestion to appear and click it
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /gi/ }));

    // Selected list shows chosen item
    const selectedList = await screen.findByRole('list', { name: 'Selected Nix packages' });
    expect(selectedList).toBeInTheDocument();
    expect(screen.getByText(/gi/)).toBeInTheDocument();

    // Choose a channel (version label will be fetched via MSW)
    const select = screen.getByLabelText(/Select version for gi/) as HTMLSelectElement;
    // MSW returns versions: ['1.2.3','1.0.0']
    await waitFor(() => expect(select.querySelector('option[value="1.2.3"]')).not.toBeNull());
    fireEvent.change(select, { target: { value: '1.2.3' } });

    // Remove the package
    fireEvent.click(screen.getByLabelText('Remove gi'));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Selected Nix packages' })).not.toBeInTheDocument());
  });

  it('resolves and manages custom flake repositories', async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('GitHub repository'), { target: { value: 'agyn/example' } });
    fireEvent.change(screen.getByLabelText('Flake attribute'), {
      target: { value: 'packages.default' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    const repoList = await screen.findByRole('list', { name: 'Custom flake repositories' });
    expect(repoList).toBeInTheDocument();
    expect(screen.getByText(/agyn\/example#packages\.default/i)).toBeInTheDocument();

    await waitFor(() => {
      const text = screen.getByTestId('nix-value').textContent ?? '';
      expect(text).toContain('"kind":"flakeRepo"');
      expect(text).toContain('"repository":"github:agyn/example"');
      expect(text).toContain('"attributePath":"packages.default"');
    });

    const refreshButton = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement;
    fireEvent.click(refreshButton);
    await waitFor(() => expect(refreshButton.disabled).toBeFalsy());

    const removeButton = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(removeButton);
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Custom flake repositories' })).not.toBeInTheDocument());
  });
});
