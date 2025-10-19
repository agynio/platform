import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { SendSlackMessageData } from '../types';

interface Props { data: SendSlackMessageData; }

function SendSlackMessageNodeComponent({ data }: Props) {
  return (
    <div className="rounded-md border bg-card text-xs shadow-sm">
      <div className="drag-handle cursor-move select-none rounded-t-md bg-violet-500/10 px-2 py-1 text-violet-600 font-medium">{data.name}</div>
      <div className="p-2 space-y-1">
        <div className="text-[10px] text-muted-foreground">Channel: {data.channel}</div>
      </div>
      <Handle type="target" position={Position.Left} id="tool" className="!h-2 !w-2" />
    </div>
  );
}

export const SendSlackMessageNode = memo(SendSlackMessageNodeComponent);
