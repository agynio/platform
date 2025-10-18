import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Link } from 'react-router-dom';
import { SpanDoc } from '../types';
import { SpanDetails, SpanTree, SpanTimeline } from '../components';
import { spanRealtime } from '../services/socket';

// Reusable layout constants (kept in sync with TracePage original values)
const HEADER_HEIGHT = 32; // px

export interface SpanHierarchyPageProps {
  mode: 'trace' | 'thread';
  id: string; // traceId or threadId depending on mode
  fetcher: (id: string) => Promise<SpanDoc[]>;
}

interface RowData { span: SpanDoc; depth: number; hasChildren: boolean; collapsed: boolean; }

function buildRows(spans: SpanDoc[], collapsed: Set<string>): RowData[] {
  const children: Record<string, SpanDoc[]> = {};
  const roots: SpanDoc[] = [];
  for (const s of spans) {
    if (!s.parentSpanId) roots.push(s); else (children[s.parentSpanId] ||= []).push(s);
  }
  const sortSiblings = (arr: SpanDoc[]) => arr.sort((a,b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  sortSiblings(roots); Object.values(children).forEach(sortSiblings);
  const rows: RowData[] = [];
  function dfs(node: SpanDoc, depth: number) {
    const kids = children[node.spanId] || [];
    const isCollapsed = collapsed.has(node.spanId);
    rows.push({ span: node, depth, hasChildren: kids.length > 0, collapsed: isCollapsed });
    if (!isCollapsed) kids.forEach(k => dfs(k, depth + 1));
  }
  roots.forEach(r => dfs(r, 0));
  return rows;
}

function buildRuler(spans: SpanDoc[]) {
  const completed = spans.filter(s => s.endTime);
  if (!completed.length) return { ticks: [], min: 0, total: 1, empty: true };
  const min = Math.min(...completed.map(s => Date.parse(s.startTime)));
  const max = Math.max(...completed.map(s => Date.parse(s.endTime!)));
  const total = max - min || 1;
  const targetTicks = 8; const raw = total / targetTicks; const magnitudes = [1,2,5,10];
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = raw; for (const m of magnitudes) { const c = m * pow10; if (raw <= c) { best = c; break; } best = c; }
  const ticks: number[] = []; const first = Math.ceil(min / best) * best; for (let t = first; t <= max; t += best) ticks.push(t);
  return { ticks, min, total, empty: false };
}

export function SpanHierarchyPage({ mode, id, fetcher }: SpanHierarchyPageProps) {
  const [spans, setSpans] = useState<SpanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpanDoc | null>(null);
  const [follow, setFollow] = useState<boolean>(false);
  const followRef = useRef(false);
  const selectedRef = useRef<SpanDoc | null>(null);
  useEffect(() => { followRef.current = follow; }, [follow]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = useCallback((sid: string) => setCollapsed(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; }), []);
  const leftRef = useRef<HTMLDivElement | null>(null); const rightRef = useRef<HTMLDivElement | null>(null);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!leftRef.current || !rightRef.current) return;
    if (e.currentTarget === leftRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop;
    else if (e.currentTarget === rightRef.current) leftRef.current.scrollTop = rightRef.current.scrollTop;
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetcher(id).then(data => { if (!cancelled) setSpans(data); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    function upsert(list: SpanDoc[], span: SpanDoc) {
      const idx = list.findIndex(s => s.spanId === span.spanId);
      if (idx === -1) return [...list, span];
      const existing = list[idx];
      if (span.rev <= existing.rev && Date.parse(span.lastUpdate) <= Date.parse(existing.lastUpdate)) return list;
      const copy = [...list]; copy[idx] = span; return copy;
    }
    const off = spanRealtime.onSpanUpsert(span => {
      // Filter based on mode
      if (mode === 'trace' && span.traceId !== id) return;
      if (mode === 'thread') {
        const thread = span.threadId || (span.attributes?.['threadId'] as string | undefined);
        // Accept if span itself tagged or its parent already in set (descendant) so thread expansion stays live
        if (thread !== id) {
          // We will decide after we know current state
          let accept = false;
          setSpans(prev => {
            if (thread === id) return upsert(prev, span);
            const parentPresent = span.parentSpanId ? prev.some(s => s.spanId === span.parentSpanId) : false;
            if (!parentPresent) return prev; // ignore unrelated
            accept = true;
            return upsert(prev, span);
          });
          if (!accept) return; // already handled via inner setState early return pattern
          return;
        }
      }
      setSpans(prev => upsert(prev, span));
      // After state queued, schedule selection if follow enabled (using refs to avoid effect re-run)
      if (followRef.current) {
        queueMicrotask(() => {
          setSpans(cur => {
            if (!followRef.current) return cur;
            const newest = [...cur].sort((a,b) => Date.parse(b.startTime) - Date.parse(a.startTime))[0];
            if (newest && (!selectedRef.current || selectedRef.current.spanId !== newest.spanId)) {
              setSelected(newest);
            }
            return cur;
          });
        });
      }
    });
    return () => { cancelled = true; off(); };
  }, [id, mode, fetcher]);

  const rows = useMemo(() => buildRows(spans, collapsed), [spans, collapsed]);
  const ruler = useMemo(() => buildRuler(spans), [spans]);
  const flatSpanIds = useMemo(() => rows.map(r => r.span.spanId), [rows]);

  // ArrowDown
  useHotkeys('arrowdown', e => {
    if (!flatSpanIds.length) return;
    e.preventDefault();
    if (!selected) {
      const first = spans.find(s => s.spanId === flatSpanIds[0]);
      if (first) setSelected(first);
      return;
    }
    const idx = flatSpanIds.indexOf(selected.spanId);
    const nextIdx = Math.min(flatSpanIds.length - 1, idx + 1);
    if (nextIdx !== idx) {
      const next = spans.find(s => s.spanId === flatSpanIds[nextIdx]);
      if (next) setSelected(next);
    }
  }, { enableOnFormTags: false, preventDefault: true }, [flatSpanIds, selected, spans]);

  // ArrowUp
  useHotkeys('arrowup', e => {
    if (!flatSpanIds.length) return;
    e.preventDefault();
    if (!selected) {
      const last = spans.find(s => s.spanId === flatSpanIds[flatSpanIds.length - 1]);
      if (last) setSelected(last);
      return;
    }
    const idx = flatSpanIds.indexOf(selected.spanId);
    const prevIdx = Math.max(0, idx - 1);
    if (prevIdx !== idx) {
      const prev = spans.find(s => s.spanId === flatSpanIds[prevIdx]);
      if (prev) setSelected(prev);
    }
  }, { enableOnFormTags: false, preventDefault: true }, [flatSpanIds, selected, spans]);

  // ArrowLeft
  useHotkeys('arrowleft', e => {
    if (!selected) return; e.preventDefault();
    const row = rows.find(r => r.span.spanId === selected.spanId);
    if (!row) return;
    if (row.hasChildren && !row.collapsed) { toggleCollapsed(row.span.spanId); return; }
    const parentId = selected.parentSpanId; if (parentId) { const parent = spans.find(s => s.spanId === parentId); if (parent) setSelected(parent); }
  }, { enableOnFormTags: false, preventDefault: true }, [rows, selected, spans, toggleCollapsed]);

  // ArrowRight
  useHotkeys('arrowright', e => {
    if (!selected) return; e.preventDefault();
    const row = rows.find(r => r.span.spanId === selected.spanId); if (!row) return;
    if (row.hasChildren) {
      if (row.collapsed) { toggleCollapsed(row.span.spanId); return; }
      const firstChildRowIndex = rows.findIndex(r => r.span.parentSpanId === row.span.spanId && r.depth === row.depth + 1);
      if (firstChildRowIndex !== -1) { const firstChild = rows[firstChildRowIndex].span; setSelected(firstChild); }
    }
  }, { enableOnFormTags: false, preventDefault: true }, [rows, selected, toggleCollapsed]);

  const titlePrefix = mode === 'trace' ? 'Trace' : 'Thread';
  const headerExtra = (
    <>
      {mode === 'thread' ? (
        <span style={{ fontWeight: 400, marginLeft: 12, fontSize: 11, color: '#666' }}>{rows.length} spans (thread view)</span>
      ) : (
        <span style={{ fontWeight: 400, marginLeft: 12, fontSize: 11, color: '#666' }}>{rows.length} spans</span>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setFollow(f => !f)}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid ' + (follow ? '#0d6efd' : '#ccc'),
            background: follow ? '#0d6efd' : '#f7f9fa',
            color: follow ? '#fff' : '#222',
            cursor: 'pointer'
          }}
          title="Automatically select newest span when it appears"
        >
          {follow ? 'Following' : 'Follow'}
        </button>
      </div>
    </>
  );

  // Ensure selected node stays visible with minimal scroll movement (must be before any early returns to keep hook order stable)
  useEffect(() => {
    if (!selected) return;
    const container = leftRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-span-id="${selected.spanId}"]`);
    if (!el) return;
    const cTop = container.scrollTop;
    const cBottom = cTop + container.clientHeight;
    const eTop = el.offsetTop;
    const eBottom = eTop + el.offsetHeight;
    if (eTop >= cTop && eBottom <= cBottom) return;
    if (eTop < cTop) { container.scrollTo({ top: eTop - 4 }); return; }
    if (eBottom > cBottom) { const delta = eBottom - cBottom; container.scrollTo({ top: cTop + delta + 4 }); }
  }, [selected, rows]);

  if (loading) return <div style={{ padding: 16 }}>Loading {titlePrefix.toLowerCase()}...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;

  return (
    <div data-testid="obsui-trace-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #ddd', background: '#f7f9fa', fontWeight: 600 }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#0366d6', fontWeight: 500, marginRight: 12, fontSize: 12 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
          <span>Back</span>
        </Link>
        {titlePrefix} {id}
        {headerExtra}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div ref={leftRef} onScroll={onScroll} style={{ width: 300, borderRight: '1px solid #ddd', overflow: 'auto' }} data-testid="obsui-trace-left">
          <div style={{ position: 'sticky', top: 0, height: HEADER_HEIGHT, background: '#fff', zIndex: 10, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', fontWeight: 600, padding: '0 8px' }}>Span</div>
          <SpanTree spans={spans} selectedId={selected?.spanId} onSelect={s => setSelected(s)} collapsedIds={collapsed} onToggle={toggleCollapsed} rows={rows.map(r => ({ span: r.span, depth: r.depth, hasChildren: r.hasChildren, collapsed: r.collapsed }))} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }} data-testid="obsui-trace-right">
          {!selected && (
            <div ref={rightRef} onScroll={onScroll} style={{ overflow: 'auto', height: '100%' }}>
              <div style={{ position: 'sticky', top: 0, height: HEADER_HEIGHT, background: '#fff', zIndex: 10, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                <div style={{ padding: '0 12px', marginRight: 8 }} data-testid="obsui-trace-timeline-header">Timeline</div>
                {!ruler.empty && (
                  <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                    {ruler.ticks.map(t => { const pct = ((t - ruler.min) / ruler.total) * 100; return <div key={t} style={{ position: 'absolute', left: pct + '%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />; })}
                    {ruler.ticks.map(t => { const pct = ((t - ruler.min) / ruler.total) * 100; const label = t - ruler.min + 'ms'; return <div key={t + '-lbl'} style={{ position: 'absolute', left: pct + '%', top: 2, fontSize: 10, paddingLeft: 2, transform: 'translateX(2px)' }}>{label}</div>; })}
                  </div>
                )}
              </div>
              <SpanTimeline rows={rows.map(r => ({ span: r.span, depth: r.depth, hasChildren: r.hasChildren, collapsed: r.collapsed }))} ruler={ruler} onSelect={(s: SpanDoc) => setSelected(s)} />
            </div>
          )}
          {selected && <SpanDetails span={selected} spans={spans} onSelectSpan={(s: SpanDoc) => setSelected(s)} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </div>
  );
}
