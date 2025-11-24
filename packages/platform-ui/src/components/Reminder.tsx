import { ReactNode, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface ReminderProps {
  content: ReactNode;
  scheduledTime: string;
  date?: string;
  className?: string;
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

export function Reminder({
  content,
  scheduledTime,
  date,
  className = '',
}: ReminderProps) {
  const [countdown, setCountdown] = useState<string>('');
  
  useEffect(() => {
    // Parse the date and time to create a target date
    const targetDate = date ? new Date(date) : new Date();
    const [hours, minutes] = scheduledTime.split(':');
    targetDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // Initial countdown
    setCountdown(getCountdown(targetDate));
    
    // Update countdown every minute
    const interval = setInterval(() => {
      setCountdown(getCountdown(targetDate));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [scheduledTime, date]);
  
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