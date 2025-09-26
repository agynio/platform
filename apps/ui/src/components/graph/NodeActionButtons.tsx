
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
            <button className="h-6 px-2 rounded border text-[10px] disabled:opacity-50" onClick={onStart} disabled={!canStart}>
              Start
            </button>
            <button className="h-6 px-2 rounded border text-[10px] disabled:opacity-50" onClick={onStop} disabled={!canStop}>
              Stop
            </button>
          </>
        )}
        {pausable && (
          <>
            <button className="h-6 px-2 rounded border text-[10px] disabled:opacity-50" onClick={onPause} disabled={!canPauseBtn}>
              Pause
            </button>
            <button className="h-6 px-2 rounded border text-[10px] disabled:opacity-50" onClick={onResume} disabled={!canResumeBtn}>
              Resume
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default NodeActionButtons;
