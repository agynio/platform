import { ArrowLeft, Download, Plus, Send } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { Button } from '../Button';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface ButtonShowcaseProps {
  onBack: () => void;
}

export default function ButtonShowcase({ onBack }: ButtonShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Button"
        description="Primary, secondary, accent, outline, and ghost buttons"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Variants */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Variants</h3>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="accent">Accent Button</Button>
              <Button variant="outline">Outline Button</Button>
              <Button variant="ghost">Ghost Button</Button>
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="sm">Small Button</Button>
              <Button size="md">Medium Button</Button>
              <Button size="lg">Large Button</Button>
            </div>
          </PanelBody>
        </Panel>

        {/* With Icons */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>With Icons</h3>
          </PanelHeader>
          <PanelBody>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
              <Button variant="secondary">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button variant="accent">
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Normal</p>
                <div className="flex flex-wrap gap-4">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                </div>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Disabled</p>
                <div className="flex flex-wrap gap-4">
                  <Button variant="primary" disabled>Primary</Button>
                  <Button variant="secondary" disabled>Secondary</Button>
                  <Button variant="outline" disabled>Outline</Button>
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
              <code>{`import { Button } from './components/Button';

<Button variant="primary">
  Click me
</Button>

<Button variant="outline" size="lg">
  <Icon className="w-4 h-4 mr-2" />
  With Icon
</Button>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}