import { useState } from 'react';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { Toggle } from '../Toggle';

interface ToggleShowcaseProps {
  onBack: () => void;
}

export default function ToggleShowcase({ onBack }: ToggleShowcaseProps) {
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div>
      <ComponentPreviewHeader
        title="Toggle"
        description="Switch controls for binary on/off states"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Toggle */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Toggle</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Simple on/off switches</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Toggle
                label="Enable notifications"
                checked={notifications}
                onCheckedChange={setNotifications}
              />

              <Toggle
                label="Email alerts"
                description="Receive email notifications for important events"
                checked={emailAlerts}
                onCheckedChange={setEmailAlerts}
              />

              <Toggle
                label="Auto-save"
                description="Automatically save your work every 30 seconds"
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />

              <Toggle
                label="No label toggle"
                checked={darkMode}
                onCheckedChange={setDarkMode}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Toggle size variants</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <div>
                <h4 className="text-sm mb-3">Default Size</h4>
                <Toggle
                  label="Standard toggle"
                  description="Normal size for most use cases"
                  defaultChecked={true}
                />
              </div>

              <div>
                <h4 className="text-sm mb-3">Small Size</h4>
                <Toggle
                  label="Compact toggle"
                  description="Smaller size for dense layouts"
                  size="sm"
                  defaultChecked={true}
                />
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Different toggle states</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Toggle
                label="Unchecked (Off)"
                description="Default unchecked state"
                checked={false}
              />

              <Toggle
                label="Checked (On)"
                description="Active checked state"
                checked={true}
              />

              <Toggle
                label="Disabled (Off)"
                description="Disabled in unchecked state"
                disabled={true}
                checked={false}
              />

              <Toggle
                label="Disabled (On)"
                description="Disabled in checked state"
                disabled={true}
                checked={true}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* With and Without Labels */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Label Variations</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Toggles with different label configurations</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Toggle
                label="Label only"
                defaultChecked={true}
              />

              <Toggle
                label="Label with description"
                description="This toggle has both a label and a description"
                defaultChecked={false}
              />

              <Toggle
                description="Description only (no label)"
                defaultChecked={true}
              />

              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--agyn-dark)]">Custom layout:</span>
                <Toggle defaultChecked={false} />
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Real-world Examples */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Real-world Examples</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Toggles in realistic settings contexts</p>
          </PanelHeader>
          <PanelBody>
            <div className="bg-white p-6 border border-[var(--agyn-border-default)] rounded-[10px] max-w-md">
              <h4 className="mb-4">Agent Settings</h4>
              
              <div className="space-y-4">
                <Toggle
                  label="Enable agent"
                  description="Allow this agent to process requests"
                  defaultChecked={true}
                />

                <Toggle
                  label="Auto-retry on failure"
                  description="Automatically retry failed operations up to 3 times"
                  defaultChecked={false}
                />

                <Toggle
                  label="Stream responses"
                  description="Stream agent responses as they are generated"
                  defaultChecked={true}
                  size="sm"
                />

                <Toggle
                  label="Log all interactions"
                  description="Save all agent interactions for debugging and analysis"
                  defaultChecked={true}
                  size="sm"
                />

                <Toggle
                  label="Rate limiting"
                  description="Limit the number of requests per minute (currently disabled)"
                  disabled={true}
                  defaultChecked={false}
                />
              </div>
            </div>

            <div className="bg-white p-6 border border-[var(--agyn-border-default)] rounded-[10px] max-w-md mt-4">
              <h4 className="mb-4">Workflow Execution</h4>
              
              <div className="space-y-4">
                <Toggle
                  label="Parallel execution"
                  description="Execute independent nodes simultaneously"
                  defaultChecked={false}
                />

                <Toggle
                  label="Continue on error"
                  description="Continue workflow execution even if a node fails"
                  defaultChecked={false}
                />

                <Toggle
                  label="Debug mode"
                  description="Enable verbose logging and breakpoints"
                  defaultChecked={false}
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
              <code>{`import { Toggle } from './components/Toggle';
import { useState } from 'react';

function MyComponent() {
  const [enabled, setEnabled] = useState(false);

  return (
    <>
      {/* Basic toggle */}
      <Toggle
        label="Enable feature"
        checked={enabled}
        onCheckedChange={setEnabled}
      />

      {/* With description */}
      <Toggle
        label="Auto-save"
        description="Automatically save your work"
        checked={autoSave}
        onCheckedChange={setAutoSave}
      />

      {/* Small size */}
      <Toggle
        label="Compact toggle"
        size="sm"
        defaultChecked={true}
      />

      {/* Disabled */}
      <Toggle
        label="Disabled"
        disabled={true}
        checked={false}
      />

      {/* No label (standalone) */}
      <Toggle
        checked={value}
        onCheckedChange={setValue}
      />
    </>
  );
}`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
