import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { ActionIconButton } from '@/components/ActionIconButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PaginationBar } from '@/components/PaginationBar';
import type { SecretProvider } from '@/api/modules/secretProviders';
import { useDeleteSecretProvider, useSecretProviders } from '@/features/entitySecrets/hooks/useSecretProviders';
import { formatTimestamp } from '@/lib/formatTimestamp';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

type SecretProvidersHeaderProps = {
  onCreate: () => void;
  createDisabled: boolean;
};

function SecretProvidersHeader({ onCreate, createDisabled }: SecretProvidersHeaderProps) {
  return (
    <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Secret Providers</h1>
          <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
            Manage integrations for external secret stores.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={createDisabled}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New secret provider
        </button>
      </div>
    </div>
  );
}

type SecretProvidersTableProps = {
  providers: SecretProvider[];
  isLoading: boolean;
  tooltipDelay: number;
  onEdit: (provider: SecretProvider) => void;
  onDelete: (provider: SecretProvider) => void;
};

function SecretProvidersTable({ providers, isLoading, tooltipDelay, onEdit, onDelete }: SecretProvidersTableProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Provider</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Type</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Updated</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && providers.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading secret providers…
              </td>
            </tr>
          ) : providers.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                No secret providers available.
              </td>
            </tr>
          ) : (
            providers.map((provider) => {
              const displayTitle = provider.title?.trim() || 'Untitled provider';
              const description = provider.description?.trim();
              const updatedAt = formatTimestamp(provider.updatedAt ?? provider.createdAt);

              return (
                <tr
                  key={provider.id}
                  className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]"
                >
                  <td className="h-[70px] px-6">
                    <div className="font-medium text-[var(--agyn-dark)]">{displayTitle}</div>
                    {description ? (
                      <div className="mt-1 text-xs text-[var(--agyn-text-subtle)]">{description}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[var(--agyn-text-subtle)]">
                      <span className="uppercase">ID</span>: <code className="text-[10px]">{provider.id}</code>
                    </div>
                  </td>
                  <td className="h-[70px] px-6">
                    <span className="text-sm text-[var(--agyn-dark)]">
                      {provider.type === 'vault' ? 'Vault' : provider.type}
                    </span>
                  </td>
                  <td className="h-[70px] px-6">
                    <span className="text-sm text-[var(--agyn-text-subtle)]">{updatedAt}</span>
                  </td>
                  <td className="h-[70px] px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <ActionIconButton
                        icon={<Pencil className="w-4 h-4" />}
                        label="Edit secret provider"
                        tooltip="Edit"
                        delayDuration={tooltipDelay}
                        onClick={() => onEdit(provider)}
                      />
                      <ActionIconButton
                        icon={<Trash2 className="w-4 h-4" />}
                        label="Delete secret provider"
                        tooltip="Delete"
                        delayDuration={tooltipDelay}
                        onClick={() => onDelete(provider)}
                        variant="danger"
                      />
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

export function SecretProvidersListPage() {
  const navigate = useNavigate();
  const providersQuery = useSecretProviders({ pageSize: DEFAULT_PAGE_SIZE });
  const deleteProvider = useDeleteSecretProvider();

  const providers = providersQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [];
  const hasMoreProviders = providersQuery.hasNextPage ?? false;
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  const handleOpenCreate = () => {
    navigate('/secret-providers/new');
  };

  const handleOpenEdit = (provider: SecretProvider) => {
    navigate(`/secret-providers/${provider.id}/edit`);
  };
  const errorMessage = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load secret providers.'
    : null;

  const handleDelete = async (provider: SecretProvider) => {
    const name = provider.title?.trim() || 'this provider';
    const confirmed = window.confirm(`Delete ${name}? This action cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteProvider.mutateAsync(provider.id);
    } catch {
      // handled by mutation callbacks
    }
  };

  const createDisabled = false;
  const handleLoadMore = () => {
    if (providersQuery.hasNextPage) {
      void providersQuery.fetchNextPage();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <SecretProvidersHeader onCreate={handleOpenCreate} createDisabled={createDisabled} />

      {errorMessage && (
        <div className="shrink-0 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
          <Alert variant="destructive">
            <AlertTitle>Unable to load secret providers</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => {
                  void providersQuery.refetch();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]"
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <SecretProvidersTable
        providers={providers}
        isLoading={providersQuery.isLoading}
        tooltipDelay={tooltipDelay}
        onEdit={handleOpenEdit}
        onDelete={handleDelete}
      />

      <PaginationBar
        itemCount={providers.length}
        itemLabel="provider"
        hasMore={hasMoreProviders}
        isLoadingMore={providersQuery.isFetchingNextPage}
        onLoadMore={handleLoadMore}
      />

    </div>
  );
}
