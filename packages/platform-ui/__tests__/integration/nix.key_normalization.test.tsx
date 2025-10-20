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

describe('Nix key normalization guard', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('skips hydration when same packages come back reordered or with different key ordering', async () => {
    const ref = React.createRef<HarnessApi>();
    render(<UncontrolledHarness ref={ref} />);

    const input = await screen.findByLabelText('Search Nix packages');
    ;(input as HTMLInputElement).focus();
    // Select htop and git
    fireEvent.change(input, { target: { value: 'htop' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /htop/ }));
    const selectHtop = await screen.findByLabelText(/Select version for htop/);
    await screen.findByRole('option', { name: '1.2.3' });
    fireEvent.change(selectHtop, { target: { value: '1.2.3' } });

    ;(input as HTMLInputElement).focus();
    fireEvent.change(input, { target: { value: 'git' } });
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('option', { name: /git/ }));
    const selectGit = await screen.findByLabelText(/Select version for git/);
    await screen.findByRole('option', { name: '1.0.0' });
    fireEvent.change(selectGit, { target: { value: '1.0.0' } });

    // Now simulate incoming same packages but reversed order
    const reversed: NixPackageSelection[] = [
      { name: 'git', version: '1.0.0', commitHash: 'abcd1234', attributePath: 'git' },
      { name: 'htop', version: '1.2.3', commitHash: 'abcd1234', attributePath: 'htop' },
    ];
    const nextConfig1 = { ...(ref.current?.getConfig() ?? {}), nix: { packages: reversed } } as ConfigWithNix;
    ref.current?.setConfig(nextConfig1);

    // Assert selection unchanged (still two items, order preserved locally)
    await waitFor(() => {
      const selectedList = screen.getByRole('list', { name: 'Selected Nix packages' });
      const items = selectedList.querySelectorAll('li');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('htop');
      expect(items[1].textContent).toContain('git');
    });

    // Same content but keys out of standard order inside objects (simulate)
    // Note: our stablePkgsKey canonicalizes order of keys; this only ensures guard stability.
    const shuffledKeyObjects: Array<Record<string, string>> = [
      // Different property order for htop
      { attributePath: 'htop', commitHash: 'abcd1234', version: '1.2.3', name: 'htop' } as any,
      // Different property order for git
      { commitHash: 'abcd1234', name: 'git', attributePath: 'git', version: '1.0.0' } as any,
    ];
    const nextConfig2 = { ...(ref.current?.getConfig() ?? {}), nix: { packages: shuffledKeyObjects as unknown as NixPackageSelection[] } } as ConfigWithNix;
    ref.current?.setConfig(nextConfig2);

    await waitFor(() => {
      const selectedList = screen.getByRole('list', { name: 'Selected Nix packages' });
      const items = selectedList.querySelectorAll('li');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('htop');
      expect(items[1].textContent).toContain('git');
    });
  });
});

