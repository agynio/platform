import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import Badge from '../Badge';

interface BadgeShowcaseProps {
  onBack: () => void;
}

export default function BadgeShowcase({ onBack }: BadgeShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Badge"
        description="Status indicators and labels"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Variants */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Variants</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Standard badge variants for different contexts</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap gap-3 bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
              <Badge variant="default">Default</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="info">Info</Badge>
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Badge size variants</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div className="bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
                <h4 className="text-sm mb-3">Default Size</h4>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="primary">Default Badge</Badge>
                  <Badge variant="success">Active</Badge>
                  <Badge variant="warning">Pending</Badge>
                </div>
              </div>

              <div className="bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
                <h4 className="text-sm mb-3">Small Size</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="primary" size="sm">Small Badge</Badge>
                  <Badge variant="success" size="sm">Active</Badge>
                  <Badge variant="warning" size="sm">Pending</Badge>
                  <Badge variant="error" size="sm">Error</Badge>
                  <Badge variant="info" size="sm">Processing</Badge>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Status Badges */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Status Badges</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Using badge variants for status indication</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div className="bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
                <h4 className="text-sm mb-3">Node States</h4>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="default">Not Ready</Badge>
                  <Badge variant="info">Provisioning</Badge>
                  <Badge variant="success">Ready</Badge>
                  <Badge variant="warning">Deprovisioning</Badge>
                  <Badge variant="error">Provisioning Error</Badge>
                  <Badge variant="error">Deprovisioning Error</Badge>
                </div>
              </div>

              <div className="bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
                <h4 className="text-sm mb-3">Event Types</h4>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="default">System</Badge>
                  <Badge variant="primary">User</Badge>
                  <Badge variant="secondary">Assistant</Badge>
                  <Badge variant="accent">Tool</Badge>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Custom Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Custom Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Badges with custom color overrides</p>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap gap-3 bg-[var(--agyn-bg-light)] p-6 rounded-[6px]">
              <Badge color="#10B981" bgColor="#D1FAE5">
                Custom Green
              </Badge>
              <Badge color="#F59E0B" bgColor="#FEF3C7">
                Custom Amber
              </Badge>
              <Badge color="#EF4444" bgColor="#FEE2E2">
                Custom Red
              </Badge>
              <Badge color="#8B5CF6" bgColor="#EDE9FE">
                Custom Purple
              </Badge>
              <Badge color="#EC4899" bgColor="#FCE7F3">
                Custom Pink
              </Badge>
            </div>
          </PanelBody>
        </Panel>

        {/* In Context */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>In Context</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Badges used in realistic UI scenarios</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div className="bg-white p-4 border border-[var(--agyn-border-default)] rounded-[10px]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm">Customer Support Agent</h4>
                  <Badge variant="success">Active</Badge>
                </div>
                <p className="text-sm text-[var(--agyn-gray)]">Handles customer inquiries and support tickets</p>
              </div>

              <div className="bg-white p-4 border border-[var(--agyn-border-default)] rounded-[10px]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm">Data Analysis Tool</h4>
                  <Badge variant="warning">Maintenance</Badge>
                </div>
                <p className="text-sm text-[var(--agyn-gray)]">Processes and analyzes large datasets</p>
              </div>

              <div className="bg-white p-4 border border-[var(--agyn-border-default)] rounded-[10px]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm">Code Review Bot</h4>
                  <Badge variant="error">Error</Badge>
                </div>
                <p className="text-sm text-[var(--agyn-gray)]">Automated code review and suggestions</p>
              </div>

              <div className="bg-white p-4 border border-[var(--agyn-border-default)] rounded-[10px]">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm">Multi-Language Assistant</h4>
                  <Badge variant="primary">English</Badge>
                  <Badge variant="secondary">Spanish</Badge>
                  <Badge variant="accent">French</Badge>
                </div>
                <p className="text-sm text-[var(--agyn-gray)]">Supports multiple languages</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Usage Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Usage</h3>
          </PanelHeader>
          <PanelBody>
            <pre className="text-sm bg-[var(--agyn-bg-light)] p-4 rounded-[6px] overflow-x-auto">
              <code>{`import Badge from './components/Badge';

// Using variants
<Badge variant="success">Ready</Badge>
<Badge variant="error">Failed</Badge>

// Small size
<Badge variant="primary" size="sm">Small</Badge>

// Custom colors
<Badge 
  color="#10B981" 
  bgColor="#D1FAE5"
>
  Custom
</Badge>

// With additional styling
<Badge 
  variant="primary" 
  className="ml-2"
>
  Primary
</Badge>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}