import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { resolveErrorMessage } from '@/api/errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createLLMModel,
  deleteLLMModel,
  getLLMModel,
  listLLMModels,
  updateLLMModel,
  type LLMModel,
  type LLMModelCreateInput,
  type LLMModelUpdateInput,
  type ListLLMModelsParams,
  type PaginatedResponse,
} from '@/api/modules/llmEntities';

const LLM_MODELS_QUERY_KEY = ['llm', 'entities', 'models'] as const;

async function invalidateModels(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: LLM_MODELS_QUERY_KEY });
}

export function useLLMModels(params: ListLLMModelsParams = {}) {
  return useQuery<PaginatedResponse<LLMModel>, ApiError>({
    queryKey: [...LLM_MODELS_QUERY_KEY, params],
    queryFn: () => listLLMModels(params),
    staleTime: 30_000,
  });
}

export function useLLMModel(id: string | null) {
  return useQuery<LLMModel, ApiError>({
    queryKey: [...LLM_MODELS_QUERY_KEY, id],
    queryFn: () => getLLMModel(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LLMModelCreateInput) => createLLMModel(payload),
    onSuccess: async () => {
      notifySuccess('Model created');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to create model'));
    },
  });
}

export function useUpdateLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMModelUpdateInput }) => updateLLMModel(id, payload),
    onSuccess: async () => {
      notifySuccess('Model updated');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to update model'));
    },
  });
}

export function useDeleteLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLLMModel(id),
    onSuccess: async () => {
      notifySuccess('Model deleted');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to delete model'));
    },
  });
}
