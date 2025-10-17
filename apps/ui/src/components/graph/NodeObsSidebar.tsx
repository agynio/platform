import { useEffect, useMemo, useState } from 'react';
import type { Node } from 'reactflow';
import type { SpanDoc } from '@/lib/obs/api';
import { fetchSpansInRange } from '@/lib/obs/api';
import { obsRealtime } from '@/lib/obs/socket';
import { useTemplatesCache } from '@/lib/graph/templates.provider';
import { useNodeReminders } from '@/lib/graph/hooks';
import { api } from '@/lib/graph/api';
import { notifyError, notifySuccess } from '@/lib/notify';

type BuilderPanelNodeData = {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;
};

const OBS_UI_BASE: string = import.meta.env.VITE_OBS_UI_BASE || 'http://localhost:4320';

function spanMatchesContext(span: SpanDoc, node: Node<BuilderPanelNodeData>, kind: 'agent' | 'tool') {
  const attrs = (span.attributes || {}) as Record<string, unknown>;
  const kindAttr = String(attrs['kind'] || '');
  const label = span.label || '';
  const nodeIdAttr = span.nodeId || (attrs['nodeId'] as string | undefined);
  const kindOk = kind === 'agent' ? (kindAttr === 'agent' || label === 'agent') : (kindAttr === 'tool_call' || label.startsWith('tool:'));
  if (!kindOk) return false;
  // Agent: filter by nodeId (agent id)
  if (kind === 'agent') return nodeIdAttr === node.id;
  // Tool: ONLY include spans where nodeId equals Tool id (no legacy fallback)
  return nodeIdAttr === node.id;
}

function summarizeStatus(s: SpanDoc['status']) {
  switch (s) {
    case 'running': return 'running';
    case 'ok': return 'ok';
    case 'error': return 'error';
    case 'cancelled': return 'cancelled';
    default: return String(s);
  }
}

export function NodeObsSidebar({ node }: { node: Node<BuilderPanelNodeData> }) {
  const [spans, setSpans] = useState<SpanDoc[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [runs, setRuns] = useState<Array<{ runId: string; threadId: string; status: string; updatedAt: string }>>([]);
  const { getTemplate } = useTemplatesCache();
  const tmpl = getTemplate(node.data.template);
  const kind: 'agent' | 'tool' | 'other' = (tmpl?.kind === 'agent' || /agent/i.test(node.data.template)) ? 'agent' : (tmpl?.kind === 'tool' ? 'tool' : 'other');
  const reminders = useNodeReminders(node.id, node.data.template === 'remindMeTool');

  if (kind === 'other') return null; // Only show for agent/tool nodes

  // Seed: last 24 hours from obs-server, optionally by label
  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const label = kind === 'agent' ? 'agent' : undefined; // optional label filter; tools use client-side filter
    fetchSpansInRange({ from, to, label, limit: 2000, sort: 'lastUpdate' })
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        const filtered = items.filter((s) => spanMatchesContext(s, node, kind === 'agent' ? 'agent' : 'tool'));
        if (filtered.length === 0) setNote('No spans for this node. Ensure nodeId is instrumented.');
        else setNote(null);
        // Order by lastUpdate desc and cap to 100
        const sorted = filtered.sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate)).slice(0, 100);
        setSpans(sorted);
      })
      .catch((err) => {
        console.warn('Failed to seed OBS spans', err);
      });
    return () => { cancelled = true; };
  }, [node.id, node.data.template, kind]);

  // Realtime subscription
  useEffect(() => {
    const off = obsRealtime.onSpanUpsert((s) => {
      if (!spanMatchesContext(s, node, kind === 'agent' ? 'agent' : 'tool')) return;
      setSpans((prev) => {
        const next = [s, ...prev.filter((p) => !(p.traceId === s.traceId && p.spanId === s.spanId))];
        next.sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate));
        return next.slice(0, 100);
      });
    });
    return () => { off(); };
  }, [node.id, node.data.template, kind]);

  // Poll active runs every ~3s for agent nodes
  useEffect(() => {
    if (kind !== 'agent') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await api.listNodeRuns(node.id, 'all');
        if (cancelled) return;
        const items = (res.items || []).map((r) => ({ runId: r.runId, threadId: r.threadId, status: r.status, updatedAt: r.updatedAt }));
        setRuns(items);
      } catch (e) {
        // mask errors in UI; devtools will show console
      } finally {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [node.id, kind]);

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

  const items = useMemo(() => spans.map((s) => ({
    span: s,
    link: `${OBS_UI_BASE}/trace/${encodeURIComponent(s.traceId)}`,
  })), [spans]);

  const title = kind === 'agent' ? 'Agent Activity' : 'Tool Spans (24h)';

  return (
    <div className="space-y-2 text-xs">
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
                <span className="px-1.5 py-0.5 rounded border bg-accent/20 text-[10px]">{summarizeStatus(span.status)}</span>
                <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[11px]">open</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
