import { ArrowLeft } from 'lucide-react';
import Sidebar from '../Sidebar';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface SidebarShowcaseProps {
  onBack: () => void;
}

export default function SidebarShowcase({ onBack }: SidebarShowcaseProps) {
  return (
    <div>
      {/* Header */}
      <ComponentPreviewHeader
        title="Sidebar"
        description="Navigation menu with collapsible sections and user information"
        onBack={onBack}
      />

      {/* Live Preview */}
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Live Preview</h3>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">Interactive sidebar with menu navigation</p>
        </PanelHeader>
        <PanelBody>
          <div className="rounded-[10px] overflow-hidden border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
            <div className="flex h-[600px]">
              <Sidebar currentUser={{ name: 'Jane Smith', email: 'jane@agyn.io' }} />
              <div className="flex-1 p-8">
                <div className="max-w-2xl">
                  <h2 className="mb-4">Main Content Area</h2>
                  <p className="text-[var(--agyn-gray)] mb-4">
                    The sidebar provides navigation to different sections of the application. Click on menu items to expand/collapse sections and select pages.
                  </p>
                  <div className="space-y-4">
                    <div className="p-4 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)]">
                      <h4 className="mb-2">Features</h4>
                      <ul className="space-y-2 text-sm text-[var(--agyn-gray)]">
                        <li>• Collapsible menu sections</li>
                        <li>• Icons for all menu items</li>
                        <li>• Active state highlighting</li>
                        <li>• User information in footer</li>
                        <li>• Smooth transitions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PanelBody>
      </Panel>

      {/* Code Example */}
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Sidebar Usage Example</h4>
        </PanelHeader>
        <PanelBody>
          <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
            <code>{`import Sidebar from './components/Sidebar';

function App() {
  return (
    <div className="flex h-screen">
      <Sidebar 
        currentUser={{
          name: 'Jane Smith',
          email: 'jane@agyn.io',
          avatar: '/path/to/avatar.jpg' // optional
        }}
      />
      <main className="flex-1 overflow-auto">
        {/* Your main content */}
      </main>
    </div>
  );
}

// The sidebar automatically handles:
// - Menu expansion/collapse
// - Active item highlighting
// - Responsive hover states
// - User information display`}</code>
          </pre>
        </PanelBody>
      </Panel>
    </div>
  );
}