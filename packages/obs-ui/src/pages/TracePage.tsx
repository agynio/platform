import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useParams, Link } from 'react-router-dom';
import { fetchTrace } from '../services/api';
import { spanRealtime } from '../services/socket';
import { SpanDoc } from '../types';
import { SpanDetails, SpanTree, SpanTimeline } from '../components';

// Layout constants to keep visual alignment exact across panes
const HEADER_HEIGHT = 32; // px
const ROW_HEIGHT = 26; // px (data row height)
const BAR_HEIGHT = 18; // px (timeline bar visual height)
const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2; // centers bar within row

interface RowData {
  span: SpanDoc;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}
function buildRows(spans: SpanDoc[], collapsed: Set<string>): RowData[] {
  // Build adjacency list grouped by parent
  const children: Record<string, SpanDoc[]> = {};
  const roots: SpanDoc[] = [];
  for (const s of spans) {
    if (!s.parentSpanId) roots.push(s);
    else (children[s.parentSpanId] ||= []).push(s);
  }
  const sortSiblings = (arr: SpanDoc[]) =>
    arr.sort((a, b) => {
      const at = Date.parse(a.startTime);
      const bt = Date.parse(b.startTime);
      if (at !== bt) return at - bt; // earliest first
      const al = a.label.localeCompare(b.label);
      if (al !== 0) return al;
      return a.spanId.localeCompare(b.spanId);
    });
  sortSiblings(roots);
  Object.values(children).forEach(sortSiblings);
  const rows: RowData[] = [];
  function dfs(node: SpanDoc, depth: number) {
    const kids = children[node.spanId] || [];
    const isCollapsed = collapsed.has(node.spanId);
    rows.push({ span: node, depth, hasChildren: kids.length > 0, collapsed: isCollapsed });
    if (!isCollapsed) {
      for (const k of kids) dfs(k, depth + 1);
    }
  }
  for (const r of roots) dfs(r, 0);
  return rows;
}

function buildRuler(spans: SpanDoc[]) {
  const completed = spans.filter((s) => s.endTime);
  if (completed.length === 0) return { ticks: [], min: 0, total: 1, empty: true };
  const min = Math.min(...completed.map((s) => Date.parse(s.startTime)));
  const max = Math.max(...completed.map((s) => Date.parse(s.endTime!)));
  const total = max - min || 1;
  const targetTickCount = 8;
  const rawInterval = total / targetTickCount;
  const magnitudes = [1, 2, 5, 10];
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  let best = rawInterval;
  for (const m of magnitudes) {
    const candidate = m * pow10;
    if (rawInterval <= candidate) {
      best = candidate;
      break;
    }
    best = candidate;
  }
  const ticks: number[] = [];
  const first = Math.ceil(min / best) * best;
  for (let t = first; t <= max; t += best) ticks.push(t);
  return { ticks, min, total, empty: false };
}

// TimelinePane removed in favor of reusable <SpanTimeline /> component

// TreePane removed in favor of reusable <SpanTree /> component

export function TracePage() {
  const { traceId } = useParams();
  const [spans, setSpans] = useState<SpanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpanDoc | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Refs & callbacks placed before any conditional returns to maintain hook order stability
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!leftRef.current || !rightRef.current) return;
    if (e.currentTarget === leftRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop;
    else if (e.currentTarget === rightRef.current) leftRef.current.scrollTop = rightRef.current.scrollTop;
  }, []);

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    fetchTrace(traceId)
      .then((d) => {
        if (!cancelled) {
          setSpans(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Realtime subscription (global broadcast; filter locally)
    const off = spanRealtime.onSpanUpsert((span) => {
      if (span.traceId !== traceId) return;
      setSpans((prev) => {
        const idx = prev.findIndex((s) => s.spanId === span.spanId);
        if (idx === -1) return [...prev, span];
        // Replace if newer (compare rev or lastUpdate)
        const existing = prev[idx];
        if (span.rev <= existing.rev && Date.parse(span.lastUpdate) <= Date.parse(existing.lastUpdate)) return prev;
        const copy = [...prev];
        copy[idx] = span;
        return copy;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  const rows = useMemo(() => buildRows(spans, collapsed), [spans, collapsed]);
  const ruler = useMemo(() => buildRuler(spans), [spans]);
  // Flatten visible spans for keyboard navigation (same order as rows)
  const flatSpanIds = useMemo(() => rows.map((r) => r.span.spanId), [rows]);

  // Keyboard navigation: ArrowUp / ArrowDown to move selection in tree
  useHotkeys(
    'arrowdown',
    (e) => {
      if (!flatSpanIds.length) return;
      e.preventDefault();
      if (!selected) {
        // Select first
        const first = spans.find((s) => s.spanId === flatSpanIds[0]);
        if (first) setSelected(first);
        return;
      }
      const idx = flatSpanIds.indexOf(selected.spanId);
      const nextIdx = Math.min(flatSpanIds.length - 1, idx + 1);
      if (nextIdx !== idx) {
        const next = spans.find((s) => s.spanId === flatSpanIds[nextIdx]);
        if (next) setSelected(next);
      }
    },
    { enableOnFormTags: false, preventDefault: true },
    [flatSpanIds, selected, spans],
  );

  useHotkeys(
    'arrowup',
    (e) => {
      if (!flatSpanIds.length) return;
      e.preventDefault();
      if (!selected) {
        const last = spans.find((s) => s.spanId === flatSpanIds[flatSpanIds.length - 1]);
        if (last) setSelected(last);
        return;
      }
      const idx = flatSpanIds.indexOf(selected.spanId);
      const prevIdx = Math.max(0, idx - 1);
      if (prevIdx !== idx) {
        const prev = spans.find((s) => s.spanId === flatSpanIds[prevIdx]);
        if (prev) setSelected(prev);
      }
    },
    { enableOnFormTags: false, preventDefault: true },
    [flatSpanIds, selected, spans],
  );

  // ArrowLeft: if node expanded and has children -> collapse; else move to parent
  useHotkeys(
    'arrowleft',
    (e) => {
      if (!selected) return;
      e.preventDefault();
      const row = rows.find((r) => r.span.spanId === selected.spanId);
      if (!row) return;
      if (row.hasChildren && !row.collapsed) {
        toggleCollapsed(row.span.spanId);
        return;
      }
      // Move to parent if exists
      const parentId = selected.parentSpanId;
      if (parentId) {
        const parent = spans.find((s) => s.spanId === parentId);
        if (parent) setSelected(parent);
      }
    },
    { enableOnFormTags: false, preventDefault: true },
    [rows, selected, spans, toggleCollapsed],
  );

  // ArrowRight: if node has children and is collapsed -> expand; else move to first child
  useHotkeys(
    'arrowright',
    (e) => {
      if (!selected) return;
      e.preventDefault();
      const row = rows.find((r) => r.span.spanId === selected.spanId);
      if (!row) return;
      if (row.hasChildren) {
        if (row.collapsed) {
          toggleCollapsed(row.span.spanId);
          return;
        }
        // Move to first visible child
        const firstChildRowIndex = rows.findIndex(
          (r) => r.span.parentSpanId === row.span.spanId && r.depth === row.depth + 1,
        );
        if (firstChildRowIndex !== -1) {
          const firstChild = rows[firstChildRowIndex].span;
          setSelected(firstChild);
        }
      }
    },
    { enableOnFormTags: false, preventDefault: true },
    [rows, selected, toggleCollapsed],
  );
  const loadingEl = loading && <div style={{ padding: 16 }}>Loading trace...</div>;
  const errorEl = !loading && error && <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;
  const ready = !loading && !error;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {loadingEl || errorEl}
      {ready && (
        <>
          {/* Global trace header */}
          <div
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              borderBottom: '1px solid #ddd',
              background: '#f7f9fa',
              fontWeight: 600,
            }}
          >
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                textDecoration: 'none',
                color: '#0366d6',
                fontWeight: 500,
                marginRight: 12,
                fontSize: 12,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
              <span>Back</span>
            </Link>
            Trace {traceId}
            <span style={{ fontWeight: 400, marginLeft: 12, fontSize: 11, color: '#666' }}>{rows.length} spans</span>
          </div>
          <div ref={containerRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left (tree) */}
            <div
              ref={leftRef}
              onScroll={onScroll}
              style={{ width: 300, borderRight: '1px solid #ddd', overflow: 'auto' }}
            >
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  height: HEADER_HEIGHT,
                  background: '#fff',
                  zIndex: 10,
                  borderBottom: '1px solid #ddd',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 600,
                  padding: '0 8px',
                }}
              >
                Span
              </div>
              <SpanTree
                spans={spans}
                selectedId={selected?.spanId}
                onSelect={(s) => setSelected(s)}
                collapsedIds={collapsed}
                onToggle={(id) => toggleCollapsed(id)}
                // Provide externally computed ordered visible rows so SpanTree and
                // keyboard navigation share a single source of truth.
                rows={rows.map(r => ({ span: r.span, depth: r.depth, hasChildren: r.hasChildren, collapsed: r.collapsed }))}
              />
            </div>
            {/* Right (timeline or details) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {!selected && (
                <div ref={rightRef} onScroll={onScroll} style={{ overflow: 'auto', height: '100%' }}>
                  <div
                    style={{
                      position: 'sticky',
                      top: 0,
                      height: HEADER_HEIGHT,
                      background: '#fff',
                      zIndex: 10,
                      borderBottom: '1px solid #ddd',
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ padding: '0 12px', marginRight: 8 }}>Timeline</div>
                    {!ruler.empty && (
                      <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                        {ruler.ticks.map((t) => {
                          const pct = ((t - ruler.min) / ruler.total) * 100;
                          return (
                            <div
                              key={t}
                              style={{
                                position: 'absolute',
                                left: pct + '%',
                                top: 0,
                                bottom: 0,
                                width: 1,
                                background: '#ccc',
                              }}
                            />
                          );
                        })}
                        {ruler.ticks.map((t) => {
                          const pct = ((t - ruler.min) / ruler.total) * 100;
                          const label = t - ruler.min + 'ms';
                          return (
                            <div
                              key={t + '-lbl'}
                              style={{
                                position: 'absolute',
                                left: pct + '%',
                                top: 2,
                                fontSize: 10,
                                paddingLeft: 2,
                                transform: 'translateX(2px)',
                              }}
                            >
                              {label}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <SpanTimeline
                    rows={rows.map(r => ({ span: r.span, depth: r.depth, hasChildren: r.hasChildren, collapsed: r.collapsed }))}
                    ruler={ruler}
                    onSelect={(s: SpanDoc) => setSelected(s)}
                  />
                </div>
              )}
              {selected && (
                <SpanDetails
                  span={selected}
                  spans={spans}
                  onSelectSpan={(s: SpanDoc) => setSelected(s)}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
