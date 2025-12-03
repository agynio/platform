import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { server, TestProviders } from '../../integration/testUtils';
import NixPackagesSection from '@/components/nix/NixPackagesSection';

describe('NixPackagesSection (uncontrolled)', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('hydrates persisted packages and emits updated config on removal', async () => {
    const onUpdateConfig = vi.fn();
    const persistedConfig = {
      nix: {
        packages: [
          {
            kind: 'nixpkgs',
            name: 'git',
            version: '2.0.0',
            commitHash: 'abcd1234',
            attributePath: 'pkgs.git',
          },
        ],
      },
    } as Record<string, unknown>;

    render(
      <TestProviders>
        <NixPackagesSection config={persistedConfig} onUpdateConfig={onUpdateConfig} />
      </TestProviders>,
    );

    const selectedList = await screen.findByRole('list', { name: 'Selected Nix packages' });
    expect(selectedList).toBeInTheDocument();
    expect(screen.getByText('git')).toBeInTheDocument();

    const select = screen.getByLabelText('Select version for git') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('2.0.0'));

    expect(onUpdateConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Remove git'));

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalled());
    const payload = onUpdateConfig.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    const nix = (payload?.nix ?? {}) as { packages?: unknown };
    expect(nix.packages).toEqual([]);
  });

  it('preserves custom flake entries when editing nixpkgs selections', async () => {
    const onUpdateConfig = vi.fn();
    const persistedConfig = {
      nix: {
        packages: [
          {
            kind: 'flakeRepo',
            repository: 'github:agyn/example',
            commitHash: '1234567890abcdef1234567890abcdef12345678',
            attributePath: 'packages.default',
            ref: 'main',
          },
          {
            kind: 'nixpkgs',
            name: 'git',
            version: '2.0.0',
            commitHash: 'abcd1234',
            attributePath: 'pkgs.git',
          },
        ],
      },
    } as Record<string, unknown>;

    render(
      <TestProviders>
        <NixPackagesSection config={persistedConfig} onUpdateConfig={onUpdateConfig} />
      </TestProviders>,
    );

    await screen.findByRole('list', { name: 'Selected Nix packages' });
    fireEvent.click(screen.getByLabelText('Remove git'));

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalled());
    const payload = onUpdateConfig.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const nix = (payload?.nix ?? {}) as { packages?: unknown };
    expect(nix.packages).toEqual([
      {
        kind: 'flakeRepo',
        repository: 'github:agyn/example',
        commitHash: '1234567890abcdef1234567890abcdef12345678',
        attributePath: 'packages.default',
        ref: 'main',
      },
    ]);
  });
});
