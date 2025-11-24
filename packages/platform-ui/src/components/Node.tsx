export type NodeKind = 'Trigger' | 'Agent' | 'Tool' | 'MCP' | 'Workspace';

interface NodePort {
  id: string;
  title: string;
}

interface NodeProps {
  kind: NodeKind;
  title?: string;
  inputs?: NodePort[];
  outputs?: NodePort[];
  avatar?: string;
  avatarSeed?: string;
  selected?: boolean;
  className?: string;
}

const nodeKindConfig: Record<NodeKind, { color: string; bgColor: string; borderColor: string; gradient?: string }> = {
  Trigger: {
    color: 'var(--agyn-yellow)',
    bgColor: 'var(--agyn-bg-yellow)',
    borderColor: 'var(--agyn-yellow)',
  },
  Agent: {
    color: 'var(--agyn-blue)',
    bgColor: 'transparent',
    borderColor: 'var(--agyn-blue)',
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
  },
  Tool: {
    color: 'var(--agyn-cyan)',
    bgColor: 'var(--agyn-bg-cyan)',
    borderColor: 'var(--agyn-cyan)',
  },
  MCP: {
    color: 'var(--agyn-cyan)',
    bgColor: 'var(--agyn-bg-cyan)',
    borderColor: 'var(--agyn-cyan)',
  },
  Workspace: {
    color: 'var(--agyn-purple)',
    bgColor: 'var(--agyn-bg-purple)',
    borderColor: 'var(--agyn-purple)',
  },
};

import { Handle, Position } from '@xyflow/react';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

export default function GraphNode({ kind, title, inputs = [], outputs = [], avatar, avatarSeed, selected = false, className = '' }: NodeProps) {
  const config = nodeKindConfig[kind];
  const avatarSvg = !avatar && avatarSeed
    ? createAvatar(avataaars, { seed: avatarSeed }).toString()
    : undefined;
  const showAvatar = kind === 'Agent' && (avatar || avatarSvg);

  return (
    <div className={`relative ${className}`}>
      {/* Node Container */}
      <div 
        className="relative bg-white rounded-[10px] w-[280px] transition-all cursor-pointer"
        style={{ 
          border: `1px solid ${config.borderColor}40`,
          boxShadow: selected
            ? '0 4px 12px rgba(0,0,0,0.12)'
            : '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Selection outline overlay so it sits above header background */}
        {selected && (
          <div
            className="pointer-events-none absolute inset-0 rounded-[10px]"
            style={{
              boxShadow: `0 0 0 2px ${config.borderColor}`,
            }}
          />
        )}
        {/* Header */}
        <div 
          className="px-4 py-3 rounded-t-[10px] overflow-hidden"
          style={{ 
            background: kind === 'Agent' ? (config.gradient || config.bgColor) : `${config.bgColor}`,
            borderBottom: `1px solid ${config.borderColor}40`,
          }}
        >
          <div className="flex items-center gap-3">
            {showAvatar && (
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white border-2" style={{ borderColor: config.borderColor }}>
                {avatar ? (
                  <img src={avatar} alt={title || kind} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full"
                    dangerouslySetInnerHTML={{ __html: avatarSvg || '' }}
                  />
                )}
              </div>
            )}
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wide opacity-70" style={{ color: config.color }}>
                {kind}
              </div>
              {title && (
                <div className="mt-0.5" style={{ color: config.color }}>
                  {title}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body with Ports */}
        <div className="py-1.5">
          <div className="flex justify-between">
            {/* Input Ports */}
            <div className="space-y-0.5">
              {inputs.map((input) => (
                  <div
                    key={input.id}
                    className="relative flex items-center h-7 pl-4"
                  >
                  {/* Handle is the interactive surface; circle is purely visual */}
                    <Handle
                      id={input.id}
                      type="target"
                      position={Position.Left}
                      className="absolute rounded-full"
                    style={{
                      left: 0,
                      top: '50%',
                      width: '12px',
                      height: '12px',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full border-2 bg-white cursor-pointer"
                      style={{
                        borderColor: config.color,
                        pointerEvents: 'none',
                      }}
                    />
                  </Handle>
                  <span className="ml-2 text-sm text-[var(--agyn-gray)] uppercase">{input.title}</span>
                </div>
              ))}
            </div>

            {/* Output Ports */}
            <div className="space-y-0.5">
              {outputs.map((output) => (
                  <div
                    key={output.id}
                    className="relative flex items-center justify-end h-7 pr-4"
                  >
                  {/* Handle is the interactive surface; circle is purely visual */}
                    <Handle
                      id={output.id}
                      type="source"
                      position={Position.Right}
                      className="absolute rounded-full"
                    style={{
                      right: 0,
                      top: '50%',
                      width: '12px',
                      height: '12px',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full border-2 bg-white cursor-pointer"
                      style={{
                        borderColor: config.color,
                        pointerEvents: 'none',
                      }}
                    />
                  </Handle>
                  <span className="mr-2 text-sm text-[var(--agyn-gray)] uppercase">{output.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}