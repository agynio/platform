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
    fireEvent.click(await screen.findByRole('option', { name: /gi \(gi\.attr\)/ }));

    // Selected list shows chosen item
    const selectedList = await screen.findByRole('list', { name: 'Selected Nix packages' });
    expect(selectedList).toBeInTheDocument();
    expect(screen.getByText(/gi \(gi\.attr\)/)).toBeInTheDocument();

    // Choose a channel (version label will be fetched via MSW)
    const select = screen.getByLabelText('Select version for gi (gi.attr)') as HTMLSelectElement;
    await waitFor(() => expect(select.querySelector('option[value="nixpkgs-unstable"]')?.getAttribute('disabled')).toBeNull());
    fireEvent.change(select, { target: { value: 'nixpkgs-unstable' } });

    // Remove the package
    fireEvent.click(screen.getByLabelText('Remove gi (gi.attr)'));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Selected Nix packages' })).not.toBeInTheDocument());
  });
});
