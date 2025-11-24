import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RemindersLayout } from '@/components/reminders/RemindersLayout';
import { useAgentsReminders } from '@/features/reminders/hooks';

export function AgentsReminders() {
  const navigate = useNavigate();
  const remindersQ = useAgentsReminders('all');

  const handleViewThread = useCallback(
    (threadId: string) => {
      navigate(`/agents/threads/${threadId}`);
    },
    [navigate],
  );

  const handleRetry = useCallback(() => {
    void remindersQ.refetch();
  }, [remindersQ]);

  return (
    <RemindersLayout
      reminders={remindersQ.data}
      isLoading={remindersQ.isLoading}
      error={remindersQ.error ?? null}
      onRetry={handleRetry}
      onViewThread={handleViewThread}
    />
  );
}
