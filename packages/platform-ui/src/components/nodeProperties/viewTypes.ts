import type { ReactElement } from 'react';

import type { NodeConfig, NodeKind, NodePropertiesSidebarProps, NodeState } from './types';

type CommonViewProps<K extends NodeKind> = Pick<
  NodePropertiesSidebarProps,
  'displayTitle' | 'onConfigChange' | 'onProvision' | 'onDeprovision' | 'canProvision' | 'canDeprovision' | 'isActionPending' | 'nodeId' | 'graphNodes' | 'graphEdges'
> & {
  config: NodeConfig & { kind: K };
  state: NodeState;
};

type EnvSupportProps = {
  secretSuggestions: string[];
  variableSuggestions: string[];
  ensureSecretKeys?: () => Promise<string[]>;
  ensureVariableKeys?: () => Promise<string[]>;
};

type WorkspaceSupportProps = Pick<
  NodePropertiesSidebarProps,
  'nixPackageSearch' | 'fetchNixPackageVersions' | 'resolveNixPackageSelection'
>;

type McpSupportProps = Pick<
  NodePropertiesSidebarProps,
  'tools' | 'enabledTools' | 'onToggleTool' | 'toolsLoading'
>;

export type NodePropertiesViewPropsMap = {
  Agent: CommonViewProps<'Agent'>;
  Tool: CommonViewProps<'Tool'> & EnvSupportProps;
  MCP: CommonViewProps<'MCP'> & EnvSupportProps & McpSupportProps;
  Trigger: CommonViewProps<'Trigger'> & EnvSupportProps;
  Workspace: CommonViewProps<'Workspace'> & EnvSupportProps & WorkspaceSupportProps;
};

export type NodePropertiesViewProps<K extends NodeKind> = NodePropertiesViewPropsMap[K];

export type NodePropertiesViewComponent<K extends NodeKind> = (
  props: NodePropertiesViewProps<K>,
) => ReactElement | null;

export type NodePropertiesViewRegistry = {
  [K in NodeKind]: NodePropertiesViewComponent<K>;
};

export const NODE_TEMPLATE_KIND_MAP = {
  memory: 'Workspace',
  memoryConnector: 'Workspace',
  shellTool: 'Tool',
  manageTool: 'Tool',
  memoryTool: 'Tool',
  githubCloneRepoTool: 'Tool',
  sendSlackMessageTool: 'Tool',
  callAgentTool: 'Tool',
  remindMeTool: 'Tool',
} as const;

export type NodeTemplateName = keyof typeof NODE_TEMPLATE_KIND_MAP;

export type NodePropertiesTemplateViewRegistry = Partial<{
  [T in NodeTemplateName]: NodePropertiesViewComponent<(typeof NODE_TEMPLATE_KIND_MAP)[T]>;
}>;

export function isNodeTemplateName(value: string): value is NodeTemplateName {
  return Object.prototype.hasOwnProperty.call(NODE_TEMPLATE_KIND_MAP, value);
}
