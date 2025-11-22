import { ArrowLeft, Settings, Bell, User } from 'lucide-react';
import { Panel, PanelHeader, PanelBody, PanelFooter } from '../Panel';
import { Button } from '../Button';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface PanelShowcaseProps {
  onBack: () => void;
}

export default function PanelShowcase({ onBack }: PanelShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Panel"
        description="Container component with header and body sections"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Variants */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Panel Variants</h3>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Panel variant="standard" className="p-6">
                <h4 className="mb-2">Standard Panel</h4>
                <p className="text-[var(--agyn-gray)]">
                  White background with subtle border. Default panel style for most content.
                </p>
              </Panel>

              <Panel variant="elevated" className="p-6">
                <h4 className="mb-2">Elevated Panel</h4>
                <p className="text-[var(--agyn-gray)]">
                  White background with shadow. Used for cards that need to stand out.
                </p>
              </Panel>

              <Panel variant="subtle" className="p-6">
                <h4 className="mb-2">Subtle Panel</h4>
                <p className="text-[var(--agyn-gray)]">
                  Light gray background with border. Used for secondary content areas.
                </p>
              </Panel>

              <Panel variant="highlighted" className="p-6">
                <h4 className="mb-2">Highlighted Panel</h4>
                <p className="text-[var(--agyn-gray)]">
                  Blue accent background with primary border. Used to draw attention.
                </p>
              </Panel>
            </div>
          </PanelBody>
        </Panel>

        {/* Panel Sections */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Panel Sections</h3>
          </PanelHeader>
          <PanelBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Panel variant="standard">
                <PanelHeader>
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-[var(--agyn-blue)]" />
                    <h4>Settings</h4>
                  </div>
                </PanelHeader>
                <PanelBody>
                  <p className="text-[var(--agyn-gray)]">
                    Configure your account preferences and application settings here.
                  </p>
                </PanelBody>
                <PanelFooter>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" size="sm">Cancel</Button>
                    <Button variant="primary" size="sm">Save</Button>
                  </div>
                </PanelFooter>
              </Panel>

              <Panel variant="standard">
                <PanelHeader>
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-[var(--agyn-purple)]" />
                    <h4>Notifications</h4>
                  </div>
                </PanelHeader>
                <PanelBody>
                  <p className="text-[var(--agyn-gray)]">
                    Manage how you receive notifications and updates from the platform.
                  </p>
                </PanelBody>
                <PanelFooter>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" size="sm">Cancel</Button>
                    <Button variant="primary" size="sm">Update</Button>
                  </div>
                </PanelFooter>
              </Panel>
            </div>
          </PanelBody>
        </Panel>

        {/* Content Examples */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Content Examples</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* User Card */}
              <Panel variant="standard">
                <PanelBody>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[var(--agyn-blue)] rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1">John Developer</h4>
                      <p className="text-[var(--agyn-gray)] mb-3">john@agyn.io</p>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-[var(--agyn-bg-accent)] text-[var(--agyn-blue)] rounded-full text-sm">
                          Admin
                        </span>
                        <span className="px-3 py-1 bg-[var(--agyn-bg-light)] text-[var(--agyn-gray)] rounded-full text-sm">
                          Active
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </PanelBody>
              </Panel>

              {/* Stats Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Panel variant="highlighted">
                  <PanelBody>
                    <p className="text-[var(--agyn-gray)] mb-2">Total Projects</p>
                    <h2 className="text-[var(--agyn-blue)]">24</h2>
                  </PanelBody>
                </Panel>
                <Panel variant="elevated">
                  <PanelBody>
                    <p className="text-[var(--agyn-gray)] mb-2">Active Tasks</p>
                    <h2>156</h2>
                  </PanelBody>
                </Panel>
                <Panel variant="elevated">
                  <PanelBody>
                    <p className="text-[var(--agyn-gray)] mb-2">Team Members</p>
                    <h2>8</h2>
                  </PanelBody>
                </Panel>
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
              <code>{`import { Panel, PanelHeader, PanelBody, PanelFooter } from './components/Panel';

// Simple panel
<Panel variant="elevated" className="p-6">
  <h3>Title</h3>
  <p>Content goes here</p>
</Panel>

// Panel with sections
<Panel variant="standard">
  <PanelHeader>
    <h3>Settings</h3>
  </PanelHeader>
  <PanelBody>
    <p>Configure your preferences</p>
  </PanelBody>
  <PanelFooter>
    <Button>Save Changes</Button>
  </PanelFooter>
</Panel>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}