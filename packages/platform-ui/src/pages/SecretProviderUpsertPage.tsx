import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import { Dropdown } from '@/components/Dropdown';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import {
  getSecretProvider,
  type SecretProvider,
  type SecretProviderCreateRequest,
  type SecretProviderType,
  type SecretProviderUpdateRequest,
} from '@/api/modules/secretProviders';
import { useCreateSecretProvider, useUpdateSecretProvider } from '@/features/entitySecrets/hooks/useSecretProviders';

type SecretProviderUpsertPageProps = {
  mode: 'create' | 'edit';
};

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

function buildFormState(provider: SecretProvider): ProviderFormState {
  const vaultConfig = provider.config.vault;
  return {
    title: provider.title ?? '',
    description: provider.description ?? '',
    type: provider.type,
    vaultAddress: vaultConfig?.address ?? '',
    vaultToken: vaultConfig?.token ?? '',
  };
}

function validateForm(state: ProviderFormState): ProviderFormErrors {
  const errors: ProviderFormErrors = {};
  if (!state.vaultAddress.trim()) {
    errors.vaultAddress = 'Vault address is required.';
  }
  if (!state.vaultToken.trim()) {
    errors.vaultToken = 'Vault token is required.';
  }
  return errors;
}

export function SecretProviderUpsertPage({ mode }: SecretProviderUpsertPageProps) {
  const navigate = useNavigate();
  const { entityId } = useParams<{ entityId?: string }>();
  const createProvider = useCreateSecretProvider();
  const updateProvider = useUpdateSecretProvider();
  const providerQuery = useQuery<SecretProvider, Error>({
    queryKey: ['secret-provider', entityId],
    queryFn: () => getSecretProvider(entityId ?? ''),
    enabled: mode === 'edit' && Boolean(entityId),
  });

  const [formState, setFormState] = useState<ProviderFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<ProviderFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const provider = providerQuery.data;
  const isEditing = mode === 'edit';
  const isSaving = createProvider.isPending || updateProvider.isPending;
  const isLoading = providerQuery.isLoading;
  const loadError = providerQuery.isError
    ? providerQuery.error?.message ?? 'Unable to load secret provider.'
    : null;

  useEffect(() => {
    setSubmitError(null);
    if (mode === 'create') {
      setFormState({ ...EMPTY_FORM_STATE });
      setFormErrors({});
      return;
    }
    if (provider) {
      setFormState(buildFormState(provider));
      setFormErrors({});
    }
  }, [mode, provider]);

  const pageTitle = useMemo(() => {
    if (mode === 'create') {
      return 'Create secret provider';
    }
    const title = provider?.title?.trim();
    return `Edit ${title || 'secret provider'}`;
  }, [mode, provider?.title]);

  const pageSubtitle = useMemo(() => {
    return mode === 'create'
      ? 'Add a provider integration for storing and resolving secrets.'
      : 'Update the provider settings used to resolve secrets.';
  }, [mode]);

  const handleCancel = () => {
    navigate('/secret-providers');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

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
      if (mode === 'edit' && provider) {
        const updatePayload: SecretProviderUpdateRequest = {
          title: payload.title,
          description: payload.description,
          config: payload.config,
        };
        await updateProvider.mutateAsync({ id: provider.id, patch: updatePayload });
      } else {
        await createProvider.mutateAsync(payload);
      }
      navigate('/secret-providers', { replace: true });
    } catch {
      setSubmitError('Unable to save the secret provider. Please try again.');
    }
  };

  const showForm = mode === 'create' || Boolean(provider);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      {showForm ? (
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
            <div className="flex flex-wrap items-start gap-6">
              <div className="min-w-[240px] flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    {pageTitle}
                  </p>
                  <p className="text-sm text-[var(--agyn-text-subtle)]">{pageSubtitle}</p>
                </div>
                <Input
                  label="Title"
                  size="sm"
                  value={formState.title}
                  onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Provider name"
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center gap-3 self-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isEditing ? 'Save changes' : 'Create provider'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <Textarea
              label="Description"
              value={formState.description}
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add a description (optional)"
              rows={3}
              disabled={isSaving}
            />
            <Dropdown
              label="Provider type"
              size="sm"
              value={formState.type}
              onValueChange={(value) =>
                setFormState((current) => ({ ...current, type: value as SecretProviderType }))
              }
              options={PROVIDER_TYPE_OPTIONS}
              disabled={isSaving || isEditing}
            />
            <Input
              label="Vault address"
              size="sm"
              value={formState.vaultAddress}
              onChange={(event) => setFormState((current) => ({ ...current, vaultAddress: event.target.value }))}
              placeholder="https://vault.example.com"
              error={formErrors.vaultAddress}
              disabled={isSaving}
            />
            <Input
              label="Vault token"
              size="sm"
              type="password"
              value={formState.vaultToken}
              onChange={(event) => setFormState((current) => ({ ...current, vaultToken: event.target.value }))}
              placeholder="Enter a Vault token"
              error={formErrors.vaultToken}
              disabled={isSaving}
            />
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </div>
        </form>
      ) : (
        !isLoading && (
          <div className="flex flex-1 items-center justify-center px-6 py-12">
            <Alert variant="destructive" className="max-w-xl">
              <AlertTitle>{loadError ? 'Unable to load secret provider' : 'Secret provider not found'}</AlertTitle>
              <AlertDescription>{loadError ?? 'The requested secret provider could not be located.'}</AlertDescription>
            </Alert>
          </div>
        )
      )}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-[var(--agyn-text-subtle)]">
          Loading secret provider…
        </div>
      )}
    </div>
  );
}
