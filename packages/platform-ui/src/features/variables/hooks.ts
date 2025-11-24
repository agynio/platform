import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createVariable,
  deleteVariable,
  listVariables,
  updateVariable,
  type CreateVariablePayload,
  type UpdateVariablePayload,
  type VariableItem,
} from './api';

const VARIABLES_QUERY_KEY = ['variables'];

function extractErrorCode(error: unknown): string | null {
  if (!error) return null;
  const maybeApiError = error as ApiError;
  const payload = maybeApiError.response?.data;
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }
  if (maybeApiError.message && typeof maybeApiError.message === 'string') {
    return maybeApiError.message;
  }
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

function invalidateVariablesQuery(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: VARIABLES_QUERY_KEY });
}

export function useVariables() {
  return useQuery<VariableItem[], Error>({
    queryKey: VARIABLES_QUERY_KEY,
    queryFn: () => listVariables(),
    staleTime: 30_000,
  });
}

export function useCreateVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVariablePayload) => createVariable(payload),
    onSuccess: async () => {
      notifySuccess('Variable added');
      await invalidateVariablesQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'DUPLICATE_KEY') {
        notifyError('Key already exists');
      } else if (code === 'VERSION_CONFLICT') {
        notifyError('Version conflict, please retry');
      } else {
        notifyError(code ?? 'Create failed');
      }
    },
  });
}

export function useUpdateVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: UpdateVariablePayload }) => updateVariable(key, patch),
    onSuccess: async () => {
      await invalidateVariablesQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'BAD_VALUE') {
        notifyError('Value cannot be empty');
      } else if (code === 'VERSION_CONFLICT') {
        notifyError('Version conflict, please retry');
      } else {
        notifyError(code ?? 'Update failed');
      }
    },
  });
}

export function useDeleteVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteVariable(key),
    onSuccess: async () => {
      await invalidateVariablesQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        notifyError('Version conflict, please retry');
      } else {
        notifyError(code ?? 'Delete failed');
      }
    },
  });
}
