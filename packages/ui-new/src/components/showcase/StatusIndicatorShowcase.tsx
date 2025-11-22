import { Panel, PanelHeader, PanelBody } from '../Panel';
import { StatusIndicator, Status } from '../StatusIndicator';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface StatusIndicatorShowcaseProps {
  onBack: () => void;
}

const statuses: Status[] = ['pending', 'running', 'finished', 'failed', 'terminated'];

export default function StatusIndicatorShowcase({ onBack }: StatusIndicatorShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="StatusIndicator"
        description="Visual indicator for status with color-coded dots and tooltips"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* All Statuses */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>All Statuses</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              All available status types with default (md) size. Hover to see tooltip.
            </p>
            <div className="flex flex-wrap gap-6">
              {statuses.map((status) => (
                <div key={status} className="flex items-center gap-3">
                  <StatusIndicator status={status} />
                  <span className="text-sm text-[var(--agyn-dark)] capitalize">{status}</span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Three size variants: sm (6px), md (10px), and lg (16px).
            </p>
            <div className="space-y-6">
              <div>
                <p className="text-xs text-[var(--agyn-gray)] mb-3">Small (sm)</p>
                <div className="flex flex-wrap gap-6">
                  {statuses.map((status) => (
                    <div key={status} className="flex items-center gap-3">
                      <StatusIndicator status={status} size="sm" />
                      <span className="text-sm text-[var(--agyn-dark)] capitalize">{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--agyn-gray)] mb-3">Medium (md) - Default</p>
                <div className="flex flex-wrap gap-6">
                  {statuses.map((status) => (
                    <div key={status} className="flex items-center gap-3">
                      <StatusIndicator status={status} size="md" />
                      <span className="text-sm text-[var(--agyn-dark)] capitalize">{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--agyn-gray)] mb-3">Large (lg)</p>
                <div className="flex flex-wrap gap-6">
                  {statuses.map((status) => (
                    <div key={status} className="flex items-center gap-3">
                      <StatusIndicator status={status} size="lg" />
                      <span className="text-sm text-[var(--agyn-dark)] capitalize">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Without Tooltip */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>With Text (No Tooltip)</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              When used with text labels, tooltips can be disabled with showTooltip=false to avoid redundancy.
            </p>
            <div className="space-y-3">
              {statuses.map((status) => (
                <div key={status} className="flex items-center gap-3">
                  <StatusIndicator status={status} showTooltip={false} />
                  <span className="text-sm text-[var(--agyn-dark)] capitalize">{status}</span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>

        {/* Standalone Without Tooltip */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Standalone (With Tooltip)</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              When used alone without text, tooltips are helpful. Hover over the indicators below.
            </p>
            <div className="flex flex-wrap gap-6">
              {statuses.map((status) => (
                <StatusIndicator key={status} status={status} />
              ))}
            </div>
          </PanelBody>
        </Panel>

        {/* In Context - Table Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Usage Example - Task List</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Example of status indicators used in a task list context.
            </p>
            <div className="border border-[var(--agyn-border-subtle)] rounded-[10px] overflow-hidden">
              {/* Header */}
              <div className="bg-[var(--agyn-bg-light)] px-4 py-3 border-b border-[var(--agyn-border-subtle)]">
                <div className="grid grid-cols-[1fr_120px_80px] gap-4">
                  <span className="text-sm text-[var(--agyn-gray)]">Task Name</span>
                  <span className="text-sm text-[var(--agyn-gray)]">Agent</span>
                  <span className="text-sm text-[var(--agyn-gray)]">Status</span>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-[var(--agyn-border-subtle)]">
                {[
                  { task: 'Authentication implementation', agent: 'CodeGen', status: 'finished' as Status },
                  { task: 'Database optimization', agent: 'Optimizer', status: 'running' as Status },
                  { task: 'API endpoint creation', agent: 'CodeGen', status: 'failed' as Status },
                  { task: 'Unit test generation', agent: 'Tester', status: 'pending' as Status },
                  { task: 'Legacy code refactoring', agent: 'Analyzer', status: 'terminated' as Status },
                ].map((row, idx) => (
                  <div key={idx} className="px-4 py-3 hover:bg-[var(--agyn-bg-light)] transition-colors">
                    <div className="grid grid-cols-[1fr_120px_80px] gap-4 items-center">
                      <span className="text-sm text-[var(--agyn-dark)]">{row.task}</span>
                      <span className="text-sm text-[var(--agyn-gray)]">{row.agent}</span>
                      <div className="flex items-center gap-2">
                        <StatusIndicator status={row.status} size="sm" showTooltip={false} />
                        <span className="text-xs text-[var(--agyn-gray)] capitalize">{row.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Color Reference */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Color Reference</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Status color mappings for design consistency.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-[var(--agyn-dark)]">Pending</div>
                <StatusIndicator status="pending" showTooltip={false} />
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded">
                  var(--agyn-status-pending)
                </code>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-[var(--agyn-dark)]">Running</div>
                <StatusIndicator status="running" showTooltip={false} />
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded">
                  var(--agyn-status-pending) + pulse
                </code>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-[var(--agyn-dark)]">Finished</div>
                <StatusIndicator status="finished" showTooltip={false} />
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded">
                  var(--agyn-status-finished)
                </code>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-[var(--agyn-dark)]">Failed</div>
                <StatusIndicator status="failed" showTooltip={false} />
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded">
                  var(--agyn-status-failed)
                </code>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-[var(--agyn-dark)]">Terminated</div>
                <StatusIndicator status="terminated" showTooltip={false} />
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded">
                  var(--agyn-status-terminated)
                </code>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}