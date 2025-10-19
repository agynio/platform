import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { SlackTriggerData } from '../types';

interface Props { data: SlackTriggerData; }

function SlackTriggerNodeComponent({ data }: Props) {
  return (
    <div className="rounded-md border bg-card text-xs shadow-sm">
      <div className="drag-handle cursor-move select-none rounded-t-md bg-blue-500/10 px-2 py-1 text-blue-600 font-medium">{data.name}</div>
      <div className="p-2 space-y-1">
        <div className="text-[10px] text-muted-foreground">Channel: {data.channel}</div>
      </div>
      <Handle type="source" position={Position.Right} id="trigger" className="!h-2 !w-2" />
    </div>
  );
}

export const SlackTriggerNode = memo(SlackTriggerNodeComponent);
