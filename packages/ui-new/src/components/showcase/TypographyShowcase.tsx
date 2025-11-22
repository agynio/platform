import { ArrowLeft } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface TypographyShowcaseProps {
  onBack: () => void;
}

export default function TypographyShowcase({ onBack }: TypographyShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Typography"
        description="Text styles and hierarchies"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Headings */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Headings</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">H1 - 36px / Bold / -0.02em</p>
                <h1>The quick brown fox jumps over the lazy dog</h1>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">H2 - 30px / Medium</p>
                <h2>The quick brown fox jumps over the lazy dog</h2>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">H3 - 24px / Medium</p>
                <h3>The quick brown fox jumps over the lazy dog</h3>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">H4 - 16px / Medium</p>
                <h4>The quick brown fox jumps over the lazy dog</h4>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Body Text */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Body Text</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Regular - 16px / Normal</p>
                <p>The quick brown fox jumps over the lazy dog. Agyn is an AI-powered SWE automation platform.</p>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Muted - 16px / Normal / Gray</p>
                <p className="text-[var(--agyn-gray)]">The quick brown fox jumps over the lazy dog. Agyn is an AI-powered SWE automation platform.</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Font Family */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Font Families</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Primary (System UI)</p>
                <p style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Monospace</p>
                <p style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace' }}>
                  The quick brown fox jumps over the lazy dog
                </p>
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
              <code>{`/* Typography is automatically applied via globals.css */

<h1>Main Heading</h1>
<h2>Section Heading</h2>
<h3>Subsection Heading</h3>
<h4>Small Heading</h4>
<p>Body text paragraph</p>
<p className="text-[var(--agyn-gray)]">Muted text</p>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}