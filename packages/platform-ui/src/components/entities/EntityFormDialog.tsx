import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectInput } from '@/components/SelectInput';
import type { GraphEntityKind, GraphEntitySummary, GraphEntityUpsertInput, TemplateOption } from '@/features/entities/types';

type NodeKind = 'Trigger' | 'Agent' | 'Tool' | 'MCP' | 'Workspace';

interface EntityFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  kind: GraphEntityKind;
  entity?: GraphEntitySummary;
  templates: TemplateOption[];
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: GraphEntityUpsertInput) => Promise<void>;
}

type EntityFormValues = {
  template: string;
  title: string;
  configText: string;
};

const CONFIG_PLACEHOLDER = '{\n  "key": "value"\n}';

function toNodeKind(rawKind?: string | GraphEntityKind | null): NodeKind {
  switch ((rawKind ?? '').toString().toLowerCase()) {
    case 'trigger':
      return 'Trigger';
    case 'agent':
      return 'Agent';
    case 'tool':
      return 'Tool';
    case 'mcp':
      return 'MCP';
    default:
      return 'Workspace';
  }
}

function formatConfigText(config?: Record<string, unknown> | null): string {
  try {
    return JSON.stringify(config ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export function EntityFormDialog({
  open,
  mode,
  kind,
  entity,
  templates,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: EntityFormDialogProps) {
  const templateMap = useMemo(() => new Map(templates.map((tpl) => [tpl.name, tpl])), [templates]);

  const form = useForm<EntityFormValues>({
    defaultValues: {
      template: entity?.templateName ?? '',
      title: entity?.title ?? '',
      configText: formatConfigText(entity?.config ?? {}),
    },
  });

  const templateSelection = form.watch('template');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSubmitError(null);
    form.reset({
      template: entity?.templateName ?? '',
      title: entity?.title ?? '',
      configText: formatConfigText(entity?.config ?? {}),
    });
  }, [entity, form, open]);

  const disableTemplateSelect = mode === 'edit';
  const dialogTitle = mode === 'create' ? `Create ${kind}` : `Edit ${entity?.title ?? kind}`;

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    form.clearErrors();

    const templateName = values.template || entity?.templateName || '';
    if (!templateName) {
      form.setError('template', { type: 'required', message: 'Template is required.' });
      return;
    }

    const trimmedTitle = values.title.trim();
    if (!trimmedTitle) {
      form.setError('title', { type: 'required', message: 'Title is required.' });
      return;
    }

    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = values.configText.trim() ? (JSON.parse(values.configText) as Record<string, unknown>) : {};
    } catch {
      form.setError('configText', { type: 'validate', message: 'Config must be valid JSON.' });
      return;
    }

    const nodeKind = (() => {
      const template = templateMap.get(templateName);
      if (template) {
        return toNodeKind(template.source?.kind ?? template.kind);
      }
      if (entity) {
        return toNodeKind(entity.rawTemplateKind ?? entity.templateKind);
      }
      return toNodeKind(kind);
    })();

    const payloadConfig: Record<string, unknown> = {
      ...parsedConfig,
      title: trimmedTitle,
      template: templateName,
      kind: nodeKind,
    };

    const payload: GraphEntityUpsertInput = {
      id: entity?.id,
      template: templateName,
      title: trimmedTitle,
      config: payloadConfig,
    } satisfies GraphEntityUpsertInput;

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch {
      setSubmitError('Unable to save entity. Please try again.');
    }
  });

  return (
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="max-h-[90vh] overflow-y-auto">
        <ScreenDialogHeader>
          <ScreenDialogTitle>{dialogTitle}</ScreenDialogTitle>
          <ScreenDialogDescription>Configure the template and metadata for this {kind}.</ScreenDialogDescription>
        </ScreenDialogHeader>
        {templates.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>No templates available. Please add templates before creating entities.</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            <FormField
              control={form.control}
              name="template"
              rules={{ required: mode === 'create' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={disableTemplateSelect || templates.length === 0 || isSubmitting}
                      placeholder="Select a template"
                      options={templates.map((tpl) => ({ value: tpl.name, label: tpl.title }))}
                      allowEmptyOption
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} aria-label="Entity title" placeholder="Enter a title" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="configText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Configuration (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      aria-label="Entity configuration (JSON)"
                      placeholder={CONFIG_PLACEHOLDER}
                      rows={12}
                      className="font-mono"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <ScreenDialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || (mode === 'create' && !templateSelection)}>
                {mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </ScreenDialogFooter>
          </form>
        </Form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
