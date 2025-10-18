import React, { useEffect, useState } from 'react';
import { Button, Table, Thead, Tbody, Tr, Th, Td } from '@hautech/ui';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TimeRangeSelector, defaultLast6h } from '../components/TimeRangeSelector';
import { fetchSpansInRange } from '../services/api';
import { SpanDoc } from '../types';
import { SpanDetails } from '../components/SpanDetails';
import { formatDuration } from '../utils/format';

export function ToolErrorsPage() {
  const { label: encoded } = useParams<{ label: string }>();
  const label = decodeURIComponent(encoded || '');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRange = getRangeFromParams(searchParams) || defaultLast6h();
  const [range, setRange] = useState(initialRange);
  const [items, setItems] = useState<SpanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<SpanDoc | null>(null);
  const navigate = useNavigate();

  useEffect(() => { setSearchParams({ from: range.from, to: range.to }, { replace: true }); }, [range.from, range.to]);

  // Reset pagination when label or range changes
  useEffect(() => { setCursor(undefined); }, [label, range.from, range.to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchSpansInRange(range, { status: 'error', label, sort: 'lastUpdate', limit: 50, cursor })
      .then((res) => { if (!cancelled) { setItems(res.items); setNextCursor(res.nextCursor); if (res.items.length && !selected) setSelected(res.items[0]); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, label, cursor]);

  const title = `Tool Errors — ${label}`;

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to={`/errors/tools?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`}>← Back</Link>
          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>
        <TimeRangeSelector value={range} onChange={(r) => { setCursor(undefined); setRange(r); }} />
      </div>
      {loading && <div style={{ paddingTop: 16 }}>Loading...</div>}
      {error && <div style={{ paddingTop: 16, color: 'red' }}>Error: {error}</div>}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, minHeight: 0, flex: 1 }}>
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid #eee', borderRadius: 6 }} data-testid="obsui-errors-list">
            <Table className="w-full" data-testid="obsui-errors-table">
              <Thead>
                <Tr>
                  <Th>Time</Th>
                  <Th>Trace</Th>
                  <Th>Span</Th>
                  <Th>Status</Th>
                  <Th>Duration</Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((s) => (
                  <Tr
                    key={s._id || s.spanId}
                    data-testid="obsui-errors-row"
                    data-trace-id={s.traceId}
                    data-span-id={s.spanId}
                    className={selected?.spanId === s.spanId ? 'bg-accent/50' : ''}
                    onClick={() => setSelected(s)}
                  >
                    <Td>{new Date(s.lastUpdate).toLocaleString()}</Td>
                    <Td className="font-mono">{s.traceId}</Td>
                    <Td className="font-mono">{s.spanId}</Td>
                    <Td>{s.status}</Td>
                    <Td>{s.endTime ? formatDuration(Date.parse(s.endTime) - Date.parse(s.startTime)) : 'running'}</Td>
                  </Tr>
                ))}
                {items.length === 0 && (
                  <Tr>
                    <Td colSpan={5} className="p-3">
                      No errors for this tool in range.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
            <div className="flex items-center justify-between p-2">
              <Button size="sm" variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)} data-testid="obsui-errors-reset">
                Reset
              </Button>
              <Button size="sm" disabled={!nextCursor} onClick={() => setCursor(nextCursor)} data-testid="obsui-errors-next">
                Next →
              </Button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, height: '70vh' }} data-testid="obsui-errors-detail">
            {selected ? (
              <SpanDetails span={selected} spans={[selected]} onSelectSpan={() => {}} onClose={() => navigate(-1)} />
            ) : (
              <div style={{ padding: 12 }}>Select a span to inspect IO and logs.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getRangeFromParams(sp: URLSearchParams) {
  const from = sp.get('from');
  const to = sp.get('to');
  if (from && to) return { from, to };
  return null;
}
