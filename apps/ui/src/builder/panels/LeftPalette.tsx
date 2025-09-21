import { useDrag } from 'react-dnd';
import { DND_ITEM_NODE } from '../dnd';
import type { TemplateNodeSchema } from 'shared';

interface PaletteItemProps {
  template: string;
}
function PaletteItem({ template }: PaletteItemProps) {
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: DND_ITEM_NODE,
      item: { kind: template },
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
      className={`cursor-move select-none rounded border bg-card px-2 py-1 text-xs shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="text-primary">{template}</span>
    </div>
  );
}

export function LeftPalette({ templates }: { templates: TemplateNodeSchema[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Nodes</div>
      {templates.map((t) => (
        <PaletteItem key={t.name} template={t.name} />
      ))}
    </div>
  );
}
