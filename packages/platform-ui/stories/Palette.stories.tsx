import type { Meta, StoryObj } from '@storybook/react';
import { Panel, PanelHeader, PanelBody } from '../src/components/Panel';

const meta = {
  title: 'Foundation/Palette',
  component: PaletteStory,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
} satisfies Meta<typeof PaletteStory>;

export default meta;

type Story = StoryObj<typeof PaletteStory>;

export const Playground: Story = {};

function PaletteStory() {
  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1>Color Palette</h1>
          <p className="text-[var(--agyn-gray)]">
            Brand colors and role-based colors for the Agyn design system
          </p>
        </header>

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
              <h3>Secondary &amp; Accent</h3>
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
                  <div className="w-24 h-16 rounded-[10px] bg-white border border-[var(--agyn-border-subtle)]" />
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
                  <div className="w-24 h-16 rounded-[10px] bg-white border-2 border-[var(--agyn-border-medium)]" />
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
                  <div className="w-24 h-16 rounded-[10px] bg-white border-2 border-[var(--agyn-border-strong)]" />
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
                  <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-white)] mb-3 border border-[var(--agyn-border-subtle)]" />
                  <h4 className="mb-1">White</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#FFFFFF</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-bg-white)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Primary surfaces, cards</p>
                </div>
                <div>
                  <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-light)] mb-3 border border-[var(--agyn-border-subtle)]" />
                  <h4 className="mb-1">Light Gray</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#F1F5F9</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-bg-light)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Page backgrounds</p>
                </div>
                <div>
                  <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-dark)] mb-3" />
                  <h4 className="mb-1">Dark</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">#0F172A</p>
                  <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
                    var(--agyn-bg-dark)
                  </code>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">Dark mode, headers</p>
                </div>
                <div>
                  <div className="h-20 rounded-[10px] bg-[var(--agyn-bg-accent)] mb-3 border border-[var(--agyn-border-subtle)]" />
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
                  />
                  <h4 className="mb-1">Primary Gradient</h4>
                  <p className="text-sm text-[var(--agyn-gray)]">Blue to Purple (135deg)</p>
                  <p className="text-xs text-[var(--agyn-gray)] mt-1">#3B82F6 → #8B5CF6</p>
                </div>
                <div>
                  <div
                    className="h-24 rounded-[10px] mb-3"
                    style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)' }}
                  />
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
                <StatusRow
                  name="Pending"
                  solidClass="bg-[var(--agyn-status-pending)]"
                  bgClass="bg-[var(--agyn-status-pending-bg)]"
                  textClass="text-[var(--agyn-status-pending)]"
                  hex="#F59E0B / #FEF3C7"
                  token="var(--agyn-status-pending) / var(--agyn-status-pending-bg)"
                  description="Jobs waiting to start"
                />

                {/* Finished */}
                <StatusRow
                  name="Finished"
                  solidClass="bg-[var(--agyn-status-finished)]"
                  bgClass="bg-[var(--agyn-status-finished-bg)]"
                  textClass="text-[var(--agyn-status-finished)]"
                  hex="#10B981 / #D1FAE5"
                  token="var(--agyn-status-finished) / var(--agyn-status-finished-bg)"
                  description="Jobs completed successfully"
                />

                {/* Failed */}
                <StatusRow
                  name="Failed"
                  solidClass="bg-[var(--agyn-status-failed)]"
                  bgClass="bg-[var(--agyn-status-failed-bg)]"
                  textClass="text-[var(--agyn-status-failed)]"
                  hex="#EF4444 / #FEE2E2"
                  token="var(--agyn-status-failed) / var(--agyn-status-failed-bg)"
                  description="Jobs that encountered errors"
                />

                {/* Terminated */}
                <StatusRow
                  name="Terminated"
                  solidClass="bg-[var(--agyn-status-terminated)]"
                  bgClass="bg-[var(--agyn-status-terminated-bg)]"
                  textClass="text-[var(--agyn-status-terminated)]"
                  hex="#64748B / #F1F5F9"
                  token="var(--agyn-status-terminated) / var(--agyn-status-terminated-bg)"
                  description="Jobs manually stopped"
                />
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
                <RoleRow
                  name="System"
                  solidClass="bg-[var(--agyn-role-system)]"
                  bgClass="bg-[var(--agyn-role-system-bg)]"
                  textClass="text-[var(--agyn-role-system)]"
                  hex="#64748B / #F1F5F9"
                  token="var(--agyn-role-system) / var(--agyn-role-system-bg)"
                  description="System-generated events and notifications"
                />

                {/* User */}
                <RoleRow
                  name="User"
                  solidClass="bg-[var(--agyn-role-user)]"
                  bgClass="bg-[var(--agyn-role-user-bg)]"
                  textClass="text-[var(--agyn-role-user)]"
                  hex="#3B82F6 / #DBEAFE"
                  token="var(--agyn-role-user) / var(--agyn-role-user-bg)"
                  description="User inputs and interactions"
                />

                {/* Assistant */}
                <RoleRow
                  name="Assistant"
                  solidClass="bg-[var(--agyn-role-assistant)]"
                  bgClass="bg-[var(--agyn-role-assistant-bg)]"
                  textClass="text-[var(--agyn-role-assistant)]"
                  hex="#8B5CF6 / #EDE9FE"
                  token="var(--agyn-role-assistant) / var(--agyn-role-assistant-bg)"
                  description="AI assistant responses and actions"
                />

                {/* Tool */}
                <RoleRow
                  name="Tool"
                  solidClass="bg-[var(--agyn-role-tool)]"
                  bgClass="bg-[var(--agyn-role-tool-bg)]"
                  textClass="text-[var(--agyn-role-tool)]"
                  hex="#06B6D4 / #CFFAFE"
                  token="var(--agyn-role-tool) / var(--agyn-role-tool-bg)"
                  description="Tool executions and integrations"
                />
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
    </div>
  );
}

interface StatusRowProps {
  name: string;
  solidClass: string;
  bgClass: string;
  textClass: string;
  hex: string;
  token: string;
  description: string;
}

function StatusRow({ name, solidClass, bgClass, textClass, hex, token, description }: StatusRowProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-shrink-0">
        <div className={`w-24 h-16 rounded-[10px] flex items-center justify-center ${solidClass}`}>
          <span className="text-white">Aa</span>
        </div>
      </div>
      <div className="flex-1">
        <h4 className="mb-1">{name}</h4>
        <p className="text-sm text-[var(--agyn-gray)]">{hex}</p>
        <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
          {token}
        </code>
        <p className="text-xs text-[var(--agyn-gray)] mt-1">{description}</p>
      </div>
      <div className="flex gap-2">
        <span className={`px-3 py-1 rounded-full text-sm ${bgClass} ${textClass}`}>
          {name}
        </span>
      </div>
    </div>
  );
}

interface RoleRowProps {
  name: string;
  solidClass: string;
  bgClass: string;
  textClass: string;
  hex: string;
  token: string;
  description: string;
}

function RoleRow({ name, solidClass, bgClass, textClass, hex, token, description }: RoleRowProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-shrink-0">
        <div className={`w-24 h-16 rounded-[10px] flex items-center justify-center ${solidClass}`}>
          <span className="text-white">Aa</span>
        </div>
      </div>
      <div className="flex-1">
        <h4 className="mb-1">{name}</h4>
        <p className="text-sm text-[var(--agyn-gray)]">{hex}</p>
        <code className="text-xs text-[var(--agyn-gray)] bg-[var(--agyn-bg-light)] px-2 py-1 rounded block mt-1">
          {token}
        </code>
        <p className="text-xs text-[var(--agyn-gray)] mt-1">{description}</p>
      </div>
      <div className="flex gap-2">
        <span className={`px-3 py-1 rounded-full text-sm ${bgClass} ${textClass}`}>
          {name}
        </span>
      </div>
    </div>
  );
}
