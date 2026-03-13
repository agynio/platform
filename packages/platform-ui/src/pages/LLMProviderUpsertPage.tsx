import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/forms/Form';
import { Input } from '@/components/Input';
import { SelectInput } from '@/components/SelectInput';
import { useCreateLLMProvider, useLLMProvider, useUpdateLLMProvider } from '@/api/hooks/useLLMProviders';
import type { LLMAuthMethod } from '@/api/modules/llmEntities';

const LIST_PATH = '/llm-providers';

const AUTH_METHOD_OPTIONS = [{ value: 'bearer', label: 'Bearer token' }];

type ProviderFormValues = {
  endpoint: string;
  authMethod: LLMAuthMethod;
  token: string;
};

export interface LLMProviderUpsertPageProps {
  mode: 'create' | 'edit';
}

function isValidEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function LLMProviderUpsertPage({ mode }: LLMProviderUpsertPageProps) {
  const navigate = useNavigate();
  const params = useParams();
  const providerId = params.id ?? null;
  const providerQuery = useLLMProvider(mode === 'edit' ? providerId : null);
  const createProvider = useCreateLLMProvider();
  const updateProvider = useUpdateLLMProvider();
  const provider = providerQuery.data;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ProviderFormValues>({
    defaultValues: {
      endpoint: '',
      authMethod: 'bearer',
      token: '',
    },
  });

  useEffect(() => {
    if (mode === 'edit' && provider) {
      form.reset({
        endpoint: provider.endpoint,
        authMethod: provider.authMethod,
        token: '',
      });
    }
  }, [form, mode, provider]);

  const isSubmitting = createProvider.isPending || updateProvider.isPending;
  const showNotFound = mode === 'edit' && !providerQuery.isLoading && !providerQuery.isError && !provider;
  const showFormFields = mode === 'create' || Boolean(provider);

  const handleCancel = () => {
    navigate(LIST_PATH);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const endpoint = values.endpoint.trim();
    const token = values.token.trim();

    try {
      if (mode === 'create') {
        await createProvider.mutateAsync({
          endpoint,
          authMethod: values.authMethod,
          token,
        });
      } else if (provider) {
        await updateProvider.mutateAsync({
          id: provider.id,
          payload: {
            endpoint,
            authMethod: values.authMethod,
            ...(token ? { token } : {}),
          },
        });
      }
      navigate(LIST_PATH);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save provider.');
    }
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col" data-testid="llm-provider-form">
          <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
            <div className="flex flex-wrap items-start gap-6">
              <div className="min-w-[240px] flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    {mode === 'create' ? 'Create LLM provider' : 'Edit LLM provider'}
                  </p>
                  <p className="text-sm text-[var(--agyn-text-subtle)]">
                    Add endpoints and credentials for your gateway.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || showNotFound}>
                  {mode === 'create' ? 'Create' : 'Save changes'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {providerQuery.isError && (
              <Alert variant="destructive">
                <AlertTitle>Unable to load provider</AlertTitle>
                <AlertDescription>{providerQuery.error?.message ?? 'Check your connection and try again.'}</AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>Unable to save provider</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {showNotFound && (
              <Alert variant="destructive">
                <AlertTitle>Provider not found</AlertTitle>
                <AlertDescription>We could not locate the requested provider.</AlertDescription>
              </Alert>
            )}

            {mode === 'edit' && providerQuery.isLoading && (
              <p className="text-sm text-[var(--agyn-text-subtle)]">Loading provider...</p>
            )}

            {showFormFields && (
              <>
                <FormField
                  control={form.control}
                  name="endpoint"
                  rules={{
                    validate: (value: string) => {
                      const trimmed = value.trim();
                      if (!trimmed) return 'Endpoint is required.';
                      if (!isValidEndpoint(trimmed)) return 'Enter a valid http(s) URL.';
                      return true;
                    },
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endpoint</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="url"
                          placeholder="https://api.example.com"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="authMethod"
                  rules={{ required: 'Select an authentication method.' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication method</FormLabel>
                      <FormControl>
                        <SelectInput
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(event.target.value as LLMAuthMethod)}
                          disabled={isSubmitting}
                          placeholder="Select a method"
                          options={AUTH_METHOD_OPTIONS}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="token"
                  rules={
                    mode === 'create'
                      ? {
                          validate: (value: string) =>
                            value.trim().length > 0 ? true : 'Token is required.',
                        }
                      : undefined
                  }
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bearer token</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder={mode === 'create' ? 'Enter token' : 'Leave blank to keep current token'}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      {mode === 'edit' && (
                        <FormDescription>Leave blank to keep the existing token.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
