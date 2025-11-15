import { useEffect, useId, useMemo, useRef, useState } from 'react';

type ReminderCountdownProps = {
  threadId: string;
  at: string;
  note: string;
  serverOffsetMs?: number;
  onExpire?: () => void;
};

export function ReminderCountdown({ threadId, at, note, serverOffsetMs = 0, onExpire }: ReminderCountdownProps) {
  const targetTs = useMemo(() => new Date(at).getTime(), [at]);
  const [remainingMs, setRemainingMs] = useState<number>(() => targetTs - (Date.now() + serverOffsetMs));
  const expiredRef = useRef(false);
  const labelId = useId();
  const liveId = useId();

  useEffect(() => {
    let intervalId: number | null = null;
    const calc = () => targetTs - (Date.now() + serverOffsetMs);
    const tick = () => {
      const next = calc();
      setRemainingMs(Math.max(next, 0));
      if (next <= 0 && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    tick();
    intervalId = window.setInterval(tick, 1000);
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [targetTs, serverOffsetMs]);

  useEffect(() => {
    if (remainingMs <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    } else {
      expiredRef.current = false;
    }
  }, [remainingMs, onExpire]);

  const isExpired = remainingMs <= 0;
  const formatted = useMemo(() => {
    if (isExpired) return 'due now';
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hoursPart = String(hours).padStart(2, '0');
    const minutesPart = String(minutes).padStart(2, '0');
    const secondsPart = String(seconds).padStart(2, '0');
    return `${hoursPart}:${minutesPart}:${secondsPart}`;
  }, [remainingMs, isExpired]);

  return (
    <div
      className="rounded border border-amber-300 bg-amber-50 text-amber-900 shadow px-4 py-3 max-w-md"
      role="status"
      aria-labelledby={labelId}
      aria-describedby={liveId}
    >
      <div id={labelId} className="text-sm font-semibold flex items-center gap-2">
        Reminder for thread{' '}
        <span className="font-mono text-xs bg-white/70 px-1.5 py-0.5 rounded border">
          {threadId.slice(0, 8)}
        </span>
      </div>
      <div className="mt-1 text-sm" title={note}>
        {note}
      </div>
      <div
        id={liveId}
        className={`mt-2 text-sm font-medium ${isExpired ? 'text-red-600' : 'text-amber-800'}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {isExpired ? 'Reminder reached' : `Due in ${formatted}`}
      </div>
    </div>
  );
}
