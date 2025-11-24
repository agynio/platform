import { describe, it, beforeEach, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { VariablesPageProps } from '@/components/pages/VariablesPage';

const variablesPageMock = vi.fn((props: VariablesPageProps) => {
  latestProps = props;
  return <div data-testid="variables-page-mock" />;
});

vi.mock('@/components/pages/VariablesPage', () => ({
  VariablesPage: (props: VariablesPageProps) => variablesPageMock(props),
}));

const useVariablesMock = vi.fn();
const useCreateVariableMock = vi.fn();
const useUpdateVariableMock = vi.fn();
const useDeleteVariableMock = vi.fn();

vi.mock('@/features/variables/hooks', () => ({
  useVariables: () => useVariablesMock(),
  useCreateVariable: () => useCreateVariableMock(),
  useUpdateVariable: () => useUpdateVariableMock(),
  useDeleteVariable: () => useDeleteVariableMock(),
}));

vi.mock('@/lib/notify', () => ({
  notifyError: vi.fn(),
}));

import { SettingsVariables } from '../SettingsVariables';
import { notifyError } from '@/lib/notify';

let latestProps: VariablesPageProps | undefined;
const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutate = vi.fn();
const refetchMock = vi.fn();

describe('SettingsVariables container', () => {
  beforeEach(() => {
    latestProps = undefined;
    variablesPageMock.mockClear();
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    deleteMutate.mockReset();
    refetchMock.mockReset();
    vi.mocked(notifyError).mockReset();

    useVariablesMock.mockReturnValue({
      data: [
        { key: 'alpha', graph: 'ga', local: null },
        { key: 'beta', graph: 'gb', local: 'lb' },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    });

    useCreateVariableMock.mockReturnValue({ mutateAsync: createMutateAsync });
    useUpdateVariableMock.mockReturnValue({ mutateAsync: updateMutateAsync });
    useDeleteVariableMock.mockReturnValue({ mutate: deleteMutate });
  });

  it('maps query data to VariablesPage props', () => {
    render(<SettingsVariables />);

    expect(variablesPageMock).toHaveBeenCalled();
    expect(latestProps?.variables).toEqual([
      { id: 'alpha', key: 'alpha', graphValue: 'ga', localValue: '' },
      { id: 'beta', key: 'beta', graphValue: 'gb', localValue: 'lb' },
    ]);
    expect(latestProps?.isLoading).toBe(false);
    expect(latestProps?.errorMessage).toBeNull();
  });

  it('passes error state to VariablesPage and refetch handler', () => {
    const err = new Error('explode');
    useVariablesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: err,
      refetch: refetchMock,
    });

    render(<SettingsVariables />);

    expect(latestProps?.errorMessage).toBe('explode');
    latestProps?.onRetry?.();
    expect(refetchMock).toHaveBeenCalled();
  });

  it('prevents duplicate keys and missing values on create', async () => {
    render(<SettingsVariables />);

    await latestProps?.onCreateVariable?.({ key: ' alpha ', graphValue: ' ', localValue: '' });
    expect(notifyError).toHaveBeenCalledWith('Key and Graph value are required');
    expect(createMutateAsync).not.toHaveBeenCalled();

    vi.mocked(notifyError).mockClear();

    await latestProps?.onCreateVariable?.({ key: ' beta ', graphValue: 'gb', localValue: '' });
    expect(notifyError).toHaveBeenCalledWith('Key already exists');
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('creates variable with trimmed payload and optional local update', async () => {
    render(<SettingsVariables />);

    await latestProps?.onCreateVariable?.({ key: ' gamma ', graphValue: ' gc ', localValue: 'lc' });

    expect(createMutateAsync).toHaveBeenCalledWith({ key: 'gamma', graph: 'gc' });
    expect(updateMutateAsync).toHaveBeenCalledWith({ key: 'gamma', patch: { local: 'lc' } });
  });

  it('does not call update when create local value empty', async () => {
    render(<SettingsVariables />);

    await latestProps?.onCreateVariable?.({ key: ' gamma ', graphValue: ' gc ', localValue: '   ' });

    expect(createMutateAsync).toHaveBeenCalledWith({ key: 'gamma', graph: 'gc' });
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('prevents renaming during update', async () => {
    render(<SettingsVariables />);

    await latestProps?.onUpdateVariable?.('alpha', { key: 'omega', graphValue: 'ga', localValue: '' });

    expect(notifyError).toHaveBeenCalledWith('Renaming variables is not supported');
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('updates only changed fields', async () => {
    render(<SettingsVariables />);

    // Change local only
    await latestProps?.onUpdateVariable?.('beta', { key: 'beta', graphValue: 'gb', localValue: '' });
    expect(updateMutateAsync).toHaveBeenCalledWith({ key: 'beta', patch: { local: null } });

    updateMutateAsync.mockClear();

    // Change graph only
    await latestProps?.onUpdateVariable?.('alpha', { key: 'alpha', graphValue: ' new ', localValue: '' });
    expect(updateMutateAsync).toHaveBeenCalledWith({ key: 'alpha', patch: { graph: 'new' } });
  });

  it('skips update when nothing changed', async () => {
    render(<SettingsVariables />);

    await latestProps?.onUpdateVariable?.('alpha', { key: 'alpha', graphValue: 'ga', localValue: '' });
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('deletes variable through mutation', () => {
    render(<SettingsVariables />);

    latestProps?.onDeleteVariable?.('alpha');
    expect(deleteMutate).toHaveBeenCalledWith('alpha');
  });
});
