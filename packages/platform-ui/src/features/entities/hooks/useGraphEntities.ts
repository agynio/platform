import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { graph as graphApi } from '@/api/modules/graph';
import { useTemplates } from '@/lib/graph/hooks';
import { notifyError, notifySuccess } from '@/lib/notify';
import type { ApiError } from '@/api/http';
import type { PersistedGraph } from '@agyn/shared';
import {
  applyCreateEntity,
  applyDeleteEntity,
  applyUpdateEntity,
  buildGraphPayload,
  mapGraphEntities,
} from '../api/graphEntities';
import type { GraphEntityDeleteInput, GraphEntitySummary, GraphEntityUpsertInput } from '../types';

const GRAPH_QUERY_KEY = ['graph', 'full'] as const;

type ConflictState = {
  code: string;
  current?: PersistedGraph;
};

function extractGraphError(error: unknown): { code: string | null; current?: PersistedGraph } {
  if (!error) return { code: null };
  const apiError = error as ApiError;
  const payload = apiError.response?.data as { error?: unknown; current?: unknown } | undefined;
  if (payload && typeof payload === 'object') {
    const code = typeof payload.error === 'string' ? payload.error : null;
    const current = payload.current && typeof payload.current === 'object' ? (payload.current as PersistedGraph) : undefined;
    if (code || current) {
      return { code, current };
    }
  }
  if (apiError?.message && typeof apiError.message === 'string') {
    return { code: apiError.message };
  }
  if (error instanceof Error && typeof error.message === 'string') {
    return { code: error.message };
  }
  return { code: null };
}

export function useGraphEntities() {
  const qc = useQueryClient();
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const graphQuery = useQuery({
    queryKey: GRAPH_QUERY_KEY,
    queryFn: () => graphApi.getFullGraph(),
    staleTime: 15_000,
  });

  const templatesQuery = useTemplates();

  const entities: GraphEntitySummary[] = useMemo(() => {
    if (!graphQuery.data) return [];
    return mapGraphEntities(graphQuery.data, templatesQuery.data ?? []);
  }, [graphQuery.data, templatesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildGraphPayload>) => graphApi.saveFullGraph(payload),
    onSuccess: (saved) => {
      qc.setQueryData(GRAPH_QUERY_KEY, saved);
      setConflict(null);
    },
    onError: (error: unknown) => {
      const { code, current } = extractGraphError(error);
      if (code === 'VERSION_CONFLICT') {
        setConflict({ code, current });
        notifyError('Graph is out of date. Refresh to continue.');
        return;
      }
      notifyError(code ?? 'Graph save failed');
    },
  });

  const submit = useCallback(
    async (builder: (graph: PersistedGraph) => PersistedGraph, successMessage: string) => {
      const current = graphQuery.data;
      if (!current) {
        throw new Error('Graph is not loaded yet');
      }
      const next = builder(current);
      const payload = buildGraphPayload(next);
      await saveMutation.mutateAsync(payload);
      notifySuccess(successMessage);
    },
    [graphQuery.data, saveMutation],
  );

  const createEntity = useCallback(
    async (input: GraphEntityUpsertInput) => {
      await submit((graph) => applyCreateEntity(graph, input), 'Entity created');
    },
    [submit],
  );

  const updateEntity = useCallback(
    async (input: GraphEntityUpsertInput) => {
      await submit((graph) => applyUpdateEntity(graph, input), 'Entity updated');
    },
    [submit],
  );

  const deleteEntity = useCallback(
    async (input: GraphEntityDeleteInput) => {
      await submit((graph) => applyDeleteEntity(graph, input), 'Entity deleted');
    },
    [submit],
  );

  const resolveConflict = useCallback(async () => {
    const snapshot = conflict?.current;
    if (snapshot) {
      qc.setQueryData(GRAPH_QUERY_KEY, snapshot);
      setConflict(null);
      return;
    }
    await graphQuery.refetch();
    setConflict(null);
  }, [conflict, graphQuery, qc]);

  const refreshGraph = useCallback(async () => {
    await graphQuery.refetch();
  }, [graphQuery]);

  return {
    graphQuery,
    templatesQuery,
    entities,
    createEntity,
    updateEntity,
    deleteEntity,
    refreshGraph,
    conflict,
    resolveConflict,
    isSaving: saveMutation.isPending,
    isLoading: graphQuery.isLoading || templatesQuery.isLoading,
  } as const;
}
