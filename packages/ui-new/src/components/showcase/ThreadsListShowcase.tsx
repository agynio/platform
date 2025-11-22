import { useState } from 'react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { ThreadsList } from '../ThreadsList';
import { Thread } from '../ThreadItem';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { User, Bot, Wrench, Circle, CheckCircle2 } from 'lucide-react';
import { StatusIndicator } from '../StatusIndicator';

interface ThreadsListShowcaseProps {
  onBack: () => void;
}

// Sample data generator
const generateThreads = (count: number, startId: number = 0, withSubthreads: boolean = false): Thread[] => {
  const statuses: ('running' | 'pending' | 'finished' | 'failed')[] = ['running', 'pending', 'finished', 'failed'];
  const agents = ['CodeGen', 'Debugger', 'Analyzer', 'Optimizer', 'Tester'];
  const summaries = [
    'Implementing user authentication with JWT',
    'Fixing memory leak in data processing module',
    'Analyzing performance bottlenecks in API',
    'Optimizing database queries for better performance',
    'Writing unit tests for payment integration',
    'Refactoring legacy code to use modern patterns',
    'Setting up CI/CD pipeline with GitHub Actions',
    'Implementing real-time notifications',
    'Adding TypeScript support to existing codebase',
    'Creating REST API endpoints for user management',
  ];

  return Array.from({ length: count }, (_, i) => {
    const id = startId + i;
    const hasSubthreads = withSubthreads && Math.random() > 0.6;
    
    return {
      id: `thread-${id}`,
      summary: summaries[Math.floor(Math.random() * summaries.length)],
      agentName: agents[Math.floor(Math.random() * agents.length)],
      createdAt: `${Math.floor(Math.random() * 12) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      isOpen: Math.random() > 0.3,
      subthreads: hasSubthreads ? generateSubthreads(id, Math.floor(Math.random() * 3) + 1) : undefined,
    };
  });
};

const generateSubthreads = (parentId: number, count: number, depth: number = 0): Thread[] => {
  if (depth > 2) return []; // Limit nesting depth for demo

  const statuses: ('running' | 'pending' | 'finished' | 'failed')[] = ['running', 'pending', 'finished', 'failed'];
  const agents = ['CodeGen', 'Debugger', 'Analyzer', 'Optimizer', 'Tester'];
  const summaries = [
    'Sub-task: Setting up database schema',
    'Sub-task: Implementing validation logic',
    'Sub-task: Writing integration tests',
    'Sub-task: Code review and refactoring',
    'Sub-task: Deployment preparation',
  ];

  return Array.from({ length: count }, (_, i) => {
    const hasSubthreads = depth < 2 && Math.random() > 0.7;
    
    return {
      id: `thread-${parentId}-sub-${i}`,
      summary: summaries[Math.floor(Math.random() * summaries.length)],
      agentName: agents[Math.floor(Math.random() * agents.length)],
      createdAt: `${Math.floor(Math.random() * 12) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      isOpen: Math.random() > 0.5,
      subthreads: hasSubthreads ? generateSubthreads(parentId * 100 + i, Math.floor(Math.random() * 2) + 1, depth + 1) : undefined,
    };
  });
};

// Mock detail view component
function ThreadDetailView({ thread }: { thread: Thread | null }) {
  if (!thread) {
    return (
      <div className="flex-1 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] flex items-center justify-center">
        <p className="text-[var(--agyn-gray)]">Select a thread to view details</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--agyn-border-subtle)]">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: 'var(--agyn-blue)' }}
          >
            {thread.agentName.charAt(0)}
          </div>
          <div>
            <h3 className="text-[var(--agyn-dark)]">{thread.agentName}</h3>
            <p className="text-xs text-[var(--agyn-gray)]">{thread.createdAt}</p>
          </div>
          <div className="ml-auto">
            <StatusIndicator status={thread.status} />
          </div>
        </div>
        <h4 className="text-[var(--agyn-dark)]">{thread.summary}</h4>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-[var(--agyn-blue)] mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-[var(--agyn-gray)] mb-1">User</p>
              <p className="text-sm">Can you help me implement this feature?</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Bot className="w-5 h-5 text-[var(--agyn-purple)] mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-[var(--agyn-gray)] mb-1">{thread.agentName}</p>
              <p className="text-sm">I'll help you with that. Let me analyze the requirements first.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Wrench className="w-5 h-5 text-[var(--agyn-cyan)] mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-[var(--agyn-gray)] mb-1">Tool Execution</p>
              <p className="text-sm">Running code analysis...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThreadsListShowcase({ onBack }: ThreadsListShowcaseProps) {
  // Realistic example with side-by-side layout
  const [realisticThreads, setRealisticThreads] = useState<Thread[]>(generateThreads(15, 2000, true));
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [nextId, setNextId] = useState(2015);

  const handleLoadMore = () => {
    if (isLoading) return;

    setIsLoading(true);
    setTimeout(() => {
      const newThreads = generateThreads(5, nextId, true);
      setRealisticThreads((prev) => [...prev, ...newThreads]);
      setNextId((prev) => prev + 5);
      setIsLoading(false);

      if (realisticThreads.length + 5 >= 30) {
        setHasMore(false);
      }
    }, 800);
  };

  const handleToggleOpenState = (threadId: string, threads: Thread[]): Thread[] => {
    return threads.map((thread) => {
      if (thread.id === threadId) {
        return { ...thread, isOpen: !thread.isOpen };
      }
      if (thread.subthreads) {
        return {
          ...thread,
          subthreads: handleToggleOpenState(threadId, thread.subthreads),
        };
      }
      return thread;
    });
  };

  const handleRealisticToggle = (threadId: string) => {
    setRealisticThreads((prev) => handleToggleOpenState(threadId, prev));
  };

  const findThread = (threads: Thread[], id: string): Thread | null => {
    for (const thread of threads) {
      if (thread.id === id) return thread;
      if (thread.subthreads) {
        const found = findThread(thread.subthreads, id);
        if (found) return found;
      }
    }
    return null;
  };

  const handleThreadClick = (threadId: string) => {
    const thread = findThread(realisticThreads, threadId);
    setSelectedThread(thread);
  };

  return (
    <div>
      <ComponentPreviewHeader
        title="ThreadsList"
        description="Infinitely scrollable list of threads with nested subthreads and open/closed states"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Realistic Layout - Side by Side */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Realistic Layout - Threads with Detail View</h3>
          </PanelHeader>
          <PanelBody>
            <div className="mb-4 space-y-3">
              <p className="text-sm text-[var(--agyn-gray)]">
                Typical usage: narrow threads list on the left (360px), detailed view on the right.
                Features infinite scroll, nested threads, and state management.
              </p>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <StatusIndicator status="running" size="sm" showTooltip={false} />
                  <span className="text-[var(--agyn-gray)]">Running</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status="pending" size="sm" showTooltip={false} />
                  <span className="text-[var(--agyn-gray)]">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status="finished" size="sm" showTooltip={false} />
                  <span className="text-[var(--agyn-gray)]">Finished</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status="failed" size="sm" showTooltip={false} />
                  <span className="text-[var(--agyn-gray)]">Failed</span>
                </div>
                <span className="text-[var(--agyn-gray)]">|</span>
                <div className="flex items-center gap-2">
                  <Circle className="w-4 h-4 text-[var(--agyn-gray)]" />
                  <span className="text-[var(--agyn-gray)]">Open Issue</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span className="text-[var(--agyn-gray)]">Resolved Issue</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4 h-[700px]">
              {/* Threads List - Narrow Column */}
              <div className="w-[360px] flex-shrink-0 overflow-auto">
                <ThreadsList
                  threads={realisticThreads}
                  onLoadMore={handleLoadMore}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  onToggleOpenState={handleRealisticToggle}
                  onSelectThread={handleThreadClick}
                  selectedThreadId={selectedThread?.id}
                />
              </div>

              {/* Detail View - Flexible Width */}
              <ThreadDetailView thread={selectedThread} />
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}