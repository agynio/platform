import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ApiError } from '@/api/http';
import React, { type PropsWithChildren, type ReactElement } from 'react';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  useCreateEntitySecret,
  useDeleteEntitySecret,
  useEntitySecrets,
  useResolveEntitySecret,
  useUpdateEntitySecret,
} from '../useEntitySecrets';
import {
  useCreateSecretProvider,
  useDeleteSecretProvider,
  useSecretProviders,
  useUpdateSecretProvider,
} from '../useSecretProviders';

const listSecretProvidersMock = vi.fn();
const createSecretProviderMock = vi.fn();
const updateSecretProviderMock = vi.fn();
const deleteSecretProviderMock = vi.fn();

const listEntitySecretsMock = vi.fn();
const createEntitySecretMock = vi.fn();
const updateEntitySecretMock = vi.fn();
const deleteEntitySecretMock = vi.fn();
const resolveEntitySecretMock = vi.fn();

vi.mock('@/api/modules/secretProviders', () => ({
  listSecretProviders: (...args: unknown[]) => listSecretProvidersMock(...args),
  createSecretProvider: (...args: unknown[]) => createSecretProviderMock(...args),
  updateSecretProvider: (...args: unknown[]) => updateSecretProviderMock(...args),
  deleteSecretProvider: (...args: unknown[]) => deleteSecretProviderMock(...args),
}));

vi.mock('@/api/modules/entitySecrets', () => ({
  listEntitySecrets: (...args: unknown[]) => listEntitySecretsMock(...args),
  createEntitySecret: (...args: unknown[]) => createEntitySecretMock(...args),
  updateEntitySecret: (...args: unknown[]) => updateEntitySecretMock(...args),
  deleteEntitySecret: (...args: unknown[]) => deleteEntitySecretMock(...args),
  resolveEntitySecret: (...args: unknown[]) => resolveEntitySecretMock(...args),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren): ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createApiError(code: string): ApiError {
  return {
    name: 'AxiosError',
    message: code,
    config: {},
    isAxiosError: true,
    toJSON: () => ({}),
    response: { data: { error: code }, status: 400, statusText: 'Bad Request', headers: {}, config: {} },
  } as ApiError;
}

describe('entity secrets hooks', () => {
  beforeEach(() => {
    listSecretProvidersMock.mockReset();
    createSecretProviderMock.mockReset();
    updateSecretProviderMock.mockReset();
    deleteSecretProviderMock.mockReset();
    listEntitySecretsMock.mockReset();
    createEntitySecretMock.mockReset();
    updateEntitySecretMock.mockReset();
    deleteEntitySecretMock.mockReset();
    resolveEntitySecretMock.mockReset();
    vi.mocked(notifyError).mockReset();
    vi.mocked(notifySuccess).mockReset();
  });

  it('fetches secret providers via useSecretProviders', async () => {
    listSecretProvidersMock.mockResolvedValue({
      items: [
        {
          id: 'provider-1',
          createdAt: '2024-01-01T00:00:00Z',
          title: 'Vault West',
          type: 'vault',
          config: { vault: { address: 'https://vault.example.com', token: 'token' } },
        },
      ],
      page: 1,
      perPage: 20,
      total: 1,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useSecretProviders(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(result.current.data?.items).toEqual([
        {
          id: 'provider-1',
          createdAt: '2024-01-01T00:00:00Z',
          title: 'Vault West',
          type: 'vault',
          config: { vault: { address: 'https://vault.example.com', token: 'token' } },
        },
      ]);
    });
  });

  it('surfaces provider list errors', async () => {
    listSecretProvidersMock.mockRejectedValue(new Error('Provider fetch failed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useSecretProviders(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Provider fetch failed');
  });

  it('creates a secret provider and invalidates queries', async () => {
    createSecretProviderMock.mockResolvedValue({
      id: 'provider-1',
      createdAt: '2024-01-01T00:00:00Z',
      title: 'Vault West',
      type: 'vault',
      config: { vault: { address: 'https://vault.example.com', token: 'token' } },
    });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateSecretProvider(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({
        title: 'Vault West',
        type: 'vault',
        config: { vault: { address: 'https://vault.example.com', token: 'token' } },
      });
    });

    expect(notifySuccess).toHaveBeenCalledWith('Secret provider added');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['secret-providers'] });
  });

  it('notifies on secret provider update errors', async () => {
    updateSecretProviderMock.mockRejectedValue(createApiError('BAD_PROVIDER'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useUpdateSecretProvider(), { wrapper: createWrapper(queryClient) });

    await expect(
      result.current.mutateAsync({ id: 'provider-1', patch: { title: 'Vault East' } }),
    ).rejects.toThrow('BAD_PROVIDER');
    expect(notifyError).toHaveBeenCalledWith('BAD_PROVIDER');
  });

  it('fetches entity secrets via useEntitySecrets', async () => {
    listEntitySecretsMock.mockResolvedValue({
      items: [
        {
          id: 'secret-1',
          createdAt: '2024-01-01T00:00:00Z',
          title: 'DB Password',
          secretProviderId: 'provider-1',
          remoteName: 'db.password',
        },
      ],
      page: 1,
      perPage: 20,
      total: 1,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useEntitySecrets(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(result.current.data?.items).toEqual([
        {
          id: 'secret-1',
          createdAt: '2024-01-01T00:00:00Z',
          title: 'DB Password',
          secretProviderId: 'provider-1',
          remoteName: 'db.password',
        },
      ]);
    });
  });

  it('surfaces entity secret list errors', async () => {
    listEntitySecretsMock.mockRejectedValue(new Error('Secret fetch failed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useEntitySecrets(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Secret fetch failed');
  });

  it('creates a secret and invalidates queries', async () => {
    createEntitySecretMock.mockResolvedValue({
      id: 'secret-1',
      createdAt: '2024-01-01T00:00:00Z',
      title: 'DB Password',
      secretProviderId: 'provider-1',
      remoteName: 'db.password',
    });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateEntitySecret(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({
        title: 'DB Password',
        secretProviderId: 'provider-1',
        remoteName: 'db.password',
      });
    });

    expect(notifySuccess).toHaveBeenCalledWith('Secret created');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['entity-secrets'] });
  });

  it('notifies on secret update errors', async () => {
    updateEntitySecretMock.mockRejectedValue(createApiError('BAD_SECRET'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useUpdateEntitySecret(), { wrapper: createWrapper(queryClient) });

    await expect(
      result.current.mutateAsync({ id: 'secret-1', patch: { remoteName: 'db.password' } }),
    ).rejects.toThrow('BAD_SECRET');
    expect(notifyError).toHaveBeenCalledWith('BAD_SECRET');
  });

  it('notifies on secret delete errors', async () => {
    deleteEntitySecretMock.mockRejectedValue(createApiError('DELETE_FAILED'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDeleteEntitySecret(), { wrapper: createWrapper(queryClient) });

    await expect(result.current.mutateAsync('secret-1')).rejects.toThrow('DELETE_FAILED');
    expect(notifyError).toHaveBeenCalledWith('DELETE_FAILED');
  });

  it('notifies on resolve errors', async () => {
    resolveEntitySecretMock.mockRejectedValue(createApiError('RESOLVE_FAILED'));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useResolveEntitySecret(), { wrapper: createWrapper(queryClient) });

    await expect(result.current.mutateAsync('secret-1')).rejects.toThrow('RESOLVE_FAILED');
    expect(notifyError).toHaveBeenCalledWith('RESOLVE_FAILED');
  });

  it('invalidates queries after deleting a provider', async () => {
    deleteSecretProviderMock.mockResolvedValue(undefined);
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteSecretProvider(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync('provider-1');
    });

    expect(notifySuccess).toHaveBeenCalledWith('Secret provider deleted');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['secret-providers'] });
  });
});
