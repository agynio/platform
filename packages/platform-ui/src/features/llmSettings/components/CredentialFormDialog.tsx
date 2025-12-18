import { useEffect, useMemo, type ReactElement } from 'react';
import { useForm, useWatch, type FieldValues } from 'react-hook-form';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import type { CredentialRecord, ProviderField, ProviderOption } from '../types';

type CredentialFormValues = FieldValues & {
  name: string;
  providerKey: string;
  tags: string;
  values: Record<string, string>;
};

export interface CredentialFormPayload {
  name: string;
  providerKey: string;
  tags: string[];
  values: Record<string, string>;
  metadata: Record<string, unknown>;
}

interface CredentialFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  providers: ProviderOption[];
  credential?: CredentialRecord;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CredentialFormPayload) => Promise<void> | void;
  submitting: boolean;
}

function buildDefaultValues(
  mode: 'create' | 'edit',
  providers: ProviderOption[],
  credential?: CredentialRecord,
): CredentialFormValues {
  if (mode === 'edit' && credential) {
    const tags = credential.tags.join(', ');
    const providerKey = credential.providerKey;
    const values: Record<string, string> = { ...credential.values };
    return {
      name: credential.name,
      providerKey,
      tags,
      values,
    } satisfies CredentialFormValues;
  }

  const firstProvider = providers[0];
  const providerKey = firstProvider?.litellmProvider ?? '';
  const values: Record<string, string> = {};
  if (firstProvider) {
    for (const field of firstProvider.fields) {
      if (field.defaultValue != null) values[field.key] = field.defaultValue;
      else values[field.key] = '';
    }
  }
  return {
    name: '',
    providerKey,
    tags: '',
    values,
  } satisfies CredentialFormValues;
}

function sanitizeValues(values: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value == null) continue;
    const str = String(value);
    if (str.trim().length === 0) continue;
    result[key] = str;
  }
  return result;
}

function getFieldDescription(field: ProviderField, isMasked: boolean): string | undefined {
  if (isMasked) return 'Stored securely. Leave blank to keep existing value.';
  if (field.tooltip) return field.tooltip;
  if (field.placeholder) return field.placeholder;
  return undefined;
}

export function CredentialFormDialog({
  open,
  mode,
  providers,
  credential,
  submitting,
  onOpenChange,
  onSubmit,
}: CredentialFormDialogProps): ReactElement {
  const providerMap = useMemo(() => new Map(providers.map((p) => [p.litellmProvider, p])), [providers]);

  const form = useForm<CredentialFormValues>({
    defaultValues: buildDefaultValues(mode, providers, credential),
  });

  useEffect(() => {
    form.reset(buildDefaultValues(mode, providers, credential));
  }, [mode, credential, providers, form]);

  const providerKey = useWatch({ control: form.control, name: 'providerKey' });

  const selectedProvider = providerKey ? providerMap.get(providerKey) : undefined;

  useEffect(() => {
    if (!selectedProvider) return;
    const currentValues = form.getValues('values') ?? {};
    const nextValues: Record<string, string> = {};
    let changed = false;

    for (const field of selectedProvider.fields) {
      if (currentValues[field.key] !== undefined) {
        nextValues[field.key] = currentValues[field.key];
      } else if (field.defaultValue != null) {
        nextValues[field.key] = field.defaultValue;
        changed = true;
      } else {
        nextValues[field.key] = '';
        changed = true;
      }
    }

    for (const key of Object.keys(currentValues)) {
      if (!selectedProvider.fields.find((field) => field.key === key)) {
        changed = true;
        break;
      }
    }

    if (changed) {
      form.setValue('values', nextValues, { shouldDirty: false, shouldTouch: false });
    }
  }, [selectedProvider, form]);

  const maskedFields = credential?.maskedFields ?? new Set<string>();

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!data.providerKey) {
      form.setError('providerKey', { message: 'Select a provider' });
      return;
    }

    const tags = data.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    await onSubmit({
      name: data.name.trim(),
      providerKey: data.providerKey,
      tags,
      values: sanitizeValues(data.values ?? {}),
      metadata: credential?.metadata ?? {},
    });
  });

  return (
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <ScreenDialogHeader>
          <ScreenDialogTitle>{mode === 'create' ? 'Create Credential' : `Edit Credential — ${credential?.name}`}</ScreenDialogTitle>
          <ScreenDialogDescription>
            Provide LiteLLM credential details. All values are stored securely on the server.
          </ScreenDialogDescription>
        </ScreenDialogHeader>

        <Form {...form}>
          <form id="llm-credential-form" onSubmit={handleSubmit} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: 'Name is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credential Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="openai-prod"
                      disabled={mode === 'edit'}
                    />
                  </FormControl>
                  <FormDescription>Unique identifier used when referencing this credential.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="providerKey"
              rules={{ required: 'Provider selection is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={providers.length === 0}
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
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="prod, team-alpha" />
                  </FormControl>
                  <FormDescription>Optional comma-separated tags for organizing credentials.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProvider && selectedProvider.fields.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground">Provider Fields</h3>
                <div className="grid gap-4">
                  {selectedProvider.fields.map((fieldDef) => {
                    const fieldName = `values.${fieldDef.key}` as const;
                    const isMasked = maskedFields.has(fieldDef.key);
                    const isRequired = fieldDef.required && (mode === 'create' || !isMasked);
                    const description = getFieldDescription(fieldDef, isMasked);
                    return (
                      <FormField
                        key={fieldDef.key}
                        control={form.control}
                        name={fieldName}
                        rules={isRequired ? { required: 'Required field' } : undefined}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{fieldDef.label}</FormLabel>
                            <FormControl>
                            {renderFieldInput(fieldDef, field.value ?? '', field.onChange, isMasked)}
                            </FormControl>
                            {description ? <FormDescription>{description}</FormDescription> : null}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </form>
        </Form>

        <ScreenDialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-credential-form" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Create Credential' : 'Save Changes'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}

type FieldChangeHandler = (value: string) => void;

function renderFieldInput(field: ProviderField, value: string, onChange: FieldChangeHandler, isMasked: boolean) {
  const placeholder = isMasked ? '••••••' : field.placeholder ?? undefined;
  if (field.type === 'password') {
    return <Input type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" />;
  }

  if (field.type === 'select' && field.options) {
    return (
      <SelectInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Select option"
        options={field.options.map((option) => ({ value: option, label: option }))}
      />
    );
  }

  if (field.type === 'textarea') {
    return <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-[120px]" />;
  }

  return <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
}
