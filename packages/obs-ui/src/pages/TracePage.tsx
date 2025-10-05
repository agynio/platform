import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchTrace } from '../services/api';
import { spanRealtime } from '../services/socket';
import { SpanDoc } from '../types';
import { SpanDetails } from '../components/SpanDetails';

// Layout constants to keep visual alignment exact across panes
const HEADER_HEIGHT = 32; // px
const ROW_HEIGHT = 26; // px (data row height)
const BAR_HEIGHT = 18; // px (timeline bar visual height)
const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2; // centers bar within row

interface RowData { span: SpanDoc; depth: number; }

function buildRows(spans: SpanDoc[]): RowData[] {
  const byId: Record<string, SpanDoc> = Object.fromEntries(spans.map(s => [s.spanId, s]));
  function depth(s: SpanDoc): number {
    if (!s.parentSpanId) return 0;
    const p = byId[s.parentSpanId];
    if (!p) return 0;
    return depth(p) + 1;
  }
  const rows = spans.map(s => ({ span: s, depth: depth(s) }));
  rows.sort((a, b) => {
    const startA = Date.parse(a.span.startTime);
    const startB = Date.parse(b.span.startTime);
    return startA - startB;
  });
  return rows;
}

function buildRuler(spans: SpanDoc[]) {
  const completed = spans.filter(s => s.endTime);
  if (completed.length === 0) return { ticks: [], min: 0, total: 1, empty: true };
  const min = Math.min(...completed.map(s => Date.parse(s.startTime)));
  const max = Math.max(...completed.map(s => Date.parse(s.endTime!)));
  const total = max - min || 1;
  const targetTickCount = 8;
  const rawInterval = total / targetTickCount;
  const magnitudes = [1,2,5,10];
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  let best = rawInterval;
  for (const m of magnitudes) {
    const candidate = m * pow10;
    if (rawInterval <= candidate) { best = candidate; break; }
    best = candidate;
  }
  const ticks: number[] = [];
  const first = Math.ceil(min / best) * best;
  for (let t = first; t <= max; t += best) ticks.push(t);
  return { ticks, min, total, empty: false };
}

function TimelinePane({ rows, ruler, onSelect }: { rows: RowData[]; ruler: ReturnType<typeof buildRuler>; onSelect(s: SpanDoc): void }) {
  if (ruler.empty) return <div style={{ padding: 16 }}>No completed spans.</div>;
  const { min, total } = ruler;
  return (
    <div style={{ position: 'relative' }}>
      {rows.map(r => {
        const s = r.span;
        const start = Date.parse(s.startTime);
        const end = Date.parse(s.endTime || s.startTime);
        const left = ((start - min) / total) * 100;
        const width = Math.max(0.5, ((end - start) / total) * 100);
        return (
          <div key={s.spanId} style={{ position: 'relative', height: ROW_HEIGHT }}>
            <div
              onClick={() => onSelect(s)}
              title={s.label}
              style={{
                position: 'absolute',
                left: left + '%',
                top: BAR_TOP,
                height: BAR_HEIGHT,
                width: width + '%',
                background: '#0d6efd33',
                border: '1px solid #0d6efd66',
                borderRadius: 4,
                fontSize: 11,
                lineHeight: BAR_HEIGHT + 'px',
                padding: '0 4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function TreePane({ rows, selectedId, onSelect }: { rows: RowData[]; selectedId?: string; onSelect(s: SpanDoc): void }) {
  return (
    <div>
      {rows.map(r => {
        const s = r.span;
        const isSelected = selectedId === s.spanId;
        return (
          <div
            key={s.spanId}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: ROW_HEIGHT,
              cursor: 'pointer',
              background: isSelected ? '#0d6efd10' : 'transparent'
            }}
            onClick={() => onSelect(s)}
          >
            <div style={{ paddingLeft: 8 + r.depth * 12, fontFamily: 'monospace', fontSize: 12 }}>{s.label}</div>
            <div style={{ marginLeft: 6, fontSize: 10, color: '#666' }}>{s.status}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TracePage() {
  const { traceId } = useParams();
  const [spans, setSpans] = useState<SpanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpanDoc | null>(null);
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
    fetchTrace(traceId).then(d => { if (!cancelled) { setSpans(d); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    // Realtime subscription (global broadcast; filter locally)
    const off = spanRealtime.onSpanUpsert(span => {
      if (span.traceId !== traceId) return;
      setSpans(prev => {
        const idx = prev.findIndex(s => s.spanId === span.spanId);
        if (idx === -1) return [...prev, span];
        // Replace if newer (compare rev or lastUpdate)
        const existing = prev[idx];
        if (span.rev <= existing.rev && Date.parse(span.lastUpdate) <= Date.parse(existing.lastUpdate)) return prev;
        const copy = [...prev];
        copy[idx] = span;
        return copy;
      });
    });
    return () => { cancelled = true; };
  }, [traceId]);

  const rows = useMemo(() => buildRows(spans), [spans]);
  const ruler = useMemo(() => buildRuler(spans), [spans]);
  const loadingEl = loading && (<div style={{ padding: 16 }}>Loading trace...</div>);
  const errorEl = !loading && error && (<div style={{ padding: 16, color: 'red' }}>Error: {error}</div>);
  const ready = !loading && !error;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
      {loadingEl || errorEl}
      {ready && (
        <>
          {/* Global trace header */}
          <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #ddd', background: '#f7f9fa', fontWeight: 600 }}>
            Trace {traceId}
            <span style={{ fontWeight: 400, marginLeft: 12, fontSize: 11, color: '#666' }}>{rows.length} spans</span>
          </div>
          <div ref={containerRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left (tree) */}
            <div ref={leftRef} onScroll={onScroll} style={{ width: 300, borderRight: '1px solid #ddd', overflow: 'auto' }}>
              <div style={{ position: 'sticky', top: 0, height: HEADER_HEIGHT, background: '#fff', zIndex: 10, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', fontWeight: 600, padding: '0 8px' }}>Span</div>
              <TreePane rows={rows} selectedId={selected?.spanId} onSelect={s => setSelected(s)} />
            </div>
            {/* Right (timeline or details) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {!selected && (
                <div ref={rightRef} onScroll={onScroll} style={{ overflow: 'auto', height: '100%' }}>
                  <div style={{ position: 'sticky', top: 0, height: HEADER_HEIGHT, background: '#fff', zIndex: 10, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                    <div style={{ padding: '0 12px', marginRight: 8 }}>Timeline</div>
                    {!ruler.empty && (
                      <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                        {ruler.ticks.map(t => {
                          const pct = ((t - ruler.min) / ruler.total) * 100;
                          return <div key={t} style={{ position: 'absolute', left: pct + '%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />;
                        })}
                        {ruler.ticks.map(t => {
                          const pct = ((t - ruler.min) / ruler.total) * 100;
                          const label = (t - ruler.min) + 'ms';
                          return <div key={t + '-lbl'} style={{ position: 'absolute', left: pct + '%', top: 2, fontSize: 10, paddingLeft: 2, transform: 'translateX(2px)' }}>{label}</div>;
                        })}
                      </div>
                    )}
                  </div>
                  <TimelinePane rows={rows} ruler={ruler} onSelect={s => setSelected(s)} />
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
