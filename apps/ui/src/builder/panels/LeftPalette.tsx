import { useDrag } from 'react-dnd';
import { DND_ITEM_NODE } from '../dnd';
import type { TemplateNodeSchema } from 'shared';
import { kindBadgeClasses, kindLabel } from '../lib/display';

interface PaletteItemProps {
  template: TemplateNodeSchema;
}
function PaletteItem({ template }: PaletteItemProps) {
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: DND_ITEM_NODE,
      // Align payload to standardized shape
      item: { template: template.name, title: template.title, kind: template.kind, origin: 'palette' as const },
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [template],
  );
  const setRef = (el: HTMLDivElement | null) => {
    if (el) dragRef(el);
  };
  return (
    <div
      ref={setRef}
      className={`cursor-move select-none rounded border bg-card px-2 py-1 text-xs shadow-sm flex items-center gap-2 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] leading-none ${kindBadgeClasses(template.kind)}`}>
        {kindLabel(template.kind)}
      </span>
      <span className="text-primary">{template.title || template.name}</span>
    </div>
  );
}

export function LeftPalette({ templates }: { templates: TemplateNodeSchema[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Nodes</div>
      {templates.map((t) => (
        <PaletteItem key={t.name} template={t} />
      ))}
    </div>
  );
}
