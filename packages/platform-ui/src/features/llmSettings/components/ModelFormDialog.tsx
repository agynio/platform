import { useEffect, useMemo, type ReactElement } from 'react';
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
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { SelectInput } from '@/components/SelectInput';
import { SwitchControl } from '@/components/SwitchControl';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import type { CredentialRecord, ModelRecord, ProviderOption } from '../types';

type ModelFormValues = FieldValues & {
  name: string;
  providerKey: string;
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

interface ModelFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  providers: ProviderOption[];
  credentials: CredentialRecord[];
  model?: ModelRecord;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ModelFormPayload) => Promise<void> | void;
  submitting: boolean;
}

function toInputString(value: number | undefined): string {
  if (value == null) return '';
  return String(value);
}

function buildDefaultValues(
  mode: 'create' | 'edit',
  providers: ProviderOption[],
  model?: ModelRecord,
): ModelFormValues {
  if (mode === 'edit' && model) {
    return {
      name: model.id,
      providerKey: model.providerKey,
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

  const firstProvider = providers[0];
  return {
    name: '',
    providerKey: firstProvider?.litellmProvider ?? '',
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

export function ModelFormDialog({
  open,
  mode,
  providers,
  credentials,
  model,
  submitting,
  onOpenChange,
  onSubmit,
}: ModelFormDialogProps): ReactElement {
  const providerMap = useMemo(() => new Map(providers.map((p) => [p.litellmProvider, p])), [providers]);
  const form = useForm<ModelFormValues>({ defaultValues: buildDefaultValues(mode, providers, model) });

  useEffect(() => {
    form.reset(buildDefaultValues(mode, providers, model));
  }, [mode, providers, model, form]);

  const providerKey = useWatch({ control: form.control, name: 'providerKey' });
  const selectedProvider = providerKey ? providerMap.get(providerKey) : undefined;

  const availableCredentials = useMemo(() => {
    if (!providerKey) return credentials;
    const filtered = credentials.filter((credential) => credential.providerKey === providerKey);
    return filtered.length > 0 ? filtered : credentials;
  }, [credentials, providerKey]);

  useEffect(() => {
    const current = form.getValues('credentialName');
    if (!current) {
      const fallback = availableCredentials[0]?.name ?? '';
      if (fallback) form.setValue('credentialName', fallback, { shouldDirty: false });
      return;
    }
    if (!availableCredentials.some((credential) => credential.name === current)) {
      const fallback = availableCredentials[0]?.name ?? '';
      form.setValue('credentialName', fallback, { shouldDirty: false });
    }
  }, [availableCredentials, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!values.providerKey) {
      form.setError('providerKey', { message: 'Select provider' });
      return;
    }
    if (!values.credentialName) {
      form.setError('credentialName', { message: 'Select credential' });
      return;
    }

    try {
      const params = parseParams(values.paramsJson);
      await onSubmit({
        name: values.name.trim(),
        providerKey: values.providerKey,
        model: values.model.trim(),
        credentialName: values.credentialName,
        mode: values.mode?.trim() || undefined,
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
      });
    } catch (error) {
      if (error instanceof Error) {
        form.setError('paramsJson', { message: error.message });
      }
    }
  });

  const providerPlaceholder = selectedProvider?.defaultModelPlaceholder ?? 'provider/model-name';

  return (
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <ScreenDialogHeader>
          <ScreenDialogTitle>{mode === 'create' ? 'Create Model' : `Edit Model — ${model?.id}`}</ScreenDialogTitle>
          <ScreenDialogDescription>
            Define LiteLLM model routing and guardrails for agent usage.
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <Form {...form}>
          <form id="llm-model-form" onSubmit={handleSubmit} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: 'Name is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="assistant-prod" />
                  </FormControl>
                  <FormDescription>Unique identifier referenced by agents.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="providerKey"
              rules={{ required: 'Provider is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      placeholder="Select provider"
                      options={providers.map((provider) => ({
                        value: provider.litellmProvider,
                        label: provider.label,
                      }))}
                    />
                  </FormControl>
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
                    <Input {...field} placeholder={providerPlaceholder} />
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
                    <SelectInput
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      placeholder="Select credential"
                      options={availableCredentials.map((credentialOption) => ({
                        value: credentialOption.name,
                        label: credentialOption.name,
                      }))}
                    />
                  </FormControl>
                  <FormDescription>
                    Credentials filtered by provider when available.
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
                    <Input {...field} placeholder="chat" />
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
        </Form>
        <ScreenDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-model-form" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Create Model' : 'Save Changes'}
          </Button>
        </ScreenDialogFooter>
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
            <Input type="number" step="any" {...field} placeholder={placeholder} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
