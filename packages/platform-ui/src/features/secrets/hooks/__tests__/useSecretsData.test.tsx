import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const graphMocks = vi.hoisted(() => ({
  getFullGraph: vi.fn(),
  listVaultMounts: vi.fn(),
  listVaultPaths: vi.fn(),
  listVaultKeys: vi.fn(),
  readVaultKey: vi.fn(),
}));

const computeRequiredKeysMock = vi.hoisted(() => vi.fn());
const computeSecretsUnionMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/modules/graph', () => ({
  graph: graphMocks,
  computeRequiredKeys: computeRequiredKeysMock,
  computeSecretsUnion: computeSecretsUnionMock,
}));

import { useSecretsData } from '../useSecretsData';

describe('useSecretsData', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    graphMocks.getFullGraph.mockResolvedValue({} as unknown);
    graphMocks.listVaultMounts.mockResolvedValue({ items: ['secret'] });
    graphMocks.listVaultPaths.mockResolvedValue({ items: ['github'] });
    graphMocks.listVaultKeys.mockResolvedValue({ items: ['TOKEN'] });
    graphMocks.readVaultKey.mockResolvedValue({ value: 'gh-secret' });

    computeRequiredKeysMock.mockReturnValue([{ mount: 'secret', path: 'github', key: 'TOKEN' }]);
    computeSecretsUnionMock.mockImplementation((required, available) =>
      required.map((item: { mount: string; path: string; key: string }) => ({
        ...item,
        required: true,
        present: available.some(
          (candidate: { mount: string; path: string; key: string }) =>
            candidate.mount === item.mount && candidate.path === item.path && candidate.key === item.key,
        ),
      })),
    );
  });

  it('returns secrets with derived counts when discovery succeeds', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSecretsData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({ value: 'gh-secret' });
    expect(result.current.valueReadErrors).toEqual([]);
    expect(result.current.missingCount).toBe(0);
    expect(result.current.requiredCount).toBe(1);
    expect(result.current.vaultUnavailable).toBe(false);
    expect(computeSecretsUnionMock).toHaveBeenCalledWith(
      [{ mount: 'secret', path: 'github', key: 'TOKEN' }],
      [{ mount: 'secret', path: 'github', key: 'TOKEN' }],
    );
  });

  it('marks vault unavailable when mounts query resolves empty', async () => {
    graphMocks.listVaultMounts.mockResolvedValueOnce({ items: [] });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSecretsData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.vaultUnavailable).toBe(true);
    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({
      key: 'secret/github/TOKEN',
      status: 'missing',
      required: true,
      present: false,
    });
    expect(result.current.valueReadErrors).toEqual([]);
  });

  it('records read failures and leaves values empty', async () => {
    graphMocks.readVaultKey.mockRejectedValueOnce(new Error('read failed'));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSecretsData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({ value: '' });
    expect(result.current.valueReadErrors).toEqual(['secret::github::TOKEN']);
  });
});
