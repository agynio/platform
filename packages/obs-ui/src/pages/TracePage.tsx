import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchTrace } from '../services/api';
import { SpanDoc } from '../types';
import { SpanTree } from '../components/SpanTree';
import { Timeline } from '../components/Timeline';
import { SpanDetails } from '../components/SpanDetails';

export function TracePage() {
  const { traceId } = useParams();
  const [spans, setSpans] = useState<SpanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpanDoc | null>(null);

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    fetchTrace(traceId).then(d => { if (!cancelled) { setSpans(d); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [traceId]);

  const rootSpans = useMemo(() => spans.filter(s => !s.parentSpanId), [spans]);

  if (loading) return <div style={{ padding: 16 }}>Loading trace...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;

  const leftWidth = '30%';

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: leftWidth, borderRight: '1px solid #ddd', overflow: 'auto' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>Trace {traceId}</div>
        {rootSpans.map(r => (
          <SpanTree key={r.spanId} span={r} all={spans} selected={selected?.spanId} onSelect={s => setSelected(s)} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selected && <Timeline spans={spans} onSelect={s => setSelected(s)} />}
        {selected && <SpanDetails span={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
