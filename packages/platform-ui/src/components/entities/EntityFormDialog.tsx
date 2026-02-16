import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectInput } from '@/components/SelectInput';
import TriggerNodeConfigView from '@/components/nodeProperties/views/TriggerNodeConfigView';
import AgentNodeConfigView from '@/components/nodeProperties/views/AgentNodeConfigView';
import ToolNodeConfigView from '@/components/nodeProperties/views/ToolNodeConfigView';
import WorkspaceNodeConfigView from '@/components/nodeProperties/views/WorkspaceNodeConfigView';
import type { NodeConfig, NodeState } from '@/components/nodeProperties/types';
import type { NodePropertiesViewProps } from '@/components/nodeProperties/viewTypes';
import { graphApiService } from '@/features/graph/services/api';
import { listAllSecretPaths } from '@/features/secrets/utils/flatVault';
import { listVariables } from '@/features/variables/api';
import type { GraphEntityKind, GraphEntitySummary, GraphEntityUpsertInput, TemplateOption } from '@/features/entities/types';

type EntityFormValues = {
  template: string;
  title: string;
};

type NodeViewKind = Extract<NodeConfig['kind'], 'Trigger' | 'Agent' | 'Tool' | 'Workspace'>;

const SECRET_SUGGESTION_TTL_MS = 5 * 60 * 1000;
const VARIABLE_SUGGESTION_TTL_MS = 5 * 60 * 1000;

const NODE_STATUS_VALUES: ReadonlyArray<NodeState['status']> = [
  'not_ready',
  'provisioning',
  'ready',
  'deprovisioning',
  'provisioning_error',
  'deprovisioning_error',
];

function ensureRecord(value?: Record<string, unknown> | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value } as Record<string, unknown>;
  }
  return {};
}

function toNodeKind(rawKind?: string | GraphEntityKind | null): NodeViewKind {
  switch ((rawKind ?? '').toString().toLowerCase()) {
    case 'trigger':
      return 'Trigger';
    case 'agent':
      return 'Agent';
    case 'tool':
    case 'mcp':
      return 'Tool';
    case 'workspace':
    case 'service':
    default:
      return 'Workspace';
  }
}

function resolveNodeStatus(entity?: GraphEntitySummary): NodeState['status'] {
  const rawState = entity?.state;
  if (rawState && typeof rawState === 'object') {
    const status = (rawState as Record<string, unknown>).status;
    if (typeof status === 'string' && NODE_STATUS_VALUES.includes(status as NodeState['status'])) {
      return status as NodeState['status'];
    }
  }
  return 'not_ready';
}

function buildSubmitConfig(
  base: Record<string, unknown>,
  meta: { title: string; template: string; kind: NodeViewKind },
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) {
      continue;
    }
    sanitized[key] = value;
  }
  sanitized.title = meta.title;
  sanitized.template = meta.template;
  sanitized.kind = meta.kind;
  return sanitized;
}

function useSecretSuggestions() {
  const cacheRef = useRef<string[] | null>(null);
  const promiseRef = useRef<Promise<string[]> | null>(null);
  const fetchedAtRef = useRef(0);
  const [secretSuggestions, setSecretSuggestions] = useState<string[]>([]);

  const ensureSecretKeys = useCallback(async (): Promise<string[]> => {
    const now = Date.now();
    const cached = cacheRef.current;
    if (cached && now - fetchedAtRef.current < SECRET_SUGGESTION_TTL_MS) {
      setSecretSuggestions((current) => (current === cached ? current : cached));
      return cached;
    }

    if (!promiseRef.current) {
      promiseRef.current = listAllSecretPaths()
        .then((items) => {
          const sanitized = Array.isArray(items)
            ? items.filter((item): item is string => typeof item === 'string' && item.length > 0)
            : [];
          cacheRef.current = sanitized;
          fetchedAtRef.current = Date.now();
          setSecretSuggestions(sanitized);
          return sanitized;
        })
        .catch(() => {
          cacheRef.current = [];
          fetchedAtRef.current = Date.now();
          setSecretSuggestions([]);
          return [];
        })
        .finally(() => {
          promiseRef.current = null;
        });
    }

    try {
      return (await promiseRef.current) ?? [];
    } catch {
      return [];
    }
  }, []);

  return { secretSuggestions, ensureSecretKeys } as const;
}

function useVariableSuggestions() {
  const cacheRef = useRef<string[] | null>(null);
  const promiseRef = useRef<Promise<string[]> | null>(null);
  const fetchedAtRef = useRef(0);
  const [variableSuggestions, setVariableSuggestions] = useState<string[]>([]);

  const ensureVariableKeys = useCallback(async (): Promise<string[]> => {
    const now = Date.now();
    const cached = cacheRef.current;
    if (cached && now - fetchedAtRef.current < VARIABLE_SUGGESTION_TTL_MS) {
      setVariableSuggestions((current) => (current === cached ? current : cached));
      return cached;
    }

    if (!promiseRef.current) {
      promiseRef.current = listVariables()
        .then((items) => {
          const sanitized = Array.isArray(items)
            ? items
                .map((item) => item?.key)
                .filter((key): key is string => typeof key === 'string' && key.length > 0)
            : [];
          cacheRef.current = sanitized;
          fetchedAtRef.current = Date.now();
          setVariableSuggestions(sanitized);
          return sanitized;
        })
        .catch(() => {
          cacheRef.current = [];
          fetchedAtRef.current = Date.now();
          setVariableSuggestions([]);
          return [];
        })
        .finally(() => {
          promiseRef.current = null;
        });
    }

    try {
      return (await promiseRef.current) ?? [];
    } catch {
      return [];
    }
  }, []);

  return { variableSuggestions, ensureVariableKeys } as const;
}

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
    },
  });

  const templateSelection = form.watch('template');
  const titleValue = form.watch('title');
  const [configState, setConfigState] = useState<Record<string, unknown>>(() => ensureRecord(entity?.config));
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { secretSuggestions, ensureSecretKeys } = useSecretSuggestions();
  const { variableSuggestions, ensureVariableKeys } = useVariableSuggestions();

  useEffect(() => {
    if (!open) {
      return;
    }
    setSubmitError(null);
    form.reset({
      template: entity?.templateName ?? '',
      title: entity?.title ?? '',
    });
    setConfigState(ensureRecord(entity?.config));
  }, [entity, form, open]);

  const selectedTemplate = templateSelection ? templateMap.get(templateSelection) : undefined;
  const nodeKind = useMemo<NodeViewKind>(() => {
    if (selectedTemplate) {
      return toNodeKind(selectedTemplate.source?.kind ?? selectedTemplate.kind);
    }
    if (entity) {
      return toNodeKind(entity.rawTemplateKind ?? entity.templateKind);
    }
    return toNodeKind(kind);
  }, [entity, kind, selectedTemplate]);

  const viewConfig = useMemo<NodeConfig>(
    () => ({
      ...(configState as Record<string, unknown>),
      kind: nodeKind,
      template: templateSelection ?? '',
      title: titleValue ?? '',
    }) as NodeConfig,
    [configState, nodeKind, templateSelection, titleValue],
  );

  const viewState = useMemo<NodeState>(() => ({ status: resolveNodeStatus(entity) }), [entity]);

  const handleViewConfigChange = useCallback(
    (partial: Partial<NodeConfig>) => {
      if (!partial) return;
      setConfigState((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(partial)) {
          if (key === 'kind' || key === 'template') {
            continue;
          }
          if (key === 'title') {
            const stringValue = typeof value === 'string' ? value : '';
            form.setValue('title', stringValue, { shouldDirty: true, shouldValidate: false });
            if (stringValue.length > 0) {
              next.title = stringValue;
            } else {
              delete next.title;
            }
            continue;
          }
          if (value === undefined) {
            delete next[key];
          } else {
            next[key] = value;
          }
        }
        return next;
      });
    },
    [form],
  );

  const nixPackageSearch = useCallback(async (query: string): Promise<Array<{ value: string; label: string }>> => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }
    try {
      const result = await graphApiService.searchNixPackages(trimmed);
      return result
        .map((item) => item?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
        .map((name) => ({ value: name, label: name }));
    } catch {
      return [];
    }
  }, []);

  const fetchNixPackageVersions = useCallback(async (name: string): Promise<string[]> => {
    if (!name) {
      return [];
    }
    try {
      const result = await graphApiService.listNixPackageVersions(name);
      return result
        .map((item) => item?.version)
        .filter((version): version is string => typeof version === 'string' && version.length > 0);
    } catch {
      return [];
    }
  }, []);

  const resolveNixPackageSelection = useCallback(
    async (name: string, version: string) => {
      const resolved = await graphApiService.resolveNixSelection(name, version);
      return {
        version: resolved.version,
        commitHash: resolved.commit,
        attributePath: resolved.attr,
      };
    },
    [],
  );

  const configView = useMemo(() => {
    if (!templateSelection) {
      return null;
    }
    switch (nodeKind) {
      case 'Trigger': {
        const triggerProps: NodePropertiesViewProps<'Trigger'> = {
          config: viewConfig as NodePropertiesViewProps<'Trigger'>['config'],
          state: viewState,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
        };
        return <TriggerNodeConfigView {...triggerProps} />;
      }
      case 'Agent': {
        const agentProps: NodePropertiesViewProps<'Agent'> = {
          config: viewConfig as NodePropertiesViewProps<'Agent'>['config'],
          state: viewState,
          onConfigChange: handleViewConfigChange,
        };
        return <AgentNodeConfigView {...agentProps} />;
      }
      case 'Tool': {
        const toolProps: NodePropertiesViewProps<'Tool'> = {
          config: viewConfig as NodePropertiesViewProps<'Tool'>['config'],
          state: viewState,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
        };
        return <ToolNodeConfigView {...toolProps} />;
      }
      case 'Workspace':
      default: {
        const workspaceProps: NodePropertiesViewProps<'Workspace'> = {
          config: viewConfig as NodePropertiesViewProps<'Workspace'>['config'],
          state: viewState,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          nixPackageSearch,
          fetchNixPackageVersions,
          resolveNixPackageSelection,
        };
        return <WorkspaceNodeConfigView {...workspaceProps} />;
      }
    }
  }, [
    templateSelection,
    nodeKind,
    viewConfig,
    viewState,
    handleViewConfigChange,
    secretSuggestions,
    variableSuggestions,
    ensureSecretKeys,
    ensureVariableKeys,
    nixPackageSearch,
    fetchNixPackageVersions,
    resolveNixPackageSelection,
  ]);

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

    const template = templateMap.get(templateName);
    const resolvedKind = template
      ? toNodeKind(template.source?.kind ?? template.kind)
      : entity
      ? toNodeKind(entity.rawTemplateKind ?? entity.templateKind)
      : toNodeKind(kind);

    const payloadConfig = buildSubmitConfig(configState, {
      title: trimmedTitle,
      template: templateName,
      kind: resolvedKind,
    });

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
          <form className="space-y-6" onSubmit={handleFormSubmit}>
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
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        if (mode === 'create') {
                          setConfigState({});
                        }
                      }}
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
                    <Input
                      {...field}
                      aria-label="Entity title"
                      placeholder="Enter a title"
                      disabled={isSubmitting}
                      onChange={(event) => {
                        field.onChange(event);
                        const nextValue = event.target.value;
                        setConfigState((current) => ({ ...current, title: nextValue }));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border border-[var(--agyn-border-subtle)] bg-white px-6 py-6">
              {templateSelection ? (
                <div className="space-y-8">{configView}</div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a template to configure this {kind}.</p>
              )}
            </div>

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
