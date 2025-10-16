import { registerConfigView } from './registry';
import SimpleAgentConfigView from './SimpleAgentConfigView';
import McpServerDynamicConfigView from './McpServerDynamicConfigView';

// Register built-in custom views for SSR import side-effects.
registerConfigView({ template: 'simpleAgent', mode: 'static', component: SimpleAgentConfigView });
registerConfigView({ template: 'mcpServer', mode: 'dynamic', component: McpServerDynamicConfigView });

