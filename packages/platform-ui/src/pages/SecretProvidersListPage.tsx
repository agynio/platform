import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { ActionIconButton } from '@/components/ActionIconButton';
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
import { PaginationBar } from '@/components/PaginationBar';
import { SelectInput } from '@/components/SelectInput';
import { Textarea } from '@/components/Textarea';
import type {
  SecretProvider,
  SecretProviderCreateRequest,
  SecretProviderType,
  SecretProviderUpdateRequest,
} from '@/api/modules/secretProviders';
import {
  useCreateSecretProvider,
  useDeleteSecretProvider,
  useSecretProviders,
  useUpdateSecretProvider,
} from '@/features/entitySecrets/hooks/useSecretProviders';
import { formatTimestamp } from '@/lib/formatTimestamp';
import { DEFAULT_PAGE_SIZE, getPaginationMeta } from '@/lib/pagination';

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

type ProviderFormOptions = {
  dialogMode: 'create' | 'edit' | null;
  editingProvider: SecretProvider | null;
  onCreate: (payload: SecretProviderCreateRequest) => Promise<SecretProvider>;
  onUpdate: (id: string, patch: SecretProviderUpdateRequest) => Promise<SecretProvider>;
  onClose: () => void;
};

const EMPTY_FORM_STATE: ProviderFormState = {
  title: '',
  description: '',
  type: 'vault',
  vaultAddress: '',
  vaultToken: '',
};

const PROVIDER_TYPE_OPTIONS = [{ value: 'vault', label: 'Vault' }];

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

function useProviderForm({ dialogMode, editingProvider, onCreate, onUpdate, onClose }: ProviderFormOptions) {
  const [formState, setFormState] = useState<ProviderFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<ProviderFormErrors>({});

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

    const payload: SecretProviderCreateRequest = {
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
        await onCreate(payload);
      } else if (dialogMode === 'edit' && editingProvider) {
        await onUpdate(editingProvider.id, {
          title: payload.title,
          description: payload.description,
          config: payload.config,
        });
      }
      onClose();
    } catch {
      // handled by mutation callbacks
    }
  };

  return { formState, formErrors, setFormState, handleSubmit };
}

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

type ProviderFormDialogProps = {
  open: boolean;
  isEditing: boolean;
  isSaving: boolean;
  formState: ProviderFormState;
  formErrors: ProviderFormErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  setFormState: Dispatch<SetStateAction<ProviderFormState>>;
};

function ProviderFormDialog({
  open,
  isEditing,
  isSaving,
  formState,
  formErrors,
  onSubmit,
  onClose,
  setFormState,
}: ProviderFormDialogProps) {
  return (
    <ScreenDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
        <ScreenDialogHeader className="flex-1 gap-2">
          <ScreenDialogTitle>{isEditing ? 'Edit secret provider' : 'New secret provider'}</ScreenDialogTitle>
          <ScreenDialogDescription>
            {isEditing
              ? 'Update the provider settings used to resolve secrets.'
              : 'Add a provider integration for storing and resolving secrets.'}
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
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
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create provider'}
            </Button>
          </ScreenDialogFooter>
        </form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

type ProviderDeleteDialogProps = {
  deleteTarget: SecretProvider | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function ProviderDeleteDialog({ deleteTarget, isDeleting, onClose, onConfirm }: ProviderDeleteDialogProps) {
  return (
    <ScreenDialog open={Boolean(deleteTarget)} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
            Keep provider
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete provider'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

export function SecretProvidersListPage() {
  const [page, setPage] = useState(1);
  const providersQuery = useSecretProviders({ page, perPage: DEFAULT_PAGE_SIZE });
  const createProvider = useCreateSecretProvider();
  const updateProvider = useUpdateSecretProvider();
  const deleteProvider = useDeleteSecretProvider();
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingProvider, setEditingProvider] = useState<SecretProvider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecretProvider | null>(null);

  const providers = providersQuery.data?.items ?? [];
  const pageSize = providersQuery.data?.perPage ?? DEFAULT_PAGE_SIZE;
  const totalCount = providersQuery.data?.total ?? 0;
  const { pageCount, safePage, rangeStart, rangeEnd } = getPaginationMeta({
    page,
    pageSize,
    totalCount,
    itemsCount: providers.length,
  });
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
    }
  }, [page, safePage]);

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

  const form = useProviderForm({
    dialogMode,
    editingProvider,
    onCreate: createProvider.mutateAsync,
    onUpdate: (id, patch) => updateProvider.mutateAsync({ id, patch }),
    onClose: handleCloseDialog,
  });

  const isFormOpen = dialogMode !== null;
  const isEditing = dialogMode === 'edit';
  const isSaving = createProvider.isPending || updateProvider.isPending;
  const errorMessage = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load secret providers.'
    : null;

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
        onDelete={setDeleteTarget}
      />

      <PaginationBar
        page={safePage}
        pageCount={pageCount}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        totalCount={totalCount}
        itemLabel="provider"
        onPageChange={setPage}
      />

      <ProviderFormDialog
        open={isFormOpen}
        isEditing={isEditing}
        isSaving={isSaving}
        formState={form.formState}
        formErrors={form.formErrors}
        setFormState={form.setFormState}
        onSubmit={form.handleSubmit}
        onClose={handleCloseDialog}
      />

      <ProviderDeleteDialog
        deleteTarget={deleteTarget}
        isDeleting={deleteProvider.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
