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
      
    </div>
  );
}
