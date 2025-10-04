import React, { useMemo } from 'react';
import { SpanDoc } from '../types';

interface Props { spans: SpanDoc[]; onSelect(span: SpanDoc): void; }

export function Timeline({ spans, onSelect }: Props) {
  const completed = spans.filter(s => s.endTime);
  if (completed.length === 0) return <div style={{ padding: 16 }}>No completed spans to render timeline.</div>;
  const min = Math.min(...completed.map(s => Date.parse(s.startTime)));
  const max = Math.max(...completed.map(s => Date.parse(s.endTime!)));
  const total = max - min || 1;

  function widthPct(s: SpanDoc) {
    return ((Date.parse(s.endTime!) - Date.parse(s.startTime)) / total) * 100;
  }
  function offsetPct(s: SpanDoc) {
    return ((Date.parse(s.startTime) - min) / total) * 100;
  }

  const byDepth = useMemo(() => {
    const depthMap: Record<string, number> = {};
    function depth(span: SpanDoc): number {
      if (!span.parentSpanId) return 0;
      const parent = spans.find(s => s.spanId === span.parentSpanId);
      if (!parent) return 0;
      if (depthMap[parent.spanId] != null) return depthMap[parent.spanId] + 1;
      return depth(parent) + 1;
    }
    const result: Array<{ span: SpanDoc; depth: number }> = spans.map(s => ({ span: s, depth: depth(s) }));
    result.sort((a,b) => a.depth - b.depth || Date.parse(a.span.startTime) - Date.parse(b.span.startTime));
    return result;
  }, [spans]);

  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Timeline</h2>
      <div style={{ position: 'relative', border: '1px solid #ddd', padding: 8, borderRadius: 4 }}>
        {byDepth.map(({ span, depth }) => (
          <div key={span.spanId} style={{ position: 'relative', height: 28 }}>
            <div
              onClick={() => onSelect(span)}
              title={span.label}
              style={{
                position: 'absolute',
                left: offsetPct(span) + '%',
                top: 4,
                height: 20,
                width: widthPct(span) + '%',
                background: '#0d6efd33',
                border: '1px solid #0d6efd66',
                borderRadius: 4,
                fontSize: 11,
                lineHeight: '20px',
                padding: '0 4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transform: `translateY(${depth * 26}px)`
              }}
            >
              {span.label}
            </div>
          </div>
        ))}
        <div style={{ height: (Math.max(...byDepth.map(d => d.depth)) + 1) * 26 + 16 }} />
      </div>
    </div>
  );
}
