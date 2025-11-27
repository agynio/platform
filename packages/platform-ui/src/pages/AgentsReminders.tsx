import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RemindersLayout } from '@/components/reminders/RemindersLayout';
import { useAgentsReminders } from '@/features/reminders/hooks';
import type {
  ListRemindersFilter,
  ListRemindersSortBy,
  ListRemindersSortOrder,
  ReminderStatusCounts,
  ReminderStatusFilter,
} from '@/features/reminders/types';

const STATUS_TO_API_FILTER: Record<ReminderStatusFilter, ListRemindersFilter> = {
  all: 'all',
  scheduled: 'active',
  executed: 'completed',
  cancelled: 'all',
};

const DEFAULT_COUNTS: ReminderStatusCounts = { scheduled: 0, executed: 0, cancelled: 0 };
const DEFAULT_PER_PAGE = 20;

export function AgentsReminders() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ReminderStatusFilter>('all');
  const [page, setPage] = useState(1);
  const perPage = DEFAULT_PER_PAGE;
  const [sortBy, setSortBy] = useState<ListRemindersSortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<ListRemindersSortOrder>('desc');

  const apiFilter = STATUS_TO_API_FILTER[statusFilter];
  const remindersQ = useAgentsReminders({ filter: apiFilter, page, perPage, sortBy, sortOrder });

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy, sortOrder, apiFilter]);

  const handleViewThread = useCallback(
    (threadId: string) => {
      navigate(`/agents/threads/${threadId}`);
    },
    [navigate],
  );

  const handleRetry = useCallback(() => {
    void remindersQ.refetch();
  }, [remindersQ]);

  const data = remindersQ.data;
  const countsByStatus = data?.countsByStatus ?? DEFAULT_COUNTS;

  const reminders = useMemo(() => {
    const items = data?.items ?? [];
    if (statusFilter === 'cancelled') {
      return items.filter((item) => item.status === 'cancelled');
    }
    return items;
  }, [data?.items, statusFilter]);

  const total = statusFilter === 'cancelled' ? countsByStatus.cancelled : data?.total ?? 0;
  const totalPages = statusFilter === 'cancelled'
    ? (countsByStatus.cancelled === 0 ? 0 : Math.ceil(countsByStatus.cancelled / perPage))
    : data?.totalPages ?? 0;

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleStatusFilterChange = useCallback((next: ReminderStatusFilter) => {
    setStatusFilter(next);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  const handleSortByChange = useCallback((nextSortBy: ListRemindersSortBy) => {
    if (sortBy === nextSortBy) return;
    setSortBy(nextSortBy);
  }, [sortBy]);

  const handleSortOrderChange = useCallback((nextSortOrder: ListRemindersSortOrder) => {
    if (sortOrder === nextSortOrder) return;
    setSortOrder(nextSortOrder);
  }, [sortOrder]);

  const effectiveSortBy = data?.sortBy ?? sortBy;
  const effectiveSortOrder = data?.sortOrder ?? sortOrder;

  return (
    <RemindersLayout
      reminders={reminders}
      isLoading={remindersQ.isLoading || remindersQ.isFetching}
      error={remindersQ.error ?? null}
      onRetry={handleRetry}
      onViewThread={handleViewThread}
      page={page}
      perPage={perPage}
      total={total}
      totalPages={totalPages}
      sortBy={effectiveSortBy}
      sortOrder={effectiveSortOrder}
      countsByStatus={countsByStatus}
      statusFilter={statusFilter}
      onStatusFilterChange={handleStatusFilterChange}
      onPageChange={handlePageChange}
      onSortByChange={handleSortByChange}
      onSortOrderChange={handleSortOrderChange}
    />
  );
}
