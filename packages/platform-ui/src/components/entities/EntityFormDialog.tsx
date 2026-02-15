import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectInput } from '@/components/SelectInput';
import { EmbeddedNodeProperties } from '@/components/nodeProperties/EmbeddedNodeProperties';
import type { NodeConfig, NodeState } from '@/components/nodeProperties/types';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { useReferenceSuggestions } from '@/features/entities/hooks/useReferenceSuggestions';
import { useNixServices } from '@/features/entities/hooks/useNixServices';
import type {
  GraphEntityKind,
  GraphEntitySummary,
  GraphEntityUpsertInput,
  TemplateOption,
} from '@/features/entities/types';

interface EntityFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  kind: GraphEntityKind;
  entity?: GraphEntitySummary;
  templates: TemplateOption[];
  entities: GraphEntitySummary[];
  graphEdges?: GraphPersistedEdge[];
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: GraphEntityUpsertInput) => Promise<void>;
}

type TemplateFormValues = {
  template: string;
};

const DEFAULT_NODE_STATE: NodeState = { status: 'not_ready' };

function randomSegment() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const [segment] = crypto.randomUUID().split('-');
    if (segment) {
      return segment;
    }
  }
  return Math.random().toString(36).slice(2, 10);
}

function generatePreviewNodeId() {
  return `entity-preview-${randomSegment()}`;
}

function toNodeKind(rawKind?: string | GraphEntityKind | null): NodeConfig['kind'] {
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

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallback.trim();
}

function buildConfigFromEntity(entity: GraphEntitySummary): NodeConfig {
  const clonedConfig = entity.config ? { ...entity.config } : {};
  const fallbackTitle = entity.title ?? '';
  const title = normalizeTitle((clonedConfig as Record<string, unknown>).title, fallbackTitle);
  return {
    ...(clonedConfig as Record<string, unknown>),
    kind: toNodeKind(entity.rawTemplateKind ?? entity.templateKind),
    title,
    template: entity.templateName,
  } satisfies NodeConfig;
}

function buildConfigFromTemplate(option: TemplateOption): NodeConfig {
  const fallbackTitle = option.title ?? option.name;
  return {
    kind: toNodeKind(option.source.kind),
    title: fallbackTitle,
    template: option.name,
  } satisfies NodeConfig;
}

function mapEntitiesToGraphNodes(entities: GraphEntitySummary[]): GraphNodeConfig[] {
  if (!Array.isArray(entities) || entities.length === 0) {
    return [];
  }
  return entities.map((entity) => ({
    id: entity.id,
    template: entity.templateName,
    kind: toNodeKind(entity.rawTemplateKind ?? entity.templateKind),
    title: entity.title,
    x: entity.position?.x ?? 0,
    y: entity.position?.y ?? 0,
    status: 'not_ready',
    config: entity.config ? { ...entity.config } : undefined,
    state: entity.state ? { ...entity.state } : undefined,
    ports: {
      inputs: entity.ports.inputs.map((port) => ({ id: port.id, title: port.label })),
      outputs: entity.ports.outputs.map((port) => ({ id: port.id, title: port.label })),
    },
    avatarSeed: entity.id,
  } satisfies GraphNodeConfig));
}

export function EntityFormDialog({
  open,
  mode,
  kind,
  entity,
  templates,
  entities,
  graphEdges,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: EntityFormDialogProps) {
  const templateMap = useMemo(() => new Map(templates.map((tpl) => [tpl.name, tpl])), [templates]);
  const graphNodes = useMemo(() => mapEntitiesToGraphNodes(entities), [entities]);
  const sanitizedGraphEdges = useMemo(
    () => (graphEdges ?? []).filter((edge): edge is GraphPersistedEdge => Boolean(edge)),
    [graphEdges],
  );

  const { secretKeys, variableKeys, ensureSecretKeys, ensureVariableKeys } = useReferenceSuggestions();
  const nixServices = useNixServices();

  const form = useForm<TemplateFormValues>({
    defaultValues: { template: entity?.templateName ?? '' },
  });

  const [config, setConfig] = useState<NodeConfig | null>(() => (mode === 'edit' && entity ? buildConfigFromEntity(entity) : null));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string>(() => generatePreviewNodeId());

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'create') {
      setPreviewNodeId(generatePreviewNodeId());
    }
    setSubmitError(null);
    form.reset({ template: entity?.templateName ?? '' });
    if (mode === 'edit' && entity) {
      setConfig(buildConfigFromEntity(entity));
      return;
    }
    if (mode === 'create') {
      const templateName = form.getValues('template');
      if (templateName) {
        const template = templateMap.get(templateName);
        setConfig(template ? buildConfigFromTemplate(template) : null);
      } else {
        setConfig(null);
      }
    }
  }, [entity, form, mode, open, templateMap]);

  const selectedTemplateName = form.watch('template');

  useEffect(() => {
    if (mode !== 'create') {
      return;
    }
    if (!selectedTemplateName) {
      setConfig(null);
      return;
    }
    const template = templateMap.get(selectedTemplateName);
    if (!template) {
      setConfig(null);
      return;
    }
    setConfig((current) => {
      if (current && current.template === selectedTemplateName) {
        return current;
      }
      return buildConfigFromTemplate(template);
    });
  }, [mode, selectedTemplateName, templateMap]);

  const handleConfigChange = useCallback((partial: Partial<NodeConfig>) => {
    setConfig((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        ...partial,
        template: current.template,
        kind: current.kind,
      } satisfies NodeConfig;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    const currentConfig = config;
    const templateName = entity?.templateName ?? form.getValues('template');
    if (!templateName) {
      setSubmitError('Template is required.');
      return;
    }
    if (!currentConfig) {
      setSubmitError('Select a template to configure this entity.');
      return;
    }
    const trimmedTitle = typeof currentConfig.title === 'string' ? currentConfig.title.trim() : '';
    if (!trimmedTitle) {
      setSubmitError('Title is required.');
      return;
    }

    const payloadConfig: Record<string, unknown> = {
      ...currentConfig,
      title: trimmedTitle,
      template: templateName,
      kind: currentConfig.kind,
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
  }, [config, entity?.id, entity?.templateName, form, onOpenChange, onSubmit]);

  const disableTemplateSelect = mode === 'edit';
  const dialogTitle = mode === 'create' ? `Create ${kind}` : `Edit ${entity?.title ?? kind}`;
  const actionDisabled = isSubmitting || !config;
  const resolvedNodeId = entity?.id ?? previewNodeId;

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
          <form className="space-y-4" onSubmit={form.handleSubmit(() => handleSubmit())}>
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

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            {config ? (
              <EmbeddedNodeProperties
                className="space-y-8"
                config={config}
                state={DEFAULT_NODE_STATE}
                onConfigChange={handleConfigChange}
                nodeId={resolvedNodeId}
                secretKeys={secretKeys}
                variableKeys={variableKeys}
                ensureSecretKeys={ensureSecretKeys}
                ensureVariableKeys={ensureVariableKeys}
                nixPackageSearch={nixServices.search}
                fetchNixPackageVersions={nixServices.listVersions}
                resolveNixPackageSelection={nixServices.resolve}
                graphNodes={graphNodes.length > 0 ? graphNodes : undefined}
                graphEdges={sanitizedGraphEdges.length > 0 ? sanitizedGraphEdges : undefined}
                titleAutoFocus={open}
              />
            ) : (
              <div className="rounded-md border border-dashed border-[var(--agyn-border-default)] bg-muted/30 p-6 text-sm text-muted-foreground">
                Select a template to configure this entity.
              </div>
            )}

            <ScreenDialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionDisabled}>
                {mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </ScreenDialogFooter>
          </form>
        </Form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
