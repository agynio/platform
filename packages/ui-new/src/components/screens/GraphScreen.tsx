import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Sidebar from '../Sidebar';
import NodePropertiesSidebar from '../NodePropertiesSidebar';
import Node from '../Node';
import { IconButton } from '../IconButton';

export type NodeKind = 'Trigger' | 'Agent' | 'Tool' | 'MCP' | 'Workspace';
export type NodeStatus = 'not_ready' | 'provisioning' | 'ready' | 'deprovisioning' | 'provisioning_error' | 'deprovisioning_error';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  status: NodeStatus;
  data?: Record<string, any>;
}

interface GraphScreenProps {
  nodes?: GraphNode[];
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function GraphScreen({ 
  nodes: initialNodes, 
  onBack,
  selectedMenuItem,
  onMenuItemSelect
}: GraphScreenProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const defaultNodes: GraphNode[] = [
    { id: 'node-1', kind: 'Agent', title: 'GPT-4 Agent', x: 100, y: 100, status: 'ready', data: { model: 'gpt-4', temperature: 0.7 } },
    { id: 'node-2', kind: 'Tool', title: 'Search Tool', x: 400, y: 100, status: 'ready', data: { toolName: 'web_search' } },
    { id: 'node-3', kind: 'MCP', title: 'Database MCP', x: 700, y: 100, status: 'ready', data: { server: 'postgres' } },
    { id: 'node-4', kind: 'Trigger', title: 'HTTP Trigger', x: 100, y: 300, status: 'ready', data: { method: 'POST' } },
    { id: 'node-5', kind: 'Workspace', title: 'Dev Workspace', x: 400, y: 300, status: 'provisioning', data: { cpu: 2, memory: 4096 } },
    { id: 'node-6', kind: 'Agent', title: 'Claude Agent', x: 700, y: 300, status: 'not_ready', data: { model: 'claude-3' } },
  ];

  const nodes = initialNodes || defaultNodes;
  const selectedNode = nodes.find(node => node.id === selectedNodeId);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleCloseProperties = () => {
    setSelectedNodeId(null);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Graph</span>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={onMenuItemSelect}
        />

        {/* Canvas */}
        <div className="flex-1 relative bg-[var(--agyn-bg-light)] overflow-hidden">
          {/* Grid Background */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, var(--agyn-border-subtle) 1px, transparent 1px),
                linear-gradient(to bottom, var(--agyn-border-subtle) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
            }}
          />
          
          {/* Canvas Content */}
          <div className="relative w-full h-full p-8">
            {/* Placeholder Text */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-2xl font-semibold text-[var(--agyn-text-subtle)] mb-2">
                Graph Canvas
              </div>
              <div className="text-sm text-[var(--agyn-text-subtle)]">
                Click on nodes to view their properties
              </div>
            </div>

            {/* Nodes */}
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  cursor: 'pointer',
                }}
                onClick={() => handleNodeClick(node.id)}
              >
                <Node
                  kind={node.kind}
                  title={node.title}
                  selected={selectedNodeId === node.id}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Node Properties */}
        <NodePropertiesSidebar
          nodeKind={selectedNode?.kind || 'Agent'}
          nodeTitle={selectedNode?.title || 'Select a node'}
          status={selectedNode?.status || 'ready'}
          onSave={() => {
            if (selectedNode) {
              console.log('Save changes to node:', selectedNode.id);
            }
          }}
        />
      </div>
    </div>
  );
}
