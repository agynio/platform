import { useState } from 'react';
import { ArrowLeft, Trash2, Terminal, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { MainSidebar } from '../../MainSidebar';
import { IconButton } from '../../IconButton';
import { Badge } from '../../Badge';
import * as Tooltip from '@radix-ui/react-tooltip';

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping';
export type ContainerRole = 'workspace' | 'dind';

export interface Container {
  id: string;
  name: string; // Container name
  containerId: string; // Docker container ID
  image: string;
  role: ContainerRole;
  status: ContainerStatus;
  startedAt: string;
  lastUsedAt: string;
  ttl?: string; // Time to live
  volumes: string[];
  parentId?: string; // For DinD containers, reference to workspace container
  threadId?: string; // Associated thread ID for View thread functionality
}

interface ContainersScreenProps {
  containers: Container[];
  onOpenTerminal?: (containerId: string) => void;
  onDeleteContainer?: (containerId: string) => void;
  onViewThread?: (threadId: string) => void;
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

const ITEMS_PER_PAGE = 20;

export default function ContainersScreen({
  containers,
  onOpenTerminal,
  onDeleteContainer,
  onViewThread,
  onBack,
  selectedMenuItem,
  onMenuItemSelect,
}: ContainersScreenProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ContainerStatus | 'all'>('all');
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

  // Filter containers
  const filteredContainers = containers.filter((container) => {
    if (statusFilter !== 'all' && container.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Group containers with their sidecars
  const groupedContainers: (Container | Container[])[] = [];
  const processedIds = new Set<string>();

  filteredContainers.forEach((container) => {
    if (processedIds.has(container.id)) return;

    if (container.role === 'workspace') {
      const dinds = filteredContainers.filter((c) => c.role === 'dind' && c.parentId === container.id);
      if (dinds.length > 0) {
        groupedContainers.push([container, ...dinds]);
        processedIds.add(container.id);
        dinds.forEach((s) => processedIds.add(s.id));
      } else {
        groupedContainers.push(container);
        processedIds.add(container.id);
      }
    } else if (!container.parentId) {
      // DinD without parent
      groupedContainers.push(container);
      processedIds.add(container.id);
    }
  });

  // Pagination
  const totalPages = Math.ceil(groupedContainers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedContainers = groupedContainers.slice(startIndex, endIndex);

  // Get status badge
  const getStatusBadge = (status: ContainerStatus) => {
    switch (status) {
      case 'running':
        return (
          <Badge variant="success" size="sm">
            <div className="flex items-center gap-1">Running</div>
          </Badge>
        );
      case 'stopped':
        return (
          <Badge variant="neutral" size="sm">
            Stopped
          </Badge>
        );
      case 'starting':
        return (
          <Badge variant="warning" size="sm">
            Starting
          </Badge>
        );
      case 'stopping':
        return (
          <Badge variant="warning" size="sm">
            Stopping
          </Badge>
        );
    }
  };

  // Format time display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  // Format TTL
  const formatTTL = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMs < 0) return 'Expired';
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  };

  // Count by status
  const runningCount = containers.filter((c) => c.status === 'running').length;
  const stoppedCount = containers.filter((c) => c.status === 'stopped').length;
  const startingCount = containers.filter((c) => c.status === 'starting').length;
  const stoppingCount = containers.filter((c) => c.status === 'stopping').length;

  return (
    <div className="h-screen flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Containers</span>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left MainSidebar */}
        <MainSidebar selectedMenuItem={selectedMenuItem} onMenuItemSelect={onMenuItemSelect} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4">
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Containers</h1>
            <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">Manage Docker containers and sidecars</p>
          </div>

          {/* Filters */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                All ({containers.length})
              </button>
              <button
                onClick={() => setStatusFilter('running')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'running'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Running ({runningCount})
              </button>
              <button
                onClick={() => setStatusFilter('stopped')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'stopped'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Stopped ({stoppedCount})
              </button>
              <button
                onClick={() => setStatusFilter('starting')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'starting'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Starting ({startingCount})
              </button>
              <button
                onClick={() => setStatusFilter('stopping')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'stopping'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Stopping ({stoppingCount})
              </button>
            </div>
          </div>

          {/* Container List */}
          <div className="flex-1 overflow-auto bg-[var(--agyn-bg-light)] p-6">
            {paginatedContainers.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--agyn-text-subtle)]">No containers found</div>
            ) : (
              <div className="space-y-3">
                {paginatedContainers.map((item) => {
                  const isGroup = Array.isArray(item);
                  const mainContainer = isGroup ? item[0] : item;
                  const dinds = isGroup ? item.slice(1) : [];
                  const isExpanded = expandedContainers.has(mainContainer.id);
                  const hasDinds = dinds.length > 0;

                  const toggleExpanded = () => {
                    const newExpanded = new Set(expandedContainers);
                    if (isExpanded) {
                      newExpanded.delete(mainContainer.id);
                    } else {
                      newExpanded.add(mainContainer.id);
                    }
                    setExpandedContainers(newExpanded);
                  };

                  return (
                    <div key={mainContainer.id}>
                      {/* Main Container Card */}
                      <div className="bg-white rounded-lg border border-[var(--agyn-border-subtle)] p-4 max-w-[700px]">
                        <div className="flex items-start gap-4">
                          {/* Container Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-2 mb-1">
                                  <Tooltip.Provider delayDuration={300}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger asChild>
                                        <div className="text-base font-medium text-[var(--agyn-dark)] cursor-help truncate">
                                          {mainContainer.name}
                                        </div>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content
                                          className="bg-[var(--agyn-dark)] text-white text-xs px-3 py-2 rounded-md"
                                          sideOffset={5}
                                        >
                                          <div className="font-mono">ID: {mainContainer.containerId}</div>
                                          <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                  <Badge variant="primary" size="sm">
                                    Workspace
                                  </Badge>
                                  {getStatusBadge(mainContainer.status)}
                                </div>
                                <div className="text-sm text-[var(--agyn-text-subtle)] mt-1">{mainContainer.image}</div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1">
                                {mainContainer.threadId && (
                                  <Tooltip.Provider delayDuration={300}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger asChild>
                                        <button
                                          onClick={() => onViewThread?.(mainContainer.threadId!)}
                                          className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </button>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content
                                          className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                          sideOffset={5}
                                        >
                                          View Thread
                                          <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                )}
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        onClick={() => onOpenTerminal?.(mainContainer.containerId)}
                                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                      >
                                        <Terminal className="w-4 h-4" />
                                      </button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                        sideOffset={5}
                                      >
                                        Open Terminal
                                        <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        onClick={() => onDeleteContainer?.(mainContainer.containerId)}
                                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                        sideOffset={5}
                                      >
                                        Delete
                                        <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              </div>
                            </div>

                            {/* Metadata */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--agyn-text-subtle)]">Started:</span>
                                <span className="text-[var(--agyn-dark)]">{formatTime(mainContainer.startedAt)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--agyn-text-subtle)]">Last Used:</span>
                                <span className="text-[var(--agyn-dark)]">{formatTime(mainContainer.lastUsedAt)}</span>
                              </div>
                              {mainContainer.ttl && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--agyn-text-subtle)]">TTL:</span>
                                  <span className="text-[var(--agyn-dark)]">{formatTTL(mainContainer.ttl)}</span>
                                </div>
                              )}
                              {mainContainer.volumes.length > 0 && (
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <div className="flex items-center gap-2 cursor-help">
                                        <span className="text-[var(--agyn-text-subtle)]">Volumes:</span>
                                        <span className="text-[var(--agyn-blue)]">
                                          {mainContainer.volumes.length} volume
                                          {mainContainer.volumes.length !== 1 ? 's' : ''}
                                        </span>
                                      </div>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="bg-[var(--agyn-dark)] text-white text-xs px-3 py-2 rounded-md max-w-xs"
                                        sideOffset={5}
                                      >
                                        <div className="space-y-1">
                                          {mainContainer.volumes.map((volume, i) => (
                                            <div key={i} className="font-mono">
                                              {volume}
                                            </div>
                                          ))}
                                        </div>
                                        <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                              )}
                            </div>

                            {/* Show Sidecars Button */}
                            {hasDinds && (
                              <button
                                onClick={toggleExpanded}
                                className="flex items-center gap-2 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-dark)] transition-colors mt-3"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    <span>Hide sidecars</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                    <span>Show sidecars</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* DinD Containers (Expanded) */}
                      {hasDinds && isExpanded && (
                        <div className="ml-8 mt-2 space-y-2">
                          {dinds.map((dind) => (
                            <div
                              key={dind.id}
                              className="bg-white rounded-lg border border-[var(--agyn-border-subtle)] p-4 max-w-[calc(700px-2rem)]"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center flex-wrap gap-2 mb-1">
                                    <Tooltip.Provider delayDuration={300}>
                                      <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                          <div className="text-sm font-medium text-[var(--agyn-dark)] cursor-help truncate">
                                            {dind.name}
                                          </div>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                          <Tooltip.Content
                                            className="bg-[var(--agyn-dark)] text-white text-xs px-3 py-2 rounded-md"
                                            sideOffset={5}
                                          >
                                            <div className="font-mono">ID: {dind.containerId}</div>
                                            <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                          </Tooltip.Content>
                                        </Tooltip.Portal>
                                      </Tooltip.Root>
                                    </Tooltip.Provider>
                                    <Badge variant="neutral" size="sm">
                                      DinD
                                    </Badge>
                                    {getStatusBadge(dind.status)}
                                  </div>
                                  <div className="text-xs text-[var(--agyn-text-subtle)] mt-1">{dind.image}</div>

                                  {/* DinD Metadata */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs mt-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[var(--agyn-text-subtle)]">Started:</span>
                                      <span className="text-[var(--agyn-dark)]">{formatTime(dind.startedAt)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* DinD Actions */}
                                <div className="flex items-center gap-1">
                                  <Tooltip.Provider delayDuration={300}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger asChild>
                                        <button
                                          onClick={() => onOpenTerminal?.(dind.containerId)}
                                          className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                        >
                                          <Terminal className="w-4 h-4" />
                                        </button>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content
                                          className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                          sideOffset={5}
                                        >
                                          Open Terminal
                                          <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                  <Tooltip.Provider delayDuration={300}>
                                    <Tooltip.Root>
                                      <Tooltip.Trigger asChild>
                                        <button
                                          onClick={() => onDeleteContainer?.(dind.containerId)}
                                          className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </Tooltip.Trigger>
                                      <Tooltip.Portal>
                                        <Tooltip.Content
                                          className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
                                          sideOffset={5}
                                        >
                                          Delete
                                          <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                        </Tooltip.Content>
                                      </Tooltip.Portal>
                                    </Tooltip.Root>
                                  </Tooltip.Provider>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  Showing {startIndex + 1} to {Math.min(endIndex, groupedContainers.length)} of{' '}
                  {groupedContainers.length} container{groupedContainers.length !== 1 ? 's' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-md text-sm transition-all ${
                          currentPage === page
                            ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                            : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
