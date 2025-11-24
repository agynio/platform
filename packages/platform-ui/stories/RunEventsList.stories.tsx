import type { Meta, StoryObj } from '@storybook/react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '../src/components/Button';
import { RunEventsList, type RunEvent } from '../src/components/RunEventsList';
import { type EventType } from '../src/components/RunEventDetails';

const meta: Meta<typeof RunEventsList> = {
  title: 'Screens/Run/RunEventsList',
  component: RunEventsList,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RunEventsList>;

const EVENT_TYPES: EventType[] = ['message', 'llm', 'tool', 'summarization'];
const TOOL_SUBTYPES = ['generic', 'shell', 'manage'] as const;
const MESSAGE_SUBTYPES = ['source', 'intermediate', 'result'] as const;
const STATUSES = ['running', 'finished', 'failed', 'pending'] as const;

const ITEMS_PER_PAGE = 25;

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
    timestamp: timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    duration: type !== 'message' ? `${(Math.random() * 5).toFixed(1)}s` : undefined,
    status,
    data,
  };
};

export const InteractiveInfiniteScroll: Story = {
  render: () => {
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

    useEffect(() => {
      const startIndex = Math.max(0, allEvents.length - ITEMS_PER_PAGE);
      setDisplayedEvents(allEvents.slice(startIndex));
      setHasMore(startIndex > 0);
    }, []);

    const loadMore = () => {
      if (isLoadingMore || !hasMore) return;

      setIsLoadingMore(true);

      setTimeout(() => {
        const currentFirstIndex = allEvents.findIndex((e) => e.id === displayedEvents[0]?.id);
        const prevStartIndex = Math.max(0, currentFirstIndex - ITEMS_PER_PAGE);
        const newEvents = allEvents.slice(prevStartIndex, currentFirstIndex);

        setDisplayedEvents((prev) => [...newEvents, ...prev]);
        setHasMore(prevStartIndex > 0);
        setIsLoadingMore(false);
      }, 800);
    };

    const addNewEvent = () => {
      const newEvent = generateEvent(nextIdRef.current, new Date());
      nextIdRef.current += 1;

      setAllEvents((prev) => [...prev, newEvent]);
      setDisplayedEvents((prev) => [...prev, newEvent]);
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
        <div className="flex-1 overflow-hidden p-6">
          <div className="h-full flex gap-6">
            <div className="w-80 flex flex-col gap-4">
              <div className="bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] p-4">
                <h2 className="mb-3 text-[var(--agyn-dark)]">Controls</h2>
                <div className="space-y-3">
                  <Button onClick={addNewEvent} variant="primary" size="sm" className="w-full">
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
            </div>

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
  },
};
