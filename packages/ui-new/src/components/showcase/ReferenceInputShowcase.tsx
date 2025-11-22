import { useState } from 'react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { ReferenceInput } from '../ReferenceInput';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface ReferenceInputShowcaseProps {
  onBack: () => void;
}

export default function ReferenceInputShowcase({ onBack }: ReferenceInputShowcaseProps) {
  const [sourceType, setSourceType] = useState<'text' | 'secret' | 'variable'>('text');
  const [secretValue, setSecretValue] = useState('');
  const [variableValue, setVariableValue] = useState('');

  const mockSecretKeys = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DATABASE_URL',
    'SECRET_TOKEN',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'STRIPE_API_KEY',
    'GITHUB_TOKEN'
  ];

  const mockVariableKeys = [
    'user_id',
    'session_token',
    'workspace_name',
    'model_name',
    'temperature',
    'max_tokens',
    'system_prompt',
    'context_window'
  ];

  return (
    <div>
      <ComponentPreviewHeader
        title="Reference Input"
        description="Input field with built-in source selector"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Reference Input */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Reference Input</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Input with source type selector (Plain Text, Secret, or Variable)</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="API Key" 
                placeholder="Enter API key or select from sources..." 
              />
              <ReferenceInput 
                label="Model Name" 
                placeholder="gpt-4"
                defaultValue="gpt-4" 
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Controlled State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Controlled State</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Source type controlled externally</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <div className="mb-4 p-3 bg-[var(--agyn-bg-light)] rounded-[6px]">
                <p className="text-sm">
                  Current source type: <span className="font-mono">{sourceType}</span>
                </p>
              </div>
              <ReferenceInput 
                label="Controlled Input"
                placeholder="Change the source type above..."
                sourceType={sourceType}
                onSourceTypeChange={setSourceType}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Vault Autocomplete */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Secret Autocomplete</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Type to filter available secret keys (try typing "API" or "KEY")</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Secret Reference" 
                placeholder="Start typing to see secret keys..."
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                sourceType="secret"
                secretKeys={mockSecretKeys}
                helperText="Secret autocomplete allows you to select from available keys or type custom values"
              />
              <div className="p-3 bg-[var(--agyn-bg-light)] rounded-[6px]">
                <p className="text-sm">
                  Current value: <span className="font-mono">{secretValue || '(empty)'}</span>
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Variable Autocomplete */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Variable Autocomplete</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Type to filter available variables (try typing "user" or "token")</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Variable Reference" 
                placeholder="Start typing to see variables..."
                value={variableValue}
                onChange={(e) => setVariableValue(e.target.value)}
                sourceType="variable"
                variableKeys={mockVariableKeys}
                helperText="Variable autocomplete allows you to select from available variables or type custom values"
              />
              <div className="p-3 bg-[var(--agyn-bg-light)] rounded-[6px]">
                <p className="text-sm">
                  Current value: <span className="font-mono">{variableValue || '(empty)'}</span>
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* With Helper Text */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>With Helper Text</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Configuration Token" 
                placeholder="Enter token or reference..."
                helperText="Choose Plain Text for direct input, Secret for stored secrets, or Variable for dynamic values"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Error State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Error State</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Configuration Value" 
                placeholder="Enter value..."
                error="This field is required"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Small Size */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Small Size</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Compact Reference Input" 
                placeholder="Smaller input field..."
                size="sm"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Disabled State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Disabled State</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <ReferenceInput 
                label="Disabled Input" 
                placeholder="Cannot edit"
                disabled
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
              <code>{`import { ReferenceInput } from './components/ReferenceInput';
import { useState } from 'react';

// Basic reference input (defaults to text source)
<ReferenceInput 
  label="API Key"
  placeholder="Enter API key or select from sources..."
/>

// With secret autocomplete
const [secretValue, setSecretValue] = useState('');
const secretKeys = ['OPENAI_API_KEY', 'DATABASE_URL', 'SECRET_TOKEN'];

<ReferenceInput 
  label="Secret Reference"
  placeholder="Start typing..."
  value={secretValue}
  onChange={(e) => setSecretValue(e.target.value)}
  sourceType="secret"
  secretKeys={secretKeys}
/>

// With variable autocomplete
const [varValue, setVarValue] = useState('');
const variableKeys = ['user_id', 'model_name', 'temperature'];

<ReferenceInput 
  label="Variable Reference"
  placeholder="Start typing..."
  value={varValue}
  onChange={(e) => setVarValue(e.target.value)}
  sourceType="variable"
  variableKeys={variableKeys}
/>

// Controlled state
const [sourceType, setSourceType] = useState<'text' | 'secret' | 'variable'>('text');

<ReferenceInput 
  label="Controlled Input"
  placeholder="Enter value..."
  sourceType={sourceType}
  onSourceTypeChange={setSourceType}
/>

// Small size
<ReferenceInput 
  label="Compact Input"
  placeholder="Enter value..."
  size="sm"
/>

// Error state
<ReferenceInput 
  label="Required Field"
  placeholder="Enter value..."
  error="This field is required"
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}