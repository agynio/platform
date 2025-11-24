import type { Meta, StoryObj } from '@storybook/react';
import AgynLogo from '../src/components/AgynLogo';
import { Panel, PanelHeader, PanelBody } from '../src/components/Panel';

const meta = {
  title: 'Brand/Logo',
  component: LogoStory,
  parameters: {
    layout: 'centered',
  },
  tags: ['!autodocs'],
} satisfies Meta<typeof LogoStory>;

export default meta;

type Story = StoryObj<typeof LogoStory>;

export const Playground: Story = {};

function LogoStory() {
  return (
    <div className="space-y-6">
      {/* Primary Logo */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Primary</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">Standard wordmark on light backgrounds</p>
        </PanelHeader>
        <PanelBody>
          <div className="bg-white p-12 rounded-[6px] flex items-center justify-center">
            <AgynLogo variant="primary" className="w-64 h-auto" />
          </div>
          <div className="mt-4 p-4 bg-[var(--agyn-bg-light)] rounded-[6px]">
            <p className="text-sm text-[var(--agyn-gray)]">
              <strong>Usage:</strong> Use on light backgrounds, white surfaces, and general content areas
            </p>
          </div>
        </PanelBody>
      </Panel>

      {/* Dark Surface Logo */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Dark Surface</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">Inverted wordmark for dark backgrounds</p>
        </PanelHeader>
        <PanelBody>
          <div className="bg-[var(--agyn-dark)] p-12 rounded-[6px] flex items-center justify-center">
            <AgynLogo variant="dark" className="w-64 h-auto" />
          </div>
          <div className="mt-4 p-4 bg-[var(--agyn-bg-light)] rounded-[6px]">
            <p className="text-sm text-[var(--agyn-gray)]">
              <strong>Usage:</strong> Use on dark backgrounds, navigation bars, and hero sections
            </p>
          </div>
        </PanelBody>
      </Panel>

      {/* Gradient Logo */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Gradient</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">Premium gradient for special contexts</p>
        </PanelHeader>
        <PanelBody>
          <div className="bg-white p-12 rounded-[6px] flex items-center justify-center">
            <AgynLogo variant="gradient" className="w-64 h-auto" />
          </div>
          <div className="mt-4 p-4 bg-[var(--agyn-bg-light)] rounded-[6px]">
            <p className="text-sm text-[var(--agyn-gray)]">
              <strong>Usage:</strong> Use for marketing materials, landing pages, and premium features
            </p>
          </div>
        </PanelBody>
      </Panel>

      {/* Gradient on Dark */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Gradient on Dark</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">Alternative gradient variation</p>
        </PanelHeader>
        <PanelBody>
          <div className="bg-[var(--agyn-dark)] p-12 rounded-[6px] flex items-center justify-center">
            <AgynLogo variant="gradient" className="w-64 h-auto" />
          </div>
          <div className="mt-4 p-4 bg-[var(--agyn-bg-light)] rounded-[6px]">
            <p className="text-sm text-[var(--agyn-gray)]">
              <strong>Usage:</strong> Use for dark-themed interfaces with premium branding
            </p>
          </div>
        </PanelBody>
      </Panel>

      {/* Logo Specifications */}
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Specifications</h4>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-2">Wordmark</p>
                <p className="font-mono">agyn</p>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-2">Font Weight</p>
                <p>700 (Bold)</p>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-2">Letter Spacing</p>
                <p>-0.02em</p>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-2">Gradient</p>
                <p className="text-sm">135deg, #3B82F6  #8B5CF6</p>
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
            <code>{`import AgynLogo from './components/AgynLogo';

// Primary logo on light background
<AgynLogo variant="primary" className="w-64 h-auto" />

// Logo on dark background
<AgynLogo variant="dark" className="w-64 h-auto" />

// Gradient logo
<AgynLogo variant="gradient" className="w-64 h-auto" />`}</code>
          </pre>
        </PanelBody>
      </Panel>
    </div>
  );
}
