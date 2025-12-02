import { type ReactNode, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface ReminderProps {
  content: ReactNode;
  scheduledTime: string;
  date?: string;
  className?: string;
  utcTs?: string;
}

function getCountdown(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  
  if (diff <= 0) return 'now';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}

function resolveTargetDate(utcTs: string | undefined, date: string | undefined, scheduledTime: string): Date | null {
  if (utcTs) {
    const parsedUtc = new Date(utcTs);
    if (!Number.isNaN(parsedUtc.getTime())) {
      return parsedUtc;
    }
  }

  const [hours, minutes] = scheduledTime.split(':');
  const hourValue = Number.parseInt(hours, 10);
  const minuteValue = Number.parseInt(minutes, 10);
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) {
    return null;
  }

  const base = date ? new Date(date) : new Date();
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setHours(hourValue, minuteValue, 0, 0);
  return base;
}

export function Reminder({
  content,
  scheduledTime,
  date,
  className = '',
  utcTs,
}: ReminderProps) {
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    const targetDate = resolveTargetDate(utcTs, date, scheduledTime);
    if (!targetDate) {
      setCountdown('');
      return undefined;
    }

    const updateCountdown = () => {
      setCountdown(getCountdown(targetDate));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [utcTs, scheduledTime, date]);
  
  return (
    <div className={`flex justify-start mb-4 ${className}`}>
      <div className="flex gap-3 max-w-[70%]">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#FEF3C7' }}
        >
          <Bell className="w-4 h-4" style={{ color: '#F59E0B' }} />
        </div>

        {/* Message Content */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#F59E0B' }}>
              User
            </span>
            <span className="text-xs" style={{ color: '#F59E0B' }}>
              {scheduledTime}
            </span>
            {countdown && (
              <span className="text-xs" style={{ color: '#F59E0B' }}>
                ({countdown})
              </span>
            )}
          </div>
          <div style={{ color: '#F59E0B' }}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
