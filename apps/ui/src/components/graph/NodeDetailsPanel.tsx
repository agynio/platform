// React import not needed with react-jsx runtime
import { Button, Badge } from '@hautech/ui';
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
        <Badge variant="accent">Template: {templateName}</Badge>
        <Badge variant={provisionState === 'ready' ? 'secondary' : provisionState === 'error' ? 'destructive' : 'neutral'}>
          {provisionState}
        </Badge>
        {tmpl?.capabilities?.pausable && <Badge variant="outline">pausable</Badge>}
        {tmpl?.capabilities?.pausable && isReady && isPaused && <Badge variant="outline">paused</Badge>}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={provisionState !== 'not_ready'}
          onClick={() => action.mutate('provision')}
        >Start</Button>
        {tmpl?.capabilities?.pausable && isReady && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => action.mutate(isPaused ? 'resume' : 'pause')}
          >{isPaused ? 'Resume' : 'Pause'}</Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isReady}
          onClick={() => action.mutate('deprovision')}
        >Stop</Button>
      </div>
    </div>
  );
}
