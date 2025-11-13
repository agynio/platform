import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server, TestProviders, abs } from '../../integration/testUtils';
import NixPackagesSection from '@/components/nix/NixPackagesSection';
import type { NixPackageSelection } from '@/components/nix/types';

function Harness({ retryMs }: { retryMs?: number } = {}) {
  const [value, setValue] = useState<NixPackageSelection[]>([]);
  return (
    <TestProviders>
      <NixPackagesSection value={value} onChange={setValue} resolveRetryMs={retryMs} />
    </TestProviders>
  );
}

function HarnessWithInspector({ retryMs }: { retryMs?: number } = {}) {
  const [value, setValue] = useState<NixPackageSelection[]>([]);
  return (
    <TestProviders>
      <NixPackagesSection value={value} onChange={setValue} resolveRetryMs={retryMs} />
      <div data-testid="nix-value">{JSON.stringify(value)}</div>
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

  it('persists unresolved selections and upgrades after background retry', async () => {
    let resolveCalls = 0;
    server.use(
      http.get(abs('/api/nix/versions'), ({ request }) => {
        const url = new URL(request.url);
        const name = url.searchParams.get('name');
        if (!name) return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({ versions: ['24.11.0'] });
      }),
      http.get(abs('/api/nix/resolve'), ({ request }) => {
        resolveCalls += 1;
        const url = new URL(request.url);
        const name = url.searchParams.get('name');
        const version = url.searchParams.get('version');
        if (!name || !version) {
          return new HttpResponse(null, { status: 400 });
        }
        if (resolveCalls === 1) {
          return new HttpResponse(JSON.stringify({ error: 'upstream_error' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return HttpResponse.json({ name, version, commitHash: 'abcd1234', attributePath: `${name}` });
      }),
    );

    const retryMs = 200;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<HarnessWithInspector retryMs={retryMs} />);

      const input = screen.getByLabelText('Search Nix packages') as HTMLInputElement;
      input.focus();
      fireEvent.change(input, { target: { value: 'nodejs' } });

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
      fireEvent.click(await screen.findByRole('option', { name: /nodejs/ }));

      const select = screen.getByLabelText(/Select version for nodejs/) as HTMLSelectElement;
      await waitFor(() => expect(select.querySelector('option[value="24.11.0"]')).not.toBeNull());
      fireEvent.change(select, { target: { value: '24.11.0' } });

      await waitFor(() => {
        const text = screen.getByTestId('nix-value').textContent ?? '';
        expect(text).toContain('"name":"nodejs"');
        expect(text).toContain('"version":"24.11.0"');
        expect(text).not.toContain('commitHash');
      });

      await waitFor(() => expect(resolveCalls).toBe(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(retryMs + 50);
        await vi.runOnlyPendingTimersAsync();
      });

      await waitFor(() => expect(resolveCalls).toBeGreaterThanOrEqual(2));

      expect(screen.getByText('Resolved')).toBeInTheDocument();

      const text = screen.getByTestId('nix-value').textContent ?? '';
      expect(text).toContain('commitHash');
      expect(text).toContain('attributePath');

      expect(resolveCalls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
