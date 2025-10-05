import React, { useMemo, useState } from 'react';
import { SpanDoc } from '../types';

interface Props {
  span: SpanDoc;
  all: SpanDoc[];
  depth?: number;
  selected?: string;
  onSelect(span: SpanDoc): void;
}

export function SpanTree({ span, all, depth = 0, selected, onSelect }: Props) {
  const children = useMemo(() => all.filter(s => s.parentSpanId === span.spanId), [all, span.spanId]);
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selected === span.spanId;
  return (
    <div style={{ marginLeft: depth * 8 }}>
      <div
        onClick={() => onSelect(span)}
        style={{
          cursor: 'pointer',
          padding: '4px 6px',
          background: isSelected ? '#0d6efd10' : 'transparent',
          borderLeft: isSelected ? '3px solid #0d6efd' : '3px solid transparent'
        }}
      >
        {children.length > 0 && (
          <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{ marginRight: 4, display: 'inline-block', width: 12 }}>
            {open ? '▾' : '▸'}
          </span>
        )}
        <span style={{ fontFamily: 'monospace', color: '#555' }}>{span.label}</span>
        <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>{span.status}</span>
      </div>
      {open && children.map(ch => (
        <SpanTree key={ch.spanId} span={ch} all={all} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
