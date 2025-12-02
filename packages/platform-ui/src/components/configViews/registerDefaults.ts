import type { ConfigViewRegistration } from './types';
// registerConfigView is not used directly here; exports installer below
import McpServerDynamicConfigView from './McpServerDynamicConfigView';
import McpServerStaticConfigView from './McpServerStaticConfigView';
import WorkspaceConfigView from './WorkspaceConfigView';
import ShellToolConfigView from './ShellToolConfigView';
import GithubCloneRepoToolConfigView from './GithubCloneRepoToolConfigView';
import SendSlackMessageToolConfigView from './SendSlackMessageToolConfigView';
import CallAgentToolConfigView from './CallAgentToolConfigView';
import DebugToolTriggerConfigView from './DebugToolTriggerConfigView';
import SlackTriggerConfigView from './SlackTriggerConfigView';
import MemoryServiceConfigView from './MemoryServiceConfigView';
import MemoryConnectorConfigView from './MemoryConnectorConfigView';
import ManageToolConfigView from './ManageToolConfigView';

// Export an installer to avoid side-effect registration at import time
export function installDefaultConfigViews(register: (entry: ConfigViewRegistration) => void) {
  register({ template: 'mcpServer', mode: 'dynamic', component: McpServerDynamicConfigView });
  register({ template: 'mcpServer', mode: 'static', component: McpServerStaticConfigView });
  // Register Workspace config view under template name 'workspace'
  register({ template: 'workspace', mode: 'static', component: WorkspaceConfigView });
  register({ template: 'shellTool', mode: 'static', component: ShellToolConfigView });
  register({ template: 'githubCloneRepoTool', mode: 'static', component: GithubCloneRepoToolConfigView });
  register({ template: 'sendSlackMessageTool', mode: 'static', component: SendSlackMessageToolConfigView });
  register({ template: 'manageTool', mode: 'static', component: ManageToolConfigView });
  register({ template: 'callAgentTool', mode: 'static', component: CallAgentToolConfigView });
  register({ template: 'debugTool', mode: 'static', component: DebugToolTriggerConfigView });
  register({ template: 'slackTrigger', mode: 'static', component: SlackTriggerConfigView });
  register({ template: 'memory', mode: 'static', component: MemoryServiceConfigView });
  register({ template: 'memoryConnector', mode: 'static', component: MemoryConnectorConfigView });
}
