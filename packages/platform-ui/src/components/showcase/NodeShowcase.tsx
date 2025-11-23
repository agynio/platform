import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import Node from '../Node';

interface NodeShowcaseProps {
  onBack: () => void;
}

export default function NodeShowcase({ onBack }: NodeShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Node"
        description="Visual node components for graph-based workflows"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Selected State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Selected State</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Nodes with selected state highlighting</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Agent"
                title="Selected Agent"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Selected"
                selected={true}
                inputs={[
                  { id: 'self', title: '$self' },
                  { id: 'memory', title: 'memory' },
                ]}
                outputs={[
                  { id: 'result', title: 'result' },
                ]}
              />
              <Node
                kind="Agent"
                title="Unselected Agent"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Unselected"
                selected={false}
                inputs={[
                  { id: 'self', title: '$self' },
                ]}
                outputs={[
                  { id: 'result', title: 'result' },
                ]}
              />
              <Node
                kind="Tool"
                title="Selected Tool"
                selected={true}
                inputs={[
                  { id: 'input', title: 'input' },
                ]}
                outputs={[
                  { id: 'output', title: 'output' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Agent Node */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Agent Node</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Agent nodes with avatar, inputs and outputs</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
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
              <Node
                kind="Agent"
                title="Code Review Bot"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Chloe"
                inputs={[
                  { id: 'self', title: '$self' },
                ]}
                outputs={[
                  { id: 'analysis', title: 'analysis' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Tool Node */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Tool Node</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Tool nodes for executing actions</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Tool"
                title="Send Slack Message"
                inputs={[
                  { id: 'self', title: '$self' },
                ]}
              />
              <Node
                kind="Tool"
                title="Query Database"
                inputs={[
                  { id: 'query', title: 'query' },
                  { id: 'params', title: 'params' },
                ]}
                outputs={[
                  { id: 'results', title: 'results' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* MCP Node */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>MCP Node</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Model Context Protocol nodes</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="MCP"
                title="GitHub Integration"
                inputs={[
                  { id: 'action', title: 'action' },
                  { id: 'repo', title: 'repo' },
                ]}
                outputs={[
                  { id: 'data', title: 'data' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Trigger Node */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Trigger Node</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Event trigger nodes to start workflows</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Trigger"
                title="Webhook Received"
                outputs={[
                  { id: 'payload', title: 'payload' },
                  { id: 'headers', title: 'headers' },
                ]}
              />
              <Node
                kind="Trigger"
                title="Schedule"
                outputs={[
                  { id: 'timestamp', title: 'timestamp' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Workspace Node */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Workspace Node</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Workspace and environment nodes</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Workspace"
                title="Development Environment"
                inputs={[
                  { id: 'config', title: 'config' },
                ]}
                outputs={[
                  { id: 'env', title: 'env' },
                  { id: 'secrets', title: 'secrets' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* All Node Kinds */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>All Node Kinds</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Complete overview of all available node types</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap gap-6 bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Trigger"
                title="Webhook"
                outputs={[{ id: 'data', title: 'data' }]}
              />
              <Node
                kind="Agent"
                title="Assistant"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Agent"
                inputs={[{ id: 'self', title: '$self' }]}
                outputs={[{ id: 'response', title: 'response' }]}
              />
              <Node
                kind="Tool"
                title="API Call"
                inputs={[{ id: 'request', title: 'request' }]}
                outputs={[{ id: 'response', title: 'response' }]}
              />
              <Node
                kind="MCP"
                title="Notion"
                inputs={[{ id: 'action', title: 'action' }]}
                outputs={[{ id: 'result', title: 'result' }]}
              />
              <Node
                kind="Workspace"
                title="Production"
                inputs={[{ id: 'deploy', title: 'deploy' }]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Many Ports Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Many Ports Example</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Node with 10 input ports</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex gap-8 items-start bg-[var(--agyn-bg-light)] p-8 rounded-[6px]">
              <Node
                kind="Agent"
                title="Multi-Tool Agent"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Multi"
                inputs={[
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
                ]}
                outputs={[
                  { id: 'response', title: 'response' },
                  { id: 'analytics', title: 'analytics' },
                  { id: 'errors', title: 'errors' },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Usage Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Usage</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Implementation example</p>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
              <code>{`import Node from './components/Node';

// Agent node with avatar
<Node
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
<Node
  kind="Tool"
  title="Send Slack Message"
  inputs={[
    { id: 'self', title: '$self' },
  ]}
/>

// Trigger node with outputs only
<Node
  kind="Trigger"
  title="Webhook Received"
  outputs={[
    { id: 'payload', title: 'payload' },
    { id: 'headers', title: 'headers' },
  ]}
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}