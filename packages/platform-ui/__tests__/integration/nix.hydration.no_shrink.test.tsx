import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from './testUtils';
import NixPackagesSection from '@/components/nix/NixPackagesSection';
import type { ContainerNixConfig, NixPackageSelection } from '@/components/nix/types';

type ConfigWithNix = Record<string, unknown> & { nix?: ContainerNixConfig };

interface HarnessApi {
  setConfig: (next: ConfigWithNix) => void;
  getConfig: () => ConfigWithNix;
}

const UncontrolledHarness = forwardRef<HarnessApi, {}>(function UncontrolledHarness(_props, ref) {
  const [config, setConfig] = useState<ConfigWithNix>({});
  const lastConfigRef = useRef<ConfigWithNix>(config);
  useImperativeHandle(ref, () => ({
    setConfig(next) {
      lastConfigRef.current = next;
      setConfig(next);
    },
    getConfig() {
      return lastConfigRef.current;
    },
  }));
  return (
    <TestProviders>
      <NixPackagesSection config={config} onUpdateConfig={(next) => { lastConfigRef.current = next as ConfigWithNix; setConfig(next as ConfigWithNix); }} />
    </TestProviders>
  );
});

describe('Nix hydration merge behavior (uncontrolled)', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('does not shrink local selection when incoming props contain fewer packages', async () => {
    const ref = React.createRef<HarnessApi>();
    render(<UncontrolledHarness ref={ref} />);

    const input = await screen.findByLabelText('Search Nix packages');
    ;(input as HTMLInputElement).focus();
    // Select htop
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop/ }));
    const selectHtop = await screen.findByLabelText(/Select version for htop/);
    await screen.findByRole('option', { name: '1.2.3' });
    fireEvent.change(selectHtop, { target: { value: '1.2.3' } });

    // Select git
    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'git' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /git/ }));
    const selectGit = await screen.findByLabelText(/Select version for git/);
    await screen.findByRole('option', { name: '1.0.0' });
    fireEvent.change(selectGit, { target: { value: '1.0.0' } });

    // Ensure both are shown before hydration
    await waitFor(() => {
      const selectedList = screen.getByRole('list', { name: 'Selected Nix packages' });
      expect(selectedList).toBeInTheDocument();
      expect(screen.getByText('htop')).toBeInTheDocument();
      expect(screen.getByText('git')).toBeInTheDocument();
    });

    // Simulate incoming props update containing only one entry (e.g., autosave reflect narrow set)
    const narrowPackages: NixPackageSelection[] = [
      { name: 'htop', version: '1.2.3', commitHash: 'abcd1234', attributePath: 'htop' },
    ];
    const nextConfig = { ...(ref.current?.getConfig() ?? {}), nix: { packages: narrowPackages } } as ConfigWithNix;
    ref.current?.setConfig(nextConfig);

    // Assert that local selection remains both after hydration (no shrink)
    await waitFor(() => {
      const selectedList = screen.getByRole('list', { name: 'Selected Nix packages' });
      const items = selectedList.querySelectorAll('li');
      expect(items.length).toBe(2);
      // Keep original order (htop first, then git)
      expect(items[0].textContent).toContain('htop');
      expect(items[1].textContent).toContain('git');
    });
  });
});

