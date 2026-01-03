import { useEffect, useMemo, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { useForm, useWatch, type Control, type FieldValues } from 'react-hook-form';
import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Dropdown } from '@/components/Dropdown';
import { SwitchControl } from '@/components/SwitchControl';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';
import { createProviderOptionMap, type CredentialRecord, type ModelRecord, type ProviderOption } from '../types';
import { TestModelResultView, type TestModelErrorState } from './TestModelResultView';

type ModelFormValues = FieldValues & {
  name: string;
  model: string;
  credentialName: string;
  mode: string;
  temperature: string;
  maxTokens: string;
  topP: string;
  frequencyPenalty: string;
  presencePenalty: string;
  stream: boolean;
  rpm: string;
  tpm: string;
  paramsJson: string;
};

export interface ModelFormPayload {
  name: string;
  providerKey: string;
  model: string;
  credentialName: string;
  mode?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  rpm?: number;
  tpm?: number;
  params?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type ModelFormSnapshot = {
  name: string;
  model: string;
  credentialName: string;
  mode: string;
  temperature: string;
  maxTokens: string;
  topP: string;
  frequencyPenalty: string;
  presencePenalty: string;
  stream: boolean;
  rpm: string;
  tpm: string;
  paramsJson: string;
};

interface ModelFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  providers: ProviderOption[];
  credentials: CredentialRecord[];
  model?: ModelRecord;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ModelFormPayload) => Promise<void> | void;
  onValuesChange?: (snapshot: ModelFormSnapshot) => void;
  onTest?: (params: { snapshot: ModelFormSnapshot; payload: ModelFormPayload }) => Promise<void> | void;
  testPending?: boolean;
  testRequired?: boolean;
  canSubmit?: boolean;
  testStatus?: 'idle' | 'pending' | 'success' | 'error';
  testResultView?: {
    visible: boolean;
    subjectLabel: string;
    result?: LiteLLMHealthResponse;
    error?: TestModelErrorState;
    onBack: () => void;
    onClose: () => void;
  };
}

function toInputString(value: number | undefined): string {
  if (value == null) return '';
  return String(value);
}

function buildDefaultValues(
  mode: 'create' | 'edit',
  model?: ModelRecord,
): ModelFormValues {
  if (mode === 'edit' && model) {
    return {
      name: model.id,
      model: model.model,
      credentialName: model.credentialName,
      mode: model.mode ?? 'chat',
      temperature: toInputString(model.temperature),
      maxTokens: toInputString(model.maxTokens),
      topP: toInputString(model.topP),
      frequencyPenalty: toInputString(model.frequencyPenalty),
      presencePenalty: toInputString(model.presencePenalty),
      stream: !!model.stream,
      rpm: toInputString(model.rpm),
      tpm: toInputString(model.tpm),
      paramsJson: Object.keys(model.params ?? {}).length > 0 ? JSON.stringify(model.params, null, 2) : '',
    } satisfies ModelFormValues;
  }

  return {
    name: '',
    model: '',
    credentialName: '',
    mode: 'chat',
    temperature: '',
    maxTokens: '',
    topP: '',
    frequencyPenalty: '',
    presencePenalty: '',
    stream: false,
    rpm: '',
    tpm: '',
    paramsJson: '',
  } satisfies ModelFormValues;
}

function toOptionalNumber(value: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function parseParams(json: string): Record<string, unknown> | undefined {
  if (!json.trim()) return undefined;
  const parsed = JSON.parse(json);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error('Params must be a JSON object');
}

function buildSnapshot(values: ModelFormValues): ModelFormSnapshot {
  return {
    name: values.name ?? '',
    model: values.model ?? '',
    credentialName: values.credentialName ?? '',
    mode: values.mode ?? '',
    temperature: values.temperature ?? '',
    maxTokens: values.maxTokens ?? '',
    topP: values.topP ?? '',
    frequencyPenalty: values.frequencyPenalty ?? '',
    presencePenalty: values.presencePenalty ?? '',
    stream: Boolean(values.stream),
    rpm: values.rpm ?? '',
    tpm: values.tpm ?? '',
    paramsJson: values.paramsJson ?? '',
  };
}

export function ModelFormDialog({
  open,
  mode,
  providers,
  credentials,
  model,
  submitting,
  onOpenChange,
  onSubmit,
  onValuesChange,
  onTest,
  testPending = false,
  testRequired = false,
  canSubmit = true,
  testStatus = 'idle',
  testResultView,
}: ModelFormDialogProps): ReactElement {
  const providerMap = useMemo(() => createProviderOptionMap(providers), [providers]);
  const form = useForm<ModelFormValues>({ defaultValues: buildDefaultValues(mode, model) });

  useEffect(() => {
    form.reset(buildDefaultValues(mode, model));
  }, [mode, model, form]);

  useEffect(() => {
    if (!onValuesChange) return;
    const emit = () => onValuesChange(buildSnapshot(form.getValues()));
    emit();
    const subscription = form.watch(() => {
      emit();
    });
    return () => subscription.unsubscribe();
  }, [form, onValuesChange]);

  const credentialName = useWatch({ control: form.control, name: 'credentialName' });
  const selectedCredential = useMemo(
    () => credentials.find((credential) => credential.name === credentialName),
    [credentials, credentialName],
  );
  const providerKey = selectedCredential?.providerKey ?? (mode === 'edit' ? model?.providerKey ?? '' : '');
  const selectedProvider = providerKey ? providerMap.get(providerKey) : undefined;

  useEffect(() => {
    const current = form.getValues('credentialName');
    if (!current) {
      const fallback = credentials[0]?.name ?? '';
      if (fallback) form.setValue('credentialName', fallback, { shouldDirty: false });
      return;
    }
    if (!credentials.some((credential) => credential.name === current)) {
      const fallback = credentials[0]?.name ?? '';
      form.setValue('credentialName', fallback, { shouldDirty: false });
    }
  }, [credentials, form]);

  const createPayload = (values: ModelFormValues): ModelFormPayload | null => {
    if (!values.credentialName) {
      form.setError('credentialName', { message: 'Select credential' });
      return null;
    }

    const credential = credentials.find((item) => item.name === values.credentialName);
    const credentialProviderKey = credential?.providerKey ?? '';
    if (!credentialProviderKey) {
      form.setError('credentialName', { message: 'Selected credential is missing provider metadata' });
      return null;
    }

    let params: Record<string, unknown> | undefined;
    try {
      params = parseParams(values.paramsJson);
    } catch (error) {
      if (error instanceof Error) {
        form.setError('paramsJson', { message: error.message });
      }
      return null;
    }

    return {
      name: values.name.trim(),
      providerKey: credentialProviderKey,
      model: values.model.trim(),
      credentialName: values.credentialName,
      mode: values.mode?.trim() ? values.mode.trim() : undefined,
      temperature: toOptionalNumber(values.temperature),
      maxTokens: toOptionalNumber(values.maxTokens),
      topP: toOptionalNumber(values.topP),
      frequencyPenalty: toOptionalNumber(values.frequencyPenalty),
      presencePenalty: toOptionalNumber(values.presencePenalty),
      stream: values.stream,
      rpm: toOptionalNumber(values.rpm),
      tpm: toOptionalNumber(values.tpm),
      params,
      metadata: model?.metadata ?? {},
    } satisfies ModelFormPayload;
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload = createPayload(values);
    if (!payload) return;
    await onSubmit(payload);
  });

  const handleTest = async () => {
    if (!onTest) return;
    const valid = await form.trigger(['name', 'model', 'credentialName']);
    if (!valid) return;
    const values = form.getValues();
    const payload = createPayload(values);
    if (!payload) return;
    await onTest({ snapshot: buildSnapshot(values), payload });
  };

  const providerPlaceholder = selectedProvider?.defaultModelPlaceholder ?? 'provider/model-name';
  const showResultView = Boolean(testResultView?.visible && (testStatus === 'success' || testStatus === 'error'));
  const successResult = testStatus === 'success';
  const dialogTitle = showResultView
    ? testResultView?.subjectLabel ?? 'Test Result'
    : mode === 'create'
      ? 'Create Model'
      : `Edit Model — ${model?.id}`;
  const dialogDescription = showResultView
    ? successResult
      ? 'LiteLLM connection succeeded.'
      : 'LiteLLM reported an error during testing.'
    : 'Define LiteLLM model routing and guardrails for agent usage.';

  const handleDialogClose = () => {
    if (showResultView && testResultView) {
      testResultView.onClose();
      return;
    }
    onOpenChange(false);
  };

  return (
    <ScreenDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleDialogClose();
        } else {
          onOpenChange(next);
        }
      }}
    >
      <ScreenDialogContent className="max-h-[90vh] p-0 sm:max-w-2xl" hideCloseButton>
        <div className="flex max-h-[inherit] flex-col">
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 pb-4 pt-6">
            <div className="flex items-start justify-between gap-4">
              <ScreenDialogHeader className="flex-1 gap-2">
                <ScreenDialogTitle>{dialogTitle}</ScreenDialogTitle>
                <ScreenDialogDescription>{dialogDescription}</ScreenDialogDescription>
              </ScreenDialogHeader>
              <IconButton
                icon={<X className="h-4 w-4" />}
                variant="ghost"
                size="sm"
                rounded={false}
                aria-label="Close dialog"
                title="Close"
                className="shrink-0"
                onClick={handleDialogClose}
              />
            </div>
          </div>

          {showResultView ? (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <TestModelResultView result={testResultView?.result} error={testResultView?.error} />
            </div>
          ) : (
            <Form {...form}>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <form id="llm-model-form" onSubmit={handleSubmit} className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    rules={{ required: 'Name is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="assistant-prod" size="sm" />
                        </FormControl>
                        <FormDescription>Unique identifier referenced by agents.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    rules={{ required: 'Model identifier is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider Model Identifier</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={providerPlaceholder} size="sm" />
                        </FormControl>
                        <FormDescription>Exact model slug as recognized by the provider.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="credentialName"
                    rules={{ required: 'Credential is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credential</FormLabel>
                        <FormControl>
                          <Dropdown
                            value={field.value || undefined}
                            onValueChange={(value) => field.onChange(value)}
                            placeholder="Select credential"
                            options={credentials.map((credentialOption) => ({
                              value: credentialOption.name,
                              label: credentialOption.name,
                            }))}
                            size="sm"
                          />
                        </FormControl>
                        <FormDescription>
                          {selectedProvider
                            ? `Provider derived from credential: ${selectedProvider.label}.`
                            : 'Select a credential to derive provider.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mode</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="chat" size="sm" />
                        </FormControl>
                        <FormDescription>LiteLLM mode (chat, completion, embedding, etc.).</FormDescription>
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <NumericField label="Temperature" name="temperature" control={form.control} placeholder="0.7" />
                    <NumericField label="Top P" name="topP" control={form.control} placeholder="0.95" />
                    <NumericField label="Frequency Penalty" name="frequencyPenalty" control={form.control} placeholder="0" />
                    <NumericField label="Presence Penalty" name="presencePenalty" control={form.control} placeholder="0" />
                    <NumericField label="Max Tokens" name="maxTokens" control={form.control} placeholder="4096" />
                    <NumericField label="Requests per Minute" name="rpm" control={form.control} placeholder="600" />
                    <NumericField label="Tokens per Minute" name="tpm" control={form.control} placeholder="90000" />
                  </div>

                  <FormField
                    control={form.control}
                    name="stream"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Enable streaming</FormLabel>
                          <FormDescription>Allow streaming responses when agents use this model.</FormDescription>
                        </div>
                        <FormControl>
                          <SwitchControl checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paramsJson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Advanced Params (JSON)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder='{ "timeout": 30 }' className="min-h-[160px] font-mono text-sm" />
                        </FormControl>
                        <FormDescription>
                          Additional LiteLLM parameters encoded as JSON. Leave empty for defaults.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </div>
            </Form>
          )}

          <div className="border-t border-[var(--agyn-border-subtle)] px-6 pb-6">
            {showResultView && testResultView ? (
              <ScreenDialogFooter className="mt-6 mb-2 sm:mb-4">
                <Button variant="ghost" size="md" onClick={() => testResultView.onBack()}>
                  Back to form
                </Button>
                <Button variant="primary" size="md" onClick={() => testResultView.onClose()}>
                  Close
                </Button>
              </ScreenDialogFooter>
            ) : (
              <>
                <ScreenDialogFooter className="mt-6 mb-2 sm:mb-4">
                  <Button variant="ghost" size="md" onClick={handleDialogClose} disabled={submitting}>
                    Cancel
                  </Button>
                  {onTest ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={handleTest}
                      disabled={submitting || testPending}
                    >
                      {testPending ? 'Testing…' : 'Test Model'}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    form="llm-model-form"
                    variant="primary"
                    size="md"
                    disabled={submitting || (mode === 'create' && testRequired && !canSubmit)}
                  >
                    {submitting ? 'Saving…' : mode === 'create' ? 'Create Model' : 'Save Changes'}
                  </Button>
                </ScreenDialogFooter>
                {mode === 'create' && testRequired ? (
                  <p
                    className={`mt-1 text-xs ${
                      testStatus === 'success'
                        ? 'text-[var(--agyn-status-finished)]'
                        : testStatus === 'error'
                          ? 'text-[var(--agyn-status-failed)]'
                          : 'text-[var(--agyn-text-subtle)]'
                    }`}
                  >
                    {testStatus === 'success'
                      ? 'Test passed for current values.'
                      : testStatus === 'error'
                        ? 'Test failed. Update the configuration and try again.'
                        : testStatus === 'pending'
                          ? 'Testing current configuration…'
                          : 'Run a test to enable creation.'}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

interface NumericFieldProps {
  label: string;
  name:
    | 'temperature'
    | 'maxTokens'
    | 'topP'
    | 'frequencyPenalty'
    | 'presencePenalty'
    | 'rpm'
    | 'tpm';
  placeholder: string;
  control: Control<ModelFormValues>;
}

function NumericField({ label, name, placeholder, control }: NumericFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="number" step="any" {...field} placeholder={placeholder} size="sm" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
