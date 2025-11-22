import { useState } from 'react';
import { MarkdownInput } from '../MarkdownInput';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface MarkdownInputShowcaseProps {
  onBack: () => void;
}

export default function MarkdownInputShowcase({ onBack }: MarkdownInputShowcaseProps) {
  const [systemPrompt, setSystemPrompt] = useState(
    '# System Prompt\n\nYou are a helpful AI assistant specialized in software development.\n\n## Core Capabilities\n\n* Code generation and debugging\n* Technical documentation\n* Architecture design\n\n## Guidelines\n\n**Always** provide clear, well-commented code examples.\n\n*Remember* to explain complex concepts in simple terms.\n\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n```\n\nFor more information, visit [agyn.io](https://agyn.io).'
  );

  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div>
      {/* Header */}
      <ComponentPreviewHeader
        title="Markdown Input"
        description="Multiline text input with built-in fullscreen markdown editor"
        onBack={onBack}
      />

      {/* Live Preview - Default Size */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Default Size</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">
            Standard markdown input with fullscreen editor button
          </p>
        </PanelHeader>
        <PanelBody>
          <div className="max-w-2xl space-y-6">
            <MarkdownInput
              label="System Prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter your system prompt..."
              helperText="Define the behavior and personality of the agent (supports Markdown)"
              rows={8}
            />

            <MarkdownInput
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              helperText="Provide a brief description"
              rows={4}
            />
          </div>
        </PanelBody>
      </Panel>

      {/* Live Preview - Small Size */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Small Size</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">
            Compact version for tight layouts
          </p>
        </PanelHeader>
        <PanelBody>
          <div className="max-w-2xl space-y-6">
            <MarkdownInput
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              size="sm"
              rows={3}
            />
          </div>
        </PanelBody>
      </Panel>

      {/* Live Preview - States */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>States</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">
            Different input states
          </p>
        </PanelHeader>
        <PanelBody>
          <div className="max-w-2xl space-y-6">
            {/* With helper text */}
            <MarkdownInput
              label="Documentation"
              value=""
              onChange={() => {}}
              placeholder="Write documentation..."
              helperText="Markdown syntax is supported"
              rows={4}
            />

            {/* Error state */}
            <MarkdownInput
              label="Configuration"
              value=""
              onChange={() => {}}
              error="This field is required"
              rows={3}
            />

            {/* Disabled state */}
            <MarkdownInput
              label="Read-only Content"
              value="This field is disabled and cannot be edited."
              onChange={() => {}}
              disabled
              rows={3}
            />
          </div>
        </PanelBody>
      </Panel>

      {/* Fullscreen Editor Info */}
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Fullscreen Editor Features</h4>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-4">
            <p className="text-[var(--agyn-gray)]">
              Click the maximize icon (⛶) in the top-right corner to open the fullscreen editor with:
            </p>
            <ul className="space-y-2 text-[var(--agyn-gray)]">
              <li className="flex items-start gap-2">
                <span className="text-[var(--agyn-blue)] mt-1">•</span>
                <span><strong>Split View:</strong> Edit markdown on the left, see live preview on the right</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--agyn-blue)] mt-1">•</span>
                <span><strong>Edit Only:</strong> Full-width text editor</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[var(--agyn-blue)] mt-1">•</span>
                <span><strong>Preview Only:</strong> Full-width markdown preview</span>
              </li>
            </ul>
          </div>
        </PanelBody>
      </Panel>

      {/* Markdown Features */}
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Supported Markdown Features</h4>
        </PanelHeader>
        <PanelBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <h5 className="text-sm mb-1">Headers</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  # H1, ## H2, ### H3
                </code>
              </div>
              <div>
                <h5 className="text-sm mb-1">Bold</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  **bold text**
                </code>
              </div>
              <div>
                <h5 className="text-sm mb-1">Italic</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  *italic text*
                </code>
              </div>
              <div>
                <h5 className="text-sm mb-1">Inline Code</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  `code`
                </code>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <h5 className="text-sm mb-1">Code Blocks</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  ```code```
                </code>
              </div>
              <div>
                <h5 className="text-sm mb-1">Links</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  [text](url)
                </code>
              </div>
              <div>
                <h5 className="text-sm mb-1">Lists</h5>
                <code className="text-xs bg-[var(--agyn-bg-light)] px-2 py-1 rounded text-[var(--agyn-gray)]">
                  * item
                </code>
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
          <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[10px] overflow-x-auto text-sm">
            <code>{`import { useState } from 'react';
import { MarkdownInput } from './components/MarkdownInput';

function NodeProperties() {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="space-y-6">
      {/* Default size */}
      <MarkdownInput
        label="System Prompt"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder="Enter your system prompt..."
        helperText="Supports Markdown formatting"
        rows={8}
      />

      {/* Small size */}
      <MarkdownInput
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add a description..."
        size="sm"
        rows={4}
      />

      {/* With error */}
      <MarkdownInput
        label="Configuration"
        value=""
        onChange={() => {}}
        error="This field is required"
        rows={3}
      />

      {/* Disabled */}
      <MarkdownInput
        label="Read-only"
        value="Cannot edit"
        onChange={() => {}}
        disabled
        rows={3}
      />
    </div>
  );
}`}</code>
          </pre>
        </PanelBody>
      </Panel>
    </div>
  );
}
