import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchTrace } from '../services/api';
import { SpanDoc } from '../types';
import { SpanDetails } from '../components/SpanDetails';

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

function TimeRuler({ spans }: { spans: SpanDoc[] }) {
  const completed = spans.filter(s => s.endTime);
  if (completed.length === 0) return null;
  const min = Math.min(...completed.map(s => Date.parse(s.startTime)));
  const max = Math.max(...completed.map(s => Date.parse(s.endTime!)));
  const total = max - min || 1;
  const ticks: number[] = [];
  const targetTickCount = 8;
  const rawInterval = total / targetTickCount;
  // nice interval (ms)
  const magnitudes = [1,2,5,10];
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  let best = rawInterval;
  for (const m of magnitudes) {
    const candidate = m * pow10;
    if (rawInterval <= candidate) { best = candidate; break; }
    best = candidate;
  }
  const first = Math.ceil(min / best) * best;
  for (let t = first; t <= max; t += best) ticks.push(t);
  return (
    <div style={{ position: 'sticky', top: 0, background: '#fafbfc', zIndex: 5, borderBottom: '1px solid #ddd', height: 24 }}>
      <div style={{ position: 'relative', height: '100%' }}>
        {ticks.map(t => {
          const pct = ((t - min) / total) * 100;
          return (
            <div key={t} style={{ position: 'absolute', left: pct + '%', top: 0, bottom: 0, width: 1, background: '#ccc' }} />
          );
        })}
        {ticks.map(t => {
          const pct = ((t - min) / total) * 100;
          const label = (t - min) + 'ms';
          return (
            <div key={t + '-lbl'} style={{ position: 'absolute', left: pct + '%', top: 0, fontSize: 10, paddingLeft: 2, transform: 'translateX(2px)' }}>{label}</div>
          );
        })}
      </div>
    </div>
  );
}

function TimelinePane({ rows, spans, onSelect }: { rows: RowData[]; spans: SpanDoc[]; onSelect(s: SpanDoc): void }) {
  const completed = spans.filter(s => s.endTime);
  if (completed.length === 0) return <div style={{ padding: 16 }}>No completed spans.</div>;
  const min = Math.min(...completed.map(s => Date.parse(s.startTime)));
  const max = Math.max(...completed.map(s => Date.parse(s.endTime!)));
  const total = max - min || 1;
  return (
    <div style={{ position: 'relative' }}>
      <TimeRuler spans={spans} />
      <div>
        {rows.map(r => {
          const s = r.span;
          const start = Date.parse(s.startTime);
          const end = Date.parse(s.endTime || s.startTime);
          const left = ((start - min) / total) * 100;
          const width = Math.max(0.5, ((end - start) / total) * 100);
          return (
            <div key={s.spanId} style={{ position: 'relative', height: 26 }}>
              <div
                onClick={() => onSelect(s)}
                title={s.label}
                style={{
                  position: 'absolute',
                  left: left + '%',
                  top: 4,
                  height: 18,
                  width: width + '%',
                  background: '#0d6efd33',
                  border: '1px solid #0d6efd66',
                  borderRadius: 4,
                  fontSize: 11,
                  lineHeight: '18px',
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
    </div>
  );
}

function TreePane({ rows, selectedId, onSelect }: { rows: RowData[]; selectedId?: string; onSelect(s: SpanDoc): void }) {
  return (
    <div>
      <div style={{ position: 'sticky', top: 0, background: '#fafbfc', zIndex: 5, fontWeight: 600, padding: '4px 8px', borderBottom: '1px solid #ddd' }}>Span</div>
      {rows.map(r => {
        const s = r.span;
        const isSelected = selectedId === s.spanId;
        return (
          <div key={s.spanId} style={{ display: 'flex', alignItems: 'center', height: 26, cursor: 'pointer', background: isSelected ? '#0d6efd10' : 'transparent' }} onClick={() => onSelect(s)}>
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
    return () => { cancelled = true; };
  }, [traceId]);

  const rows = useMemo(() => buildRows(spans), [spans]);
  const loadingEl = loading && (<div style={{ padding: 16 }}>Loading trace...</div>);
  const errorEl = !loading && error && (<div style={{ padding: 16, color: 'red' }}>Error: {error}</div>);
  const ready = !loading && !error;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {loadingEl || errorEl}
      {ready && (
        <div ref={containerRef} style={{ display: 'flex', flex: 1, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
          <div ref={leftRef} onScroll={onScroll} style={{ width: 300, borderRight: '1px solid #ddd', overflow: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, padding: '6px 8px', borderBottom: '1px solid #ddd', fontWeight: 600 }}>Trace {traceId}</div>
            <TreePane rows={rows} selectedId={selected?.spanId} onSelect={s => setSelected(s)} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!selected && (
              <div ref={rightRef} onScroll={onScroll} style={{ overflow: 'auto', height: '100%' }}>
                <h2 style={{ margin: '8px 12px 4px' }}>Timeline</h2>
                <TimelinePane rows={rows} spans={spans} onSelect={s => setSelected(s)} />
              </div>
            )}
            {selected && <SpanDetails span={selected} onClose={() => setSelected(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}
