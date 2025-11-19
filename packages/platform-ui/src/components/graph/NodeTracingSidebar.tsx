import { useEffect, useState } from 'react';
import type { Node } from 'reactflow';
import { useTemplatesCache } from '@/lib/graph/templates.provider';
import { useNodeReminders } from '@/lib/graph/hooks';
import { graph as api } from '@/api/modules/graph';
import { notifyError, notifySuccess } from '@/lib/notify';

type BuilderPanelNodeData = {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
  dynamicConfig?: Record<string, unknown>;
};

function detectKind(templateKind: string | undefined, templateName: string): 'agent' | 'tool' | 'other' {
  if (templateKind === 'agent') return 'agent';
  if (templateKind === 'tool') return 'tool';
  if (/agent/i.test(templateName)) return 'agent';
  if (/tool/i.test(templateName)) return 'tool';
  return 'other';
}

export function NodeTracingSidebar({ node }: { node: Node<BuilderPanelNodeData> }) {
  return <NodeTracingSidebarBody node={node} />;
}

function NodeTracingSidebarBody({ node }: { node: Node<BuilderPanelNodeData> }) {
  const { getTemplate } = useTemplatesCache();
  const template = getTemplate(node.data.template);
  const kind = detectKind(template?.kind, node.data.template);

  const reminders = useNodeReminders(node.id, node.data.template === 'remindMeTool');
  const [runs, setRuns] = useState<Array<{ runId: string; threadId: string; status: string; updatedAt: string }>>([]);
  const [terminating, setTerminating] = useState<Record<string, boolean>>({});

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

    if (kind === 'agent') tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [node, kind]);

  async function onTerminate(runId: string) {
    const ok = typeof window !== 'undefined' ? window.confirm('Terminate this run?') : true;
    if (!ok) return;
    try {
      setTerminating((prev) => ({ ...prev, [runId]: true }));
      await api.terminateRun(runId);
      notifySuccess('Termination signaled');
      setRuns((prev) => prev.map((r) => (r.runId === runId ? { ...r, status: 'terminating' } : r)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notifyError(`Failed to terminate: ${msg}`);
    } finally {
      setTerminating((prev) => ({ ...prev, [runId]: false }));
    }
  }

  const title = kind === 'agent'
    ? 'Agent Activity'
    : kind === 'tool'
      ? 'Tool Activity'
      : 'Node Activity';

  return (
    <div className="space-y-2 text-xs">
      {node.data.template === 'remindMeTool' && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">Active Reminders</div>
          {reminders.isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : reminders.error ? (
            <div role="alert" className="text-red-700 border border-red-300 bg-red-50 rounded px-2 py-1 text-[11px]">
              {(() => {
                const err = reminders.error as unknown;
                const msg = err instanceof Error ? err.message : String(err);
                return `Failed to load reminders: ${msg}`;
              })()}
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
                      <button
                        className="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                        disabled={!!terminating[r.runId]}
                        onClick={() => onTerminate(r.runId)}
                      >
                        Terminate
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-[10px] uppercase text-muted-foreground">{title}</div>
      <div className="text-muted-foreground">
        Tracing has been removed from the platform. Span history and realtime tracing views are no longer available.
      </div>
    </div>
  );
}
