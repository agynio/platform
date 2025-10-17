
import { Button } from '@hautech/ui';

export interface NodeActionButtonsProps {
  provisionable: boolean;
  pausable: boolean;
  canStart: boolean;
  canStop: boolean;
  canPauseBtn: boolean;
  canResumeBtn: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function NodeActionButtons({
  provisionable,
  pausable,
  canStart,
  canStop,
  canPauseBtn,
  canResumeBtn,
  onStart,
  onStop,
  onPause,
  onResume,
}: NodeActionButtonsProps) {
  if (!provisionable && !pausable) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase text-muted-foreground">Actions</div>
      <div className="flex flex-wrap items-center gap-2">
        {provisionable && (
          <>
            <Button size="sm" variant="outline" onClick={onStart} disabled={!canStart}>
              Start
            </Button>
            <Button size="sm" variant="outline" onClick={onStop} disabled={!canStop}>
              Stop
            </Button>
          </>
        )}
        {pausable && (
          <>
            <Button size="sm" variant="outline" onClick={onPause} disabled={!canPauseBtn}>
              Pause
            </Button>
            <Button size="sm" variant="outline" onClick={onResume} disabled={!canResumeBtn}>
              Resume
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default NodeActionButtons;
