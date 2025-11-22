import { ArrowLeft } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface PaletteShowcaseProps {
  onBack: () => void;
}

export default function PaletteShowcase({ onBack }: PaletteShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Color Palette"
        description="Brand colors and role-based colors for the Agyn design system"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Primary Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Primary Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Main blue color family</p>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="h-24 rounded-[10px] bg-[var(--agyn-blue)] mb-3 flex items-center justify-center">
                  <span className="text-white">Aa</span>
                </div>
                <h4 className="mb-1">Blue</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#3B82F6</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-blue)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Primary actions, links</p>
              </div>
              <div>
                <div className="h-24 rounded-[10px] bg-[var(--agyn-blue-dark)] mb-3 flex items-center justify-center">
                  <span className="text-white">Aa</span>
                </div>
                <h4 className="mb-1">Blue Dark</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#2563EB</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-blue-dark)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Hover states, emphasis</p>
              </div>
              <div>
                <div className="h-24 rounded-[10px] bg-[var(--agyn-blue-light)] mb-3 flex items-center justify-center">
                  <span className="text-white">Aa</span>
                </div>
                <h4 className="mb-1">Blue Light</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#60A5FA</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-blue-light)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Accents, highlights</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Secondary & Accent */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Secondary & Accent</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Supporting brand colors</p>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="h-24 rounded-[10px] bg-[var(--agyn-purple)] mb-3 flex items-center justify-center">
                  <span className="text-white">Aa</span>
                </div>
                <h4 className="mb-1">Purple</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#8B5CF6</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-purple)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Secondary actions, features</p>
              </div>
              <div>
                <div className="h-24 rounded-[10px] bg-[var(--agyn-cyan)] mb-3 flex items-center justify-center">
                  <span className="text-white">Aa</span>
                </div>
                <h4 className="mb-1">Cyan</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#06B6D4</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-cyan)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Accent color, special states</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Neutrals */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Neutrals</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Grays and foundational colors</p>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-dark)] mb-3 flex items-center justify-center">
                  <span className="text-white text-sm">Aa</span>
                </div>
                <h4 className="mb-1">Dark</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#0F172A</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-dark)
                </code>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-gray)] mb-3 flex items-center justify-center border border-[var(--agyn-border-subtle)]">
                  <span className="text-white text-sm">Aa</span>
                </div>
                <h4 className="mb-1">Gray</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#64748B</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-gray)
                </code>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-gray-light)] mb-3 flex items-center justify-center border border-[var(--agyn-border-subtle)]">
                  <span className="text-[var(--agyn-dark)] text-sm">Aa</span>
                </div>
                <h4 className="mb-1">Gray Light</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#CBD5E1</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-gray-light)
                </code>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-gray-lighter)] mb-3 flex items-center justify-center border border-[var(--agyn-border-subtle)]">
                  <span className="text-[var(--agyn-dark)] text-sm">Aa</span>
                </div>
                <h4 className="mb-1">Gray Lighter</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#F1F5F9</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-gray-lighter)
                </code>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-white)] mb-3 flex items-center justify-center border border-[var(--agyn-border-subtle)]">
                  <span className="text-[var(--agyn-dark)] text-sm">Aa</span>
                </div>
                <h4 className="mb-1">White</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#FFFFFF</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-white)
                </code>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Border Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Border Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Colors for borders and dividers</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-24 h-16 rounded-[10px] bg-white border border-[var(--agyn-border-subtle)]"></div>
                <div className="flex-1">
                  <h4 className="mb-1">Subtle</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#E2E8F0</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-border-subtle)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Default borders</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 h-16 rounded-[10px] bg-white border-2 border-[var(--agyn-border-medium)]"></div>
                <div className="flex-1">
                  <h4 className="mb-1">Medium</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#CBD5E1</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-border-medium)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Emphasized borders</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 h-16 rounded-[10px] bg-white border-2 border-[var(--agyn-border-strong)]"></div>
                <div className="flex-1">
                  <h4 className="mb-1">Strong</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#334155</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-border-strong)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Strong emphasis</p>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Surface Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Surface Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Background and surface colors</p>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-white)] mb-3 border border-[var(--agyn-border-subtle)]"></div>
                <h4 className="mb-1">White</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#FFFFFF</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-bg-white)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Primary surfaces, cards</p>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-light)] mb-3 border border-[var(--agyn-border-subtle)]"></div>
                <h4 className="mb-1">Light Gray</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#F1F5F9</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-bg-light)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Page backgrounds</p>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-dark)] mb-3"></div>
                <h4 className="mb-1">Dark</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#0F172A</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-bg-dark)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Dark mode, headers</p>
              </div>
              <div>
                <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-accent)] mb-3 border border-[var(--agyn-border-subtle)]"></div>
                <h4 className="mb-1">Accent</h4>
                <p className="text-sm text-[var(--agyn-gray)]">#EFF6FF</p>
                <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                  var(--agyn-bg-accent)
                </code>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">Highlighted areas</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Gradients */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Gradients</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Brand gradient variations</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div>
                <div 
                  className="h-24 rounded-[10px] mb-3"
                  style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)' }}
                ></div>
                <h4 className="mb-1">Primary Gradient</h4>
                <p className="text-sm text-[var(--agyn-gray)]">Blue to Purple (135deg)</p>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">#3B82F6 → #8B5CF6</p>
              </div>
              <div>
                <div 
                  className="h-24 rounded-[10px] mb-3"
                  style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)' }}
                ></div>
                <h4 className="mb-1">Accent Gradient</h4>
                <p className="text-sm text-[var(--agyn-gray)]">Cyan to Blue (135deg)</p>
                <p className="text-xs text-[var(--agyn-gray)] mt-1">#06B6D4 → #3B82F6</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Status Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Status Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Job and process status indicators</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              {/* Pending */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-status-pending)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Pending</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#F59E0B / #FEF3C7</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-status-pending) / var(--agyn-status-pending-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Jobs waiting to start</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-[var(--agyn-status-pending-bg)] text-[var(--agyn-status-pending)] rounded-full text-sm">
                    Pending
                  </span>
                </div>
              </div>

              {/* Finished */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-status-finished)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Finished</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#10B981 / #D1FAE5</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-status-finished) / var(--agyn-status-finished-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Jobs completed successfully</p>
                </div>
              </div>

              {/* Failed */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-status-failed)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Failed</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#EF4444 / #FEE2E2</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-status-failed) / var(--agyn-status-failed-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Jobs that encountered errors</p>
                </div>
              </div>

              {/* Terminated */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-status-terminated)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Terminated</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#64748B / #F1F5F9</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-status-terminated) / var(--agyn-status-terminated-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Jobs manually stopped</p>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Role Colors */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Role Colors</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Event and message role identifiers</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              {/* System */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-role-system)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">System</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#64748B / #F1F5F9</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-role-system) / var(--agyn-role-system-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">System-generated events and notifications</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-[var(--agyn-role-system-bg)] text-[var(--agyn-role-system)] rounded-full text-sm">
                    System
                  </span>
                </div>
              </div>

              {/* User */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-role-user)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">User</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#3B82F6 / #DBEAFE</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-role-user) / var(--agyn-role-user-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">User inputs and interactions</p>
                </div>
              </div>

              {/* Assistant */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-role-assistant)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Assistant</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#8B5CF6 / #EDE9FE</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-role-assistant) / var(--agyn-role-assistant-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">AI assistant responses and actions</p>
                </div>
              </div>

              {/* Tool */}
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-16 rounded-[10px] bg-[var(--agyn-role-tool)] flex items-center justify-center">
                    <span className="text-white">Aa</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-1">Tool</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#06B6D4 / #CFFAFE</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-role-tool) / var(--agyn-role-tool-bg)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Tool executions and integrations</p>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Code Example */}
        <Panel variant="subtle">
          <PanelHeader>
            <h4>Usage Example</h4>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
              <code>{`/* Using CSS variables */
<div className="bg-[var(--agyn-blue)]">Primary Blue</div>
<div className="text-[var(--agyn-gray)]">Gray Text</div>
<div className="border-[var(--agyn-border-subtle)]">Border</div>

/* Status badges */
<span className="px-3 py-1 
  bg-[var(--agyn-status-pending-bg)] 
  text-[var(--agyn-status-pending)] 
  rounded-full">
  Pending
</span>

/* Role badges */
<span className="px-3 py-1 
  bg-[var(--agyn-role-user-bg)] 
  text-[var(--agyn-role-user)] 
  rounded-full">
  User
</span>

/* Using gradients */
<div style={{ 
  background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)' 
}}>
  Gradient Background
</div>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}