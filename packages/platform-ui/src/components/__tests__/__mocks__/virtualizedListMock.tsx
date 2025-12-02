import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
  type MutableRefObject,
} from 'react';
import { vi } from 'vitest';

export type MockVirtualizedListInstance = {
  scrollToIndex: ReturnType<typeof vi.fn>;
  scrollTo: ReturnType<typeof vi.fn>;
  captureScrollPosition: ReturnType<typeof vi.fn>;
  restoreScrollPosition: ReturnType<typeof vi.fn>;
  setAtBottom: (value: boolean) => void;
  getScroller: () => HTMLDivElement | null;
};

const instances: MockVirtualizedListInstance[] = [];

const createInstance = (propsRef: MutableRefObject<any>, scrollerRef: MutableRefObject<HTMLDivElement | null>) => {
  const scrollToIndex = vi.fn();
  const scrollTo = vi.fn();
  const captureScrollPosition = vi.fn(() => Promise.resolve<{ index?: number; scrollTop?: number } | null>({ index: undefined, scrollTop: 0 }));
  const restoreScrollPosition = vi.fn();
  let atBottom = true;

  return {
    scrollToIndex,
    scrollTo,
    captureScrollPosition,
    restoreScrollPosition,
    setAtBottom(value: boolean) {
      atBottom = value;
      propsRef.current.onAtBottomChange?.(value);
    },
    getScroller: () => scrollerRef.current,
    isAtBottom: () => atBottom,
  } satisfies MockVirtualizedListInstance & { isAtBottom: () => boolean };
};

export const VirtualizedList = forwardRef(function MockVirtualizedList(props: any, ref: ForwardedRef<any>) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const { header, footer, items = [], renderItem, getItemKey, onAtBottomChange } = props;

  const instanceRef = useRef<ReturnType<typeof createInstance> | null>(null);
  if (!instanceRef.current) {
    instanceRef.current = createInstance(propsRef, scrollerRef);
    instances.push(instanceRef.current);
  }

  useImperativeHandle(ref, () => ({
    scrollToIndex: (...args: unknown[]) => instanceRef.current?.scrollToIndex(...args),
    scrollTo: (...args: unknown[]) => instanceRef.current?.scrollTo(...args),
    getScrollerElement: () => scrollerRef.current,
    isAtBottom: () => instanceRef.current?.isAtBottom() ?? true,
    captureScrollPosition: () => instanceRef.current?.captureScrollPosition(),
    restoreScrollPosition: (position: unknown) => instanceRef.current?.restoreScrollPosition(position),
  }));

  useEffect(() => {
    return () => {
      const current = instanceRef.current as MockVirtualizedListInstance | null;
      if (!current) return;
      const idx = instances.indexOf(current);
      if (idx >= 0) instances.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    onAtBottomChange?.(instanceRef.current?.isAtBottom() ?? true);
    return () => {};
  }, [onAtBottomChange]);

  return (
    <div data-testid="mock-virtualized-list" ref={scrollerRef} style={{ overflowY: 'auto', height: '100%' }}>
      {header}
      {items.map((item: unknown, index: number) => {
        const key = getItemKey ? getItemKey(item) : index;
        return <div key={key}>{renderItem(index, item)}</div>;
      })}
      {footer}
    </div>
  );
});

export const __virtualizedListMock = {
  getInstances: () => instances as MockVirtualizedListInstance[],
  clear: () => {
    instances.splice(0, instances.length);
  },
};

export default VirtualizedList;
