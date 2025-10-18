import React, { useEffect, useState } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td } from '@hautech/ui';
import { Link } from 'react-router-dom';
import { fetchTraces } from '../services/api';
import { spanRealtime } from '../services/socket';
import { SpanDoc } from '../types';
import { emojiHash3 } from '../utils/emojiId';

interface TraceSummary { traceId: string; root?: SpanDoc; spanCount: number; failedCount: number; lastUpdate: string; }

type AgentRootAttributes = { kind?: string; inputParameters?: unknown; threadId?: string };

export function TracesListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [conn, setConn] = useState<{ connected: boolean; lastPongTs: number | null }>({ connected: false, lastPongTs: null });

  useEffect(() => {
    let cancelled = false;
    fetchTraces().then(data => {
      if (cancelled) return;
  setTraces(data);
    }).catch(e => { if (!cancelled) setError(e.message || 'error'); }).finally(() => { if (!cancelled) setLoading(false); });
    // Realtime subscription: update/insert trace summaries
    const off = spanRealtime.onSpanUpsert(span => {
      setTraces(prev => {
        // derive summary fields
        let existing = prev.find(t => t.traceId === span.traceId);
        if (!existing) {
          const root = !span.parentSpanId ? span : undefined;
            const failedCount = span.status === 'error' ? 1 : 0;
            const next = [{ traceId: span.traceId, root, spanCount: 1, failedCount, lastUpdate: span.lastUpdate }, ...prev];
            return next.sort((a,b) => Date.parse(b.lastUpdate) - Date.parse(a.lastUpdate));
        }
        const updated = prev.map(t => {
          if (t.traceId !== span.traceId) return t;
          const root = t.root || (!span.parentSpanId ? span : undefined) || t.root;
          // We cannot reliably know if it's a new span vs update without tracking IDs; approximate: if rev===0 treat as new
          const spanCount = t.spanCount + (span.rev === 0 ? 1 : 0);
          const failedCount = t.failedCount + (span.rev === 0 && span.status === 'error' ? 1 : 0) + (span.rev > 0 && span.status === 'error' && t.failedCount === 0 ? 0 : 0); // basic increment only on creation
          return { ...t, root, lastUpdate: span.lastUpdate, spanCount, failedCount };
        });
        return updated.sort((a,b) => Date.parse(b.lastUpdate) - Date.parse(a.lastUpdate));
      });
    });
    const offConn = spanRealtime.onConnectionState(s => setConn(s));
    return () => { cancelled = true; offConn(); };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading traces...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 16 }} data-testid="obsui-traces-root">
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }} data-testid="obsui-traces-header">Traces
        <span style={{ fontSize: 11, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: conn.connected ? '#28a745' : '#ccc', boxShadow: conn.connected ? '0 0 4px #28a745' : 'none' }} />
          {conn.connected ? 'live' : 'offline'}
        </span>
      </h1>
      <Table data-testid="obsui-traces-table">
        <Thead>
          <Tr>
            <Th>Trace ID</Th>
            <Th>Thread ID</Th>
            <Th>Messages</Th>
            <Th>Root Label</Th>
            <Th>Status</Th>
            <Th>Spans</Th>
            <Th>Last Update</Th>
          </Tr>
        </Thead>
        <Tbody>
          {traces.map(t => (
            <Tr key={t.traceId} data-testid="obsui-traces-row" data-trace-id={t.traceId}>
              <Td><Link to={`/trace/${t.traceId}`}>{t.traceId}</Link></Td>
              <Td>
                {(() => {
                  const attrs = t.root?.attributes as AgentRootAttributes | undefined;
                  const attrThreadId = attrs?.threadId;
                  const threadId = t.root?.threadId ?? (typeof attrThreadId === 'string' ? attrThreadId : undefined);
                  if (!threadId) return '-';
                  const e3 = emojiHash3(threadId);
                  return (
                    <Link to={`/thread/${threadId}`} title={threadId} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ fontSize: 18, marginRight: 6 }}>{e3}</span>
                      <span style={{ color: '#6c757d', fontSize: 11 }}>({threadId})</span>
                    </Link>
                  );
                })()}
              </Td>
              <Td>
                {(() => {
                  const root = t.root;
                  const attrs = root?.attributes as AgentRootAttributes | undefined;
                  const isAgent = !root?.parentSpanId && attrs?.kind === 'agent';
                  if (!isAgent) return '-';
                  const msgs = extractMessagesFromInputParameters(attrs?.inputParameters);
                  if (msgs.length === 0) return '-';
                  const firstTwo = msgs.slice(0, 2);
                  const base = firstTwo.join(' | ');
                  const moreCount = msgs.length - firstTwo.length;
                  const suffix = moreCount > 0 ? ` (+${moreCount} more)` : '';
                  const MAX_CELL = 120;
                  let display = base + suffix;
                  if (display.length > MAX_CELL) {
                    const keep = Math.max(0, MAX_CELL - suffix.length - 1); // leave room for ellipsis
                    display = base.slice(0, keep) + '…' + suffix;
                  }
                  const fullCombined = msgs.join(' | ');
                  const fullLimited = fullCombined.length > 1000 ? fullCombined.slice(0, 1000) + '…' : fullCombined;
                  return (
                    <span title={fullLimited} aria-label={fullLimited}>
                      {display}
                    </span>
                  );
                })()}
              </Td>
              <Td data-testid="obsui-traces-root-label">{t.root?.label}</Td>
              <Td>{t.root?.status && <StatusBadge status={t.root.status} />}</Td>
              <Td>
                {t.spanCount} {t.failedCount > 0 && <span style={{ color: 'red' }}>({t.failedCount})</span>}
              </Td>
              <Td>{new Date(t.lastUpdate).toLocaleTimeString()}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: SpanDoc['status'] }) {
  const color = status === 'error' ? '#dc3545' : status === 'ok' ? '#28a745' : status === 'running' ? '#ffc107' : '#6c757d';
  const bg = status === 'running' ? '#fff3cd' : status === 'error' ? '#f8d7da' : status === 'ok' ? '#d4edda' : '#e2e3e5';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px', borderRadius: 12, background: bg, color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}

// Extract messages content strings from attributes.inputParameters in a defensive, type-safe way
function extractMessagesFromInputParameters(inputParameters: unknown): string[] {
  if (inputParameters == null) return [];

  const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
  const isMessageObject = (m: unknown): m is { content: string } =>
    isRecord(m) && typeof (m as { content?: unknown }).content === 'string';

  let ip: unknown = inputParameters;
  if (typeof ip === 'string') {
    try { ip = JSON.parse(ip); } catch { /* ignore parse error */ }
  }
  // If array, find first element that has messages
  if (Array.isArray(ip)) {
    // Only one element is expected to carry messages per schema; stop at first match.
    for (const item of ip) {
      const msgs = extractMessagesFromInputParameters(item);
      if (msgs.length) return msgs;
    }
    return [];
  }
  // If object with messages
  if (isRecord(ip)) {
    const raw = (ip as { messages?: unknown }).messages;
    if (Array.isArray(raw)) {
      const out: string[] = [];
      for (const m of raw) {
        if (typeof m === 'string') out.push(m);
        else if (isMessageObject(m)) out.push(m.content);
      }
      return out.filter((v) => typeof v === 'string' && v.length > 0);
    }
  }
  return [];
}
