import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/Button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SelectInput } from '@/components/SelectInput';
import { useLLMProviders } from '@/api/hooks/useLLMProviders';
import { useCreateLLMModel, useLLMModel, useUpdateLLMModel } from '@/api/hooks/useLLMModels';
import type { LLMProvider } from '@/api/modules/llmEntities';

const LIST_PATH = '/settings/llm/models';
const PROVIDERS_PAGE_SIZE = 100;

type ModelFormValues = {
  name: string;
  llmProviderId: string;
  remoteName: string;
};

export interface LLMModelUpsertPageProps {
  mode: 'create' | 'edit';
}

function resolveProviderOptions(providers: LLMProvider[]) {
  return providers.map((provider) => ({ value: provider.id, label: provider.endpoint }));
}

export function LLMModelUpsertPage({ mode }: LLMModelUpsertPageProps) {
  const navigate = useNavigate();
  const params = useParams();
  const modelId = params.modelId ?? null;
  const providerParams = useMemo(() => ({ page: 1, perPage: PROVIDERS_PAGE_SIZE }), []);
  const providersQuery = useLLMProviders(providerParams);
  const modelQuery = useLLMModel(mode === 'edit' ? modelId : null);
  const createModel = useCreateLLMModel();
  const updateModel = useUpdateLLMModel();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const providers = useMemo(() => providersQuery.data?.items ?? [], [providersQuery.data]);
  const model = modelQuery.data;
  const providerOptions = useMemo(() => resolveProviderOptions(providers), [providers]);

  const form = useForm<ModelFormValues>({
    defaultValues: {
      name: '',
      llmProviderId: '',
      remoteName: '',
    },
  });

  useEffect(() => {
    if (mode === 'edit' && model) {
      form.reset({
        name: model.name,
        llmProviderId: model.llmProviderId,
        remoteName: model.remoteName,
      });
    }
  }, [form, mode, model]);

  const isSubmitting = createModel.isPending || updateModel.isPending;
  const showNotFound = mode === 'edit' && !modelQuery.isLoading && !modelQuery.isError && !model;
  const showFormFields = mode === 'create' || Boolean(model);
  const providersReady = providers.length > 0;

  const handleCancel = () => {
    navigate(LIST_PATH);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const name = values.name.trim();
    const remoteName = values.remoteName.trim();
    const llmProviderId = values.llmProviderId;

    try {
      if (mode === 'create') {
        await createModel.mutateAsync({
          name,
          llmProviderId,
          remoteName,
        });
      } else if (model) {
        await updateModel.mutateAsync({
          id: model.id,
          payload: {
            name,
            llmProviderId,
            remoteName,
          },
        });
      }
      navigate(LIST_PATH);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save model.');
    }
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col" data-testid="llm-model-form">
          <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
            <div className="flex flex-wrap items-start gap-6">
              <div className="min-w-[240px] flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-text-subtle)]">
                    {mode === 'create' ? 'Create LLM model' : 'Edit LLM model'}
                  </p>
                  <p className="text-sm text-[var(--agyn-text-subtle)]">
                    Configure provider routes and remote model names.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || showNotFound || !providersReady}>
                  {mode === 'create' ? 'Create' : 'Save changes'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {(modelQuery.isError || providersQuery.isError) && (
              <Alert variant="destructive">
                <AlertTitle>Unable to load models</AlertTitle>
                <AlertDescription>
                  {modelQuery.error?.message ?? providersQuery.error?.message ?? 'Check your connection and try again.'}
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>Unable to save model</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {!providersQuery.isLoading && providers.length === 0 && (
              <Alert variant="destructive">
                <AlertTitle>No providers available</AlertTitle>
                <AlertDescription>Add an LLM provider before configuring models.</AlertDescription>
              </Alert>
            )}

            {showNotFound && (
              <Alert variant="destructive">
                <AlertTitle>Model not found</AlertTitle>
                <AlertDescription>We could not locate the requested model.</AlertDescription>
              </Alert>
            )}

            {mode === 'edit' && modelQuery.isLoading && (
              <p className="text-sm text-[var(--agyn-text-subtle)]">Loading model...</p>
            )}

            {showFormFields && (
              <>
                <FormField
                  control={form.control}
                  name="name"
                  rules={{
                    validate: (value: string) =>
                      value.trim().length > 0 ? true : 'Name is required.',
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Friendly model name" disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="llmProviderId"
                  rules={{ required: 'Select a provider.' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <FormControl>
                        <SelectInput
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(event.target.value)}
                          disabled={isSubmitting || !providersReady}
                          placeholder="Select a provider"
                          options={providerOptions}
                          allowEmptyOption
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="remoteName"
                  rules={{
                    validate: (value: string) =>
                      value.trim().length > 0 ? true : 'Remote name is required.',
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remote name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="remote-model-id" disabled={isSubmitting} />
                      </FormControl>
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
