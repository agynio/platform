import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Row } from '@/pages/SettingsSecrets/components/Row';
import type { SecretEntry } from '@/api/modules/graph';

describe('Secrets row masking', () => {
  it('toggle mask affects only its row and copy disabled when masked', async () => {
    const entryA: SecretEntry = { mount: 'secret', path: 'github', key: 'A', required: true, present: false };
    const entryB: SecretEntry = { mount: 'secret', path: 'slack', key: 'B', required: false, present: true };

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <table><tbody>
            <Row entry={entryA} />
            <Row entry={entryB} />
          </tbody></table>
        </TooltipProvider>
      </QueryClientProvider>
    );

    // Both rows initially show masked placeholder and no input value
    expect(screen.getAllByText('••••').length).toBeGreaterThan(0);

    // Enter edit mode on first row
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);

    // Reveal toggle should exist for first row; copy disabled while masked
    const showButtons = screen.getAllByRole('button', { name: 'Show' });
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    expect(copyButtons[0]).toBeDisabled();

    // Toggle reveal on first row; second row remains unaffected (still no edit state)
    fireEvent.click(showButtons[0]);
    // Now copy is still disabled because no value typed
    expect(copyButtons[0]).toBeDisabled();

    // Type a value and ensure copy enabled only for first row
    const inputs = await screen.findAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'secret_value' } });
    expect(copyButtons[0]).not.toBeDisabled();
    // Second row still shows Edit (not in edit mode)
    expect(editButtons[1]).toBeInTheDocument();
  });
});
