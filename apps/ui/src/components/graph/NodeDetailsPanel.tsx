import React from 'react';
import { useNodeStatus, useNodeAction } from '../../lib/graph/hooks';
import { useTemplatesCache } from '../../lib/graph/templates.provider';

interface Props { nodeId: string; templateName: string; }

export default function NodeDetailsPanel({ nodeId, templateName }: Props) {
  const { data: status } = useNodeStatus(nodeId);
  const action = useNodeAction(nodeId);
  const { getTemplate } = useTemplatesCache();
  const tmpl = getTemplate(templateName);

  // Default to not_ready (tests expect this baseline) until first fetch resolves
  const provisionState = status?.provisionStatus?.state || 'not_ready';
  const isReady = provisionState === 'ready';
  const isPaused = !!status?.isPaused;

  return (
    <div className="space-y-2 text-xs">
      <h3 className="font-semibold text-sm">Node {nodeId}</h3>
      <div className="flex flex-wrap gap-1 items-center">
        <span className="px-1.5 py-0.5 rounded border bg-accent/20">Template: {templateName}</span>
        <span className="px-1.5 py-0.5 rounded border bg-accent/20">{provisionState}</span>
        {tmpl?.capabilities?.pausable && <span className="px-1.5 py-0.5 rounded border bg-accent/20">pausable</span>}
        {tmpl?.capabilities?.pausable && isReady && isPaused && (
          <span className="px-1.5 py-0.5 rounded border bg-accent/20">paused</span>
        )}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={provisionState !== 'not_ready'}
          onClick={() => action.mutate('provision')}
        >Start</button>
        {tmpl?.capabilities?.pausable && isReady && (
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-50"
            onClick={() => action.mutate(isPaused ? 'resume' : 'pause')}
          >{isPaused ? 'Resume' : 'Pause'}</button>
        )}
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={!isReady}
          onClick={() => action.mutate('deprovision')}
        >Stop</button>
      </div>
    </div>
  );
}
