import { Plus } from 'lucide-react';
import Badge from './Badge';

export interface DraggableNodeItem {
  id: string;
  kind: 'Trigger' | 'Agent' | 'Tool' | 'MCP' | 'Workspace';
  title: string;
  description: string;
}

const nodeKindConfig = {
  Trigger: { color: 'var(--agyn-yellow)', bgColor: 'var(--agyn-bg-yellow)' },
  Agent: { color: 'var(--agyn-blue)', bgColor: 'var(--agyn-bg-blue)' },
  Tool: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)' },
  MCP: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)' },
  Workspace: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)' },
};

const defaultNodeItems: DraggableNodeItem[] = [
  {
    id: 'trigger-http',
    kind: 'Trigger',
    title: 'HTTP Trigger',
    description: 'Start a workflow with an HTTP request',
  },
  {
    id: 'trigger-schedule',
    kind: 'Trigger',
    title: 'Schedule Trigger',
    description: 'Run workflows on a schedule',
  },
  {
    id: 'agent-gpt4',
    kind: 'Agent',
    title: 'GPT-4 Agent',
    description: 'AI agent powered by GPT-4',
  },
  {
    id: 'agent-claude',
    kind: 'Agent',
    title: 'Claude Agent',
    description: 'AI agent powered by Claude',
  },
  {
    id: 'tool-search',
    kind: 'Tool',
    title: 'Web Search',
    description: 'Search the web for information',
  },
  {
    id: 'tool-calculator',
    kind: 'Tool',
    title: 'Calculator',
    description: 'Perform mathematical calculations',
  },
  {
    id: 'mcp-database',
    kind: 'MCP',
    title: 'Database MCP',
    description: 'Connect to databases via MCP',
  },
  {
    id: 'mcp-files',
    kind: 'MCP',
    title: 'File System MCP',
    description: 'Access file system operations',
  },
  {
    id: 'workspace-dev',
    kind: 'Workspace',
    title: 'Development Workspace',
    description: 'Isolated environment for development',
  },
];

interface EmptySelectionSidebarProps {
  nodeItems?: DraggableNodeItem[];
  onNodeDragStart?: (nodeType: string) => void;
}

export default function EmptySelectionSidebar({
  nodeItems = defaultNodeItems,
  onNodeDragStart,
}: EmptySelectionSidebarProps) {
  const handleDragStart = (event: React.DragEvent, item: DraggableNodeItem) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
    if (onNodeDragStart) {
      onNodeDragStart(item.kind);
    }
  };

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[var(--agyn-bg-blue)] flex items-center justify-center flex-shrink-0">
            <Plus size={20} style={{ color: 'var(--agyn-blue)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-[var(--agyn-dark)]">Build Your AI Team</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-0.5">
              Add agents and tools to shape your own processes
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)] mb-3">
            Drag to Canvas
          </div>
          <div className="space-y-2">
            {nodeItems.map((item) => {
              const config = nodeKindConfig[item.kind];
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  className="p-3 rounded-[8px] border border-[var(--agyn-border-subtle)] bg-white hover:border-[var(--agyn-border-medium)] hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge
                          size="sm"
                          color={config.color}
                          bgColor={config.bgColor}
                        >
                          {item.kind}
                        </Badge>
                        <span className="text-sm text-[var(--agyn-dark)]">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--agyn-gray)] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
