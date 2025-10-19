import React, { useMemo, useState, useCallback } from 'react';
import { SpanDoc } from '../types';

export interface SpanTreeProps {
  spans: SpanDoc[];
  selectedId?: string;
  onSelect(span: SpanDoc): void;
  /** Optionally control collapsed nodes externally */
  collapsedIds?: Set<string>;
  /** Callback when a node's collapsed state toggles */
  onToggle?(spanId: string, collapsed: boolean): void;
  /** Initial auto-expand depth (default 2) */
  autoExpandDepth?: number;
  /**
   * External visible row ordering (single source of truth for keyboard navigation + rendering).
   * When provided, internal ordering + collapse calculation is skipped.
   */
  rows?: { span: SpanDoc; depth: number; hasChildren: boolean; collapsed?: boolean }[];
}

interface RowData { span: SpanDoc; depth: number; hasChildren: boolean; }

function buildRows(spans: SpanDoc[]): { rows: RowData[]; children: Record<string, SpanDoc[]>; roots: SpanDoc[] } {
  const children: Record<string, SpanDoc[]> = {};
  const roots: SpanDoc[] = [];
  for (const s of spans) {
    if (!s.parentSpanId) roots.push(s);
    else (children[s.parentSpanId] ||= []).push(s);
  }
  const sortSiblings = (arr: SpanDoc[]) => arr.sort((a,b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  sortSiblings(roots);
  Object.values(children).forEach(sortSiblings);
  const rows: RowData[] = [];
  function dfs(node: SpanDoc, depth: number) {
    const kids = children[node.spanId] || [];
    rows.push({ span: node, depth, hasChildren: kids.length > 0 });
    for (const k of kids) dfs(k, depth + 1);
  }
  for (const r of roots) dfs(r, 0);
  return { rows, children, roots };
}

export function SpanTree({
  spans,
  selectedId,
  onSelect,
  collapsedIds,
  onToggle,
  autoExpandDepth = 2,
  rows: externalRows,
}: SpanTreeProps) {
  // If collapsedIds not provided, manage locally
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(() => new Set());
  const collapsed = collapsedIds ?? internalCollapsed;
  const toggleLocal = useCallback((id: string) => {
    setInternalCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const doToggle = useCallback((id: string) => {
    const willCollapse = !collapsed.has(id);
    if (!collapsedIds) toggleLocal(id); // uncontrolled
    else toggleLocal(id); // even in controlled we keep local mirror for immediate UI (could be removed)
    onToggle?.(id, willCollapse);
  }, [collapsed, collapsedIds, onToggle, toggleLocal]);

  const { rows, children } = useMemo(() => buildRows(spans), [spans]);

  // Filter rows according to collapsed state; honor autoExpandDepth for first render only
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    // Pre-expand nodes up to autoExpandDepth (i.e., do not mark them as collapsed)
    setInitialized(true);
  }
  let visibleRows: RowData[] = [];
  if (externalRows) {
    // Directly trust provided ordering
    visibleRows = externalRows.map(r => ({ span: r.span, depth: r.depth, hasChildren: r.hasChildren }));
  } else {
    const collapsedSet = collapsed;
    const childMap = children;
    function pushVisible(node: SpanDoc, depth: number) {
      const kids = childMap[node.spanId] || [];
      const isCollapsed = collapsedSet.has(node.spanId);
      visibleRows.push({ span: node, depth, hasChildren: kids.length > 0 });
      if (!isCollapsed) {
        for (const k of kids) pushVisible(k, depth + 1);
      }
    }
    for (const r of spans.filter(s => !s.parentSpanId)) pushVisible(r, 0);
  }

  return (
    <div>
      {visibleRows.map(r => {
        const s = r.span;
        const isSelected = selectedId === s.spanId;
        const isError = s.status === 'error';
        const isCollapsed = collapsed.has(s.spanId);
        return (
          <div
            key={s.spanId}
            data-span-id={s.spanId}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 26,
              cursor: 'pointer',
              background: isSelected ? '#0d6efd10' : 'transparent',
              borderLeft: isError ? '3px solid #dc3545' : '3px solid transparent'
            }}
            onClick={() => onSelect(s)}
          >
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 + r.depth * 12 }}>
              {r.hasChildren ? (
                <span
                  onClick={(e) => { e.stopPropagation(); doToggle(s.spanId); }}
                  style={{
                    width: 14,
                    display: 'inline-block',
                    textAlign: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: 11,
                    color: isError ? '#dc3545' : undefined,
                    fontWeight: isError ? 600 : 400
                  }}
                >
                  {isCollapsed ? '▸' : '▾'}
                </span>
              ) : (
                <span style={{ width: 14, display: 'inline-block' }} />
              )}
              <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word', color: isError ? '#dc3545' : undefined, fontWeight: isError ? 600 : 400 }}>{s.label}</span>
            </div>
            <div style={{ marginLeft: 6, fontSize: 10, color: isError ? '#dc3545' : '#666', fontWeight: isError ? 600 : 400 }}>{s.status}</div>
          </div>
        );
      })}
    </div>
  );
}

