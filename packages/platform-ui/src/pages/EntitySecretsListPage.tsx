import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Input } from '@/components/Input';
import { SelectInput } from '@/components/SelectInput';
import { Textarea } from '@/components/Textarea';
import {
  useCreateEntitySecret,
  useDeleteEntitySecret,
  useEntitySecrets,
  useResolveEntitySecret,
  useUpdateEntitySecret,
} from '@/features/entitySecrets/hooks/useEntitySecrets';
import { useSecretProviders } from '@/features/entitySecrets/hooks/useSecretProviders';
import type { EntitySecret } from '@/api/modules/entitySecrets';
import type { SecretProvider } from '@/api/modules/secretProviders';

const ITEMS_PER_PAGE = 20;
const MAX_VISIBLE_PAGES = 7;
const EDGE_OFFSET = 3;

type SecretFormState = {
  title: string;
  description: string;
  secretProviderId: string;
  remoteName: string;
};

type SecretFormErrors = {
  secretProviderId?: string;
  remoteName?: string;
};

type ResolveState = {
  secret: EntitySecret;
  value: string | null;
  error: string | null;
};

const EMPTY_FORM_STATE: SecretFormState = {
  title: '',
  description: '',
  secretProviderId: '',
  remoteName: '',
};

function computePaginationWindow(page: number, pageCount: number) {
  if (pageCount <= MAX_VISIBLE_PAGES) {
    return { start: 1, end: pageCount };
  }
  if (page <= EDGE_OFFSET + 1) {
    return { start: 1, end: MAX_VISIBLE_PAGES };
  }
  if (page >= pageCount - EDGE_OFFSET) {
    const start = Math.max(pageCount - MAX_VISIBLE_PAGES + 1, 1);
    return { start, end: pageCount };
  }
  return { start: page - EDGE_OFFSET, end: page + EDGE_OFFSET };
}

function buildFormState(secret: EntitySecret | null): SecretFormState {
  if (!secret) {
    return { ...EMPTY_FORM_STATE };
  }
  return {
    title: secret.title ?? '',
    description: secret.description ?? '',
    secretProviderId: secret.secretProviderId,
    remoteName: secret.remoteName,
  };
}

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function buildProviderLabel(provider: SecretProvider) {
  return provider.title?.trim() || provider.id;
}

export function EntitySecretsListPage() {
  const [page, setPage] = useState(1);
  const [providerFilter, setProviderFilter] = useState('');
  const secretsQuery = useEntitySecrets({
    page,
    perPage: ITEMS_PER_PAGE,
    secretProviderId: providerFilter || undefined,
  });
  const providersQuery = useSecretProviders({ page: 1, perPage: 100 });
  const createSecret = useCreateEntitySecret();
  const updateSecret = useUpdateEntitySecret();
  const deleteSecret = useDeleteEntitySecret();
  const resolveSecret = useResolveEntitySecret();
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingSecret, setEditingSecret] = useState<EntitySecret | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntitySecret | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);
  const [formState, setFormState] = useState<SecretFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<SecretFormErrors>({});

  const secrets = secretsQuery.data?.items ?? [];
  const pageSize = secretsQuery.data?.perPage ?? ITEMS_PER_PAGE;
  const totalCount = secretsQuery.data?.total ?? 0;
  const pageCount = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const safePage = pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = totalCount === 0 ? 0 : Math.min(startIndex + secrets.length, totalCount);
  const rangeStart = totalCount === 0 || secrets.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = totalCount === 0 || secrets.length === 0 ? 0 : endIndex;
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  const providers = useMemo(() => providersQuery.data?.items ?? [], [providersQuery.data?.items]);
  const providerOptions = useMemo(
    () => providers.map((provider) => ({ value: provider.id, label: buildProviderLabel(provider) })),
    [providers],
  );
  const providerLabels = useMemo(() => {
    return new Map(providers.map((provider) => [provider.id, buildProviderLabel(provider)]));
  }, [providers]);

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
    }
  }, [page, safePage]);

  useEffect(() => {
    if (dialogMode === 'create') {
      setFormState({ ...EMPTY_FORM_STATE, secretProviderId: providerFilter || '' });
      setFormErrors({});
      return;
    }
    if (dialogMode === 'edit' && editingSecret) {
      setFormState(buildFormState(editingSecret));
      setFormErrors({});
    }
  }, [dialogMode, editingSecret, providerFilter]);

  const isFormOpen = dialogMode !== null;
  const isEditing = dialogMode === 'edit';
  const isSaving = createSecret.isPending || updateSecret.isPending;
  const providerError = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load providers.'
    : null;
  const secretsError = secretsQuery.isError
    ? secretsQuery.error?.message ?? 'Failed to load secrets.'
    : null;

  const { start: windowStart, end: windowEnd } = computePaginationWindow(safePage, pageCount);
  const pageNumbers = windowEnd < windowStart
    ? []
    : Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  const handleOpenCreate = () => {
    setEditingSecret(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (secret: EntitySecret) => {
    setEditingSecret(secret);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setEditingSecret(null);
  };

  const validateForm = (state: SecretFormState): SecretFormErrors => {
    const errors: SecretFormErrors = {};
    if (!state.secretProviderId.trim()) {
      errors.secretProviderId = 'Secret provider is required.';
    }
    if (!state.remoteName.trim()) {
      errors.remoteName = 'Remote name is required.';
    }
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = formState.title.trim();
    const trimmedDescription = formState.description.trim();
    const trimmedRemoteName = formState.remoteName.trim();
    const trimmedProviderId = formState.secretProviderId.trim();

    const errors = validateForm({
      ...formState,
      remoteName: trimmedRemoteName,
      secretProviderId: trimmedProviderId,
    });
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      title: trimmedTitle || undefined,
      description: trimmedDescription || undefined,
      secretProviderId: trimmedProviderId,
      remoteName: trimmedRemoteName,
    };

    try {
      if (dialogMode === 'create') {
        await createSecret.mutateAsync(payload);
      } else if (dialogMode === 'edit' && editingSecret) {
        await updateSecret.mutateAsync({
          id: editingSecret.id,
          patch: payload,
        });
      }
      handleCloseDialog();
    } catch {
      // handled by mutation callbacks
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSecret.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
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

  const isResolveDialogOpen = Boolean(resolveState);

  const createDisabled = providers.length === 0 || providersQuery.isLoading || isSaving || providersQuery.isError;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Secrets</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
              Define secret entries sourced from providers.
            </p>
            <div className="mt-3 max-w-xs">
              <SelectInput
                label="Filter by provider"
                value={providerFilter}
                onChange={(event) => {
                  setProviderFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="All providers"
                allowEmptyOption
                options={providerOptions}
                disabled={providersQuery.isLoading || providersQuery.isError}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            disabled={createDisabled}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New secret
          </button>
        </div>
      </div>

      {(providerError || secretsError) && (
        <div className="shrink-0 border-b border-[var(--agyn-border-subtle)] px-6 py-4 space-y-3">
          {providerError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load secret providers</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{providerError}</span>
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
          )}
          {secretsError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load secrets</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{secretsError}</span>
                <button
                  type="button"
                  onClick={() => {
                    void secretsQuery.refetch();
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]"
                >
                  Retry
                </button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

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
            {secretsQuery.isLoading && secrets.length === 0 ? (
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
                const isResolving = resolveSecret.isPending && resolveState?.secret.id === secret.id;

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
                        <Tooltip.Provider delayDuration={tooltipDelay}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => handleResolve(secret)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                aria-label="Resolve secret"
                                disabled={resolveSecret.isPending}
                              >
                                {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                sideOffset={5}
                              >
                                Resolve
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                        <Tooltip.Provider delayDuration={tooltipDelay}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(secret)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                aria-label="Edit secret"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                sideOffset={5}
                              >
                                Edit
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                        <Tooltip.Provider delayDuration={tooltipDelay}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(secret)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] transition-colors"
                                aria-label="Delete secret"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                sideOffset={5}
                              >
                                Delete
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--agyn-text-subtle)]">
              Showing {rangeStart} to {rangeEnd} of {totalCount} secret{totalCount === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    className={`w-8 h-8 rounded-md text-sm transition-all ${
                      safePage === pageNumber
                        ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                        : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                    }`}
                    aria-current={safePage === pageNumber ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={safePage === pageCount}
                className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <ScreenDialog open={isFormOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
          <ScreenDialogHeader className="flex-1 gap-2">
            <ScreenDialogTitle>{isEditing ? 'Edit secret' : 'New secret'}</ScreenDialogTitle>
            <ScreenDialogDescription>
              {isEditing ? 'Update the provider and remote identifier.' : 'Create a new secret reference.'}
            </ScreenDialogDescription>
          </ScreenDialogHeader>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Title"
              value={formState.title}
              onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
              placeholder="Secret name"
              disabled={isSaving}
            />
            <Textarea
              label="Description"
              value={formState.description}
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add a description (optional)"
              rows={3}
              disabled={isSaving}
            />
            <SelectInput
              label="Secret provider"
              value={formState.secretProviderId}
              onChange={(event) => setFormState((current) => ({ ...current, secretProviderId: event.target.value }))}
              options={providerOptions}
              placeholder={providersQuery.isLoading ? 'Loading providers…' : 'Select a provider'}
              error={formErrors.secretProviderId}
              disabled={providersQuery.isLoading || providersQuery.isError || isSaving}
            />
            <Input
              label="Remote name"
              value={formState.remoteName}
              onChange={(event) => setFormState((current) => ({ ...current, remoteName: event.target.value }))}
              placeholder="Path or identifier in the provider"
              error={formErrors.remoteName}
              disabled={isSaving}
            />
            <ScreenDialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create secret'}
              </Button>
            </ScreenDialogFooter>
          </form>
        </ScreenDialogContent>
      </ScreenDialog>

      <ScreenDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ScreenDialogContent className="sm:max-w-md">
          <ScreenDialogHeader>
            <ScreenDialogTitle>Delete secret?</ScreenDialogTitle>
            <ScreenDialogDescription>This action can&apos;t be undone.</ScreenDialogDescription>
          </ScreenDialogHeader>
          {deleteTarget ? (
            <div className="mt-4 rounded-lg border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-4 py-3 text-sm text-[var(--agyn-text-subtle)]">
              <div className="font-medium text-[var(--agyn-dark)]">
                {deleteTarget.title?.trim() || 'Untitled secret'}
              </div>
              <div className="mt-1 text-xs">{deleteTarget.remoteName}</div>
            </div>
          ) : null}
          <ScreenDialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteSecret.isPending}>
              Keep secret
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmDelete} disabled={deleteSecret.isPending}>
              {deleteSecret.isPending ? 'Deleting…' : 'Delete secret'}
            </Button>
          </ScreenDialogFooter>
        </ScreenDialogContent>
      </ScreenDialog>

      <ScreenDialog open={isResolveDialogOpen} onOpenChange={(open) => !open && setResolveState(null)}>
        <ScreenDialogContent className="sm:max-w-lg">
          <ScreenDialogHeader>
            <ScreenDialogTitle>Resolved secret</ScreenDialogTitle>
            <ScreenDialogDescription>
              Use this value immediately. It will not be stored in the UI.
            </ScreenDialogDescription>
          </ScreenDialogHeader>
          {resolveState ? (
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
          ) : null}
          <ScreenDialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setResolveState(null)}>
              Close
            </Button>
          </ScreenDialogFooter>
        </ScreenDialogContent>
      </ScreenDialog>
    </div>
  );
}
