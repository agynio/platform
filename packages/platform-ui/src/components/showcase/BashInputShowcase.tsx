import { useState } from 'react';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { BashInput } from '../BashInput';

interface BashInputShowcaseProps {
  onBack: () => void;
}

export default function BashInputShowcase({ onBack }: BashInputShowcaseProps) {
  const [basicScript, setBasicScript] = useState(`#!/bin/bash
echo "Hello, World!"`);

  const [installScript, setInstallScript] = useState(`#!/bin/bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start`);

  const [deployScript, setDeployScript] = useState(`#!/bin/bash
set -e

echo "Starting deployment..."

# Pull latest changes
git pull origin main

# Install dependencies
npm ci

# Run tests
npm test

# Build production bundle
npm run build

# Restart service
systemctl restart myapp

echo "Deployment complete!"`);

  return (
    <div>
      <ComponentPreviewHeader
        title="Bash Input"
        description="Text input for bash scripts with fullscreen editor"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Usage */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Usage</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Simple bash input with fullscreen editor
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-6">
              <BashInput
                label="Bash Script"
                value={basicScript}
                onChange={(e) => setBasicScript(e.target.value)}
                rows={3}
                placeholder="#!/bin/bash\necho 'Your script here'"
              />
              
              <div className="text-sm text-[var(--agyn-gray)]">
                <p className="mb-2">Current value:</p>
                <pre className="bg-[var(--agyn-bg-light)] p-4 rounded-[6px] overflow-auto">
                  <code>{basicScript}</code>
                </pre>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Small and default size variants
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-6">
              <BashInput
                label="Small Size"
                value={basicScript}
                onChange={(e) => setBasicScript(e.target.value)}
                rows={3}
                size="sm"
              />

              <BashInput
                label="Default Size"
                value={basicScript}
                onChange={(e) => setBasicScript(e.target.value)}
                rows={3}
                size="default"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Installation Script Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Installation Script</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Example with helper text
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl">
              <BashInput
                label="Setup Script"
                value={installScript}
                onChange={(e) => setInstallScript(e.target.value)}
                rows={6}
                helperText="This script will run during the setup phase"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Deployment Script Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Deployment Script</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              More complex script example
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl">
              <BashInput
                label="Deploy Script"
                value={deployScript}
                onChange={(e) => setDeployScript(e.target.value)}
                rows={8}
                helperText="Click the maximize icon to open the fullscreen editor for a better editing experience"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Error and disabled states
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-6">
              <BashInput
                label="Error State"
                value="invalid script content"
                onChange={() => {}}
                rows={3}
                error="Script validation failed"
              />

              <BashInput
                label="Disabled State"
                value={basicScript}
                onChange={() => {}}
                rows={3}
                disabled
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Code Example */}
        <Panel variant="flat">
          <PanelHeader>
            <h3>Code Example</h3>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-bg-light)] p-6 rounded-[10px] overflow-x-auto">
              <code className="text-sm">{`import { BashInput } from './components/BashInput';

function MyComponent() {
  const [script, setScript] = useState(\`#!/bin/bash
echo "Hello, World!"\`);

  return (
    <BashInput
      label="Bash Script"
      value={script}
      onChange={(e) => setScript(e.target.value)}
      rows={6}
      helperText="Click maximize to open Monaco editor"
    />
  );
}`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}