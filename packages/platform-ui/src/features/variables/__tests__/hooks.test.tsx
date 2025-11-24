import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCreateVariable, useDeleteVariable, useUpdateVariable, useVariables } from '../hooks';
import type { ApiError } from '@/api/http';
import React, { type ReactElement, type PropsWithChildren } from 'react';
import { notifyError, notifySuccess } from '@/lib/notify';

const listVariablesMock = vi.fn();
const createVariableMock = vi.fn();
const updateVariableMock = vi.fn();
const deleteVariableMock = vi.fn();

vi.mock('../api', () => ({
  listVariables: (...args: unknown[]) => listVariablesMock(...args),
  createVariable: (...args: unknown[]) => createVariableMock(...args),
  updateVariable: (...args: unknown[]) => updateVariableMock(...args),
  deleteVariable: (...args: unknown[]) => deleteVariableMock(...args),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

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

describe('features/variables hooks', () => {
  beforeEach(() => {
    listVariablesMock.mockReset();
    createVariableMock.mockReset();
    updateVariableMock.mockReset();
    deleteVariableMock.mockReset();
    vi.mocked(notifyError).mockReset();
    vi.mocked(notifySuccess).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches variables via useVariables', async () => {
    listVariablesMock.mockResolvedValue([
      { key: 'A', graph: 'GA', local: null },
      { key: 'B', graph: 'GB', local: 'LB' },
    ]);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useVariables(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.data).toEqual([
      { key: 'A', graph: 'GA', local: null },
      { key: 'B', graph: 'GB', local: 'LB' },
    ]));
  });

  it('creates variable, notifies success, and invalidates query', async () => {
    createVariableMock.mockResolvedValue({ key: 'A', graph: 'GA' });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateVariable(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ key: 'A', graph: 'GA' });
    });

    expect(createVariableMock).toHaveBeenCalledWith({ key: 'A', graph: 'GA' });
    expect(notifySuccess).toHaveBeenCalledWith('Variable added');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['variables'] });
  });

  it('maps duplicate key error on create', async () => {
    createVariableMock.mockRejectedValue(createApiError('DUPLICATE_KEY'));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useCreateVariable(), { wrapper: createWrapper(queryClient) });

    await expect(result.current.mutateAsync({ key: 'A', graph: 'GA' })).rejects.toThrow('DUPLICATE_KEY');
    expect(notifyError).toHaveBeenCalledWith('Key already exists');
  });

  it('maps update validation error', async () => {
    updateVariableMock.mockRejectedValue(createApiError('BAD_VALUE'));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useUpdateVariable(), { wrapper: createWrapper(queryClient) });

    await expect(result.current.mutateAsync({ key: 'A', patch: { graph: '  ' } })).rejects.toThrow('BAD_VALUE');
    expect(notifyError).toHaveBeenCalledWith('Value cannot be empty');
  });

  it('invalidates query after update', async () => {
    updateVariableMock.mockResolvedValue({ key: 'A', graph: 'GB' });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateVariable(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ key: 'A', patch: { graph: 'GB' } });
    });

    expect(updateVariableMock).toHaveBeenCalledWith('A', { graph: 'GB' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['variables'] });
  });

  it('surfaces delete version conflict error', async () => {
    deleteVariableMock.mockRejectedValue(createApiError('VERSION_CONFLICT'));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useDeleteVariable(), { wrapper: createWrapper(queryClient) });

    await expect(result.current.mutateAsync('A')).rejects.toThrow('VERSION_CONFLICT');
    expect(notifyError).toHaveBeenCalledWith('Version conflict, please retry');
  });

  it('invalidates query after delete', async () => {
    deleteVariableMock.mockResolvedValue(undefined);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteVariable(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync('A');
    });

    expect(deleteVariableMock).toHaveBeenCalledWith('A');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['variables'] });
  });
});
