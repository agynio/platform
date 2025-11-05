import { useDragLayer } from 'react-dnd';
import type { DragItem } from './dnd';

// Simple card preview that follows cursor while dragging from popover/palette
export function BuilderDragLayer() {
  const collected = useDragLayer((monitor) => ({
    item: monitor.getItem() as DragItem | null,
    isDragging: monitor.isDragging(),
    clientOffset: monitor.getClientOffset(),
    itemType: monitor.getItemType(),
  }));

  if (!collected.isDragging || !collected.clientOffset || !collected.item) return null;

  const { x, y } = collected.clientOffset;
  const label = collected.item.title || collected.item.template;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div
        style={{ transform: `translate(${x + 12}px, ${y + 12}px)` }}
        className="min-w-40 max-w-60 rounded-md border bg-card/80 px-3 py-2 text-xs text-card-foreground shadow-xl backdrop-blur-sm opacity-90"
      >
        <div className="font-medium truncate">{label}</div>
        {collected.item.kind && (
          <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{String(collected.item.kind)}</div>
        )}
        {collected.item.origin && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">From: {collected.item.origin}</div>
        )}
      </div>
    </div>
  );
}
