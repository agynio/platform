import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDeleteLLMProvider, useLLMProviders } from '@/api/hooks/useLLMProviders';
import type { LLMAuthMethod, LLMProvider } from '@/api/modules/llmEntities';

const LIST_PATH = '/llm-providers';
const PAGE_SIZE = 20;

function formatAuthMethod(value: LLMAuthMethod): string {
  switch (value) {
    case 'bearer':
      return 'Bearer';
    default: {
      const exhaustive: never = value;
      throw new Error(`Unknown auth method: ${exhaustive}`);
    }
  }
}

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ProvidersTableProps {
  rows: LLMProvider[];
  isLoading?: boolean;
  emptyLabel: string;
  onEdit: (provider: LLMProvider) => void;
  onDelete: (provider: LLMProvider) => void;
}

function ProvidersTable({ rows, isLoading, emptyLabel, onEdit, onDelete }: ProvidersTableProps) {
  if (!isLoading && rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="llm-providers-table">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10" data-testid="llm-providers-table-header">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Endpoint</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
              Auth method
            </th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Created</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading providers...
              </td>
            </tr>
          ) : (
            rows.map((provider) => (
              <tr
                key={provider.id}
                data-testid={`llm-provider-row-${provider.id}`}
                className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50"
              >
                <td className="h-[60px] px-6">
                  <span className="font-medium text-[var(--agyn-dark)]" data-testid="llm-provider-endpoint">
                    {provider.endpoint}
                  </span>
                </td>
                <td className="h-[60px] px-6">
                  <span className="text-sm text-[var(--agyn-text-subtle)]" data-testid="llm-provider-auth">
                    {formatAuthMethod(provider.authMethod)}
                  </span>
                </td>
                <td className="h-[60px] px-6">
                  <span className="text-sm text-[var(--agyn-text-subtle)]" data-testid="llm-provider-created">
                    {formatCreatedAt(provider.createdAt)}
                  </span>
                </td>
                <td className="h-[60px] px-6">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(provider)}
                      className="rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] transition-colors hover:bg-[var(--agyn-bg-light)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(provider)}
                      className="rounded-md px-3 py-1.5 text-xs text-[var(--agyn-text-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function LLMProvidersListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const paginationParams = useMemo(() => ({ page, perPage: PAGE_SIZE }), [page]);
  const providersQuery = useLLMProviders(paginationParams);
  const deleteProvider = useDeleteLLMProvider();

  const providers = useMemo(() => providersQuery.data?.items ?? [], [providersQuery.data]);
  const sortedProviders = useMemo(() => {
    if (providers.length === 0) return providers;
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return [...providers].sort((a, b) => collator.compare(a.endpoint, b.endpoint));
  }, [providers]);
  const totalProviders = providersQuery.data?.total ?? 0;
  const resolvedPage = providersQuery.data?.page ?? page;
  const resolvedPerPage = providersQuery.data?.perPage ?? PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(totalProviders / resolvedPerPage));
  const startIndex = totalProviders === 0 ? 0 : (resolvedPage - 1) * resolvedPerPage + 1;
  const endIndex = totalProviders === 0 ? 0 : Math.min(totalProviders, resolvedPage * resolvedPerPage);
  const showPagination = pageCount > 1;

  useEffect(() => {
    if (!providersQuery.data) return;
    if (resolvedPage > pageCount) setPage(pageCount);
  }, [pageCount, providersQuery.data, resolvedPage]);

  const handleCreateClick = () => {
    navigate(`${LIST_PATH}/new`);
  };

  const handleEditClick = (provider: LLMProvider) => {
    navigate(`${LIST_PATH}/${provider.id}/edit`);
  };

  const handleDeleteClick = (provider: LLMProvider) => {
    const confirmed = window.confirm(`Delete provider ${provider.endpoint}? This action cannot be undone.`);
    if (!confirmed) return;
    deleteProvider.mutate(provider.id);
  };

  const handlePreviousPage = () => {
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNextPage = () => {
    setPage((current) => Math.min(pageCount, current + 1));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">LLM Providers</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
              Manage gateway providers and authentication endpoints.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateClick}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New provider
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {providersQuery.isError && (
          <div className="shrink-0 space-y-4 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <Alert variant="destructive">
              <AlertTitle>Unable to load LLM providers</AlertTitle>
              <AlertDescription>{providersQuery.error?.message ?? 'Check your connection and try again.'}</AlertDescription>
            </Alert>
          </div>
        )}

        <ProvidersTable
          rows={sortedProviders}
          isLoading={providersQuery.isLoading}
          emptyLabel="No LLM providers configured yet."
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />

        {showPagination && (
          <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-[var(--agyn-text-subtle)]">
                Showing {startIndex} to {endIndex} of {totalProviders} provider{totalProviders !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreviousPage}
                  disabled={resolvedPage === 1 || providersQuery.isLoading}
                  className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  Page {resolvedPage} of {pageCount}
                </div>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={resolvedPage >= pageCount || providersQuery.isLoading}
                  className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
