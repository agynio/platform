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

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 6000 });

    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({ value: 'gh-secret' });
    expect(result.current.valuesIsError).toBe(false);
    expect(result.current.valuesError).toBeNull();
    expect(result.current.failedValueCount).toBe(0);
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

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 6000 });
    expect(result.current.vaultUnavailable).toBe(true);
    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({
      key: 'secret/github/TOKEN',
      status: 'missing',
      required: true,
      present: false,
    });
    expect(result.current.valuesIsError).toBe(false);
    expect(result.current.valuesError).toBeNull();
    expect(result.current.failedValueCount).toBe(0);
  });

  it('treats 404 reads as missing values without surfacing an error', async () => {
    const notFoundError = Object.assign(new Error('not found'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    graphMocks.readVaultKey.mockRejectedValueOnce(notFoundError);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSecretsData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 6000 });

    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({ value: '' });
    expect(result.current.valuesIsError).toBe(false);
    expect(result.current.valuesError).toBeNull();
    expect(result.current.failedValueCount).toBe(0);
  });

  it('surfaces non-404 read failures while leaving placeholders', async () => {
    const serverError = Object.assign(new Error('read failed'), {
      isAxiosError: true,
      response: { status: 500 },
    });
    graphMocks.readVaultKey.mockRejectedValue(serverError);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSecretsData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 6000 });

    expect(result.current.secrets).toHaveLength(1);
    expect(result.current.secrets[0]).toMatchObject({ value: '' });
    expect(result.current.valuesIsError).toBe(true);
    expect(result.current.valuesError).toBeInstanceOf(Error);
    expect((result.current.valuesError as Error).message).toBe('vault-read-failure:1');
    expect(result.current.failedValueCount).toBe(1);
  });
});
