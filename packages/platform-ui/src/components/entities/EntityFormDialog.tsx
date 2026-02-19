import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { useForm } from 'react-hook-form';

import { ScreenDialog, ScreenDialogContent, ScreenDialogDescription, ScreenDialogTitle } from '@/components/Dialog';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectInput } from '@/components/SelectInput';
import type { NodeConfig, NodeState } from '@/components/nodeProperties/types';
import type { NodePropertiesViewProps } from '@/components/nodeProperties/viewTypes';
import { NODE_TEMPLATE_KIND_MAP, isNodeTemplateName } from '@/components/nodeProperties/viewTypes';
import { NODE_TEMPLATE_VIEW_REGISTRY, NODE_VIEW_REGISTRY } from '@/components/nodeProperties/viewRegistry';
import { graphApiService } from '@/features/graph/services/api';
import { listAllSecretPaths } from '@/features/secrets/utils/flatVault';
import { listVariables } from '@/features/variables/api';
import type {
  GraphEntityKind,
  GraphEntityRelationInput,
  GraphEntitySummary,
  GraphEntityUpsertInput,
  TemplateOption,
} from '@/features/entities/types';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { X } from 'lucide-react';
import { useMcpNodeState } from '@/lib/graph/hooks';
import { buildEntityRelationPrefill, getEntityRelationDefinitions } from '@/features/entities/api/graphEntities';

type EntityFormValues = {
  template: string;
  title: string;
};

type NodeViewKind = NodeConfig['kind'];

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
      return 'Tool';
    case 'mcp':
      return 'MCP';
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

function randomIdSegment(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().split('-')[0] ?? Math.random().toString(36).slice(2, 10);
  }
  return Math.random().toString(36).slice(2, 10);
}

function generatePreviewNodeId(kind: GraphEntityKind): string {
  return `entity-preview-${kind}-${randomIdSegment()}`;
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
  graphNodes?: GraphNodeConfig[];
  graphEdges?: GraphPersistedEdge[];
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
  graphNodes,
  graphEdges,
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
  const previewNodeIdRef = useRef<string>('');

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

  useEffect(() => {
    if (!open) {
      previewNodeIdRef.current = '';
    }
  }, [open]);

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

  const nodeIdForView = useMemo(() => {
    if (mode === 'edit' && entity?.id) {
      return entity.id;
    }
    if (!open) {
      return '';
    }
    if (!previewNodeIdRef.current) {
      previewNodeIdRef.current = generatePreviewNodeId(kind);
    }
    return previewNodeIdRef.current;
  }, [mode, entity?.id, open, kind]);

  const safeGraphNodes = useMemo(() => graphNodes ?? [], [graphNodes]);
  const safeGraphEdges = useMemo(() => graphEdges ?? [], [graphEdges]);
  const relationDefinitions = useMemo(
    () => getEntityRelationDefinitions(templateSelection || entity?.templateName),
    [templateSelection, entity?.templateName],
  );
  const relationPrefill = useMemo(
    () => buildEntityRelationPrefill(entity?.id, safeGraphEdges, relationDefinitions),
    [entity?.id, relationDefinitions, safeGraphEdges],
  );
  const [relationInputs, setRelationInputs] = useState<GraphEntityRelationInput[]>(relationPrefill);
  useEffect(() => {
    if (!open) return;
    setRelationInputs(relationPrefill);
  }, [open, relationPrefill]);
  const mcpStateNodeId = nodeKind === 'MCP' && mode === 'edit' ? entity?.id ?? null : null;
  const {
    tools: mcpTools,
    enabledTools: mcpEnabledTools,
    setEnabledTools: setMcpEnabledTools,
    isLoading: mcpToolsLoading,
  } = useMcpNodeState(mcpStateNodeId);

  const handleToggleMcpTool = useCallback(
    (toolName: string, enabled: boolean) => {
      if (!mcpStateNodeId) return;
      const current = new Set(mcpEnabledTools ?? []);
      if (enabled) {
        current.add(toolName);
      } else {
        current.delete(toolName);
      }
      setMcpEnabledTools(Array.from(current));
    },
    [mcpEnabledTools, mcpStateNodeId, setMcpEnabledTools],
  );

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

  const displayTitle = (titleValue ?? '').trim() || entity?.title || '';

  const templateNameForView = typeof viewConfig.template === 'string' ? viewConfig.template : undefined;

  const templateViewComponent = useCallback(<K extends NodeConfig['kind']>(kind: K) => {
    if (!templateNameForView || !isNodeTemplateName(templateNameForView)) {
      return undefined;
    }
    const expectedKind = NODE_TEMPLATE_KIND_MAP[templateNameForView];
    if (expectedKind !== kind) {
      return undefined;
    }
    return NODE_TEMPLATE_VIEW_REGISTRY[templateNameForView] as ComponentType<NodePropertiesViewProps<K>>;
  }, [templateNameForView]);

  const configView = useMemo(() => {
    if (!templateSelection) {
      return null;
    }
    switch (nodeKind) {
      case 'Tool': {
        const View = templateViewComponent('Tool') ?? NODE_VIEW_REGISTRY.Tool;
        const toolProps: NodePropertiesViewProps<'Tool'> = {
          config: viewConfig as NodePropertiesViewProps<'Tool'>['config'],
          state: viewState,
          displayTitle,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          nodeId: nodeIdForView,
          graphNodes: safeGraphNodes,
          graphEdges: safeGraphEdges,
        } satisfies NodePropertiesViewProps<'Tool'>;
        return <View {...toolProps} />;
      }
      case 'MCP': {
        const View = templateViewComponent('MCP') ?? NODE_VIEW_REGISTRY.MCP;
        const mcpProps: NodePropertiesViewProps<'MCP'> = {
          config: viewConfig as NodePropertiesViewProps<'MCP'>['config'],
          state: viewState,
          displayTitle,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          tools: mcpTools,
          enabledTools: mcpEnabledTools,
          onToggleTool: handleToggleMcpTool,
          toolsLoading: mcpToolsLoading,
          nodeId: nodeIdForView,
          graphNodes: safeGraphNodes,
          graphEdges: safeGraphEdges,
        } satisfies NodePropertiesViewProps<'MCP'>;
        return <View {...mcpProps} />;
      }
      case 'Workspace': {
        const View = templateViewComponent('Workspace') ?? NODE_VIEW_REGISTRY.Workspace;
        const workspaceProps: NodePropertiesViewProps<'Workspace'> = {
          config: viewConfig as NodePropertiesViewProps<'Workspace'>['config'],
          state: viewState,
          displayTitle,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          nixPackageSearch,
          fetchNixPackageVersions,
          resolveNixPackageSelection,
          nodeId: nodeIdForView,
          graphNodes: safeGraphNodes,
          graphEdges: safeGraphEdges,
        } satisfies NodePropertiesViewProps<'Workspace'>;
        return <View {...workspaceProps} />;
      }
      case 'Agent': {
        const View = templateViewComponent('Agent') ?? NODE_VIEW_REGISTRY.Agent;
        const agentProps: NodePropertiesViewProps<'Agent'> = {
          config: viewConfig as NodePropertiesViewProps<'Agent'>['config'],
          state: viewState,
          displayTitle,
          onConfigChange: handleViewConfigChange,
          nodeId: nodeIdForView,
          graphNodes: safeGraphNodes,
          graphEdges: safeGraphEdges,
        } satisfies NodePropertiesViewProps<'Agent'>;
        return <View {...agentProps} />;
      }
      case 'Trigger': {
        const View = templateViewComponent('Trigger') ?? NODE_VIEW_REGISTRY.Trigger;
        const triggerProps: NodePropertiesViewProps<'Trigger'> = {
          config: viewConfig as NodePropertiesViewProps<'Trigger'>['config'],
          state: viewState,
          displayTitle,
          onConfigChange: handleViewConfigChange,
          secretSuggestions,
          variableSuggestions,
          ensureSecretKeys,
          ensureVariableKeys,
          nodeId: nodeIdForView,
          graphNodes: safeGraphNodes,
          graphEdges: safeGraphEdges,
        } satisfies NodePropertiesViewProps<'Trigger'>;
        return <View {...triggerProps} />;
      }
      default: {
        const unexpected: never = nodeKind;
        throw new Error(`Unsupported node kind: ${String(unexpected)}`);
      }
    }
  }, [
    templateSelection,
    nodeKind,
    viewConfig,
    viewState,
    displayTitle,
    handleViewConfigChange,
    secretSuggestions,
    variableSuggestions,
    ensureSecretKeys,
    ensureVariableKeys,
    nixPackageSearch,
    fetchNixPackageVersions,
    templateViewComponent,
    resolveNixPackageSelection,
    nodeIdForView,
    safeGraphNodes,
    safeGraphEdges,
    mcpTools,
    mcpEnabledTools,
    handleToggleMcpTool,
    mcpToolsLoading,
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
      relations: relationDefinitions.length > 0 ? relationInputs : undefined,
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
      <ScreenDialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0" hideCloseButton>
        <Form {...form}>
          <form className="flex h-full flex-col" onSubmit={handleFormSubmit}>
            <ScreenDialogTitle className="sr-only">{dialogTitle}</ScreenDialogTitle>
            <ScreenDialogDescription className="sr-only">
              Configure the template and metadata for this {kind}.
            </ScreenDialogDescription>
            <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-text-subtle)]">{dialogTitle}</p>
                  <FormField
                    control={form.control}
                    name="title"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <FormItem className="space-y-2">
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
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex size-8 items-center justify-center rounded-full text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-dark)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--agyn-blue)] focus-visible:ring-offset-2"
                  aria-label="Close dialog"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {templates.length === 0 && (
                <Alert variant="destructive">
                  <AlertDescription>No templates available. Please add templates before creating entities.</AlertDescription>
                </Alert>
              )}

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

              {templateSelection ? (
                <div className="space-y-8">
                  {configView}
                  {relationDefinitions.length > 0 ? (
                    <div className="space-y-4 rounded-xl border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/40 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--agyn-dark)]">Relations</p>
                        <p className="text-xs text-[var(--agyn-text-subtle)]">
                          Connect this entity to downstream nodes.
                        </p>
                      </div>
                      <div className="space-y-4">
                        {relationDefinitions.map((definition) => {
                          const currentRelation = relationInputs.find((relation) => relation.id === definition.id);
                          const selectedValue = currentRelation?.targetId ?? '';
                          const targetNodeKind = toNodeKind(definition.targetKind);
                          const candidateNodes = safeGraphNodes
                            .filter((node) => node.kind === targetNodeKind)
                            .sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id));
                          const helperText =
                            candidateNodes.length === 0
                              ? `No ${definition.targetKind}s are available in this graph.`
                              : definition.description;
                          return (
                            <SelectInput
                              key={definition.id}
                              label={definition.label}
                              placeholder={`Select a ${definition.targetKind}`}
                              value={selectedValue}
                              allowEmptyOption
                              disabled={isSubmitting || candidateNodes.length === 0}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setRelationInputs((current) =>
                                  current.map((relation) =>
                                    relation.id === definition.id
                                      ? { ...relation, targetId: nextValue.length > 0 ? nextValue : null }
                                      : relation,
                                  ),
                                );
                              }}
                              helperText={helperText}
                              options={candidateNodes.map((node) => ({
                                value: node.id,
                                label: node.title || node.id,
                              }))}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[var(--agyn-text-subtle)]">Select a template to configure this {kind}.</p>
              )}

              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || (mode === 'create' && !templateSelection)}>
                {mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
