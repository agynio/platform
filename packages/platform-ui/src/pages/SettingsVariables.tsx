import { useMemo, useCallback } from 'react';
import { VariablesPage } from '@/components/pages/VariablesPage';
import type { Variable as ScreenVariable } from '@/components/screens/VariablesScreen';
import { notifyError } from '@/lib/notify';
import {
  useCreateVariable,
  useDeleteVariable,
  useUpdateVariable,
  useVariables,
} from '@/features/variables/hooks';

export function SettingsVariables() {
  const variablesQuery = useVariables();
  const createVariable = useCreateVariable();
  const updateVariable = useUpdateVariable();
  const deleteVariable = useDeleteVariable();

  const variables = useMemo<ScreenVariable[]>(
    () =>
      (variablesQuery.data ?? []).map((item) => ({
        id: item.key,
        key: item.key,
        graphValue: item.graph ?? '',
        localValue: item.local ?? '',
      })),
    [variablesQuery.data],
  );

  const existingKeys = useMemo(() => new Set((variablesQuery.data ?? []).map((item) => item.key)), [variablesQuery.data]);

  const handleCreate = useCallback(
    async (input: Omit<ScreenVariable, 'id'>) => {
      const key = input.key.trim();
      const graph = input.graphValue.trim();
      const localRaw = input.localValue;
      const localTrimmed = localRaw.trim();

      if (!key || !graph) {
        notifyError('Key and Graph value are required');
        return;
      }

      if (existingKeys.has(key)) {
        notifyError('Key already exists');
        return;
      }

      try {
        await createVariable.mutateAsync({ key, graph });
        if (localTrimmed) {
          await updateVariable.mutateAsync({ key, patch: { local: localRaw } });
        }
      } catch {
        // Errors handled by mutation callbacks
      }
    },
    [createVariable, existingKeys, updateVariable],
  );

  const handleUpdate = useCallback(
    async (id: string, input: Omit<ScreenVariable, 'id'>) => {
      const current = variablesQuery.data?.find((item) => item.key === id);
      const nextKey = input.key.trim();

      if (nextKey !== id) {
        notifyError('Renaming variables is not supported');
        return;
      }

      const nextGraph = input.graphValue.trim();
      if (!nextGraph) {
        notifyError('Graph value is required');
        return;
      }

      const nextLocal = input.localValue.trim() ? input.localValue : null;

      const patch: { graph?: string; local?: string | null } = {};

      if (!current || (current.graph ?? '') !== nextGraph) {
        patch.graph = nextGraph;
      }

      if (!current || (current.local ?? null) !== nextLocal) {
        patch.local = nextLocal;
      }

      if (Object.keys(patch).length === 0) {
        return;
      }

      try {
        await updateVariable.mutateAsync({ key: id, patch });
      } catch {
        // handled by mutation callbacks
      }
    },
    [updateVariable, variablesQuery.data],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteVariable.mutate(id);
    },
    [deleteVariable],
  );

  const errorMessage = variablesQuery.isError
    ? variablesQuery.error?.message ?? 'Failed to load variables'
    : null;

  return (
    <VariablesPage
      variables={variables}
      isLoading={variablesQuery.isLoading}
      errorMessage={errorMessage}
      onRetry={() => {
        void variablesQuery.refetch();
      }}
      onCreateVariable={handleCreate}
      onUpdateVariable={handleUpdate}
      onDeleteVariable={handleDelete}
    />
  );
}
