import React from 'react';
import { SpanDoc } from '../types';

export interface SpanTimelineRuler {
  ticks: number[];
  min: number;
  total: number;
  empty: boolean;
}

export interface SpanTimelineRow {
  span: SpanDoc;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface SpanTimelineProps {
  rows: SpanTimelineRow[];
  ruler: SpanTimelineRuler;
  barHeight?: number;
  rowHeight?: number;
  barTop?: number;
  onSelect(span: SpanDoc): void;
}

// Extracted from TracePage TimelinePane; now reusable and with error highlighting
export function SpanTimeline({ rows, ruler, onSelect, barHeight = 18, rowHeight = 26, barTop = (26 - 18) / 2 }: SpanTimelineProps) {
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
        const isError = s.status === 'error';
        return (
          <div key={s.spanId} style={{ position: 'relative', height: rowHeight }}>
            <div
              onClick={() => onSelect(s)}
              title={s.label}
              style={{
                position: 'absolute',
                left: left + '%',
                top: barTop,
                height: barHeight,
                width: width + '%',
                background: isError ? '#dc354566' : '#0d6efd33',
                border: isError ? '1px solid #dc3545' : '1px solid #0d6efd66',
                borderRadius: 4,
                fontSize: 11,
                lineHeight: barHeight + 'px',
                padding: '0 4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: isError ? '#66121a' : undefined,
                fontWeight: isError ? 600 : 400,
              }}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
