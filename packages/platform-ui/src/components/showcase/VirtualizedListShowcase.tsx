import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Button } from '../Button';
import { VirtualizedList } from '../VirtualizedList';

interface ShowcaseProps {
  onBack: () => void;
}

interface ListItem {
  id: number;
  text: string;
  timestamp: Date;
}

const ITEMS_PER_PAGE = 25;

const generateItem = (id: number, timestamp: Date): ListItem => ({
  id,
  text: `Item ${id} - ${timestamp.toLocaleTimeString()}`,
  timestamp,
});

export function VirtualizedListShowcase({ onBack }: ShowcaseProps) {
  const [allItems, setAllItems] = useState<ListItem[]>(() => {
    const initial: ListItem[] = [];
    const now = new Date();
    for (let i = 0; i < 200; i++) {
      initial.push(generateItem(i, new Date(now.getTime() - (200 - i) * 5000)));
    }
    return initial;
  });
  
  const [displayedItems, setDisplayedItems] = useState<ListItem[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isAutoAdding, setIsAutoAdding] = useState(false);
  const nextIdRef = useRef(200);
  const autoAddIntervalRef = useRef<number>();

  // Initialize with last 25 items
  useEffect(() => {
    const startIndex = Math.max(0, allItems.length - ITEMS_PER_PAGE);
    setDisplayedItems(allItems.slice(startIndex));
    setHasMore(startIndex > 0);
  }, []);

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    setTimeout(() => {
      const currentFirstIndex = allItems.findIndex(item => item.id === displayedItems[0]?.id);
      const prevStartIndex = Math.max(0, currentFirstIndex - ITEMS_PER_PAGE);
      const newItems = allItems.slice(prevStartIndex, currentFirstIndex);
      
      setDisplayedItems(prev => [...newItems, ...prev]);
      setHasMore(prevStartIndex > 0);
      setIsLoadingMore(false);
    }, 800);
  };

  const addNewItem = () => {
    const newItem = generateItem(nextIdRef.current, new Date());
    nextIdRef.current++;
    
    setAllItems(prev => [...prev, newItem]);
    setDisplayedItems(prev => [...prev, newItem]);
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
        addNewItem();
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

  const renderItem = (index: number, item: ListItem) => (
    <div className="px-4 py-3 border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)] transition-colors">
      <div className="text-sm text-[var(--agyn-dark)]">{item.text}</div>
      <div className="text-xs text-[var(--agyn-gray)] mt-1">
        {item.timestamp.toLocaleString()}
      </div>
    </div>
  );

  const header = hasMore ? (
    <div className="p-4 flex items-center justify-center">
      {isLoadingMore ? (
        <div className="flex items-center gap-2 text-[var(--agyn-gray)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading more items...</span>
        </div>
      ) : (
        <div className="text-xs text-[var(--agyn-gray)]">Scroll up to load more</div>
      )}
    </div>
  ) : null;

  const emptyPlaceholder = (
    <div className="flex items-center justify-center h-full text-[var(--agyn-gray)]">
      No items
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--agyn-bg-light)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-[var(--agyn-border-subtle)]">
        <IconButton onClick={onBack} variant="ghost" size="sm" icon={<ArrowLeft />} />
        <div className="flex-1">
          <h1 className="text-xl text-[var(--agyn-dark)]">Virtualized List</h1>
          <p className="text-sm text-[var(--agyn-gray)] mt-1">
            Reusable virtualized list with infinite scroll
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
                  onClick={addNewItem}
                  variant="primary"
                  size="sm"
                  className="w-full"
                >
                  Add New Item
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
                  <span>Auto-follows new items when at bottom</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Preserves scroll position when not at bottom</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Infinite scroll up to load older items</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Loads 25 items per page</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Virtualized rendering for performance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--agyn-green)] mt-0.5">✓</span>
                  <span>Reusable component</span>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] p-4">
              <h2 className="text-sm text-[var(--agyn-dark)] mb-3">Stats</h2>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Total Items:</span>
                  <span className="text-[var(--agyn-dark)]">{allItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--agyn-gray)]">Displayed:</span>
                  <span className="text-[var(--agyn-dark)]">{displayedItems.length}</span>
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

          {/* Right Panel - List */}
          <div className="flex-1 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
              <h3 className="text-sm text-[var(--agyn-dark)]">Items List</h3>
              <p className="text-xs text-[var(--agyn-gray)] mt-1">{displayedItems.length} items</p>
            </div>
            <VirtualizedList
              items={displayedItems}
              renderItem={renderItem}
              getItemKey={(item) => item.id}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              header={header}
              emptyPlaceholder={emptyPlaceholder}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
