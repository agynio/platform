import { Virtuoso, type VirtuosoHandle, type StateSnapshot } from 'react-virtuoso';
import {
  useRef,
  useEffect,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback,
  Component,
  type ReactNode,
  type ForwardedRef,
  type HTMLAttributes,
  type MutableRefObject,
  type Key,
  type ErrorInfo,
} from 'react';
import { debugConversation } from '@/lib/debug';

type ScrollToIndexArgs = Parameters<VirtuosoHandle['scrollToIndex']>;
type ScrollToIndexLocation = ScrollToIndexArgs[0];
type ScrollToIndexRest = ScrollToIndexArgs extends [unknown, ...infer R] ? R : never;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sanitizeScrollPosition = (
  position: VirtualizedListScrollPosition | null | undefined,
  itemsLength: number,
): VirtualizedListScrollPosition | null => {
  if (!position) return null;

  const next: VirtualizedListScrollPosition = {};

  if (isFiniteNumber(position.index) && itemsLength > 0) {
    const raw = Math.floor(position.index as number);
    next.index = Math.max(0, Math.min(itemsLength - 1, raw));
  }

  if (isFiniteNumber(position.offset) && next.index !== undefined) {
    const offset = Math.max(0, position.offset as number);
    next.offset = offset;
  }

  if (isFiniteNumber(position.scrollTop)) {
    const scrollTop = Math.max(0, position.scrollTop as number);
    next.scrollTop = scrollTop;
  }

  if (position.atBottom === true) {
    next.atBottom = true;
  }

  if (next.index === undefined && next.scrollTop === undefined && !next.atBottom) {
    return null;
  }

  return next;
};

export interface VirtualizedListScrollPosition {
  index?: number;
  offset?: number;
  scrollTop?: number;
  atBottom?: boolean;
}

export interface VirtualizedListHandle {
  scrollToIndex: VirtuosoHandle['scrollToIndex'];
  scrollTo: VirtuosoHandle['scrollTo'];
  getScrollerElement: () => HTMLElement | null;
  isAtBottom: () => boolean;
  captureScrollPosition: () => Promise<VirtualizedListScrollPosition | null>;
  restoreScrollPosition: (position: VirtualizedListScrollPosition) => void;
}

export interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (index: number, item: T) => ReactNode;
  getItemKey?: (item: T) => string | number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  emptyPlaceholder?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onAtBottomChange?: (isAtBottom: boolean) => void;
}

interface VirtualizedListErrorBoundaryProps {
  onError: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

interface VirtualizedListErrorBoundaryState {
  hasError: boolean;
}

class VirtualizedListErrorBoundary extends Component<
  VirtualizedListErrorBoundaryProps,
  VirtualizedListErrorBoundaryState
> {
  constructor(props: VirtualizedListErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): VirtualizedListErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function VirtualizedListInner<T>(
  {
  items,
  renderItem,
  getItemKey,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore = () => {},
  header,
  footer,
  emptyPlaceholder,
  className,
  style,
  onAtBottomChange,
}: VirtualizedListProps<T>,
  ref: ForwardedRef<VirtualizedListHandle>,
) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoPatchedRef = useRef(false);
  const virtuosoOriginalScrollRef = useRef<VirtuosoHandle['scrollToIndex'] | null>(null);
  const atBottomRef = useRef(true);
  const prevItemsLengthRef = useRef(items.length);
  const prevFirstItemKeyRef = useRef<string | number | null>(null);
  const isInitialMount = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(() => Math.max(0, 100000 - items.length));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const virtualizationDisabled = Boolean(
    (globalThis as { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__,
  );
  const [virtualizationFailed, setVirtualizationFailed] = useState(false);
  const shouldForceStatic = virtualizationDisabled || virtualizationFailed;

  const attachVirtuosoRef = useCallback(
    (instance: VirtuosoHandle | null) => {
      virtuosoRef.current = instance;

      if (!instance) {
        if (virtuosoOriginalScrollRef.current) {
          virtuosoOriginalScrollRef.current = null;
        }
        virtuosoPatchedRef.current = false;
        return;
      }

      if (virtuosoPatchedRef.current) {
        return;
      }

      const originalScrollToIndex = instance.scrollToIndex.bind(instance) as (...args: ScrollToIndexArgs) => void;
      virtuosoOriginalScrollRef.current = originalScrollToIndex;

      const patchedScrollToIndex: VirtuosoHandle['scrollToIndex'] = ((
        location: ScrollToIndexLocation | null | undefined,
        ...rest: ScrollToIndexRest
      ) => {
        if (location === undefined || location === null) {
          debugConversation('virtualized-list.scrollToIndex.patch.skip-null', () => ({ items: items.length }));
          return;
        }
        const args = [location, ...rest] as ScrollToIndexArgs;
        originalScrollToIndex(...args);
      }) as VirtuosoHandle['scrollToIndex'];

      instance.scrollToIndex = patchedScrollToIndex;
      virtuosoPatchedRef.current = true;
    },
    [items.length],
  );

  const handleVirtualizationError = useCallback(
    (error: unknown, info: ErrorInfo) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      debugConversation('virtualized-list.error-boundary', () => ({
        items: items.length,
        message,
        stack,
        componentStack: info?.componentStack,
      }));
      setVirtualizationFailed(true);
    },
    [items.length],
  );

  const scrollElement = useCallback((element: HTMLElement, options: ScrollToOptions | number) => {
    const scrollFn = (element as HTMLElement & { scrollTo?: (options: ScrollToOptions | number) => void }).scrollTo;
    if (typeof scrollFn === 'function') {
      scrollFn.call(element, options as ScrollToOptions);
      return;
    }
    if (typeof options === 'number') {
      element.scrollTop = options;
      return;
    }
    if (options && typeof options === 'object' && 'top' in options && typeof options.top === 'number') {
      element.scrollTop = options.top;
    }
  }, []);

  // Handle initial scroll to bottom
  useEffect(() => {
    if (isInitialMount.current && items.length > 0) {
      isInitialMount.current = false;
      const baseIndex = Math.max(0, 100000 - items.length);
      setFirstItemIndex(baseIndex);
      if (getItemKey) {
        prevFirstItemKeyRef.current = getItemKey(items[0]);
      }
    }
  }, [items.length, items, getItemKey]);

  // Detect when new items are added
  useEffect(() => {
    if (isInitialMount.current || items.length === 0) {
      return;
    }

    const prevLength = prevItemsLengthRef.current;
    const currentLength = items.length;
    const currentFirstItemKey = getItemKey ? getItemKey(items[0]) : null;
    
    if (currentLength > prevLength) {
      // Check if items were prepended (first item key changed)
      if (getItemKey && currentFirstItemKey !== prevFirstItemKeyRef.current) {
        const itemsAdded = currentLength - prevLength;
        setFirstItemIndex(prev => prev - itemsAdded);
        prevFirstItemKeyRef.current = currentFirstItemKey;
      }
      // If first item key is the same, items were appended - don't change firstItemIndex
    }
    
    prevItemsLengthRef.current = currentLength;
  }, [items, getItemKey]);

  const fallbackScrollToIndex = useCallback(
    (location: Parameters<VirtualizedListHandle['scrollToIndex']>[0]) => {
      if (!shouldForceStatic) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const options = typeof location === 'number' ? { index: location } : location ?? { index: 0 };
      const index = options.index === 'LAST' ? items.length - 1 : options.index;
      if (typeof index !== 'number' || !Number.isFinite(index)) return;
      if (index < 0 || index >= items.length) return;
      const target = itemRefs.current[index];
      if (!target) return;
      const behavior = ('behavior' in options && options.behavior ? options.behavior : 'auto') as ScrollBehavior;
      const align = ('align' in options && options.align ? options.align : 'end') as ScrollLogicalPosition;
      const offset = 'offset' in options && typeof options.offset === 'number' ? options.offset : 0;

      if (align === 'start') {
        const top = target.offsetTop + offset;
        scrollElement(scroller, { top, behavior });
        return;
      }

      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior, block: align });
        if (offset) {
          scrollElement(scroller, { top: target.offsetTop + offset, behavior });
        }
        return;
      }

      let top = target.offsetTop;
      if (align === 'end') {
        top = target.offsetTop - (scroller.clientHeight - target.offsetHeight) + offset;
      } else if (align === 'center') {
        top = target.offsetTop - scroller.clientHeight / 2 + target.offsetHeight / 2 + offset;
      } else {
        top += offset;
      }
      scrollElement(scroller, { top, behavior });
    },
    [shouldForceStatic, items.length, scrollElement],
  );

  const fallbackScrollTo = useCallback(
    (location: Parameters<VirtualizedListHandle['scrollTo']>[0]) => {
      if (!shouldForceStatic) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scrollElement(scroller, location ?? { top: 0 });
    },
    [shouldForceStatic, scrollElement],
  );

  const renderVirtualItem = useCallback(
    (index: number, item: T): ReactNode => {
      const arrayIndex = index - firstItemIndex;
      return renderItem(arrayIndex, item);
    },
    [firstItemIndex, renderItem],
  );

  const resolveVirtualItemKey = useCallback(
    (index: number, item: T, _context?: unknown): Key => (getItemKey ? getItemKey(item) : index),
    [getItemKey],
  );

  const captureStaticPosition = useCallback((): VirtualizedListScrollPosition | null => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const scrollTop = scroller.scrollTop;
    const entries = itemRefs.current;
    let index: number | undefined;
    let offset = 0;

    for (let i = 0; i < entries.length; i += 1) {
      const node = entries[i];
      if (!node) continue;
      const nodeTop = node.offsetTop;
      const nodeBottom = nodeTop + node.offsetHeight;
      if (scrollTop < nodeBottom) {
        index = i;
        offset = Math.max(0, scrollTop - nodeTop);
        break;
      }
    }

    if (index === undefined && items.length > 0) {
      index = Math.max(0, items.length - 1);
      offset = 0;
    }

    const result: VirtualizedListScrollPosition = {};
    if (index !== undefined) {
      result.index = index;
      if (offset > 0) {
        result.offset = offset;
      }
    }
    if (isFiniteNumber(scrollTop)) {
      result.scrollTop = scrollTop;
    }
    const atBottom = Math.abs(scroller.scrollHeight - scroller.clientHeight - scrollTop) <= 1;
    if (atBottom) {
      result.atBottom = true;
    }

    if (result.index === undefined && result.scrollTop === undefined && !result.atBottom) {
      return null;
    }

    const sanitized = sanitizeScrollPosition(result, items.length);
    debugConversation('virtualized-list.capture.static', () => ({ items: items.length, sanitized }));
    return sanitized;
  }, [items.length]);

  const restoreStaticPosition = useCallback(
    (position: VirtualizedListScrollPosition) => {
      const scroller = scrollerRef.current;
      if (!scroller || !position) return;

      const sanitized = sanitizeScrollPosition(position, items.length);
      if (!sanitized) {
        debugConversation('virtualized-list.restore.static.skip', () => ({ items: items.length }));
        return;
      }

      if (isFiniteNumber(sanitized.index) && items.length > 0) {
        const raw = Math.floor(sanitized.index as number);
        const clampedIndex = Math.max(0, Math.min(items.length - 1, raw));
        const node = itemRefs.current[clampedIndex] ?? null;
        if (node) {
          const offsetValue = isFiniteNumber(sanitized.offset) ? (sanitized.offset as number) : 0;
          const top = node.offsetTop + offsetValue;
          debugConversation('virtualized-list.restore.static.index', () => ({ items: items.length, clampedIndex, offset: offsetValue }));
          scrollElement(scroller, { top, behavior: 'auto' });
          return;
        }
      }

      if (isFiniteNumber(sanitized.scrollTop)) {
        const top = sanitized.scrollTop as number;
        debugConversation('virtualized-list.restore.static.scrollTop', () => ({ items: items.length, top }));
        scrollElement(scroller, { top, behavior: 'auto' });
        return;
      }

      if (sanitized.atBottom && items.length > 0) {
        const lastNode = itemRefs.current[Math.max(0, items.length - 1)] ?? null;
        if (lastNode) {
          const target = lastNode.offsetTop - (scroller.clientHeight - lastNode.offsetHeight);
          debugConversation('virtualized-list.restore.static.bottom', () => ({ items: items.length, target }));
          scrollElement(scroller, { top: target, behavior: 'auto' });
          return;
        }
        debugConversation('virtualized-list.restore.static.bottom-fallback', () => ({ items: items.length }));
        scrollElement(scroller, { top: scroller.scrollHeight, behavior: 'auto' });
      }
    },
    [items.length, scrollElement],
  );

  const captureScrollPosition = useCallback(async () => {
    if (shouldForceStatic) {
      return captureStaticPosition();
    }
    const instance = virtuosoRef.current;
    if (!instance) return null;
    return new Promise<VirtualizedListScrollPosition | null>((resolve) => {
      instance.getState((snapshot: StateSnapshot) => {
        const range = snapshot.ranges[0];
        const absoluteIndex = range ? range.startIndex : undefined;
        const scrollTop = snapshot.scrollTop;
        const hasRange = Number.isFinite(absoluteIndex);
        const hasScrollTop = Number.isFinite(scrollTop);

        if (!hasRange || !hasScrollTop) {
          debugConversation('virtualized-list.capture.virtuoso.unusable', () => ({ items: items.length, hasRange, hasScrollTop }));
          resolve(null);
          return;
        }

        const relative = (absoluteIndex as number) - firstItemIndex;
        const result: VirtualizedListScrollPosition = {};

        if (items.length > 0) {
          const clamped = Math.max(0, Math.min(items.length - 1, Math.floor(relative)));
          result.index = clamped;
        }

        result.scrollTop = scrollTop as number;

        if (atBottomRef.current) {
          result.atBottom = true;
        }

        const sanitized = sanitizeScrollPosition(result, items.length);
        if (!sanitized) {
          debugConversation('virtualized-list.capture.virtuoso.sanitized-null', () => ({ items: items.length }));
          resolve(null);
          return;
        }

        debugConversation('virtualized-list.capture.virtuoso', () => ({ items: items.length, sanitized }));
        resolve(sanitized);
      });
    });
  }, [captureStaticPosition, firstItemIndex, items.length, shouldForceStatic]);

  const restoreScrollPosition = useCallback(
    (position: VirtualizedListScrollPosition) => {
      if (!position) return;
      const sanitized = sanitizeScrollPosition(position, items.length);
      if (!sanitized) {
        debugConversation('virtualized-list.restore.skip', () => ({ items: items.length }));
        return;
      }

      if (shouldForceStatic) {
        debugConversation('virtualized-list.restore.static', () => ({ items: items.length, sanitized }));
        restoreStaticPosition(sanitized);
        return;
      }

      const instance = virtuosoRef.current;
      if (!instance) {
        debugConversation('virtualized-list.restore.pending-instance', () => ({ items: items.length }));
        return;
      }

      const idx = sanitized.index;
      const top = sanitized.scrollTop;
      const offset = sanitized.offset;
      const wasAtBottom = sanitized.atBottom === true;
      const itemsLength = items.length;

      if (itemsLength === 0 && !Number.isFinite(top) && !wasAtBottom) {
        debugConversation('virtualized-list.restore.skip-empty', () => ({ items: items.length }));
        return;
      }

      if (Number.isFinite(idx) && itemsLength > 0) {
        const raw = Math.floor(idx as number);
        const clampedIndex = Math.max(0, Math.min(itemsLength - 1, raw));
        const absoluteIndex = firstItemIndex + clampedIndex;
        const location: { index: number; align: 'start'; behavior: 'auto'; offset?: number } = {
          index: absoluteIndex,
          align: 'start',
          behavior: 'auto',
        };
        if (Number.isFinite(offset)) {
          location.offset = offset as number;
        }
        debugConversation('virtualized-list.restore.index', () => ({ items: items.length, location }));
        instance.scrollToIndex(location);
        return;
      }

      if (Number.isFinite(top)) {
        const topValue = top as number;
        debugConversation('virtualized-list.restore.scrollTop', () => ({ items: items.length, top: topValue }));
        instance.scrollTo({ top: topValue, behavior: 'auto' });
        return;
      }

      if (wasAtBottom && itemsLength > 0) {
        debugConversation('virtualized-list.restore.bottom', () => ({ items: items.length, firstItemIndex }));
        instance.scrollToIndex({ index: firstItemIndex + itemsLength - 1, align: 'end', behavior: 'auto' });
        return;
      }

      debugConversation('virtualized-list.restore.unhandled', () => ({ items: items.length }));
    },
    [firstItemIndex, items.length, restoreStaticPosition, shouldForceStatic],
  );

  useImperativeHandle(
    ref,
    () => {
      if (shouldForceStatic) {
        return {
          scrollToIndex: (location) => fallbackScrollToIndex(location),
          scrollTo: (location) => fallbackScrollTo(location),
          getScrollerElement: () => scrollerRef.current,
          isAtBottom: () => atBottomRef.current,
          captureScrollPosition: () => Promise.resolve(captureStaticPosition()),
          restoreScrollPosition: (position) => {
            if (position) restoreStaticPosition(position);
          },
        } as VirtualizedListHandle;
      }
      return {
        scrollToIndex: (...args: Parameters<VirtuosoHandle['scrollToIndex']>) => {
          const [location] = args;
          if (location === undefined || location === null) {
            debugConversation('virtualized-list.scrollToIndex.skip-null', () => ({ items: items.length }));
            return;
          }
          const instance = virtuosoRef.current;
          if (!instance) {
            debugConversation('virtualized-list.scrollToIndex.no-instance', () => ({ items: items.length }));
            return;
          }

          debugConversation('virtualized-list.scrollToIndex.request', () => ({ items: items.length, location }));

          const clampRelativeIndex = (value: unknown): number | null => {
            if (items.length === 0) {
              return null;
            }
            if (value === 'LAST') {
              return items.length - 1;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
              const raw = Math.floor(value);
              return Math.max(0, Math.min(items.length - 1, raw));
            }
            return null;
          };

          const resolveAbsoluteLocation = (
            target: ScrollToIndexLocation | 'LAST',
          ): ScrollToIndexLocation | null => {
            if (target === null || target === undefined) {
              return null;
            }

            if (target === 'LAST') {
              const relative = clampRelativeIndex('LAST');
              if (relative === null) return null;
              return firstItemIndex + relative;
            }

            if (typeof target === 'number') {
              const relative = clampRelativeIndex(target);
              if (relative === null) return null;
              return firstItemIndex + relative;
            }

            if (typeof target === 'object') {
              const locationTarget = target as { index?: unknown };
              const relative = clampRelativeIndex(locationTarget.index);
              if (relative === null) return null;
              return { ...target, index: firstItemIndex + relative };
            }

            return null;
          };

          const resolved = resolveAbsoluteLocation(location);
          if (resolved === null) {
            debugConversation('virtualized-list.scrollToIndex.invalid-location', () => ({ items: items.length, location }));
            return;
          }

          const [, ...rest] = args as ScrollToIndexArgs;
          const finalArgs = [resolved, ...rest] as ScrollToIndexArgs;
          instance.scrollToIndex(...finalArgs);
        },
        scrollTo: (...args) => {
          virtuosoRef.current?.scrollTo(...args);
        },
        getScrollerElement: () => scrollerRef.current,
        isAtBottom: () => atBottomRef.current,
        captureScrollPosition: () => captureScrollPosition(),
        restoreScrollPosition: (position) => {
          if (position) restoreScrollPosition(position);
        },
      } as VirtualizedListHandle;
    },
    [
      captureScrollPosition,
      captureStaticPosition,
      fallbackScrollTo,
      fallbackScrollToIndex,
      restoreScrollPosition,
      restoreStaticPosition,
      shouldForceStatic,
      firstItemIndex,
      items.length,
    ],
  );

  useEffect(() => {
    if (!shouldForceStatic) return;
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length, shouldForceStatic]);

  useEffect(() => {
    if (!shouldForceStatic) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;
    if (isAtBottom) {
      scrollElement(scroller, { top: scroller.scrollHeight, behavior: 'auto' });
    }
    if (isAtBottom !== atBottomRef.current) {
      atBottomRef.current = isAtBottom;
      onAtBottomChange?.(isAtBottom);
    }
  }, [items.length, onAtBottomChange, scrollElement, shouldForceStatic]);

  useEffect(() => {
    if (!shouldForceStatic) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1;
      if (isAtBottom !== atBottomRef.current) {
        atBottomRef.current = isAtBottom;
        onAtBottomChange?.(isAtBottom);
      }
    };

    handleScroll();

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [items.length, onAtBottomChange, shouldForceStatic]);

  const Scroller = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function VirtualizedListScroller(props, forward) {
        const { itemKey: _ignoredItemKey, ...rest } = props as HTMLAttributes<HTMLDivElement> & { itemKey?: unknown };
        return (
          <div
            {...rest}
            ref={(node) => {
              scrollerRef.current = node ?? null;
              if (typeof forward === 'function') {
                forward(node);
              } else if (forward) {
                (forward as MutableRefObject<HTMLDivElement | null>).current = node;
              }
            }}
          />
        );
      }),
    [],
  );

  if (shouldForceStatic) {
    return (
      <div className={className} style={style}>
        <div
          ref={(node) => {
            scrollerRef.current = node ?? null;
          }}
          style={{ overflowY: 'auto', height: '100%' }}
        >
          {header}
          {items.length === 0 && emptyPlaceholder}
          {items.map((item, index) => {
            const key = getItemKey ? getItemKey(item) : index;
            return (
              <div
                key={key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
              >
                {renderItem(index, item)}
              </div>
            );
          })}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <VirtualizedListErrorBoundary onError={handleVirtualizationError}>
        <Virtuoso
          ref={attachVirtuosoRef}
          data={items}
          totalCount={firstItemIndex + items.length}
          firstItemIndex={firstItemIndex}
          itemContent={renderVirtualItem}
          computeItemKey={resolveVirtualItemKey}
          components={{
            Header: header ? () => <>{header}</> : undefined,
            Footer: footer ? () => <>{footer}</> : undefined,
            EmptyPlaceholder: emptyPlaceholder ? () => <>{emptyPlaceholder}</> : undefined,
            Scroller,
          }}
          followOutput={(isAtBottom) => {
            atBottomRef.current = isAtBottom;
            return isAtBottom ? 'auto' : false;
          }}
          atBottomStateChange={(isAtBottom) => {
            atBottomRef.current = isAtBottom;
            onAtBottomChange?.(isAtBottom);
          }}
          startReached={() => {
            if (hasMore && !isLoadingMore) {
              onLoadMore();
            }
          }}
        />
      </VirtualizedListErrorBoundary>
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & { ref?: ForwardedRef<VirtualizedListHandle> },
) => React.ReactElement;
