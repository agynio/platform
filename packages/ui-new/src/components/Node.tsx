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

export default function Node({ kind, title, inputs = [], outputs = [], avatar, selected = false, className = '' }: NodeProps) {
  const config = nodeKindConfig[kind];
  const showAvatar = kind === 'Agent' && avatar;

  return (
    <div className={`relative ${className}`}>
      {/* Node Container */}
      <div 
        className="bg-white rounded-[10px] w-[280px] transition-all cursor-pointer"
        style={{ 
          border: `1px solid ${config.borderColor}40`,
          outline: selected ? `2px solid ${config.borderColor}` : 'none',
          outlineOffset: '2px',
          boxShadow: selected 
            ? `0 4px 12px rgba(0,0,0,0.12)` 
            : '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div 
          className="px-4 py-3 rounded-t-[8px]"
          style={{ 
            background: config.gradient || config.bgColor,
            borderBottom: `1px solid ${config.borderColor}40`,
          }}
        >
          <div className="flex items-center gap-3">
            {showAvatar && (
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white border-2" style={{ borderColor: config.borderColor }}>
                <img src={avatar} alt={title || kind} className="w-full h-full object-cover" />
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
        <div className="p-4">
          <div className="flex justify-between">
            {/* Input Ports */}
            <div className="space-y-2">
              {inputs.map((input) => (
                <div key={input.id} className="relative flex items-center gap-2 h-8">
                  {/* Input Connector - positioned relative to this port */}
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 bg-white cursor-pointer hover:scale-125 transition-transform"
                    style={{
                      borderColor: config.color,
                      left: '-22px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  <span className="text-sm text-[var(--agyn-gray)] uppercase">{input.title}</span>
                </div>
              ))}
            </div>

            {/* Output Ports */}
            <div className="space-y-2">
              {outputs.map((output) => (
                <div key={output.id} className="relative flex items-center gap-2 justify-end h-8">
                  {/* Output Connector - positioned relative to this port */}
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 bg-white cursor-pointer hover:scale-125 transition-transform"
                    style={{
                      borderColor: config.color,
                      right: '-22px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  <span className="text-sm text-[var(--agyn-gray)] uppercase">{output.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}