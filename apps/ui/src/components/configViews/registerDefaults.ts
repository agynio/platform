import type { ConfigViewRegistration } from './types';
import { registerConfigView } from './registry';
import SimpleAgentConfigView from './SimpleAgentConfigView';
import McpServerDynamicConfigView from './McpServerDynamicConfigView';
import McpServerStaticConfigView from './McpServerStaticConfigView';
import ContainerProviderConfigView from './ContainerProviderConfigView';
import ShellToolConfigView from './ShellToolConfigView';
import GithubCloneRepoToolConfigView from './GithubCloneRepoToolConfigView';
import SendSlackMessageToolConfigView from './SendSlackMessageToolConfigView';
import FinishToolConfigView from './FinishToolConfigView';
import CallAgentToolConfigView from './CallAgentToolConfigView';
import RemindMeToolConfigView from './RemindMeToolConfigView';
import DebugToolTriggerConfigView from './DebugToolTriggerConfigView';
import SlackTriggerConfigView from './SlackTriggerConfigView';
import MemoryServiceConfigView from './MemoryServiceConfigView';
import MemoryConnectorConfigView from './MemoryConnectorConfigView';

// Export an installer to avoid side-effect registration at import time
export function installDefaultConfigViews(register: (entry: ConfigViewRegistration) => void) {
  register({ template: 'simpleAgent', mode: 'static', component: SimpleAgentConfigView });
  register({ template: 'mcpServer', mode: 'dynamic', component: McpServerDynamicConfigView });
  register({ template: 'mcpServer', mode: 'static', component: McpServerStaticConfigView });
  register({ template: 'containerProvider', mode: 'static', component: ContainerProviderConfigView });
  register({ template: 'shellTool', mode: 'static', component: ShellToolConfigView });
  register({ template: 'githubCloneRepoTool', mode: 'static', component: GithubCloneRepoToolConfigView });
  register({ template: 'sendSlackMessageTool', mode: 'static', component: SendSlackMessageToolConfigView });
  register({ template: 'finishTool', mode: 'static', component: FinishToolConfigView });
  register({ template: 'callAgentTool', mode: 'static', component: CallAgentToolConfigView });
  register({ template: 'remindMeTool', mode: 'static', component: RemindMeToolConfigView });
  register({ template: 'debugTool', mode: 'static', component: DebugToolTriggerConfigView });
  register({ template: 'slackTrigger', mode: 'static', component: SlackTriggerConfigView });
  register({ template: 'memory', mode: 'static', component: MemoryServiceConfigView });
  register({ template: 'memoryConnector', mode: 'static', component: MemoryConnectorConfigView });
}
