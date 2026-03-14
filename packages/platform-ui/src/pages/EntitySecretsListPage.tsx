import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { ActionIconButton } from '@/components/ActionIconButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import { Dropdown } from '@/components/Dropdown';
import { PaginationBar } from '@/components/PaginationBar';
import { Textarea } from '@/components/Textarea';
import type { EntitySecret } from '@/api/modules/entitySecrets';
import {
  useDeleteEntitySecret,
  useEntitySecrets,
  useResolveEntitySecret,
} from '@/features/entitySecrets/hooks/useEntitySecrets';
import { useSecretProviders } from '@/features/entitySecrets/hooks/useSecretProviders';
import { buildProviderLabel, PROVIDER_DROPDOWN_PAGE_SIZE } from '@/features/entitySecrets/utils';
import { formatTimestamp } from '@/lib/formatTimestamp';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

type ResolveState = {
  secret: EntitySecret;
  value: string | null;
  error: string | null;
};

type ProviderOption = {
  value: string;
  label: string;
};

const ALL_PROVIDERS_VALUE = '__all_providers__';

type EntitySecretsHeaderProps = {
  providerFilter: string;
  providerOptions: ProviderOption[];
  providersLoading: boolean;
  providersError: boolean;
  onProviderChange: (providerId: string) => void;
  onCreate: () => void;
  createDisabled: boolean;
};

function EntitySecretsHeader({
  providerFilter,
  providerOptions,
  providersLoading,
  providersError,
  onProviderChange,
  onCreate,
  createDisabled,
}: EntitySecretsHeaderProps) {
  return (
    <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Secrets</h1>
          <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
            Define secret entries sourced from providers.
          </p>
          <div className="mt-3 max-w-xs">
            <Dropdown
              label="Filter by provider"
              value={providerFilter || ALL_PROVIDERS_VALUE}
              onValueChange={(value) => onProviderChange(value === ALL_PROVIDERS_VALUE ? '' : value)}
              options={providerOptions}
              disabled={providersLoading || providersError}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={createDisabled}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New secret
        </button>
      </div>
    </div>
  );
}

type EntitySecretsAlertsProps = {
  providerError: string | null;
  secretsError: string | null;
  onRetryProviders: () => void;
  onRetrySecrets: () => void;
};

function EntitySecretsAlerts({ providerError, secretsError, onRetryProviders, onRetrySecrets }: EntitySecretsAlertsProps) {
  if (!providerError && !secretsError) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-[var(--agyn-border-subtle)] px-6 py-4 space-y-3">
      {providerError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load secret providers</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{providerError}</span>
            <button
              type="button"
              onClick={onRetryProviders}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]"
            >
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
      {secretsError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load secrets</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{secretsError}</span>
            <button
              type="button"
              onClick={onRetrySecrets}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]"
            >
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

type EntitySecretsTableProps = {
  secrets: EntitySecret[];
  providerLabels: Map<string, string>;
  isLoading: boolean;
  tooltipDelay: number;
  resolvePending: boolean;
  resolvingSecretId: string | null;
  onResolve: (secret: EntitySecret) => void;
  onEdit: (secret: EntitySecret) => void;
  onDelete: (secret: EntitySecret) => void;
};

function EntitySecretsTable({
  secrets,
  providerLabels,
  isLoading,
  tooltipDelay,
  resolvePending,
  resolvingSecretId,
  onResolve,
  onEdit,
  onDelete,
}: EntitySecretsTableProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Secret</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Provider</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Remote name</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && secrets.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading secrets…
              </td>
            </tr>
          ) : secrets.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                No secrets available.
              </td>
            </tr>
          ) : (
            secrets.map((secret) => {
              const displayTitle = secret.title?.trim() || 'Untitled secret';
              const description = secret.description?.trim();
              const providerLabel = providerLabels.get(secret.secretProviderId) ?? secret.secretProviderId;
              const isResolving = resolvePending && resolvingSecretId === secret.id;

              return (
                <tr
                  key={secret.id}
                  className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]"
                >
                  <td className="h-[70px] px-6">
                    <div className="font-medium text-[var(--agyn-dark)]">{displayTitle}</div>
                    {description ? (
                      <div className="mt-1 text-xs text-[var(--agyn-text-subtle)]">{description}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[var(--agyn-text-subtle)]">
                      <span className="uppercase">ID</span>: <code className="text-[10px]">{secret.id}</code>
                    </div>
                  </td>
                  <td className="h-[70px] px-6">
                    <div className="text-sm text-[var(--agyn-dark)]">{providerLabel}</div>
                  </td>
                  <td className="h-[70px] px-6">
                    <div className="text-sm text-[var(--agyn-text-subtle)]">
                      <code className="rounded bg-[var(--agyn-bg-light)] px-2 py-1 text-xs text-[var(--agyn-dark)]">
                        {secret.remoteName}
                      </code>
                    </div>
                    <div className="mt-2 text-xs text-[var(--agyn-text-subtle)]">
                      Updated {formatTimestamp(secret.updatedAt ?? secret.createdAt)}
                    </div>
                  </td>
                  <td className="h-[70px] px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <ActionIconButton
                        icon={isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        label="Resolve secret"
                        tooltip="Resolve"
                        delayDuration={tooltipDelay}
                        onClick={() => onResolve(secret)}
                        disabled={resolvePending}
                      />
                      <ActionIconButton
                        icon={<Pencil className="w-4 h-4" />}
                        label="Edit secret"
                        tooltip="Edit"
                        delayDuration={tooltipDelay}
                        onClick={() => onEdit(secret)}
                      />
                      <ActionIconButton
                        icon={<Trash2 className="w-4 h-4" />}
                        label="Delete secret"
                        tooltip="Delete"
                        delayDuration={tooltipDelay}
                        onClick={() => onDelete(secret)}
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

type ResolveSecretPanelProps = {
  resolveState: ResolveState | null;
  providerLabels: Map<string, string>;
  onClose: () => void;
};

function ResolveSecretPanel({ resolveState, providerLabels, onClose }: ResolveSecretPanelProps) {
  if (!resolveState) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-[var(--agyn-border-subtle)] px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--agyn-dark)]">Resolved secret</p>
          <p className="text-xs text-[var(--agyn-text-subtle)]">
            Use this value immediately. It will not be stored in the UI.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="mt-4 space-y-4">
        <div className="rounded-lg border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-4 py-3 text-sm text-[var(--agyn-text-subtle)]">
          <div className="font-medium text-[var(--agyn-dark)]">
            {resolveState.secret.title?.trim() || 'Untitled secret'}
          </div>
          <div className="mt-1 text-xs">
            {providerLabels.get(resolveState.secret.secretProviderId) ?? resolveState.secret.secretProviderId}
          </div>
        </div>
        {resolveState.error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to resolve secret</AlertTitle>
            <AlertDescription>{resolveState.error}</AlertDescription>
          </Alert>
        ) : resolveState.value === null ? (
          <div className="text-sm text-[var(--agyn-text-subtle)]">Resolving secret…</div>
        ) : (
          <Textarea value={resolveState.value} readOnly rows={4} />
        )}
      </div>
    </div>
  );
}

export function EntitySecretsListPage() {
  const navigate = useNavigate();
  const [providerFilter, setProviderFilter] = useState('');
  const secretsQuery = useEntitySecrets({
    pageSize: DEFAULT_PAGE_SIZE,
    secretProviderId: providerFilter || undefined,
  });
  const providersQuery = useSecretProviders({ pageSize: PROVIDER_DROPDOWN_PAGE_SIZE });
  const deleteSecret = useDeleteEntitySecret();
  const resolveSecret = useResolveEntitySecret();
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);

  const secrets = secretsQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [];
  const hasMoreSecrets = secretsQuery.hasNextPage ?? false;
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  const providers = useMemo(() => providersQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [], [
    providersQuery.data?.pages,
  ]);
  const providerOptions = useMemo(
    () => [
      { value: ALL_PROVIDERS_VALUE, label: 'All providers' },
      ...providers.map((provider) => ({ value: provider.id, label: buildProviderLabel(provider) })),
    ],
    [providers],
  );
  const providerLabels = useMemo(() => {
    return new Map(providers.map((provider) => [provider.id, buildProviderLabel(provider)]));
  }, [providers]);

  const handleOpenCreate = () => {
    const search = providerFilter ? `?providerId=${encodeURIComponent(providerFilter)}` : '';
    navigate(`/entity-secrets/new${search}`);
  };

  const handleOpenEdit = (secret: EntitySecret) => {
    navigate(`/entity-secrets/${secret.id}/edit`);
  };

  const providerError = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load providers.'
    : null;
  const secretsError = secretsQuery.isError
    ? secretsQuery.error?.message ?? 'Failed to load secrets.'
    : null;

  const handleDelete = async (secret: EntitySecret) => {
    const name = secret.title?.trim() || 'this secret';
    const confirmed = window.confirm(`Delete ${name}? This action cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteSecret.mutateAsync(secret.id);
    } catch {
      // handled by mutation callbacks
    }
  };

  const handleResolve = (secret: EntitySecret) => {
    setResolveState({ secret, value: null, error: null });
    resolveSecret.mutate(secret.id, {
      onSuccess: (data) => {
        setResolveState({ secret, value: data.value, error: null });
      },
      onError: () => {
        setResolveState({ secret, value: null, error: 'Unable to resolve secret.' });
      },
    });
  };

  const createDisabled = providers.length === 0 || providersQuery.isLoading || providersQuery.isError;
  const handleLoadMore = () => {
    if (secretsQuery.hasNextPage) {
      void secretsQuery.fetchNextPage();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <EntitySecretsHeader
        providerFilter={providerFilter}
        providerOptions={providerOptions}
        providersLoading={providersQuery.isLoading}
        providersError={providersQuery.isError}
        onProviderChange={(value) => {
          setProviderFilter(value);
        }}
        onCreate={handleOpenCreate}
        createDisabled={createDisabled}
      />

      <EntitySecretsAlerts
        providerError={providerError}
        secretsError={secretsError}
        onRetryProviders={() => {
          void providersQuery.refetch();
        }}
        onRetrySecrets={() => {
          void secretsQuery.refetch();
        }}
      />

      <EntitySecretsTable
        secrets={secrets}
        providerLabels={providerLabels}
        isLoading={secretsQuery.isLoading}
        tooltipDelay={tooltipDelay}
        resolvePending={resolveSecret.isPending}
        resolvingSecretId={resolveState?.secret.id ?? null}
        onResolve={handleResolve}
        onEdit={handleOpenEdit}
        onDelete={handleDelete}
      />

      <ResolveSecretPanel
        resolveState={resolveState}
        providerLabels={providerLabels}
        onClose={() => setResolveState(null)}
      />

      <PaginationBar
        itemCount={secrets.length}
        itemLabel="secret"
        hasMore={hasMoreSecrets}
        isLoadingMore={secretsQuery.isFetchingNextPage}
        onLoadMore={handleLoadMore}
      />

    </div>
  );
}
