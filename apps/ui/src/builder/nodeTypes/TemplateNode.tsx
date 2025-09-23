import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useTemplates } from '../useTemplates';
import { getDisplayTitle, getKind, kindBadgeClasses, kindLabel } from '../lib/display';

interface BuilderNodeData {
  template: string;
  name?: string;
  config?: Record<string, unknown>;
}

function TemplateNodeComponent({ data }: NodeProps<BuilderNodeData>) {
  const { templates } = useTemplates();
  const schema = useMemo(() => templates.find((t) => t.name === data.template), [templates, data.template]);
  const targetPorts = schema?.targetPorts || [];
  const sourcePorts = schema?.sourcePorts || [];

  const displayTitle = getDisplayTitle(templates, data.template, data.config);
  const kind = getKind(templates, data.template);

  return (
    <div className="rounded-md border bg-card text-xs shadow-sm min-w-[220px]">
      <div className="drag-handle cursor-move select-none rounded-t-md bg-muted px-2 py-1 font-medium flex items-center gap-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] leading-none ${kindBadgeClasses(kind)}`}>
          {kindLabel(kind)}
        </span>
        <span>{displayTitle}</span>
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
