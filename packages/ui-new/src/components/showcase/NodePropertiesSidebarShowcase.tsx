import { useState } from 'react';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import NodePropertiesSidebar from '../NodePropertiesSidebar';

interface NodePropertiesSidebarShowcaseProps {
  onBack: () => void;
}

export default function NodePropertiesSidebarShowcase({ onBack }: NodePropertiesSidebarShowcaseProps) {
  const [selectedNode, setSelectedNode] = useState<'Agent' | 'Tool' | 'MCP' | 'Trigger' | 'Workspace'>('Agent');

  // Node details mapping
  const nodeDetails = {
    Agent: { kind: 'Agent' as const, title: 'Customer Support Agent', status: 'ready' as const },
    Tool: { kind: 'Tool' as const, title: 'Send Email Tool', status: 'ready' as const },
    MCP: { kind: 'MCP' as const, title: 'GitHub Integration', status: 'ready' as const },
    Trigger: { kind: 'Trigger' as const, title: 'Slack Trigger', status: 'ready' as const },
    Workspace: { kind: 'Workspace' as const, title: 'Development Environment', status: 'ready' as const },
  };

  return (
    <div>
      <ComponentPreviewHeader
        title="Node Properties Sidebar"
        description="Configuration sidebar for node properties and settings"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Static Preview */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Node Properties</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Interactive sidebar for configuring different node types
            </p>
          </PanelHeader>
          <PanelBody>
            {/* Preview Window with Sidebar */}
            <div className="flex gap-0 border border-[var(--agyn-border-default)] rounded-[10px] overflow-hidden bg-[var(--agyn-bg-light)] h-[700px]">
              {/* Main Content Area */}
              <div className="flex-1 p-8">
                <h3 className="text-[var(--agyn-dark)] mb-4">Select Node</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedNode('Agent')}
                    className={`w-full text-left px-4 py-3 rounded-[6px] transition-colors ${
                      selectedNode === 'Agent'
                        ? 'bg-[var(--agyn-blue)] text-white'
                        : 'bg-white text-[var(--agyn-dark)] hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedNode === 'Agent' ? 'bg-white' : 'bg-[var(--agyn-blue)]'
                      }`} />
                      <div>
                        <div className="font-medium">Agent</div>
                        <div className={`text-sm ${
                          selectedNode === 'Agent' ? 'text-white/80' : 'text-[var(--agyn-gray)]'
                        }`}>
                          Customer Support Agent
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedNode('Trigger')}
                    className={`w-full text-left px-4 py-3 rounded-[6px] transition-colors ${
                      selectedNode === 'Trigger'
                        ? 'bg-[var(--agyn-yellow)] text-[var(--agyn-dark)]'
                        : 'bg-white text-[var(--agyn-dark)] hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedNode === 'Trigger' ? 'bg-[var(--agyn-dark)]' : 'bg-[var(--agyn-yellow)]'
                      }`} />
                      <div>
                        <div className="font-medium">Slack Trigger</div>
                        <div className={`text-sm ${
                          selectedNode === 'Trigger' ? 'opacity-80' : 'text-[var(--agyn-gray)]'
                        }`}>
                          Event-based workflow trigger
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedNode('Tool')}
                    className={`w-full text-left px-4 py-3 rounded-[6px] transition-colors ${
                      selectedNode === 'Tool'
                        ? 'bg-[var(--agyn-cyan)] text-white'
                        : 'bg-white text-[var(--agyn-dark)] hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedNode === 'Tool' ? 'bg-white' : 'bg-[var(--agyn-cyan)]'
                      }`} />
                      <div>
                        <div className="font-medium">Tool</div>
                        <div className={`text-sm ${
                          selectedNode === 'Tool' ? 'text-white/80' : 'text-[var(--agyn-gray)]'
                        }`}>
                          Send Email Tool
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedNode('MCP')}
                    className={`w-full text-left px-4 py-3 rounded-[6px] transition-colors ${
                      selectedNode === 'MCP'
                        ? 'bg-[var(--agyn-cyan)] text-white'
                        : 'bg-white text-[var(--agyn-dark)] hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedNode === 'MCP' ? 'bg-white' : 'bg-[var(--agyn-cyan)]'
                      }`} />
                      <div>
                        <div className="font-medium">MCP</div>
                        <div className={`text-sm ${
                          selectedNode === 'MCP' ? 'text-white/80' : 'text-[var(--agyn-gray)]'
                        }`}>
                          GitHub Integration
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedNode('Workspace')}
                    className={`w-full text-left px-4 py-3 rounded-[6px] transition-colors ${
                      selectedNode === 'Workspace'
                        ? 'bg-[var(--agyn-purple)] text-white'
                        : 'bg-white text-[var(--agyn-dark)] hover:bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedNode === 'Workspace' ? 'bg-white' : 'bg-[var(--agyn-purple)]'
                      }`} />
                      <div>
                        <div className="font-medium">Workspace</div>
                        <div className={`text-sm ${
                          selectedNode === 'Workspace' ? 'text-white/80' : 'text-[var(--agyn-gray)]'
                        }`}>
                          Development Environment
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Node Properties Sidebar Component - Static */}
              <NodePropertiesSidebar
                nodeKind={nodeDetails[selectedNode].kind}
                nodeTitle={nodeDetails[selectedNode].title}
                status={nodeDetails[selectedNode].status}
              />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}