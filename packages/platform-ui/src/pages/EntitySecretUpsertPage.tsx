import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import { Dropdown } from '@/components/Dropdown';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { getEntitySecret, type EntitySecret } from '@/api/modules/entitySecrets';
import { useSecretProviders } from '@/features/entitySecrets/hooks/useSecretProviders';
import {
  useCreateEntitySecret,
  useUpdateEntitySecret,
} from '@/features/entitySecrets/hooks/useEntitySecrets';
import { buildProviderLabel, PROVIDER_DROPDOWN_PAGE_SIZE } from '@/features/entitySecrets/utils';

type EntitySecretUpsertPageProps = {
  mode: 'create' | 'edit';
};

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

const EMPTY_FORM_STATE: SecretFormState = {
  title: '',
  description: '',
  secretProviderId: '',
  remoteName: '',
};

function buildFormState(secret: EntitySecret): SecretFormState {
  return {
    title: secret.title ?? '',
    description: secret.description ?? '',
    secretProviderId: secret.secretProviderId,
    remoteName: secret.remoteName,
  };
}

function validateForm(state: SecretFormState): SecretFormErrors {
  const errors: SecretFormErrors = {};
  if (!state.secretProviderId.trim()) {
    errors.secretProviderId = 'Secret provider is required.';
  }
  if (!state.remoteName.trim()) {
    errors.remoteName = 'Remote name is required.';
  }
  return errors;
}

export function EntitySecretUpsertPage({ mode }: EntitySecretUpsertPageProps) {
  const navigate = useNavigate();
  const { entityId } = useParams<{ entityId?: string }>();
  const [searchParams] = useSearchParams();
  const createSecret = useCreateEntitySecret();
  const updateSecret = useUpdateEntitySecret();
  const providersQuery = useSecretProviders({ pageSize: PROVIDER_DROPDOWN_PAGE_SIZE });
  const secretQuery = useQuery<EntitySecret, Error>({
    queryKey: ['entity-secret', entityId],
    queryFn: () => getEntitySecret(entityId ?? ''),
    enabled: mode === 'edit' && Boolean(entityId),
  });

  const [formState, setFormState] = useState<SecretFormState>(EMPTY_FORM_STATE);
  const [formErrors, setFormErrors] = useState<SecretFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const secret = secretQuery.data;
  const isEditing = mode === 'edit';
  const isSaving = createSecret.isPending || updateSecret.isPending;
  const isLoading = secretQuery.isLoading;
  const loadError = secretQuery.isError
    ? secretQuery.error?.message ?? 'Unable to load secret.'
    : null;

  const providers = useMemo(() => providersQuery.data?.pages.flatMap((pageData) => pageData.items) ?? [], [
    providersQuery.data?.pages,
  ]);

  const providerOptions = useMemo(() => {
    const options = providers.map((provider) => ({
      value: provider.id,
      label: buildProviderLabel(provider),
    }));
    if (!formState.secretProviderId) {
      return options;
    }
    const hasSelection = options.some((option) => option.value === formState.secretProviderId);
    if (hasSelection) {
      return options;
    }
    return [{ value: formState.secretProviderId, label: formState.secretProviderId }, ...options];
  }, [providers, formState.secretProviderId]);

  useEffect(() => {
    setSubmitError(null);
    if (mode === 'create') {
      const providerId = searchParams.get('providerId') ?? '';
      setFormState({ ...EMPTY_FORM_STATE, secretProviderId: providerId });
      setFormErrors({});
      return;
    }
    if (secret) {
      setFormState(buildFormState(secret));
      setFormErrors({});
    }
  }, [mode, secret, searchParams]);

  const pageTitle = useMemo(() => {
    if (mode === 'create') {
      return 'Create entity secret';
    }
    const title = secret?.title?.trim();
    return `Edit ${title || 'entity secret'}`;
  }, [mode, secret?.title]);

  const pageSubtitle = useMemo(() => {
    return mode === 'create'
      ? 'Create a new secret reference for your entities.'
      : 'Update the provider and remote identifier for this secret.';
  }, [mode]);

  const handleCancel = () => {
    navigate('/entity-secrets');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const trimmedTitle = formState.title.trim();
    const trimmedDescription = formState.description.trim();
    const trimmedProviderId = formState.secretProviderId.trim();
    const trimmedRemoteName = formState.remoteName.trim();

    const errors = validateForm({
      ...formState,
      secretProviderId: trimmedProviderId,
      remoteName: trimmedRemoteName,
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
      if (mode === 'edit' && secret) {
        await updateSecret.mutateAsync({ id: secret.id, patch: payload });
      } else {
        await createSecret.mutateAsync(payload);
      }
      navigate('/entity-secrets', { replace: true });
    } catch {
      setSubmitError('Unable to save the secret. Please try again.');
    }
  };

  const showForm = mode === 'create' || Boolean(secret);

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
                  value={formState.title}
                  onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Secret name"
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center gap-3 self-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || (mode === 'create' && providers.length === 0)}>
                  {isEditing ? 'Save changes' : 'Create secret'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {providersQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {providersQuery.error?.message ?? 'Unable to load secret providers.'}
                </AlertDescription>
              </Alert>
            )}
            {providers.length === 0 && !providersQuery.isLoading && !providersQuery.isError && mode === 'create' && (
              <Alert variant="destructive">
                <AlertDescription>No secret providers available. Create a provider first.</AlertDescription>
              </Alert>
            )}
            <Textarea
              label="Description"
              value={formState.description}
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add a description (optional)"
              rows={3}
              disabled={isSaving}
            />
            <Dropdown
              label="Secret provider"
              value={formState.secretProviderId || undefined}
              onValueChange={(value) => setFormState((current) => ({ ...current, secretProviderId: value }))}
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
              <AlertTitle>{loadError ? 'Unable to load secret' : 'Secret not found'}</AlertTitle>
              <AlertDescription>{loadError ?? 'The requested secret could not be located.'}</AlertDescription>
            </Alert>
          </div>
        )
      )}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-[var(--agyn-text-subtle)]">
          Loading secret…
        </div>
      )}
    </div>
  );
}
