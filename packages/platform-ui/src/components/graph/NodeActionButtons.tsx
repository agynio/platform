
import { Button } from '@agyn/ui-new';

export interface NodeActionButtonsProps {
  provisionable: boolean;
  pausable: boolean;
  canStart: boolean;
  canStop: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function NodeActionButtons({ provisionable, pausable, canStart, canStop, onStart, onStop }: NodeActionButtonsProps) {
  if (!provisionable && !pausable) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase text-muted-foreground">Actions</div>
      <div className="flex flex-wrap items-center gap-2">
        {provisionable && (
          <>
            <Button size="sm" variant="outline" onClick={onStart} disabled={!canStart}>
              Provision
            </Button>
            <Button size="sm" variant="outline" onClick={onStop} disabled={!canStop}>
              Deprovision
            </Button>
          </>
        )}
        {/* Pause/Resume removed; buttons gated off */}
      </div>
    </div>
  );
}

export default NodeActionButtons;
