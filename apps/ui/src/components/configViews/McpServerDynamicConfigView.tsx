import { useEffect, useMemo } from 'react';
import type { DynamicConfigViewProps } from './types';
import { useNodeStatus, useDynamicConfig } from '../../../../../apps/ui/src/lib/graph/hooks';

export default function McpServerDynamicConfigView({
  nodeId,
  templateName: _tpl,
  value,
  onChange,
  readOnly,
  disabled,
}: DynamicConfigViewProps) {
  const { data: status } = useNodeStatus(nodeId);
  const ready = !!status?.dynamicConfigReady;
  const { schema } = useDynamicConfig(nodeId);

  const keys = useMemo(() => {
    const s = schema.data as any;
    const props: Record<string, any> | undefined = s && s.properties;
    return props ? Object.keys(props) : [];
  }, [schema.data]);

  useEffect(() => {
    if (!ready || keys.length === 0) return;
    const next = { ...value } as Record<string, unknown>;
    let changed = false;
    for (const k of keys) {
      if (typeof next[k] !== 'boolean') {
        (next as any)[k] = false;
        changed = true;
      }
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(keys)]);

  if (!ready) return <div className="text-xs text-muted-foreground">Dynamic config not available yet</div>;
  if (!schema.data) return <div className="text-xs text-muted-foreground">Loading…</div>;

  const isDisabled = !!readOnly || !!disabled;

  return (
    <div className="space-y-2 text-sm" data-testid="mcp-dyn-view">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2">
          <input
            id={`dyn-${k}`}
            type="checkbox"
            className="h-4 w-4"
            checked={!!(value as any)[k]}
            onChange={(e) => onChange({ ...(value as any), [k]: e.target.checked })}
            disabled={isDisabled}
          />
          <label htmlFor={`dyn-${k}`} className="text-xs">
            {k}
          </label>
        </div>
      ))}
    </div>
  );
}

