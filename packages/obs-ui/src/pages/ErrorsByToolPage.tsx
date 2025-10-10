import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TimeRangeSelector, defaultLast6h } from '../components/TimeRangeSelector';
import { fetchErrorsByTool, ErrorsByToolItem } from '../services/api';

export function ErrorsByToolPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRange = getRangeFromParams(searchParams) || defaultLast6h();
  const [range, setRange] = useState(initialRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ErrorsByToolItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setSearchParams({ from: range.from, to: range.to }, { replace: true });
    let cancelled = false;
    setLoading(true); setError(null);
    fetchErrorsByTool(range, { limit: 50 }).then((res) => {
      if (!cancelled) setItems(res.items);
    }).catch((e) => { if (!cancelled) setError(e.message || 'error'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Errors by Tool</h1>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>
      {loading && <div style={{ paddingTop: 16 }}>Loading...</div>}
      {error && <div style={{ paddingTop: 16, color: 'red' }}>Error: {error}</div>}
      {!loading && !error && items.length === 0 && <div style={{ paddingTop: 16 }}>No data in selected range.</div>}
      {!loading && !error && items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Tool Label</th>
              <th>Error Count</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.label} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => navigate(`/errors/tools/${encodeURIComponent(it.label)}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)}>
                <td>{it.label}</td>
                <td>{it.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
