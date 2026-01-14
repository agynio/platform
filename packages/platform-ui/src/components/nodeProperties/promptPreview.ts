import { renderMustacheTemplate } from '@/lib/mustache';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';

import { getCanonicalToolName } from './toolCanonicalNames';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const MANAGE_TEMPLATE_NAME = 'manageTool';
const MANAGE_FALLBACK_DESCRIPTION = 'Manage tool';

type PromptResolutionState = {
  agentCache: Map<string, string>;
  toolCache: Map<string, string>;
  agentStack: Set<string>;
  toolStack: Set<string>;
};

const createResolutionState = (): PromptResolutionState => ({
  agentCache: new Map(),
  toolCache: new Map(),
  agentStack: new Set(),
  toolStack: new Set(),
});

const pickFirstNonEmpty = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return '';
};

const readConfigRecord = (node: GraphNodeConfig | undefined): Record<string, unknown> => {
  if (!node || typeof node.config !== 'object' || node.config === null) {
    return {};
  }
  return node.config as Record<string, unknown>;
};

const readConfigString = (record: Record<string, unknown>, key: string): string | undefined => {
  const raw = record[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isManageTemplate = (template: string | null | undefined): boolean => template === MANAGE_TEMPLATE_NAME;

export type PreviewAgentToolContext = {
  name: string;
  title: string;
  description: string;
  prompt: string;
};

export type PreviewManageAgentContext = {
  name: string;
  role: string;
  prompt: string;
};

export type PromptResolver = {
  buildAgentToolContext: (agentId: string) => PreviewAgentToolContext[];
  resolveAgentSystemPrompt: (agentId: string) => string;
  buildManageAgentsContext: (toolId: string) => PreviewManageAgentContext[];
  resolveManagePrompt: (toolId: string) => string;
};

type CreatePromptResolverOptions = {
  graphNodes?: GraphNodeConfig[];
  graphEdges?: GraphPersistedEdge[];
  getTemplate: (name: string | null | undefined) => { title?: string; description?: string } | undefined;
  overrideAgent?: { id: string; systemPrompt: string } | undefined;
};

export function createPromptResolver(options: CreatePromptResolverOptions): PromptResolver {
  const nodesList = Array.isArray(options.graphNodes) ? options.graphNodes : [];
  const edgesList = Array.isArray(options.graphEdges) ? options.graphEdges : [];
  const getTemplate = options.getTemplate;
  const overrideAgent = options.overrideAgent;

  if (nodesList.length === 0) {
    return {
      buildAgentToolContext: () => [],
      resolveAgentSystemPrompt: () => DEFAULT_SYSTEM_PROMPT,
      buildManageAgentsContext: () => [],
      resolveManagePrompt: () => MANAGE_FALLBACK_DESCRIPTION,
    } satisfies PromptResolver;
  }

  const nodesById = new Map(nodesList.map((node) => [node.id, node] as const));
  const edgesBySource = new Map<string, GraphPersistedEdge[]>();
  for (const edge of edgesList) {
    if (!edge) continue;
    const sourceId = typeof edge.source === 'string' ? edge.source : '';
    if (!sourceId) continue;
    const list = edgesBySource.get(sourceId);
    if (list) {
      list.push(edge);
    } else {
      edgesBySource.set(sourceId, [edge]);
    }
  }

  const state = createResolutionState();

  const getEdgesFrom = (sourceId: string): GraphPersistedEdge[] => edgesBySource.get(sourceId) ?? [];

  const getOverrideSystemPrompt = (agentId: string): string | undefined => {
    if (!overrideAgent) return undefined;
    if (overrideAgent.id !== agentId) return undefined;
    return overrideAgent.systemPrompt;
  };

  const getManageFallbackDescription = (toolNode: GraphNodeConfig | undefined): string => {
    if (!toolNode) return MANAGE_FALLBACK_DESCRIPTION;
    const configRecord = readConfigRecord(toolNode);
    const description = readConfigString(configRecord, 'description');
    return pickFirstNonEmpty(description, MANAGE_FALLBACK_DESCRIPTION);
  };

  const resolveAgentSystemPrompt = (agentId: string): string => {
    const cached = state.agentCache.get(agentId);
    if (cached !== undefined) {
      return cached;
    }

    if (state.agentStack.has(agentId)) {
      const fallbackNode = nodesById.get(agentId);
      const fallbackRecord = readConfigRecord(fallbackNode);
      const fallback = pickFirstNonEmpty(
        getOverrideSystemPrompt(agentId),
        readConfigString(fallbackRecord, 'systemPrompt'),
        DEFAULT_SYSTEM_PROMPT,
      );
      state.agentCache.set(agentId, fallback);
      return fallback;
    }

    const agentNode = nodesById.get(agentId);
    if (!agentNode || agentNode.kind !== 'Agent') {
      state.agentCache.set(agentId, DEFAULT_SYSTEM_PROMPT);
      return DEFAULT_SYSTEM_PROMPT;
    }

    state.agentStack.add(agentId);
    try {
      const configRecord = readConfigRecord(agentNode);
      const template = pickFirstNonEmpty(
        getOverrideSystemPrompt(agentId),
        readConfigString(configRecord, 'systemPrompt'),
        DEFAULT_SYSTEM_PROMPT,
      );

      const toolsContext = buildAgentToolContext(agentId);
      const rendered = renderMustacheTemplate(template, { tools: toolsContext });
      const resolved = pickFirstNonEmpty(rendered, template, DEFAULT_SYSTEM_PROMPT);

      state.agentCache.set(agentId, resolved);
      return resolved;
    } finally {
      state.agentStack.delete(agentId);
    }
  };

  const buildManageAgentsContextForNode = (toolNode: GraphNodeConfig | undefined): PreviewManageAgentContext[] => {
    if (!toolNode) return [];
    const nodeId = typeof toolNode.id === 'string' ? toolNode.id : '';
    if (!nodeId) return [];

    const edges = getEdgesFrom(nodeId);
    if (edges.length === 0) return [];

    const seenTargets = new Set<string>();
    const agents: PreviewManageAgentContext[] = [];

    for (const edge of edges) {
      if (!edge) continue;
      const handle = typeof edge.sourceHandle === 'string' ? edge.sourceHandle : '';
      if (handle && handle !== 'agent') continue;
      const targetId = typeof edge.target === 'string' ? edge.target : '';
      if (!targetId || seenTargets.has(targetId)) continue;

      const agentNode = nodesById.get(targetId);
      if (!agentNode || agentNode.kind !== 'Agent') continue;

      seenTargets.add(targetId);
      const configRecord = readConfigRecord(agentNode);
      const name = readConfigString(configRecord, 'name') ?? '';
      const role = readConfigString(configRecord, 'role') ?? '';
      const prompt = resolveAgentSystemPrompt(targetId);
      agents.push({ name, role, prompt });
    }

    return agents;
  };

  const resolveManagePromptForNode = (toolNode: GraphNodeConfig | undefined): string => {
    if (!toolNode) return MANAGE_FALLBACK_DESCRIPTION;

    const nodeId = typeof toolNode.id === 'string' ? toolNode.id : '';
    const cached = nodeId ? state.toolCache.get(nodeId) : undefined;
    if (cached !== undefined) {
      return cached;
    }

    if (nodeId && state.toolStack.has(nodeId)) {
      const fallback = getManageFallbackDescription(toolNode);
      state.toolCache.set(nodeId, fallback);
      return fallback;
    }

    const configRecord = readConfigRecord(toolNode);
    const template = readConfigString(configRecord, 'prompt');
    const fallback = getManageFallbackDescription(toolNode);
    if (!template) {
      if (nodeId) state.toolCache.set(nodeId, fallback);
      return fallback;
    }

    if (nodeId) state.toolStack.add(nodeId);
    try {
      const agents = buildManageAgentsContextForNode(toolNode);
      const rendered = renderMustacheTemplate(template, { agents });
      const resolved = pickFirstNonEmpty(rendered, fallback);
      if (nodeId) {
        state.toolCache.set(nodeId, resolved);
      }
      return resolved;
    } finally {
      if (nodeId) {
        state.toolStack.delete(nodeId);
      }
    }
  };

  const resolveToolPrompt = (toolNode: GraphNodeConfig): string => {
    const nodeId = typeof toolNode.id === 'string' ? toolNode.id : '';
    const cached = nodeId ? state.toolCache.get(nodeId) : undefined;
    if (cached !== undefined) {
      return cached;
    }

    const configRecord = readConfigRecord(toolNode);
    const configPrompt = readConfigString(configRecord, 'prompt');
    const configDescription = readConfigString(configRecord, 'description');
    const templateMeta = getTemplate(toolNode.template ?? null);
    const templateDescription = typeof templateMeta?.description === 'string' ? templateMeta.description.trim() : '';
    const fallback = pickFirstNonEmpty(configPrompt, configDescription, templateDescription);

    if (isManageTemplate(toolNode.template)) {
      return resolveManagePromptForNode(toolNode);
    }

    if (!nodeId) {
      return fallback;
    }

    if (state.toolStack.has(nodeId)) {
      state.toolCache.set(nodeId, fallback);
      return fallback;
    }

    state.toolStack.add(nodeId);
    try {
      const resolved = pickFirstNonEmpty(configPrompt, configDescription, templateDescription);
      state.toolCache.set(nodeId, resolved);
      return pickFirstNonEmpty(resolved, fallback);
    } finally {
      state.toolStack.delete(nodeId);
    }
  };

  const buildAgentToolContext = (agentId: string): PreviewAgentToolContext[] => {
    const edges = getEdgesFrom(agentId);
    if (edges.length === 0) return [];

    const seenTargets = new Set<string>();
    const context: PreviewAgentToolContext[] = [];

    for (const edge of edges) {
      if (!edge) continue;
      const handle = typeof edge.sourceHandle === 'string' ? edge.sourceHandle : '';
      if (handle !== 'tools') continue;
      const targetId = typeof edge.target === 'string' ? edge.target : '';
      if (!targetId || seenTargets.has(targetId)) continue;

      const toolNode = nodesById.get(targetId);
      if (!toolNode || toolNode.kind !== 'Tool') continue;

      seenTargets.add(targetId);
      const configRecord = readConfigRecord(toolNode);
      const configName = readConfigString(configRecord, 'name');
      const configTitle = readConfigString(configRecord, 'title');
      const configDescription = readConfigString(configRecord, 'description');

      const templateMeta = getTemplate(toolNode.template ?? null);
      const templateTitle = typeof templateMeta?.title === 'string' ? templateMeta.title.trim() : '';
      const templateDescription = typeof templateMeta?.description === 'string' ? templateMeta.description.trim() : '';
      const canonicalName = getCanonicalToolName(toolNode.template).trim();
      const nodeTitle = typeof toolNode.title === 'string' ? toolNode.title.trim() : '';

      const name = pickFirstNonEmpty(configName, canonicalName, templateTitle, nodeTitle, 'tool');
      const title = pickFirstNonEmpty(configTitle, templateTitle, nodeTitle, name);
      const description = pickFirstNonEmpty(configDescription, templateDescription);
      const prompt = resolveToolPrompt(toolNode);

      context.push({ name, title, description, prompt });
    }

    return context;
  };

  return {
    buildAgentToolContext,
    resolveAgentSystemPrompt,
    buildManageAgentsContext: (toolId: string) => buildManageAgentsContextForNode(nodesById.get(toolId)),
    resolveManagePrompt: (toolId: string) => resolveManagePromptForNode(nodesById.get(toolId)),
  } satisfies PromptResolver;
}

export { DEFAULT_SYSTEM_PROMPT, MANAGE_FALLBACK_DESCRIPTION };
