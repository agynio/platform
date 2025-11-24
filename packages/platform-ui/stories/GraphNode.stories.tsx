import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider } from '@xyflow/react';
import GraphNode from '../src/components/Node';
import { Panel, PanelBody, PanelHeader } from '../src/components/Panel';

const meta: Meta<typeof GraphNode> = {
  title: 'Screens/Graph/GraphNode',
  component: GraphNode,
  decorators: [
		(Story) => (
			<ReactFlowProvider>
				<Story />
			</ReactFlowProvider>
		),
	],
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof GraphNode>;

export const SelectedAgent: Story = {
  args: {
    kind: 'Agent',
    title: 'Selected Agent',
    avatarSeed: 'Selected',
    selected: true,
    inputs: [
      { id: 'self', title: '$self' },
      { id: 'memory', title: 'memory' },
    ],
    outputs: [{ id: 'result', title: 'result' }],
  },
};

export const UnselectedAgent: Story = {
  args: {
    kind: 'Agent',
    title: 'Unselected Agent',
    avatarSeed: 'Unselected',
    selected: false,
    inputs: [{ id: 'self', title: '$self' }],
    outputs: [{ id: 'result', title: 'result' }],
  },
};

export const SelectedTool: Story = {
  args: {
    kind: 'Tool',
    title: 'Selected Tool',
    selected: true,
    inputs: [{ id: 'input', title: 'input' }],
    outputs: [{ id: 'output', title: 'output' }],
  },
};

export const AgentCustomerSupport: Story = {
  args: {
    kind: 'Agent',
    title: 'Customer Support Agent',
    avatarSeed: 'Felix',
    inputs: [
      { id: 'self', title: '$self' },
      { id: 'memory', title: 'memory' },
    ],
    outputs: [
      { id: 'tools', title: 'tools' },
      { id: 'mcp', title: 'mcp' },
    ],
  },
};

export const AgentCodeReviewBot: Story = {
  args: {
    kind: 'Agent',
    title: 'Code Review Bot',
    avatarSeed: 'Chloe',
    inputs: [{ id: 'self', title: '$self' }],
    outputs: [{ id: 'analysis', title: 'analysis' }],
  },
};

export const ToolSendSlackMessage: Story = {
  args: {
    kind: 'Tool',
    title: 'Send Slack Message',
    inputs: [{ id: 'self', title: '$self' }],
  },
};

export const ToolQueryDatabase: Story = {
  args: {
    kind: 'Tool',
    title: 'Query Database',
    inputs: [
      { id: 'query', title: 'query' },
      { id: 'params', title: 'params' },
    ],
    outputs: [{ id: 'results', title: 'results' }],
  },
};

export const MCPGithubIntegration: Story = {
  args: {
    kind: 'MCP',
    title: 'GitHub Integration',
    inputs: [
      { id: 'action', title: 'action' },
      { id: 'repo', title: 'repo' },
    ],
    outputs: [{ id: 'data', title: 'data' }],
  },
};

export const TriggerWebhookReceived: Story = {
  args: {
    kind: 'Trigger',
    title: 'Webhook Received',
    outputs: [
      { id: 'payload', title: 'payload' },
      { id: 'headers', title: 'headers' },
    ],
  },
};

export const TriggerSchedule: Story = {
  args: {
    kind: 'Trigger',
    title: 'Schedule',
    outputs: [{ id: 'timestamp', title: 'timestamp' }],
  },
};

export const WorkspaceDevelopmentEnvironment: Story = {
  args: {
    kind: 'Workspace',
    title: 'Development Environment',
    inputs: [{ id: 'config', title: 'config' }],
    outputs: [
      { id: 'env', title: 'env' },
      { id: 'secrets', title: 'secrets' },
    ],
  },
};

export const AllNodeKinds: Story = {
  render: () => (
    <Panel variant="elevated">
      <PanelHeader>
        <h3>All Node Kinds</h3>
        <p className="text-sm text-[var(--agyn-gray)] mt-1">
          Complete overview of all available node types
        </p>
      </PanelHeader>
      <PanelBody>
        <div className="flex flex-wrap gap-6 bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
          <GraphNode
            kind="Trigger"
            title="Webhook"
            outputs={[{ id: 'data', title: 'data' }]}
          />
          <GraphNode
            kind="Agent"
            title="Assistant"
            avatarSeed="Agent"
            inputs={[{ id: 'self', title: '$self' }]}
            outputs={[{ id: 'response', title: 'response' }]}
          />
          <GraphNode
            kind="Tool"
            title="API Call"
            inputs={[{ id: 'request', title: 'request' }]}
            outputs={[{ id: 'response', title: 'response' }]}
          />
          <GraphNode
            kind="MCP"
            title="Notion"
            inputs={[{ id: 'action', title: 'action' }]}
            outputs={[{ id: 'result', title: 'result' }]}
          />
          <GraphNode
            kind="Workspace"
            title="Production"
            inputs={[{ id: 'deploy', title: 'deploy' }]}
          />
        </div>
      </PanelBody>
    </Panel>
  ),
};

export const ManyPortsAgent: Story = {
  args: {
    kind: 'Agent',
    title: 'Multi-Tool Agent',
    avatarSeed: 'Multi',
    inputs: [
      { id: 'self', title: '$self' },
      { id: 'memory', title: 'memory' },
      { id: 'context', title: 'context' },
      { id: 'config', title: 'config' },
      { id: 'database', title: 'database' },
      { id: 'cache', title: 'cache' },
      { id: 'api', title: 'api' },
      { id: 'webhook', title: 'webhook' },
      { id: 'events', title: 'events' },
      { id: 'logs', title: 'logs' },
    ],
    outputs: [
      { id: 'response', title: 'response' },
      { id: 'analytics', title: 'analytics' },
      { id: 'errors', title: 'errors' },
    ],
  },
};

const usageCode = `import GraphNode from './components/Node';

// Agent node with avatar
<GraphNode
  kind="Agent"
  title="Customer Support Agent"
  avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
  inputs={[
    { id: 'self', title: '$self' },
    { id: 'memory', title: 'memory' },
  ]}
  outputs={[
    { id: 'tools', title: 'tools' },
    { id: 'mcp', title: 'mcp' },
  ]}
/>

// Tool node with inputs only
<GraphNode
  kind="Tool"
  title="Send Slack Message"
  inputs={[
    { id: 'self', title: '$self' },
  ]}
/>

// Trigger node with outputs only
<GraphNode
  kind="Trigger"
  title="Webhook Received"
  outputs={[
    { id: 'payload', title: 'payload' },
    { id: 'headers', title: 'headers' },
  ]}
/>`;

export const UsageExample: Story = {
  render: () => (
    <Panel variant="elevated">
      <PanelHeader>
        <h3>Usage</h3>
        <p className="text-sm text-[var(--agyn-gray)] mt-1">Implementation example</p>
      </PanelHeader>
      <PanelBody>
        <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
          <code>{usageCode}</code>
        </pre>
      </PanelBody>
    </Panel>
  ),
};
