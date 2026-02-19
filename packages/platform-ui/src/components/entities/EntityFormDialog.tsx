import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
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
  GraphRelationMode,
  GraphRelationOwnerRole,
  TemplateOption,
} from '@/features/entities/types';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { X } from 'lucide-react';
import { useMcpNodeState } from '@/lib/graph/hooks';
import { listTargetsByEdge, sanitizeConfigForPersistence } from '@/features/entities/api/graphEntities';

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

type RelationSelectionMode = GraphRelationMode;
type RelationOwnerRole = GraphRelationOwnerRole;

interface RelationCandidateFilter {
  kinds?: GraphEntityKind[];
  templateNames?: string[];
}

interface RelationAppliesTo {
  templateNames?: string[];
  templateKinds?: GraphEntityKind[];
}

interface RelationFieldDefinition {
  id: string;
  label: string;
  description?: string;
  appliesTo: RelationAppliesTo;
  ownerRole: RelationOwnerRole;
  ownerHandle: string;
  peerHandle: string;
  mode: RelationSelectionMode;
  candidateFilter: RelationCandidateFilter;
  placeholder?: string;
}

interface RelationOption {
  id: string;
  label: string;
}

const RELATION_FIELD_DEFINITIONS: RelationFieldDefinition[] = [
  {
    id: 'slackTriggerAgent',
    label: 'Agent destination',
    description: 'Routes Slack trigger events to the selected agent.',
    appliesTo: { templateNames: ['slackTrigger'] },
    ownerRole: 'source',
    ownerHandle: 'subscribe',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { kinds: ['agent'] },
    placeholder: 'Select an agent',
  },
  {
    id: 'agentTools',
    label: 'Tools',
    description: 'Attach tools the agent can call during a run.',
    appliesTo: { templateKinds: ['agent'] },
    ownerRole: 'source',
    ownerHandle: 'tools',
    peerHandle: '$self',
    mode: 'multi',
    candidateFilter: { kinds: ['tool'] },
  },
  {
    id: 'agentMcpServers',
    label: 'MCP servers',
    description: 'Enable MCP servers for this agent.',
    appliesTo: { templateKinds: ['agent'] },
    ownerRole: 'source',
    ownerHandle: 'mcp',
    peerHandle: '$self',
    mode: 'multi',
    candidateFilter: { kinds: ['mcp'] },
  },
  {
    id: 'agentMemoryConnector',
    label: 'Memory connector',
    description: 'Bind the agent to a memory connector.',
    appliesTo: { templateKinds: ['agent'] },
    ownerRole: 'target',
    ownerHandle: 'memory',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { templateNames: ['memoryConnector'] },
    placeholder: 'Select a memory connector',
  },
  {
    id: 'shellToolWorkspace',
    label: 'Workspace',
    description: 'Provide the workspace for this Shell tool.',
    appliesTo: { templateNames: ['shellTool'] },
    ownerRole: 'target',
    ownerHandle: 'workspace',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { kinds: ['workspace'] },
    placeholder: 'Select a workspace',
  },
  {
    id: 'githubCloneWorkspace',
    label: 'Workspace',
    description: 'Provide the workspace for this GitHub clone tool.',
    appliesTo: { templateNames: ['githubCloneRepoTool'] },
    ownerRole: 'target',
    ownerHandle: 'workspace',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { kinds: ['workspace'] },
    placeholder: 'Select a workspace',
  },
  {
    id: 'memoryToolMemory',
    label: 'Memory workspace',
    description: 'Select the memory backing this tool.',
    appliesTo: { templateNames: ['memoryTool'] },
    ownerRole: 'target',
    ownerHandle: '$memory',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { templateNames: ['memory'] },
    placeholder: 'Select a memory',
  },
  {
    id: 'manageToolAgents',
    label: 'Managed agents',
    description: 'Pick agents that can be orchestrated by this tool.',
    appliesTo: { templateNames: ['manageTool'] },
    ownerRole: 'source',
    ownerHandle: 'agent',
    peerHandle: '$self',
    mode: 'multi',
    candidateFilter: { kinds: ['agent'] },
  },
  {
    id: 'callAgentToolAgent',
    label: 'Agent',
    description: 'Select the agent to call.',
    appliesTo: { templateNames: ['callAgentTool'] },
    ownerRole: 'source',
    ownerHandle: 'agent',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { kinds: ['agent'] },
    placeholder: 'Select an agent',
  },
  {
    id: 'mcpServerWorkspace',
    label: 'Workspace',
    description: 'Select the workspace hosting this MCP server.',
    appliesTo: { templateNames: ['mcpServer'] },
    ownerRole: 'target',
    ownerHandle: 'workspace',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { kinds: ['workspace'] },
    placeholder: 'Select a workspace',
  },
  {
    id: 'memoryConnectorMemory',
    label: 'Memory workspace',
    description: 'Select the memory backing this connector.',
    appliesTo: { templateNames: ['memoryConnector'] },
    ownerRole: 'target',
    ownerHandle: '$memory',
    peerHandle: '$self',
    mode: 'single',
    candidateFilter: { templateNames: ['memory'] },
    placeholder: 'Select a memory',
  },
];

const NODE_KIND_TO_ENTITY_KIND: Record<NodeViewKind, GraphEntityKind> = {
  Agent: 'agent',
  Trigger: 'trigger',
  Tool: 'tool',
  MCP: 'mcp',
  Workspace: 'workspace',
};

function matchesCandidateFilter(node: GraphNodeConfig, filter: RelationCandidateFilter): boolean {
  if (!filter.kinds && !filter.templateNames) {
    return true;
  }
  if (filter.kinds && filter.kinds.length > 0) {
    const nodeKind = NODE_KIND_TO_ENTITY_KIND[node.kind] ?? 'workspace';
    if (!filter.kinds.includes(nodeKind)) {
      return false;
    }
  }
  if (filter.templateNames && filter.templateNames.length > 0) {
    if (!filter.templateNames.includes(node.template)) {
      return false;
    }
  }
  return true;
}

function relationApplies(
  definition: RelationFieldDefinition,
  templateName: string,
  templateKind: GraphEntityKind,
): boolean {
  if (!templateName) {
    return false;
  }
  if (definition.appliesTo.templateNames && definition.appliesTo.templateNames.length > 0) {
    if (!definition.appliesTo.templateNames.includes(templateName)) {
      return false;
    }
  }
  if (definition.appliesTo.templateKinds && definition.appliesTo.templateKinds.length > 0) {
    if (!definition.appliesTo.templateKinds.includes(templateKind)) {
      return false;
    }
  }
  return true;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

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

function buildSubmitConfig(base: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) {
      continue;
    }
    sanitized[key] = value;
  }
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
  const configTitleRef = useRef('');

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
    const initialConfigTitle = typeof entity?.config?.title === 'string' ? entity.config.title.trim() : '';
    configTitleRef.current = initialConfigTitle;
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
  const relationTemplateName = templateSelection || entity?.templateName || '';
  const relationTemplateKind = selectedTemplate?.kind ?? entity?.templateKind ?? kind;
  const relationDefinitions = useMemo(() => {
    if (!relationTemplateName) {
      return [];
    }
    return RELATION_FIELD_DEFINITIONS.filter((definition) =>
      relationApplies(definition, relationTemplateName, relationTemplateKind),
    );
  }, [relationTemplateKind, relationTemplateName]);
  const relationPrefillMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    const entityId = entity?.id;
    relationDefinitions.forEach((definition) => {
      if (!entityId) {
        map[definition.id] = [];
        return;
      }
      const filter =
        definition.ownerRole === 'source'
          ? { sourceId: entityId, sourceHandle: definition.ownerHandle }
          : { targetId: entityId, targetHandle: definition.ownerHandle };
      const matches = listTargetsByEdge(safeGraphEdges, filter);
      const selectedIds = definition.ownerRole === 'source'
        ? matches.map((edge) => edge.target)
        : matches.map((edge) => edge.source);
      map[definition.id] = uniqueStrings(selectedIds);
    });
    return map;
  }, [entity?.id, relationDefinitions, safeGraphEdges]);
  const relationOptionsMap = useMemo(() => {
    const map: Record<string, RelationOption[]> = {};
    relationDefinitions.forEach((definition) => {
      const options = safeGraphNodes
        .filter((node) => matchesCandidateFilter(node, definition.candidateFilter))
        .map((node) => ({ id: node.id, label: node.title || node.id }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));
      map[definition.id] = options;
    });
    return map;
  }, [relationDefinitions, safeGraphNodes]);
  const [relationSelections, setRelationSelections] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!open) return;
    if (relationDefinitions.length === 0) {
      setRelationSelections({});
      return;
    }
    setRelationSelections(() => {
      const next: Record<string, string[]> = {};
      relationDefinitions.forEach((definition) => {
        next[definition.id] = relationPrefillMap[definition.id] ?? [];
      });
      return next;
    });
  }, [open, relationDefinitions, relationPrefillMap]);
  const handleSingleRelationChange = useCallback((relationId: string, nextValue: string) => {
    setRelationSelections((current) => ({
      ...current,
      [relationId]: nextValue ? [nextValue] : [],
    }));
  }, []);

  const handleMultiRelationChange = useCallback(
    (relationId: string, event: ChangeEvent<HTMLSelectElement>) => {
      const selectedOptions = Array.from(event.target?.selectedOptions ?? []);
      const nextValues = selectedOptions.map((option) => option.value).filter((value) => value.length > 0);
      setRelationSelections((current) => ({
        ...current,
        [relationId]: uniqueStrings(nextValues),
      }));
    },
    [],
  );
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
            const trimmed = stringValue.trim();
            if (trimmed.length > 0) {
              configTitleRef.current = trimmed;
            }
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
    const baseConfig = buildSubmitConfig(configState);
    const configTitle = typeof baseConfig.title === 'string' ? baseConfig.title.trim() : '';
    const payloadTitle = trimmedTitle || configTitle || configTitleRef.current;
    if (!payloadTitle) {
      form.setError('title', { type: 'required', message: 'Title is required.' });
      return;
    }

    const payloadConfig = sanitizeConfigForPersistence(templateName, baseConfig);

    const relationPayload: GraphEntityRelationInput[] =
      relationDefinitions.length === 0
        ? []
        : relationDefinitions.map((definition) => {
            const selections = relationSelections[definition.id] ?? relationPrefillMap[definition.id] ?? [];
            const normalizedSelections =
              definition.mode === 'single' ? uniqueStrings(selections).slice(0, 1) : uniqueStrings(selections);
            return {
              id: definition.id,
              ownerHandle: definition.ownerHandle,
              ownerRole: definition.ownerRole,
              peerHandle: definition.peerHandle,
              mode: definition.mode,
              selections: normalizedSelections,
              ownerId: entity?.id,
            } satisfies GraphEntityRelationInput;
          });

    const payload: GraphEntityUpsertInput = {
      id: entity?.id,
      template: templateName,
      title: payloadTitle,
      config: payloadConfig,
      relations: relationPayload.length > 0 ? relationPayload : undefined,
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
                          const options = relationOptionsMap[definition.id] ?? [];
                          const selections = relationSelections[definition.id] ?? [];
                          const helperText = options.length === 0
                            ? 'No eligible nodes available in this workspace.'
                            : definition.description ?? 'Select an option.';
                          if (definition.mode === 'single') {
                            const controlId = `relation-${definition.id}`;
                            return (
                              <div key={definition.id} className="space-y-2">
                                <label
                                  htmlFor={controlId}
                                  className="text-sm font-medium text-[var(--agyn-dark)]"
                                >
                                  {definition.label}
                                </label>
                                <SelectInput
                                  id={controlId}
                                  placeholder={definition.placeholder ?? 'Select an option'}
                                  value={selections[0] ?? ''}
                                  allowEmptyOption
                                  disabled={isSubmitting || options.length === 0}
                                  onChange={(event) => handleSingleRelationChange(definition.id, event.target.value)}
                                  helperText={helperText}
                                  options={options.map((option) => ({
                                    value: option.id,
                                    label: option.label,
                                  }))}
                                />
                              </div>
                            );
                          }
                          return (
                            <div key={definition.id} className="space-y-2">
                              <label
                                htmlFor={`relation-${definition.id}`}
                                className="text-sm font-medium text-[var(--agyn-dark)]"
                              >
                                {definition.label}
                              </label>
                              {options.length === 0 ? (
                                <p className="text-xs text-[var(--agyn-text-subtle)]">No eligible nodes available.</p>
                              ) : (
                                <SelectInput
                                  id={`relation-${definition.id}`}
                                  multiple
                                  htmlSize={Math.min(6, Math.max(3, options.length))}
                                  value={selections}
                                  disabled={isSubmitting}
                                  onChange={(event) => handleMultiRelationChange(definition.id, event)}
                                  helperText={
                                    helperText
                                      ? `${helperText} Hold Cmd/Ctrl to select multiple.`
                                      : 'Select one or more targets. Hold Cmd/Ctrl to select multiple.'
                                  }
                                  options={options.map((option) => ({
                                    value: option.id,
                                    label: option.label,
                                  }))}
                                />
                              )}
                            </div>
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
