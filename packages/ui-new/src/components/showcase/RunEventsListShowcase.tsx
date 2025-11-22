import { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Button } from '../Button';
import { RunEventsList, RunEvent } from '../RunEventsList';
import { EventType } from '../RunEventDetails';

interface ShowcaseProps {
  onBack: () => void;
}

const EVENT_TYPES: EventType[] = ['message', 'llm', 'tool', 'summarization'];
const TOOL_SUBTYPES = ['generic', 'shell', 'manage'];
const MESSAGE_SUBTYPES = ['source', 'intermediate', 'result'];
const STATUSES = ['running', 'finished', 'failed', 'pending'] as const;

const ITEMS_PER_PAGE = 25;

// Generate mock events
const generateEvent = (id: number, timestamp: Date): RunEvent => {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
  
  let data: any = {};
  
  if (type === 'message') {
    const messageSubtype = MESSAGE_SUBTYPES[Math.floor(Math.random() * MESSAGE_SUBTYPES.length)];
    data = {
      messageSubtype,
      content: `This is a ${messageSubtype} message with id ${id}`,
    };
  } else if (type === 'tool') {
    const toolSubtype = TOOL_SUBTYPES[Math.floor(Math.random() * TOOL_SUBTYPES.length)];
    data = {
      toolName: toolSubtype === 'shell' ? 'run_command' : toolSubtype === 'manage' ? 'manage_todo' : 'file_read',
      toolSubtype,
    };
  } else if (type === 'llm') {
    data = {
      model: 'gpt-4-turbo',
      tokens: { input: 1234, output: 567, total: 1801 },
    };
  }
  
  return {
    id: `evt-${id}`,
    type,
    timestamp: timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    duration: type !== 'message' ? `${(Math.random() * 5).toFixed(1)}s` : undefined,
    status,
    data,
  };
};

export function RunEventsListShowcase({ onBack }: ShowcaseProps) {
  const [allEvents, setAllEvents] = useState<RunEvent[]>(() => {
    const initial: RunEvent[] = [];
    const now = new Date();
    for (let i = 0; i < 200; i++) {
      initial.push(generateEvent(i, new Date(now.getTime() - (200 - i) * 5000)));
    }
    return initial;
  });
  
  const [displayedEvents, setDisplayedEvents] = useState<RunEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isAutoAdding, setIsAutoAdding] = useState(false);
  const nextIdRef = useRef(200);
  const autoAddIntervalRef = useRef<number>();

  // Initialize with last 25 events
  useEffect(() => {
    const startIndex = Math.max(0, allEvents.length - ITEMS_PER_PAGE);
    setDisplayedEvents(allEvents.slice(startIndex));
    setHasMore(startIndex > 0);
  }, []);

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    // Simulate network delay
    setTimeout(() => {
      const currentFirstIndex = allEvents.findIndex(e => e.id === displayedEvents[0]?.id);
      const prevStartIndex = Math.max(0, currentFirstIndex - ITEMS_PER_PAGE);
      const newEvents = allEvents.slice(prevStartIndex, currentFirstIndex);
      
      // Prepend events
      setDisplayedEvents(prev => [...newEvents, ...prev]);
      setHasMore(prevStartIndex > 0);
      setIsLoadingMore(false);
    }, 800);
  };

  const addNewEvent = () => {
    const newEvent = generateEvent(nextIdRef.current, new Date());
    nextIdRef.current++;
    
    setAllEvents(prev => [...prev, newEvent]);
    // Append event
    setDisplayedEvents(prev => [...prev, newEvent]);
  };

  const toggleAutoAdd = () => {
    if (isAutoAdding) {
      if (autoAddIntervalRef.current) {
        clearInterval(autoAddIntervalRef.current);
        autoAddIntervalRef.current = undefined;
      }
      setIsAutoAdding(false);
    } else {
      setIsAutoAdding(true);
      autoAddIntervalRef.current = window.setInterval(() => {
        addNewEvent();
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (autoAddIntervalRef.current) {
        clearInterval(autoAddIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[var(--agyn-bg-light)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-[var(--agyn-border-subtle)]">
        <IconButton onClick={onBack} variant="ghost" size="sm" icon={<ArrowLeft />} />
        <div className="flex-1">
          <h1 className="text-xl text-[var(--agyn-dark)]">Run Events List</h1>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">
            Virtuoso-powered infinite scroll with auto-follow
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full flex gap-6">
          {/* Left Panel - Controls */}
          <div className="w-80 flex flex-col gap-4">
            <div className="bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] p-4">
              <h2 className="text-sm text-[var(--agyn-dark)] mb-3">Controls</h2>
              
              <div className="space-y-3">
                <Button 
                  onClick={addNewEvent}
                  variant="primary"
                  size="sm"
                  className="w-full"
                >
                  Add New Event
                </Button>
                
                <Button 
                  onClick={toggleAutoAdd}
                  variant={isAutoAdding ? 'secondary' : 'outline'}
                  size="sm"
                  className="w-full"
                >
                  {isAutoAdding ? 'Stop Auto-Add' : 'Start Auto-Add (2s)'}
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] p-4">
              <h2 className="text-sm text-[var(--agyn-dark)] mb-3">Features</h2>
              
              <ul className="space-y-2 text-xs text-[var(--agyn-gray)]">
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Initial position at bottom</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Auto-follows new messages when at bottom</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Infinite scroll up to load older events</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Loads 25 events per page</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Loading animation while fetching</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Virtualized rendering for performance</span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] p-4">
              <h2 className="text-sm text-[var(--agyn-dark)] mb-3">Stats</h2>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Total Events:</span>
                  <span className="text-[var(--agyn-dark)]">{allEvents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Displayed:</span>
                  <span className="text-[var(--agyn-dark)]">{displayedEvents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Has More:</span>
                  <span className="text-[var(--agyn-dark)]">{hasMore ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Loading:</span>
                  <span className="text-[var(--agyn-dark)]">{isLoadingMore ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Events List */}
          <div className="flex-1">
            <RunEventsList
              events={displayedEvents}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              hasMore={hasMore}
              loadMore={loadMore}
              isLoadingMore={isLoadingMore}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
