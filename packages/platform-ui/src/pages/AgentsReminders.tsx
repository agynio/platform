import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RemindersLayout } from '@/components/reminders/RemindersLayout';
import { useAgentsReminders } from '@/features/reminders/hooks';
import type { ListRemindersFilter, ListRemindersOrder, ListRemindersSort } from '@/features/reminders/api';

type UiFilter = 'all' | 'scheduled' | 'executed' | 'cancelled';

const FILTER_TO_API: Record<UiFilter, ListRemindersFilter> = {
  all: 'all',
  scheduled: 'active',
  executed: 'completed',
  cancelled: 'cancelled',
};

const PAGE_SIZE = 20;
const DEFAULT_SORT: ListRemindersSort = 'latest';
const DEFAULT_ORDER: ListRemindersOrder = 'desc';

export function AgentsReminders() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<UiFilter>('all');
  const [page, setPage] = useState(1);
  const remindersQ = useAgentsReminders(
    FILTER_TO_API[statusFilter],
    page,
    PAGE_SIZE,
    DEFAULT_SORT,
    DEFAULT_ORDER,
  );

  const handleViewThread = useCallback(
    (threadId: string) => {
      navigate(`/agents/threads/${threadId}`);
    },
    [navigate],
  );

  const handleFilterChange = useCallback((nextFilter: UiFilter) => {
    setStatusFilter(nextFilter);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  const handleRetry = useCallback(() => {
    void remindersQ.refetch();
  }, [remindersQ]);

  const data = remindersQ.data;

  const resolvedPage = data?.page ?? page;
  const resolvedPageSize = data?.pageSize ?? PAGE_SIZE;

  return (
    <RemindersLayout
      reminders={data?.items ?? []}
      countsByStatus={data?.countsByStatus}
      totalCount={data?.totalCount}
      page={resolvedPage}
      pageSize={resolvedPageSize}
      pageCount={data?.pageCount}
      filter={statusFilter}
      sortApplied={data?.sortApplied}
      onFilterChange={handleFilterChange}
      onPageChange={handlePageChange}
      isLoading={remindersQ.isLoading}
      error={remindersQ.error ?? null}
      onRetry={handleRetry}
      onViewThread={handleViewThread}
    />
  );
}
