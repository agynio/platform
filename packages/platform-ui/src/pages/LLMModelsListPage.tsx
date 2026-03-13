import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLLMProviders } from '@/api/hooks/useLLMProviders';
import { useDeleteLLMModel, useLLMModels } from '@/api/hooks/useLLMModels';
import type { LLMModel, LLMProvider } from '@/api/modules/llmEntities';

const LIST_PATH = '/settings/llm/models';

interface ModelsTableProps {
  rows: LLMModel[];
  providerMap: Map<string, LLMProvider>;
  isLoading?: boolean;
  emptyLabel: string;
  onEdit: (model: LLMModel) => void;
  onDelete: (model: LLMModel) => void;
}

function ModelsTable({ rows, providerMap, isLoading, emptyLabel, onEdit, onDelete }: ModelsTableProps) {
  if (!isLoading && rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="llm-models-table">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '24%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10" data-testid="llm-models-table-header">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Name</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Provider</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Remote name</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Model ID</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading models...
              </td>
            </tr>
          ) : (
            rows.map((model) => {
              const provider = providerMap.get(model.llmProviderId);
              return (
                <tr
                  key={model.id}
                  data-testid={`llm-model-row-${model.id}`}
                  className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50"
                >
                  <td className="h-[60px] px-6">
                    <span className="font-medium text-[var(--agyn-dark)]" data-testid="llm-model-name">
                      {model.name}
                    </span>
                  </td>
                  <td className="h-[60px] px-6">
                    <span className="text-sm text-[var(--agyn-text-subtle)]" data-testid="llm-model-provider">
                      {provider?.endpoint ?? model.llmProviderId}
                    </span>
                  </td>
                  <td className="h-[60px] px-6">
                    <span className="text-sm text-[var(--agyn-text-subtle)]" data-testid="llm-model-remote-name">
                      {model.remoteName}
                    </span>
                  </td>
                  <td className="h-[60px] px-6">
                    <code className="rounded bg-[var(--agyn-bg-light)] px-2 py-1 text-xs text-[var(--agyn-dark)]">
                      {model.id}
                    </code>
                  </td>
                  <td className="h-[60px] px-6">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(model)}
                        className="rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] transition-colors hover:bg-[var(--agyn-bg-light)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(model)}
                        className="rounded-md px-3 py-1.5 text-xs text-[var(--agyn-text-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function LLMModelsListPage() {
  const navigate = useNavigate();
  const modelsQuery = useLLMModels();
  const providersQuery = useLLMProviders();
  const deleteModel = useDeleteLLMModel();

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const sortedModels = useMemo(() => {
    if (models.length === 0) return models;
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return [...models].sort((a, b) => collator.compare(a.name, b.name));
  }, [models]);

  const handleCreateClick = () => {
    navigate(`${LIST_PATH}/new`);
  };

  const handleEditClick = (model: LLMModel) => {
    navigate(`${LIST_PATH}/${model.id}/edit`);
  };

  const handleDeleteClick = (model: LLMModel) => {
    const confirmed = window.confirm(`Delete model ${model.name}? This action cannot be undone.`);
    if (!confirmed) return;
    deleteModel.mutate(model.id);
  };

  const disableCreate = providers.length === 0 || providersQuery.isLoading;
  const errorMessage = modelsQuery.error?.message ?? providersQuery.error?.message;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">LLM Models</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
              Configure model aliases and provider routing.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateClick}
            disabled={disableCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New model
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {(modelsQuery.isError || providersQuery.isError) && (
          <div className="shrink-0 space-y-4 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <Alert variant="destructive">
              <AlertTitle>Unable to load LLM models</AlertTitle>
              <AlertDescription>{errorMessage ?? 'Check your connection and try again.'}</AlertDescription>
            </Alert>
          </div>
        )}

        <ModelsTable
          rows={sortedModels}
          providerMap={providerMap}
          isLoading={modelsQuery.isLoading || providersQuery.isLoading}
          emptyLabel={
            providers.length === 0
              ? 'Add an LLM provider before configuring models.'
              : 'No LLM models configured yet.'
          }
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      </div>
    </div>
  );
}
