import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('opens the add custom modal and lists the resolved package alongside nixpkgs selections', async () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'or add custom' });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Add custom Nix package' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close' });
    expect(closeButton.className).toContain('w-8 h-8');
    expect(closeButton.className).toContain('rounded-[10px]');
    const form = (within(dialog).getByLabelText('GitHub repository') as HTMLInputElement).closest('form');
    if (!form) {
      throw new Error('Modal form not found');
    }
    expect(form).toHaveClass('space-y-4');

    const repositoryLabel = within(dialog).getByText(/Repository/, { selector: 'span' });
    const repositoryStar = within(repositoryLabel).getByText('*');
    expect(repositoryStar).toHaveClass('text-[var(--agyn-status-failed)]');
    const attributeLabel = within(dialog).getByText('Package Attribute', { selector: 'label' });
    expect(attributeLabel.textContent).toBe('Package Attribute');

    const repositoryInput = within(dialog).getByLabelText('GitHub repository');
    expect(repositoryInput).toHaveAttribute('aria-required', 'true');
    const attributeInput = within(dialog).getByLabelText('Flake attribute');
    expect(attributeInput).not.toHaveAttribute('aria-required');
    expect(attributeInput).toHaveAttribute('placeholder', 'default');
    expect(attributeInput).toHaveValue('');

    fireEvent.change(repositoryInput, { target: { value: 'agyn/example' } });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    const addButton = within(dialog).getByRole('button', { name: 'Add' });
    expect(cancelButton.className).toContain('px-4 py-2');
    expect(cancelButton.className).toContain('text-sm');
    expect(addButton.className).toContain('px-4 py-2');
    expect(addButton.className).toContain('text-sm');
    fireEvent.click(addButton);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const selectedList = await screen.findByRole('list', { name: 'Selected Nix packages' });
    expect(selectedList).toBeInTheDocument();

    const removeButton = screen.getByLabelText('Remove default');
    expect(removeButton).toBeInTheDocument();

    const sourceSelect = screen.getByLabelText('default source') as HTMLSelectElement;
    expect(sourceSelect.disabled).toBe(true);
    expect(sourceSelect.value).toContain('agyn/example');

    await waitFor(() => {
      const text = screen.getByTestId('nix-value').textContent ?? '';
      expect(text).toContain('"kind":"flakeRepo"');
      expect(text).toContain('"repository":"github:agyn/example"');
      expect(text).toContain('"attributePath":"default"');
    });

    fireEvent.click(removeButton);
    await waitFor(() => expect(screen.queryByLabelText('default source')).not.toBeInTheDocument());
  });

  it('replaces an existing custom repo entry when re-added', async () => {
    const resolveRepoSpy = vi.spyOn(nixApi, 'resolveRepo');
    const commits = [
      '1234567890abcdef1234567890abcdef12345678',
      '9999999999999999999999999999999999999999',
    ];
    resolveRepoSpy.mockImplementation(async (repository, attributePath, ref) => {
      const commitHash = commits.shift() ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const canonicalRepo = repository.startsWith('github:') ? repository : `github:${repository}`;
      return {
        repository: canonicalRepo,
        ref: ref ?? 'main',
        commitHash,
        attributePath,
        flakeUri: `${canonicalRepo}/${commitHash}#${attributePath}`,
        attrCheck: 'ok' as const,
      };
    });

    const addCustomRepo = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'or add custom' }));
      const dialog = await screen.findByRole('dialog', { name: 'Add custom Nix package' });
      const repoInput = within(dialog).getByLabelText('GitHub repository');
      const attributeInput = within(dialog).getByLabelText('Flake attribute');
      expect(attributeInput).toHaveValue('');
      fireEvent.change(repoInput, { target: { value: 'agyn/example' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    };

    try {
      render(<Harness />);

      await addCustomRepo();
      await waitFor(() => {
        const text = screen.getByTestId('nix-value').textContent ?? '';
        expect(text).toContain('1234567890abcdef1234567890abcdef12345678');
        expect(text).toContain('"attributePath":"default"');
      });

      await addCustomRepo();
      await waitFor(() => {
        const text = screen.getByTestId('nix-value').textContent ?? '';
        expect(text).toContain('9999999999999999999999999999999999999999');
        expect(text).toContain('"attributePath":"default"');
        expect(text).not.toContain('1234567890abcdef1234567890abcdef12345678');
      });

      const list = await screen.findByRole('list', { name: 'Selected Nix packages' });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(1);
    } finally {
      resolveRepoSpy.mockRestore();
    }
  });
});
