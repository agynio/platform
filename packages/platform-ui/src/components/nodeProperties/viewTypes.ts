import type { NodeConfig, NodeKind, NodePropertiesSidebarProps, NodeState } from './types';

type CommonViewProps<K extends NodeKind> = Pick<
  NodePropertiesSidebarProps,
  'displayTitle' | 'onConfigChange' | 'onProvision' | 'onDeprovision' | 'canProvision' | 'canDeprovision' | 'isActionPending'
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
) => JSX.Element | null;

export type NodePropertiesViewRegistry = {
  [K in NodeKind]: NodePropertiesViewComponent<K>;
};
