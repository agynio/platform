import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useTemplates } from '../useTemplates';
import { getDisplayTitle, getKind, kindBadgeClasses, kindLabel } from '../lib/display';
import { useRunningCount } from '../../lib/obs/runningStore';
<<<<<<< HEAD
import { useReminderCount, useNodeStatus } from '@/lib/graph/hooks';
=======
import { useNodeReminders, useNodeStatus } from '@/lib/graph/hooks';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
import { useNodeVaultStatus } from '@/lib/vault/useNodeVaultStatus';

interface BuilderNodeData {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
}

function TemplateNodeComponent({ id, data }: NodeProps<BuilderNodeData>) {
  const { templates } = useTemplates();
  const schema = useMemo(() => templates.find((t) => t.name === data.template), [templates, data.template]);
  const targetPorts = schema?.targetPorts || [];
  const sourcePorts = schema?.sourcePorts || [];

  const displayTitle = getDisplayTitle(templates, data.template, data.config);
  const kind = getKind(templates, data.template);
  const runningCount = useRunningCount(id, kind === 'agent' || kind === 'tool' ? (kind as 'agent' | 'tool') : undefined);
<<<<<<< HEAD
  const reminderCountQ = useReminderCount(id, data.template === 'remindMeTool');
  const reminderCount = (reminderCountQ.data?.count || 0) as number;
=======
  const reminders = useNodeReminders(id, data.template === 'remindMeTool');
  const reminderCount = (reminders.data?.items?.length || 0) as number;
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
  const nodeStatus = useNodeStatus(id);
  const vaultAgg = useNodeVaultStatus(data?.config);

  const provisionError =
    nodeStatus.data?.provisionStatus?.state === 'error' ||
    nodeStatus.data?.provisionStatus?.state === 'provisioning_error' ||
    nodeStatus.data?.provisionStatus?.state === 'deprovisioning_error';
  const hasVaultError = (vaultAgg?.error || 0) > 0;
  const hasMissing = (vaultAgg?.missing || 0) > 0;
  const borderClasses = provisionError || hasVaultError
    ? 'border-red-500 ring-2 ring-red-500'
    : hasMissing
      ? 'border-amber-400 border-dashed ring-2 ring-amber-400'
      : '';

  return (
    <div className={`rounded-md border bg-card text-xs shadow-sm min-w-[220px] ${borderClasses}`}>
      <div className="drag-handle cursor-move select-none rounded-t-md bg-muted px-2 py-1 font-medium flex items-center gap-2 relative">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] leading-none ${kindBadgeClasses(kind)}`}>
          {kindLabel(kind)}
        </span>
        <span className="mr-1">{displayTitle}</span>
        {runningCount > 0 ? (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none bg-emerald-100 text-emerald-700 border border-emerald-200">
            {runningCount}
          </span>
        ) : null}
        {/* Reminders badge specific to Remind Me tool */}
        {data.template === 'remindMeTool' && reminderCount > 0 ? (
          <span
            aria-label={`Active reminders: ${reminderCount}`}
            title={`Active reminders: ${reminderCount}`}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none bg-amber-100 text-amber-900 border border-amber-300"
          >
            {reminderCount}
          </span>
        ) : null}
        {(hasVaultError || hasMissing) && (
          <span
            className={
              'absolute right-2 top-1 rounded px-1.5 py-0.5 text-[10px] leading-none border pointer-events-none ' +
              (hasVaultError ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-100 text-amber-900 border-amber-300')
            }
            title={hasVaultError ? 'vault error' : `${vaultAgg.missing} missing secrets`}
          >
            {hasVaultError ? 'error' : vaultAgg.missing}
          </span>
        )}
      </div>
      <div className="px-2 py-2">
        <div className="flex items-stretch gap-3">
          <div className="flex flex-col gap-1 items-start min-w-[70px]">
            {targetPorts.length === 0 && (
              <div className="text-[10px] text-muted-foreground italic">no inputs</div>
            )}
            {targetPorts.map((p) => (
              <div key={p} className="relative pl-3 pr-2 py-0.5 rounded bg-muted/50">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={p}
                  className="!h-2 !w-2 !bg-emerald-500 absolute left-0 top-1/2 -translate-y-1/2"
                />
                <span className="text-[10px] leading-none">{p}</span>
              </div>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex flex-col gap-1 items-end min-w-[70px]">
            {sourcePorts.length === 0 && (
              <div className="text-[10px] text-muted-foreground italic">no outputs</div>
            )}
            {sourcePorts.map((p) => (
              <div key={p} className="relative pr-3 pl-2 py-0.5 rounded bg-muted/50">
                <span className="text-[10px] leading-none mr-1">{p}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={p}
                  className="!h-2 !w-2 !bg-blue-500 absolute right-0 top-1/2 -translate-y-1/2"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const TemplateNode = memo(TemplateNodeComponent);
