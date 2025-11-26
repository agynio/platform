import { ToolItem } from '../ToolItem';

import type { McpToolDescriptor } from './types';

interface ToolsListProps {
  tools: McpToolDescriptor[];
  enabledToolSet: Set<string>;
  loading: boolean;
  onToggle: (toolName: string, enabled: boolean) => void;
}

export function ToolsList({ tools, enabledToolSet, loading, onToggle }: ToolsListProps) {
  return (
    <section>
      <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Tools</h3>
      <div className="space-y-3">
        {loading && <div className="text-xs text-[var(--agyn-gray)]">Loading tools…</div>}
        {!loading && tools.length === 0 && (
          <div className="text-xs text-[var(--agyn-gray)]">No tools discovered</div>
        )}
        {tools.map((tool) => {
          const displayName = tool.title && tool.title.trim().length > 0 ? tool.title : tool.name;
          const description = tool.description ?? '';
          const enabled = enabledToolSet.has(tool.name);
          return (
            <ToolItem
              key={tool.name}
              name={displayName}
              description={description}
              enabled={enabled}
              onToggle={(value) => {
                if (loading) return;
                onToggle(tool.name, value);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
