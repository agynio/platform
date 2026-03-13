import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

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
import type { EntitySecret, SecretCreateRequest, SecretUpdateRequest } from '@/api/modules/entitySecrets';
import type { SecretProvider } from '@/api/modules/secretProviders';
import {
  useCreateEntitySecret,
  useDeleteEntitySecret,
  useEntitySecrets,
  useResolveEntitySecret,
  useUpdateEntitySecret,
} from '@/features/entitySecrets/hooks/useEntitySecrets';
import { useSecretProviders } from '@/features/entitySecrets/hooks/useSecretProviders';
import { formatTimestamp } from '@/lib/formatTimestamp';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

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

type SecretFormOptions = {
  dialogMode: 'create' | 'edit' | null;
  editingSecret: EntitySecret | null;
  providerFilter: string;
  onCreate: (payload: SecretCreateRequest) => Promise<EntitySecret>;
  onUpdate: (id: string, patch: SecretUpdateRequest) => Promise<EntitySecret>;
  onClose: () => void;
};

type ProviderOption = {
  value: string;
  label: string;
};

const EMPTY_FORM_STATE: SecretFormState = {
  title: '',
  description: '',
  secretProviderId: '',
  remoteName: '',
};

// Keep dropdown queries bounded; use filters for larger provider sets.
const PROVIDER_DROPDOWN_PAGE_SIZE = 100;

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

function buildProviderLabel(provider: SecretProvider) {
  return provider.title?.trim() || provider.id;
}

function useSecretForm({ dialogMode, editingSecret, providerFilter, onCreate, onUpdate, onClose }: SecretFormOptions) {
  const [formState, setFormState] = useState<SecretFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<SecretFormErrors>({});

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

    const payload: SecretCreateRequest = {
      title: trimmedTitle || undefined,
      description: trimmedDescription || undefined,
      secretProviderId: trimmedProviderId,
      remoteName: trimmedRemoteName,
    };

    try {
      if (dialogMode === 'create') {
        await onCreate(payload);
      } else if (dialogMode === 'edit' && editingSecret) {
        await onUpdate(editingSecret.id, payload);
      }
      onClose();
    } catch {
      // handled by mutation callbacks
    }
  };

  return { formState, formErrors, setFormState, handleSubmit };
}

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
            <SelectInput
              label="Filter by provider"
              value={providerFilter}
              onChange={(event) => onProviderChange(event.target.value)}
              placeholder="All providers"
              allowEmptyOption
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

type SecretFormDialogProps = {
  open: boolean;
  isEditing: boolean;
  isSaving: boolean;
  formState: SecretFormState;
  formErrors: SecretFormErrors;
  providerOptions: ProviderOption[];
  providersLoading: boolean;
  providersError: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  setFormState: Dispatch<SetStateAction<SecretFormState>>;
};

function SecretFormDialog({
  open,
  isEditing,
  isSaving,
  formState,
  formErrors,
  providerOptions,
  providersLoading,
  providersError,
  onSubmit,
  onClose,
  setFormState,
}: SecretFormDialogProps) {
  return (
    <ScreenDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
        <ScreenDialogHeader className="flex-1 gap-2">
          <ScreenDialogTitle>{isEditing ? 'Edit secret' : 'New secret'}</ScreenDialogTitle>
          <ScreenDialogDescription>
            {isEditing ? 'Update the provider and remote identifier.' : 'Create a new secret reference.'}
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
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
            placeholder={providersLoading ? 'Loading providers…' : 'Select a provider'}
            error={formErrors.secretProviderId}
            disabled={providersLoading || providersError || isSaving}
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
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create secret'}
            </Button>
          </ScreenDialogFooter>
        </form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

type SecretDeleteDialogProps = {
  deleteTarget: EntitySecret | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function SecretDeleteDialog({ deleteTarget, isDeleting, onClose, onConfirm }: SecretDeleteDialogProps) {
  return (
    <ScreenDialog open={Boolean(deleteTarget)} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
            Keep secret
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete secret'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

type ResolveSecretDialogProps = {
  resolveState: ResolveState | null;
  providerLabels: Map<string, string>;
  onClose: () => void;
};

function ResolveSecretDialog({ resolveState, providerLabels, onClose }: ResolveSecretDialogProps) {
  const isOpen = Boolean(resolveState);

  return (
    <ScreenDialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
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
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

export function EntitySecretsListPage() {
  const [providerFilter, setProviderFilter] = useState('');
  const secretsQuery = useEntitySecrets({
    pageSize: DEFAULT_PAGE_SIZE,
    secretProviderId: providerFilter || undefined,
  });
  const providersQuery = useSecretProviders({ pageSize: PROVIDER_DROPDOWN_PAGE_SIZE });
  const createSecret = useCreateEntitySecret();
  const updateSecret = useUpdateEntitySecret();
  const deleteSecret = useDeleteEntitySecret();
  const resolveSecret = useResolveEntitySecret();
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingSecret, setEditingSecret] = useState<EntitySecret | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntitySecret | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);

  const secrets = secretsQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [];
  const hasMoreSecrets = secretsQuery.hasNextPage ?? false;
  const tooltipDelay = import.meta.env.MODE === 'test' ? 0 : 300;

  const providers = useMemo(() => providersQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [], [
    providersQuery.data?.pages,
  ]);
  const providerOptions = useMemo(
    () => providers.map((provider) => ({ value: provider.id, label: buildProviderLabel(provider) })),
    [providers],
  );
  const providerLabels = useMemo(() => {
    return new Map(providers.map((provider) => [provider.id, buildProviderLabel(provider)]));
  }, [providers]);

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

  const form = useSecretForm({
    dialogMode,
    editingSecret,
    providerFilter,
    onCreate: createSecret.mutateAsync,
    onUpdate: (id, patch) => updateSecret.mutateAsync({ id, patch }),
    onClose: handleCloseDialog,
  });

  const providerError = providersQuery.isError
    ? providersQuery.error?.message ?? 'Failed to load providers.'
    : null;
  const secretsError = secretsQuery.isError
    ? secretsQuery.error?.message ?? 'Failed to load secrets.'
    : null;

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

  const isFormOpen = dialogMode !== null;
  const isEditing = dialogMode === 'edit';
  const isSaving = createSecret.isPending || updateSecret.isPending;
  const createDisabled = providers.length === 0 || providersQuery.isLoading || isSaving || providersQuery.isError;
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
        onDelete={setDeleteTarget}
      />

      <PaginationBar
        itemCount={secrets.length}
        itemLabel="secret"
        hasMore={hasMoreSecrets}
        isLoadingMore={secretsQuery.isFetchingNextPage}
        onLoadMore={handleLoadMore}
      />

      <SecretFormDialog
        open={isFormOpen}
        isEditing={isEditing}
        isSaving={isSaving}
        formState={form.formState}
        formErrors={form.formErrors}
        providerOptions={providerOptions}
        providersLoading={providersQuery.isLoading}
        providersError={providersQuery.isError}
        onSubmit={form.handleSubmit}
        onClose={handleCloseDialog}
        setFormState={form.setFormState}
      />

      <SecretDeleteDialog
        deleteTarget={deleteTarget}
        isDeleting={deleteSecret.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <ResolveSecretDialog
        resolveState={resolveState}
        providerLabels={providerLabels}
        onClose={() => setResolveState(null)}
      />
    </div>
  );
}
