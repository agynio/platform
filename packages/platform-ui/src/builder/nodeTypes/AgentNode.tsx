import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { AgentData } from '../types';

interface Props { data: AgentData; }

function AgentNodeComponent({ data }: Props) {
  return (
    <div className="rounded-md border bg-card text-xs shadow-sm">
      <div className="drag-handle cursor-move select-none rounded-t-md bg-emerald-500/10 px-2 py-1 text-emerald-600 font-medium">{data.name}</div>
      <div className="p-2 space-y-1">
        <div className="text-[10px] text-muted-foreground">Model: {data.model}</div>
      </div>
      <Handle type="target" position={Position.Left} id="triggers" className="!h-2 !w-2" />
      <Handle type="source" position={Position.Right} id="tools" className="!h-2 !w-2" />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
