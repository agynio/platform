import type { FlakeRepoSelection, NixpkgsSelection } from '@/components/nix/types';

export type NodeStatus =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

export type NodeKind = 'Agent' | 'Tool' | 'MCP' | 'Trigger' | 'Workspace';

export interface NodeConfig extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  template?: string;
}

export interface NodeState extends Record<string, unknown> {
  status: NodeStatus;
}

export type ReferenceConfigValue = string | Record<string, unknown>;

export interface EnvVarMeta {
  keyField: 'name' | 'key';
  original?: Record<string, unknown>;
  originalSource?: 'static' | 'vault' | 'variable';
  valueShape?: ReferenceConfigValue;
}

export type EnvVar = {
  id: string;
  name: string;
  value: string;
  source: 'static' | 'vault' | 'variable';
  meta: EnvVarMeta;
};

export type WorkspaceNixPackage = NixpkgsSelection;
export type WorkspaceFlakeRepo = FlakeRepoSelection;

export type AgentQueueConfig = {
  debounceMs?: number;
  whenBusy?: 'wait' | 'injectAfterTools';
  processBuffer?: 'allTogether' | 'oneByOne';
};

export type AgentSummarizationConfig = {
  keepTokens?: number;
  maxTokens?: number;
  prompt?: string;
};

export interface McpToolDescriptor {
  name: string;
  title?: string | null;
  description?: string | null;
}

export type SimpleOption = { value: string; label: string };

export interface NodePropertiesSidebarProps {
  config: NodeConfig;
  state: NodeState;
  displayTitle?: string;
  onConfigChange?: (updates: Partial<NodeConfig>) => void;
  onProvision?: () => void;
  onDeprovision?: () => void;
  canProvision?: boolean;
  canDeprovision?: boolean;
  isActionPending?: boolean;
  tools?: McpToolDescriptor[];
  enabledTools?: string[] | null;
  onToggleTool?: (toolName: string, nextEnabled: boolean) => void;
  toolsLoading?: boolean;
  nixPackageSearch?: (query: string) => Promise<Array<{ value: string; label: string }>>;
  fetchNixPackageVersions?: (name: string) => Promise<string[]>;
  resolveNixPackageSelection?: (name: string, version: string) => Promise<{
    version: string;
    commitHash: string;
    attributePath: string;
  }>;
  secretKeys?: string[];
  variableKeys?: string[];
  ensureSecretKeys?: () => Promise<string[]>;
  ensureVariableKeys?: () => Promise<string[]>;
}
