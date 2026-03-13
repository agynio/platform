import { type FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
  useCreateSecretProvider,
  useDeleteSecretProvider,
  useSecretProviders,
  useUpdateSecretProvider,
} from '@/features/entitySecrets/hooks/useSecretProviders';
import type { SecretProvider, SecretProviderType } from '@/api/modules/secretProviders';

const ITEMS_PER_PAGE = 20;
const MAX_VISIBLE_PAGES = 7;
const EDGE_OFFSET = 3;

type ProviderFormState = {
  title: string;
  description: string;
  type: SecretProviderType;
  vaultAddress: string;
  vaultToken: string;
};

type ProviderFormErrors = {
  vaultAddress?: string;
  vaultToken?: string;
};

const EMPTY_FORM_STATE: ProviderFormState = {
  title: '',
  description: '',
  type: 'vault',
  vaultAddress: '',
  vaultToken: '',
};

const PROVIDER_TYPE_OPTIONS = [{ value: 'vault', label: 'Vault' }];

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

function buildFormState(provider: SecretProvider | null): ProviderFormState {
  if (!provider) {
    return { ...EMPTY_FORM_STATE };
  }
  const vaultConfig = provider.config.vault;
  return {
    title: provider.title ?? '',
    description: provider.description ?? '',
    type: provider.type,
    vaultAddress: vaultConfig?.address ?? '',
    vaultToken: vaultConfig?.token ?? '',
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

export function SecretProvidersListPage() {
  const [page, setPage] = useState(1);
  const providersQuery = useSecretProviders({ page, perPage: ITEMS_PER_PAGE });
  const createProvider = useCreateSecretProvider();
  const updateProvider = useUpdateSecretProvider();
  const deleteProvider = useDeleteSecretProvider();
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingProvider, setEditingProvider] = useState<SecretProvider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecretProvider | null>(null);
  const [formState, setFormState] = useState<ProviderFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<ProviderFormErrors>({});

  const providers = providersQuery.data?.items ?? [];
  const pageSize = providersQuery.data?.perPage ?? ITEMS_PER_PAGE;
  const totalCount = providersQuery.data?.total ?? 0;
  const pageCount = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const safePage = pageCount === 0 ? 1 : Math.min(Math.max(1, page), pageCount);
  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = totalCount === 0 ? 0 : Math.min(startIndex + providers.length, totalCount);
  const rangeStart = totalCount === 0 || providers.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = totalCount === 0 || providers.length === 0 ? 0 : endIndex;
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
    }
  }, [page, safePage]);

  useEffect(() => {
    if (dialogMode === 'create') {
      setFormState({ ...EMPTY_FORM_STATE });
      setFormErrors({});
      return;
    }
    if (dialogMode === 'edit' && editingProvider) {
      setFormState(buildFormState(editingProvider));
      setFormErrors({});
    }
  }, [dialogMode, editingProvider]);

  const isFormOpen = dialogMode !== null;
  const isEditing = dialogMode === 'edit';
  const isSaving = createProvider.isPending || updateProvider.isPending;

  const errorMessage = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load secret providers.'
    : null;

  const { start: windowStart, end: windowEnd } = computePaginationWindow(safePage, pageCount);
  const pageNumbers = windowEnd < windowStart
    ? []
    : Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  const handleOpenCreate = () => {
    setEditingProvider(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (provider: SecretProvider) => {
    setEditingProvider(provider);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setEditingProvider(null);
  };

  const validateForm = (state: ProviderFormState): ProviderFormErrors => {
    const errors: ProviderFormErrors = {};
    if (!state.vaultAddress.trim()) {
      errors.vaultAddress = 'Vault address is required.';
    }
    if (!state.vaultToken.trim()) {
      errors.vaultToken = 'Vault token is required.';
    }
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = formState.title.trim();
    const trimmedDescription = formState.description.trim();
    const trimmedAddress = formState.vaultAddress.trim();
    const trimmedToken = formState.vaultToken.trim();

    const errors = validateForm({
      ...formState,
      vaultAddress: trimmedAddress,
      vaultToken: trimmedToken,
    });
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      title: trimmedTitle || undefined,
      description: trimmedDescription || undefined,
      type: formState.type,
      config: {
        vault: {
          address: trimmedAddress,
          token: trimmedToken,
        },
      },
    };

    try {
      if (dialogMode === 'create') {
        await createProvider.mutateAsync(payload);
      } else if (dialogMode === 'edit' && editingProvider) {
        await updateProvider.mutateAsync({
          id: editingProvider.id,
          patch: {
            title: payload.title,
            description: payload.description,
            config: payload.config,
          },
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
      await deleteProvider.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // handled by mutation callbacks
    }
  };

  const createDisabled = providersQuery.isLoading || isSaving;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
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
            onClick={handleOpenCreate}
            disabled={createDisabled}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New secret provider
          </button>
        </div>
      </div>

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
            {providersQuery.isLoading && providers.length === 0 ? (
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
                        <Tooltip.Provider delayDuration={tooltipDelay}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(provider)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                aria-label="Edit secret provider"
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
                                onClick={() => setDeleteTarget(provider)}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] transition-colors"
                                aria-label="Delete secret provider"
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
              Showing {rangeStart} to {rangeEnd} of {totalCount} provider{totalCount === 1 ? '' : 's'}
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
            <ScreenDialogTitle>{isEditing ? 'Edit secret provider' : 'New secret provider'}</ScreenDialogTitle>
            <ScreenDialogDescription>
              {isEditing
                ? 'Update the provider settings used to resolve secrets.'
                : 'Add a provider integration for storing and resolving secrets.'}
            </ScreenDialogDescription>
          </ScreenDialogHeader>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Title"
              value={formState.title}
              onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
              placeholder="Provider name"
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
              label="Provider type"
              value={formState.type}
              onChange={(event) => setFormState((current) => ({ ...current, type: event.target.value as SecretProviderType }))}
              options={PROVIDER_TYPE_OPTIONS}
              disabled={isSaving || isEditing}
            />
            <Input
              label="Vault address"
              value={formState.vaultAddress}
              onChange={(event) => setFormState((current) => ({ ...current, vaultAddress: event.target.value }))}
              placeholder="https://vault.example.com"
              error={formErrors.vaultAddress}
              disabled={isSaving}
            />
            <Input
              label="Vault token"
              type="password"
              value={formState.vaultToken}
              onChange={(event) => setFormState((current) => ({ ...current, vaultToken: event.target.value }))}
              placeholder="Enter a Vault token"
              error={formErrors.vaultToken}
              disabled={isSaving}
            />
            <ScreenDialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create provider'}
              </Button>
            </ScreenDialogFooter>
          </form>
        </ScreenDialogContent>
      </ScreenDialog>

      <ScreenDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ScreenDialogContent className="sm:max-w-md">
          <ScreenDialogHeader>
            <ScreenDialogTitle>Delete secret provider?</ScreenDialogTitle>
            <ScreenDialogDescription>
              This will remove the provider and any secrets linked to it. This action can&apos;t be undone.
            </ScreenDialogDescription>
          </ScreenDialogHeader>
          {deleteTarget ? (
            <div className="mt-4 rounded-lg border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-4 py-3 text-sm text-[var(--agyn-text-subtle)]">
              <div className="font-medium text-[var(--agyn-dark)]">
                {deleteTarget.title?.trim() || 'Untitled provider'}
              </div>
              <div className="mt-1 text-xs">{deleteTarget.id}</div>
            </div>
          ) : null}
          <ScreenDialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteProvider.isPending}>
              Keep provider
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleteProvider.isPending}
            >
              {deleteProvider.isPending ? 'Deleting…' : 'Delete provider'}
            </Button>
          </ScreenDialogFooter>
        </ScreenDialogContent>
      </ScreenDialog>
    </div>
  );
}
