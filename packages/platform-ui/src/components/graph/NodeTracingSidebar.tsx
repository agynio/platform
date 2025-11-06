import { useEffect, useMemo, useState } from 'react';
import type { Node } from 'reactflow';
import type { SpanDoc, SpanExtras } from '@/api/tracing';
import { fetchSpansInRange } from '@/api/tracing';
import { tracingRealtime } from '@/lib/tracing/socket';
import { useTemplatesCache } from '@/lib/graph/templates.provider';
import { useNodeReminders } from '@/lib/graph/hooks';
import { api } from '@/api/graph';
import { notifyError, notifySuccess } from '@/lib/notify';
import { Link } from 'react-router-dom';

type BuilderPanelNodeData = {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;
};

// Use internal routing for trace links

function getAttributes(span: { attributes?: Record<string, unknown> }): Record<string, unknown> {
  return (span.attributes && typeof span.attributes === 'object') ? span.attributes : {};
}

function getStatus(span: SpanDoc & { attributes?: Record<string, unknown> }): string | undefined {
  const attr = getAttributes(span);
  const v = attr.status;
  return typeof v === 'string' ? v : undefined;
}

function getLabel(span: unknown): string | undefined {
  const label = (span as { label?: unknown })?.label;
  return typeof label === 'string' ? label : undefined;
}

function getNodeId(span: (SpanDoc & Partial<SpanExtras>) & { attributes?: Record<string, unknown> }): string | undefined {
  if (typeof (span as { nodeId?: unknown }).nodeId === 'string') return (span as { nodeId?: string }).nodeId;
  const attr = getAttributes(span).nodeId;
  return typeof attr === 'string' ? attr : undefined;
}

function getKind(span: SpanDoc & { attributes?: Record<string, unknown> }): 'agent' | 'tool' | undefined {
  const kindAttr = getAttributes(span).kind;
  const kind = typeof kindAttr === 'string' ? kindAttr : undefined;
  if (kind === 'agent') return 'agent';
  if (kind === 'tool_call') return 'tool';
  const label = getLabel(span);
  if (label === 'agent') return 'agent';
  if (label && label.startsWith('tool:')) return 'tool';
  return undefined;
}

function spanMatchesContext(span: (SpanDoc & Partial<SpanExtras>) & { attributes?: Record<string, unknown> }, node: Node<BuilderPanelNodeData>, kind: 'agent' | 'tool') {
  const detected = getKind(span);
  const kindOk = detected === kind;
  if (!kindOk) return false;
  const nodeId = getNodeId(span);
  return nodeId === node.id;
}

function summarizeStatus(s?: unknown) {
  const v = String(s || '');
  switch (s) {
    case 'running': return 'running';
    case 'ok': return 'ok';
    case 'error': return 'error';
    case 'cancelled': return 'cancelled';
    default: return v || '-';
  }
}

export function NodeTracingSidebar({ node }: { node: Node<BuilderPanelNodeData> }) {
  return <NodeTracingSidebarBody node={node} />;
}

function NodeTracingSidebarBody({ node }: { node: Node<BuilderPanelNodeData> }) {
  const [spans, setSpans] = useState<Array<SpanDoc & Partial<SpanExtras>>>([]);
  const [note, setNote] = useState<string | null>(null);
  const [runs, setRuns] = useState<Array<{ runId: string; threadId: string; status: string; updatedAt: string }>>([]);
  const { getTemplate } = useTemplatesCache();
  const tmpl = getTemplate(node.data.template);
  const kind: 'agent' | 'tool' | 'other' = (tmpl?.kind === 'agent' || /agent/i.test(node.data.template)) ? 'agent' : (tmpl?.kind === 'tool' ? 'tool' : 'other');
  const reminders = useNodeReminders(node.id, node.data.template === 'remindMeTool');

  // Seed: last 24 hours from tracing-server
  useEffect(() => {
    if (kind === 'other') return;
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    fetchSpansInRange(from, to)
      .then((items: SpanDoc[]) => {
        if (cancelled) return;
        const filtered = items.filter((s) => spanMatchesContext(s, node, kind === 'agent' ? 'agent' : 'tool')) as Array<SpanDoc & Partial<SpanExtras>>;
        if (filtered.length === 0) setNote('No spans for this node. Ensure nodeId is instrumented.');
        else setNote(null);
        // Order by lastUpdate desc and cap to 100
        const getTs = (s: SpanDoc & Partial<SpanExtras>) => {
          const lu = typeof s.lastUpdate === 'string' ? s.lastUpdate : undefined;
          const ended = typeof s.endedAt === 'string' ? s.endedAt : undefined;
          return lu || ended || s.startedAt;
        };
        const sorted = filtered.sort((a, b) => getTs(b).localeCompare(getTs(a))).slice(0, 100);
        setSpans(sorted);
      })
      .catch((err) => {
        console.warn('Failed to seed tracing spans', err);
      });
    return () => { cancelled = true; };
  }, [node, kind]);

  // Realtime subscription
  useEffect(() => {
    if (kind === 'other') return;
    const off = tracingRealtime.onSpanUpsert((s) => {
      if (!spanMatchesContext(s, node, kind === 'agent' ? 'agent' : 'tool')) return;
      setSpans((prev: Array<SpanDoc & Partial<SpanExtras>>) => {
        const next: Array<SpanDoc & Partial<SpanExtras>> = [s, ...prev.filter((p) => !(p.traceId === s.traceId && p.spanId === s.spanId))];
        const getTs = (x: SpanDoc & Partial<SpanExtras>) => {
          const lu = typeof x.lastUpdate === 'string' ? x.lastUpdate : undefined;
          const ended = typeof x.endedAt === 'string' ? x.endedAt : undefined;
          return lu || ended || x.startedAt;
        };
        next.sort((a, b) => getTs(b).localeCompare(getTs(a)));
        return next.slice(0, 100);
      });
    });
    return () => { off(); };
  }, [node, kind]);

  // Poll active runs every ~3s for agent nodes
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await api.listNodeRuns(node.id, 'all');
        if (cancelled) return;
        const items = (res.items || []).map((r) => ({ runId: r.runId, threadId: r.threadId, status: r.status, updatedAt: r.updatedAt }));
        setRuns(items);
      } catch {
        /* no-op */
      } finally {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    };
    if (kind === 'agent') {
      tick();
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [node, kind]);

  const [terminating, setTerminating] = useState<Record<string, boolean>>({});
  async function onTerminate(runId: string) {
    const ok = typeof window !== 'undefined' ? window.confirm('Terminate this run?') : true;
    if (!ok) return;
    try {
      setTerminating((prev) => ({ ...prev, [runId]: true }));
      await api.terminateRun(node.id, runId);
      notifySuccess('Termination signaled');
      // locally mark as terminating immediately
      setRuns((prev) => prev.map((r) => (r.runId === runId ? { ...r, status: 'terminating' } : r)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notifyError(`Failed to terminate: ${msg}`);
    } finally {
      setTerminating((prev) => ({ ...prev, [runId]: false }));
    }
  }

  const items = useMemo(() => spans.map((s: SpanDoc & Partial<SpanExtras>) => ({
    span: s,
    link: `/tracing/trace/${encodeURIComponent(s.traceId)}`,
  })), [spans]);

  const title = kind === 'agent' ? 'Agent Activity' : kind === 'tool' ? 'Tool Spans (24h)' : 'Spans';

  return (
    <div className="space-y-2 text-xs">
      {kind === 'other' ? (
        <div className="text-muted-foreground">No spans to display.</div>
      ) : null}
      {node.data.template === 'remindMeTool' && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">Active Reminders</div>
          {reminders.isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : reminders.error ? (
            <div role="alert" className="text-red-700 border border-red-300 bg-red-50 rounded px-2 py-1 text-[11px]">
              {(() => { const e = reminders.error as unknown; const msg = e instanceof Error ? e.message : String(e); return `Failed to load reminders: ${msg}`; })()}
            </div>
          ) : (reminders.data?.items?.length || 0) === 0 ? (
            <div className="text-muted-foreground">None</div>
          ) : (
            <ul className="divide-y border rounded">
              {reminders.data!.items.map((r) => (
                <li key={r.id} className="px-2 py-1 flex items-center justify-between" aria-label={`Reminder for thread ${r.threadId}`}>
                  <div className="truncate mr-2">
                    <div className="text-[11px]">{r.note}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">thread: {r.threadId}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground" aria-label={`Scheduled at ${new Date(r.at).toLocaleString()}`}>
                    {new Date(r.at).toLocaleTimeString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="text-[10px] uppercase text-muted-foreground">{title}</div>
      {kind === 'agent' && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">Active Runs</div>
          {runs.length === 0 ? (
            <div className="text-muted-foreground">None</div>
          ) : (
            <ul className="divide-y border rounded">
              {runs.map((r) => (
                <li key={r.runId} className="px-2 py-1 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <div className="text-[11px] font-mono truncate">{r.threadId}</div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{r.runId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded border bg-accent/20 text-[10px]">{r.status}</span>
                    {r.status === 'running' && (
                      <button className="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                        disabled={!!terminating[r.runId]}
                        onClick={() => onTerminate(r.runId)}
                      >Terminate</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {note && <div className="text-[10px] italic text-muted-foreground">{note}</div>}
      {items.length === 0 ? (
        <div className="text-muted-foreground">No spans yet.</div>
      ) : (
        <ul className="divide-y border rounded">
          {items.map(({ span, link }) => (
            <li key={span.traceId + ':' + span.spanId} className="px-2 py-1 flex items-center justify-between hover:bg-accent/20">
              <div className="truncate mr-2">
                <div className="font-mono text-[11px] truncate">{span.spanId}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{span.traceId}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded border bg-accent/20 text-[10px]">{summarizeStatus(getStatus(span))}</span>
                <Link to={link} className="text-blue-600 hover:underline text-[11px]">open</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
