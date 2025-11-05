import { useMemo, useCallback } from 'react';
import type { DynamicConfigViewProps } from './types';
import { useMcpNodeState } from '@/lib/graph/hooks';

// UI for managing MCP tools using node state only.
// Reads tools from state.mcp.tools and persists enabled list to state.mcp.enabledTools via PUT /state.

export default function McpServerDynamicConfigView({
  nodeId,
  templateName: _tpl,
  value: _value,
  onChange: _onChange,
  readOnly,
  disabled,
}: DynamicConfigViewProps) {
  const { tools, enabledTools, setEnabledTools, isLoading } = useMcpNodeState(nodeId);
  const isDisabled = !!readOnly || !!disabled;
  const enabledSet = useMemo(() => {
    const all = new Set(tools.map((t) => t.name));
    if (!enabledTools) return all; // default: all enabled
    return new Set(enabledTools);
  }, [tools, enabledTools]);
  const onToggle = useCallback(
    (name: string, checked: boolean) => {
      const allNames = tools.map((t) => t.name);
      const current = enabledTools ? new Set(enabledTools) : new Set(allNames);
      if (checked) current.add(name);
      else current.delete(name);
      const next = Array.from(current);
      setEnabledTools(next);
    },
    [tools, enabledTools, setEnabledTools],
  );

  return (
    <div className="space-y-2 text-sm" data-testid="mcp-dyn-view">
      {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {!isLoading && tools.length === 0 && (
        <div className="text-xs text-muted-foreground">No tools discovered</div>
      )}
      {tools.map((t) => {
        const title = t.title && t.title.trim().length > 0 ? t.title : t.name;
        const checked = enabledSet.has(t.name);
        return (
          <div key={t.name} className="flex items-start gap-2" data-testid={`tool-${t.name}`}>
            <input
              id={`mcp-${t.name}`}
              type="checkbox"
              className="h-4 w-4 mt-0.5"
              checked={checked}
              onChange={(e) => onToggle(t.name, e.target.checked)}
              disabled={isDisabled}
            />
            <label htmlFor={`mcp-${t.name}`} className="text-xs">
              <div className="font-medium">{title}</div>
              {t.description ? <div className="text-muted-foreground">{t.description}</div> : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}
