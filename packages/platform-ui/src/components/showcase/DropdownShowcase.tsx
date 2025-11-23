import { useState } from 'react';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { Dropdown } from '../Dropdown';

interface DropdownShowcaseProps {
  onBack: () => void;
}

export default function DropdownShowcase({ onBack }: DropdownShowcaseProps) {
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const llmModels = [
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  ];

  const statusOptions = [
    { value: 'not_ready', label: 'Not Ready' },
    { value: 'provisioning', label: 'Provisioning' },
    { value: 'ready', label: 'Ready' },
    { value: 'deprovisioning', label: 'Deprovisioning' },
  ];

  const nodeKinds = [
    { value: 'agent', label: 'Agent' },
    { value: 'tool', label: 'Tool' },
    { value: 'mcp', label: 'MCP' },
    { value: 'trigger', label: 'Trigger' },
    { value: 'workspace', label: 'Workspace' },
  ];

  const groupedModels = [
    {
      label: 'OpenAI',
      options: [
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ],
    },
    {
      label: 'Anthropic',
      options: [
        { value: 'claude-3-opus', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
      ],
    },
    {
      label: 'Meta',
      options: [
        { value: 'llama-3-70b', label: 'Llama 3 70B' },
        { value: 'llama-3-8b', label: 'Llama 3 8B' },
      ],
    },
  ];

  return (
    <div>
      <ComponentPreviewHeader
        title="Dropdown"
        description="Select inputs with single or grouped options"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Dropdown */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Dropdown</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Simple select with options</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Dropdown
                label="LLM Model"
                placeholder="Select a model..."
                options={llmModels}
                value={selectedModel}
                onValueChange={setSelectedModel}
                helperText="Choose the language model for your agent"
              />

              <Dropdown
                label="Status"
                placeholder="Select status..."
                options={statusOptions}
                value={selectedStatus}
                onValueChange={setSelectedStatus}
              />

              <Dropdown
                placeholder="No label dropdown"
                options={nodeKinds}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes & Variants</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Dropdown size and style variants</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <div>
                <h4 className="text-sm mb-3">Default Size</h4>
                <Dropdown
                  label="Node Type"
                  placeholder="Select node type..."
                  options={nodeKinds}
                />
              </div>

              <div>
                <h4 className="text-sm mb-3">Small Size</h4>
                <Dropdown
                  label="Compact Dropdown"
                  placeholder="Select option..."
                  options={nodeKinds}
                  size="sm"
                />
              </div>

              <div>
                <h4 className="text-sm mb-3">Flat Variant</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--agyn-gray)]">Output:</span>
                  <Dropdown
                    placeholder="Text"
                    options={[
                      { value: 'text', label: 'Text' },
                      { value: 'json', label: 'JSON' },
                      { value: 'yaml', label: 'YAML' },
                      { value: 'markdown', label: 'Markdown' },
                    ]}
                    variant="flat"
                    defaultValue="text"
                  />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Grouped Options */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Grouped Options</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Dropdowns with categorized option groups</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Dropdown
                label="LLM Provider"
                placeholder="Select a language model..."
                groups={groupedModels}
                helperText="Models are grouped by provider"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Different dropdown states</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Dropdown
                label="Default State"
                placeholder="Select an option..."
                options={llmModels}
              />

              <Dropdown
                label="With Value"
                placeholder="Select an option..."
                options={llmModels}
                defaultValue="gpt-4"
              />

              <Dropdown
                label="Disabled State"
                placeholder="Cannot select..."
                options={llmModels}
                disabled={true}
              />

              <Dropdown
                label="Error State"
                placeholder="Select an option..."
                options={llmModels}
                error="This field is required"
              />

              <Dropdown
                label="With Helper Text"
                placeholder="Select an option..."
                options={llmModels}
                helperText="Choose the most appropriate model for your use case"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Real-world Examples */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Real-world Examples</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Dropdowns in realistic form contexts</p>
          </PanelHeader>
          <PanelBody>
            <div className="bg-white p-6 border border-[var(--agyn-border-default)] rounded-[10px] max-w-md">
              <h4 className="mb-4">Agent Configuration</h4>
              
              <div className="space-y-4">
                <Dropdown
                  label="LLM Model"
                  placeholder="Select model..."
                  groups={groupedModels}
                  defaultValue="gpt-4"
                  helperText="The language model powering this agent"
                />

                <Dropdown
                  label="Temperature"
                  placeholder="Select temperature..."
                  options={[
                    { value: '0', label: '0 (Deterministic)' },
                    { value: '0.3', label: '0.3 (Focused)' },
                    { value: '0.7', label: '0.7 (Balanced)' },
                    { value: '1.0', label: '1.0 (Creative)' },
                  ]}
                  defaultValue="0.7"
                  size="sm"
                />

                <Dropdown
                  label="Max Tokens"
                  placeholder="Select limit..."
                  options={[
                    { value: '256', label: '256 tokens' },
                    { value: '512', label: '512 tokens' },
                    { value: '1024', label: '1024 tokens' },
                    { value: '2048', label: '2048 tokens' },
                    { value: '4096', label: '4096 tokens' },
                  ]}
                  defaultValue="1024"
                  size="sm"
                />
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
              <code>{`import { Dropdown } from './components/Dropdown';

// Basic dropdown
<Dropdown
  label="Status"
  placeholder="Select status..."
  options={[
    { value: 'ready', label: 'Ready' },
    { value: 'pending', label: 'Pending' },
  ]}
  value={status}
  onValueChange={setStatus}
/>

// Small size
<Dropdown
  label="Node Type"
  placeholder="Select..."
  options={nodeTypes}
  size="sm"
/>

// Grouped options
<Dropdown
  label="LLM Model"
  placeholder="Select model..."
  groups={[
    {
      label: 'OpenAI',
      options: [
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5', label: 'GPT-3.5' },
      ],
    },
    {
      label: 'Anthropic',
      options: [
        { value: 'claude-3', label: 'Claude 3' },
      ],
    },
  ]}
/>

// Flat variant (no frame)
<Dropdown
  placeholder="Text"
  options={options}
  variant="flat"
/>

// With error
<Dropdown
  label="Required Field"
  error="This field is required"
  options={options}
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
