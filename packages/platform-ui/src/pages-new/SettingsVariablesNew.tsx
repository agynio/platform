import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VariablesScreen, type Variable as UiVariable } from '@agyn/ui-new';
import { notifyError, notifySuccess } from '@/lib/notify';
import { http, asData } from '@/api/http';

type VarItem = { key: string; graph: string | null; local: string | null };

async function fetchVariables(): Promise<VarItem[]> {
  const data = await asData<{ items: VarItem[] }>(http.get<{ items: VarItem[] }>(`/api/graph/variables`));
  return data.items ?? [];
}

export function SettingsVariablesNew() {
  const qc = useQueryClient();
  const variablesQuery = useQuery({ queryKey: ['variables'], queryFn: fetchVariables });

  const variables = useMemo<UiVariable[]>(() => {
    const items = variablesQuery.data ?? [];
    return items.map((item) => ({
      id: item.key,
      key: item.key,
      graphValue: item.graph ?? '',
      localValue: item.local ?? '',
    } satisfies UiVariable));
  }, [variablesQuery.data]);

  const byId = useMemo(() => {
    const map = new Map<string, VarItem>();
    for (const item of variablesQuery.data ?? []) map.set(item.key, item);
    return map;
  }, [variablesQuery.data]);

  const createMutation = useMutation({
    mutationFn: async (payload: { key: string; graph: string; local?: string }) => {
      await asData(http.post<{ key: string; graph: string }>(`/api/graph/variables`, { key: payload.key, graph: payload.graph }));
      if (payload.local != null && payload.local !== '') {
        await asData(http.put<{ key: string; local: string }>(`/api/graph/variables/${encodeURIComponent(payload.key)}`, { local: payload.local }));
      }
    },
    onSuccess: async () => {
      notifySuccess('Variable saved');
      await qc.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to save variable';
      if (message === 'DUPLICATE_KEY') notifyError('Key already exists');
      else if (message === 'BAD_KEY') notifyError('Key is required');
      else if (message === 'BAD_VALUE') notifyError('Graph value is required');
      else notifyError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { key: string; graph?: string; local?: string | null }) => {
      const { key, graph, local } = payload;
      const patch: Record<string, string | null> = {};
      if (graph != null) patch.graph = graph;
      if (local !== undefined) patch.local = local;
      await asData(http.put(`/api/graph/variables/${encodeURIComponent(key)}`, patch));
    },
    onSuccess: async () => {
      notifySuccess('Variable updated');
      await qc.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to update variable';
      if (message === 'BAD_VALUE') notifyError('Value cannot be empty');
      else notifyError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await asData(http.delete<void>(`/api/graph/variables/${encodeURIComponent(key)}`));
    },
    onSuccess: async () => {
      notifySuccess('Variable removed');
      await qc.invalidateQueries({ queryKey: ['variables'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to remove variable';
      notifyError(message);
    },
  });

  const handleCreateVariable = (variable: Omit<UiVariable, 'id'>) => {
    const keyRaw = typeof variable.key === 'string' ? variable.key : '';
    const graphRaw = typeof variable.graphValue === 'string' ? variable.graphValue : '';
    const localRaw = typeof variable.localValue === 'string' ? variable.localValue : '';
    const key = keyRaw.trim();
    const graphValue = graphRaw.trim();
    const localValue = localRaw.trim();
    if (!key || !graphValue) {
      notifyError('Key and graph value are required');
      return;
    }
    if (byId.has(key)) {
      notifyError('Key already exists');
      return;
    }
    createMutation.mutate({ key, graph: graphValue, local: localValue });
  };

  const handleUpdateVariable = (id: string, variable: Omit<UiVariable, 'id'>) => {
    const existing = byId.get(id);
    if (!existing) {
      notifyError('Variable not found');
      return;
    }
    const patch: { key: string; graph?: string; local?: string | null } = { key: id };
    const nextGraphRaw = typeof variable.graphValue === 'string' ? variable.graphValue : '';
    const nextLocalRawVal = typeof variable.localValue === 'string' ? variable.localValue : '';
    const nextGraph = nextGraphRaw.trim();
    const nextLocal = nextLocalRawVal.trim();
    if (nextGraph && nextGraph !== (existing.graph ?? '')) patch.graph = nextGraph;
    if (nextLocalRawVal !== (existing.local ?? '')) patch.local = nextLocal.length > 0 ? nextLocal : null;
    if (!patch.graph && !Object.prototype.hasOwnProperty.call(patch, 'local')) {
      return;
    }
    updateMutation.mutate(patch);
  };

  const handleDeleteVariable = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (variablesQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading variables…</div>;
  }

  if (variablesQuery.error) {
    const message = variablesQuery.error instanceof Error ? variablesQuery.error.message : 'Failed to load variables';
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {message}
      </div>
    );
  }

  return (
    <VariablesScreen
      variables={variables}
      onCreateVariable={handleCreateVariable}
      onUpdateVariable={handleUpdateVariable}
      onDeleteVariable={handleDeleteVariable}
      renderSidebar={false}
    />
  );
}
