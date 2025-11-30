import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { server, TestProviders } from '../../integration/testUtils';
import NixPackagesSection from '@/components/nix/NixPackagesSection';
import type { NixPackageSelection } from '@/components/nix/types';
import * as nixApi from '@/api/modules/nix';

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

  it('keeps repo errors clear when cancelling an in-flight resolve', async () => {
    const resolveRepoSpy = vi.spyOn(nixApi, 'resolveRepo');
    const initialCommit = '1234567890abcdef1234567890abcdef12345678';
    const newCommit = '9999999999999999999999999999999999999999';
    const cancellationError = new AxiosError('canceled', AxiosError.ERR_CANCELED);
    cancellationError.code = AxiosError.ERR_CANCELED;
    cancellationError.name = 'CanceledError';

    const makeResponse = (repository: string, attr: string, commitHash: string, ref?: string) => {
      const canonicalRepo = repository.startsWith('github:') ? repository : `github:${repository}`;
      const effectiveRef = ref && ref.trim().length > 0 ? ref.trim() : 'main';
      return {
        repository: canonicalRepo,
        ref: effectiveRef,
        commitHash,
        attributePath: attr,
        flakeUri: `${canonicalRepo}/${commitHash}#${attr}`,
        attrCheck: 'ok' as const,
      };
    };

    let callCount = 0;
    resolveRepoSpy.mockImplementation((repository, attr, ref, signal) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(makeResponse(repository, attr, initialCommit, ref));
      }
      if (callCount === 2) {
        return new Promise((_, reject) => {
          const onAbort = () => {
            signal?.removeEventListener('abort', onAbort);
            reject(cancellationError);
          };
          if (!signal) {
            reject(cancellationError);
            return;
          }
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort);
          setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            reject(cancellationError);
          }, 5000);
        });
      }
      return Promise.resolve(makeResponse(repository, attr, newCommit, ref));
    });

    try {
      render(<Harness />);

      fireEvent.change(screen.getByLabelText('GitHub repository'), { target: { value: 'agyn/example' } });
      fireEvent.change(screen.getByLabelText('Flake attribute'), {
        target: { value: 'packages.default' },
      });
      const installButton = screen.getByRole('button', { name: 'Install' });
      fireEvent.click(installButton);

      const repoList = await screen.findByRole('list', { name: 'Custom flake repositories' });
      expect(repoList).toBeInTheDocument();

      const refreshButton = screen.getByRole('button', { name: 'Refresh' });
      fireEvent.click(refreshButton);

      fireEvent.change(screen.getByLabelText('GitHub repository'), { target: { value: 'agyn/example' } });
      fireEvent.change(screen.getByLabelText('Flake attribute'), {
        target: { value: 'packages.default' },
      });
      fireEvent.click(installButton);

      await waitFor(() => expect(refreshButton).not.toBeDisabled());
      await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(3));
      await waitFor(() => expect(installButton).not.toBeDisabled());
      await waitFor(() => {
        const text = screen.getByTestId('nix-value').textContent ?? '';
        expect(text).toContain(newCommit);
      });

      expect(screen.queryByText(/aborted/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/canceled/i)).not.toBeInTheDocument();
      expect(callCount).toBeGreaterThanOrEqual(3);
    } finally {
      resolveRepoSpy.mockRestore();
    }
  });
});
