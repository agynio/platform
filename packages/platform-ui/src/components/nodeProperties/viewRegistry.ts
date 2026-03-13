import type { NodePropertiesTemplateViewRegistry, NodePropertiesViewRegistry } from './viewTypes';

import ToolNodeConfigView from './views/ToolNodeConfigView';
import WorkspaceNodeConfigView from './views/WorkspaceNodeConfigView';
import McpNodeConfigView from './views/McpNodeConfigView';
import AgentNodeConfigView from './views/AgentNodeConfigView';
import TriggerNodeConfigView from './views/TriggerNodeConfigView';
import MemoryWorkspaceTemplateView from './views/WorkspaceMemoryTemplateView';
import MemoryConnectorWorkspaceTemplateView from './views/WorkspaceMemoryConnectorTemplateView';
import ShellToolTemplateView from './views/toolTemplates/ShellToolTemplateView';
import ManageToolTemplateView from './views/toolTemplates/ManageToolTemplateView';
import MemoryToolTemplateView from './views/toolTemplates/MemoryToolTemplateView';
import SendSlackMessageToolTemplateView from './views/toolTemplates/SendSlackMessageToolTemplateView';
import GithubCloneRepoToolTemplateView from './views/toolTemplates/GithubCloneRepoToolTemplateView';
import CallAgentToolTemplateView from './views/toolTemplates/CallAgentToolTemplateView';

export const NODE_VIEW_REGISTRY: NodePropertiesViewRegistry = {
  Tool: ToolNodeConfigView,
  Workspace: WorkspaceNodeConfigView,
  MCP: McpNodeConfigView,
  Agent: AgentNodeConfigView,
  Trigger: TriggerNodeConfigView,
};

export const NODE_TEMPLATE_VIEW_REGISTRY: NodePropertiesTemplateViewRegistry = {
  memory: MemoryWorkspaceTemplateView,
  memoryConnector: MemoryConnectorWorkspaceTemplateView,
  shellTool: ShellToolTemplateView,
  manageTool: ManageToolTemplateView,
  memoryTool: MemoryToolTemplateView,
  sendSlackMessageTool: SendSlackMessageToolTemplateView,
  githubCloneRepoTool: GithubCloneRepoToolTemplateView,
  callAgentTool: CallAgentToolTemplateView,
};
