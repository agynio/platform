import type { NodePropertiesViewRegistry } from './viewTypes';

import ToolNodeConfigView from './views/ToolNodeConfigView';
import WorkspaceNodeConfigView from './views/WorkspaceNodeConfigView';
import McpNodeConfigView from './views/McpNodeConfigView';
import AgentNodeConfigView from './views/AgentNodeConfigView';
import TriggerNodeConfigView from './views/TriggerNodeConfigView';

export const NODE_VIEW_REGISTRY: NodePropertiesViewRegistry = {
  Tool: ToolNodeConfigView,
  Workspace: WorkspaceNodeConfigView,
  MCP: McpNodeConfigView,
  Agent: AgentNodeConfigView,
  Trigger: TriggerNodeConfigView,
};
