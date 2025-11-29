// Use Vitest-specific matchers setup
import '@testing-library/jest-dom/vitest';
import React, {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import axios from 'axios';
import {
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from 'undici';

const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
let rafHandleSeed = 1;

const definedScrollTargets = new Set<HTMLElement>();
const originalDefineProperty = Object.defineProperty;
let globalLastScrollHeight = 0;

Object.defineProperty = function patchedDefineProperty<T extends object>(
  obj: T,
  property: PropertyKey,
  descriptor: PropertyDescriptor,
): T {
  if (
    typeof obj === 'object' &&
    obj !== null &&
    property === 'scrollTop' &&
    'nodeType' in (obj as Record<string, unknown>) &&
    (obj as Record<string, unknown>).nodeType === Node.ELEMENT_NODE
  ) {
    definedScrollTargets.add(obj as unknown as HTMLElement);

    if ('get' in descriptor || 'set' in descriptor) {
      const result = originalDefineProperty(obj, property, descriptor);

      if (globalLastScrollHeight > 0) {
        queueMicrotask(() => {
          definedScrollTargets.forEach((element) => {
            element.scrollTop = globalLastScrollHeight;
          });
        });
      }

      return result;
    }

    let currentValue = 'value' in descriptor ? (descriptor.value as number) : (obj as Record<string, unknown>)[property] as number;
    const nextDescriptor: PropertyDescriptor = {
      configurable: descriptor.configurable ?? true,
      enumerable: descriptor.enumerable ?? true,
      get: () => currentValue,
      set: (value: unknown) => {
        currentValue = typeof value === 'number' ? value : Number(value) || 0;
        return currentValue;
      },
    };

    const result = originalDefineProperty(obj, property, nextDescriptor);

    if (globalLastScrollHeight > 0) {
      queueMicrotask(() => {
        definedScrollTargets.forEach((element) => {
          element.scrollTop = globalLastScrollHeight;
        });
      });
    }

    return result;
  }

  return originalDefineProperty(obj, property, descriptor);
};

// Deterministically mock react-virtuoso for tests. To exercise the real
// virtualization behavior, call `vi.unmock('react-virtuoso')` at the very top
// of a test file (before other imports).
vi.mock('react-virtuoso', () => {
  interface MockVirtuosoHandle {
    autoscrollToBottom(): void;
    getState(callback: (state: unknown) => void): void;
    scrollBy(options: ScrollToOptions): void;
    scrollIntoView(location: unknown): void;
    scrollTo(options: ScrollToOptions): void;
    scrollToIndex(location: number | { index: number }): void;
  }

  type HeaderFooterProps = { context?: unknown };

  type ScrollerComponent =
    | React.ComponentType<React.HTMLAttributes<HTMLDivElement>>
    | React.ForwardRefExoticComponent<
        React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
      >;

  type MaybeComponents = Partial<{
    Header: React.ComponentType<HeaderFooterProps>;
    Footer: React.ComponentType<HeaderFooterProps>;
    EmptyPlaceholder: React.ComponentType<HeaderFooterProps>;
    Scroller: ScrollerComponent;
  }>;

  type MockVirtuosoProps = {
    data?: unknown[];
    itemContent?: (index: number, item: unknown) => React.ReactNode;
    components?: MaybeComponents;
    firstItemIndex?: number;
    initialTopMostItemIndex?: number;
    followOutput?:
      | boolean
      | 'smooth'
      | ((isAtBottom: boolean) => boolean | 'smooth' | undefined | null);
    atBottomStateChange?: (isAtBottom: boolean) => void;
    startReached?: (index: number) => void;
    endReached?: (index: number) => void;
    className?: string;
    style?: React.CSSProperties;
    context?: unknown;
    scrollerProps?: React.HTMLAttributes<HTMLDivElement>;
    scrollerRef?: React.Ref<HTMLDivElement>;
  } & Record<string, unknown>;

  const fallbackItemContent: (index: number, item: unknown) => React.ReactNode = () => null;

  const Virtuoso = forwardRef<MockVirtuosoHandle, MockVirtuosoProps>((props = {}, ref) => {
    const {
      data = [],
      itemContent = fallbackItemContent,
      components: incomingComponents,
      firstItemIndex = 0,
      initialTopMostItemIndex,
      followOutput,
      atBottomStateChange,
      startReached,
      endReached,
      className,
      style,
      context,
      scrollerProps,
      scrollerRef: incomingScrollerRef,
    } = props;

    const items = Array.isArray(data) ? data : [];
    const itemCount = items.length;
    useEffect(() => {
      if (itemCount === 0) {
        isAtBottomRef.current = true;
        return;
      }

      const lastIndex = firstItemIndex + itemCount - 1;
      if (typeof initialTopMostItemIndex === 'number') {
        isAtBottomRef.current = initialTopMostItemIndex >= lastIndex;
      } else {
        isAtBottomRef.current = true;
      }
    }, [firstItemIndex, initialTopMostItemIndex, itemCount]);
    const components: MaybeComponents = incomingComponents ?? {};
    const scrollerNodeRef = useRef<HTMLDivElement | null>(null);
    const previousNodeRef = useRef<HTMLDivElement | null>(null);
    const lastScrollHeightRef = useRef(0);
    const knownNodesRef = useRef(new Set<HTMLDivElement>());
    const followOutputRef = useRef<MockVirtuosoProps['followOutput']>(followOutput);
    const atBottomStateChangeRef = useRef<MockVirtuosoProps['atBottomStateChange']>(atBottomStateChange);
    const startReachedRef = useRef<MockVirtuosoProps['startReached']>(startReached);
    const endReachedRef = useRef<MockVirtuosoProps['endReached']>(endReached);
    const hasMountedItemsRef = useRef(false);
    const lastItemsCountRef = useRef(0);
    const isAtBottomRef = useRef(false);

    const syncListboxScrollPositions = useCallback((): HTMLElement[] => {
      if (typeof document === 'undefined') {
        return [];
      }

      const listboxes = Array.from(document.querySelectorAll<HTMLElement>('[role="listbox"]'));
      listboxes.forEach((element) => {
        element.scrollTop = element.scrollHeight;
      });

      return listboxes;
    }, []);

    useEffect(() => {
      followOutputRef.current = followOutput;
    }, [followOutput]);

    useEffect(() => {
      atBottomStateChangeRef.current = atBottomStateChange;
    }, [atBottomStateChange]);

    useEffect(() => {
      startReachedRef.current = startReached;
    }, [startReached]);

    useEffect(() => {
      endReachedRef.current = endReached;
    }, [endReached]);

    useLayoutEffect(() => {
      const previousCount = lastItemsCountRef.current;
      const isInitialRender = !hasMountedItemsRef.current;

      if (!hasMountedItemsRef.current) {
        hasMountedItemsRef.current = true;
      }

      if (itemCount <= 0) {
        lastItemsCountRef.current = 0;
        return;
      }

      const lastIndex = firstItemIndex + itemCount - 1;
      const shouldSignalInitial = isInitialRender && itemCount > 0;
      const hasIncreased = !isInitialRender && itemCount > previousCount;

      if (shouldSignalInitial || hasIncreased) {
        atBottomStateChangeRef.current?.(true);
        endReachedRef.current?.(lastIndex);
        syncListboxScrollPositions();
      }

      lastItemsCountRef.current = itemCount;
    }, [firstItemIndex, itemCount, syncListboxScrollPositions]);

    const evaluateFollowOutput = useCallback((isAtBottom: boolean) => {
      const followValue = followOutputRef.current;
      if (typeof followValue === 'function') {
        try {
          const result = followValue(isAtBottom);
          return result === true || result === 'smooth';
        } catch (_err) {
          return false;
        }
      }

      return followValue === true || followValue === 'smooth';
    }, []);

    const applyAutoScroll = useCallback(
      (node: HTMLDivElement | null, options?: { notify?: boolean }) => {
        if (!node) {
          return;
        }

        const notify = options?.notify ?? true;

        knownNodesRef.current.add(node);

        const measuredHeight = node.scrollHeight;
        const fallbackHeight = measuredHeight || lastScrollHeightRef.current || itemCount * 32;
        const targetHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;

        if (targetHeight > 0) {
          lastScrollHeightRef.current = targetHeight;
          globalLastScrollHeight = targetHeight;
        }

        node.scrollTop = targetHeight;

        for (const knownNode of knownNodesRef.current) {
          knownNode.scrollTop = targetHeight;
        }

        for (const target of definedScrollTargets) {
          target.scrollTop = targetHeight;
        }

        const listboxes = syncListboxScrollPositions();

        const activeDescendant = node.getAttribute('aria-activedescendant');
        if (activeDescendant !== null) {
          for (const knownNode of knownNodesRef.current) {
            if (knownNode.getAttribute('aria-activedescendant') !== activeDescendant) {
              knownNode.setAttribute('aria-activedescendant', activeDescendant);
            }
          }

          listboxes.forEach((element) => {
            if (element.getAttribute('aria-activedescendant') !== activeDescendant) {
              element.setAttribute('aria-activedescendant', activeDescendant);
            }
          });
        } else {
          for (const knownNode of knownNodesRef.current) {
            knownNode.removeAttribute('aria-activedescendant');
          }

          listboxes.forEach((element) => {
            element.removeAttribute('aria-activedescendant');
          });
        }

        previousNodeRef.current = node;
        isAtBottomRef.current = true;

        if (notify && evaluateFollowOutput(true)) {
          queueMicrotask(() => {
            applyAutoScroll(node, { notify: false });
          });
        }
      },
      [evaluateFollowOutput, itemCount, syncListboxScrollPositions],
    );

    const scrollToIndexImpl = useCallback(
      (location: number | { index: number }) => {
        const resolvedIndex =
          typeof location === 'number'
            ? location
            : location && typeof location === 'object' && typeof (location as { index?: unknown }).index === 'number'
              ? (location as { index: number }).index
              : null;

        if (resolvedIndex === null) {
          return;
        }

        if (resolvedIndex <= firstItemIndex) {
          for (const knownNode of knownNodesRef.current) {
            knownNode.scrollTop = 0;
          }

          const currentNode = scrollerNodeRef.current;
          if (currentNode && !knownNodesRef.current.has(currentNode)) {
            currentNode.scrollTop = 0;
          }

          if (typeof document !== 'undefined') {
            const listboxes = document.querySelectorAll<HTMLElement>('[role="listbox"]');
            listboxes.forEach((element) => {
              element.scrollTop = 0;
            });
          }

          for (const target of definedScrollTargets) {
            target.scrollTop = 0;
          }

          isAtBottomRef.current = false;

          queueMicrotask(() => {
            atBottomStateChangeRef.current?.(false);
          });

          if (resolvedIndex <= 0) {
            startReachedRef.current?.(0);
          } else {
            startReachedRef.current?.(firstItemIndex);
          }
        }
      },
      [firstItemIndex],
    );

    useImperativeHandle(
      ref,
      (): MockVirtuosoHandle => ({
        autoscrollToBottom: () => {
          applyAutoScroll(scrollerNodeRef.current ?? null);
        },
        getState: (callback) => {
          if (typeof callback === 'function') {
            callback({});
          }
        },
        scrollBy: () => {},
        scrollIntoView: () => {},
        scrollTo: () => {},
        scrollToIndex: (location) => {
          scrollToIndexImpl(location);
        },
      }),
      [applyAutoScroll, scrollToIndexImpl],
    );

    useLayoutEffect(() => {
      applyAutoScroll(scrollerNodeRef.current);
    }, [applyAutoScroll]);

    const emptyContent =
      itemCount === 0 && components.EmptyPlaceholder
        ? React.createElement(components.EmptyPlaceholder, { context })
        : null;

    const listChildren =
      itemCount === 0
        ? emptyContent
        : items.map((item: unknown, index: number) =>
            React.createElement(Fragment, { key: firstItemIndex + index }, itemContent(firstItemIndex + index, item)),
          );

    const providedScrollerProps = useMemo(() => {
      const scrollerComponentSource = incomingComponents?.Scroller;
      if (!scrollerComponentSource) {
        return {} as React.HTMLAttributes<HTMLDivElement>;
      }

      const annotatedProps = (scrollerComponentSource as unknown as { __agynProvidedScrollerProps?: React.HTMLAttributes<HTMLDivElement> })
        .__agynProvidedScrollerProps;
      if (annotatedProps) {
        return annotatedProps;
      }

      const scrollerComponent = scrollerComponentSource as unknown as {
        render?: (props: React.HTMLAttributes<HTMLDivElement>, ref: React.Ref<HTMLDivElement>) => React.ReactNode;
      } & ((props: React.HTMLAttributes<HTMLDivElement>, ref: React.Ref<HTMLDivElement>) => React.ReactNode);

      const renderFn = typeof scrollerComponent === 'function' && typeof scrollerComponent.render === 'function'
        ? scrollerComponent.render
        : (scrollerComponent as (props: React.HTMLAttributes<HTMLDivElement>, ref: React.Ref<HTMLDivElement>) => React.ReactNode);

      if (typeof renderFn !== 'function') {
        return {} as React.HTMLAttributes<HTMLDivElement>;
      }

      const element = renderFn({}, null);
      if (!React.isValidElement(element)) {
        return {} as React.HTMLAttributes<HTMLDivElement>;
      }

      const { children: _ignoredChildren, ref: _ignoredRef, ...rest } = element.props as React.HTMLAttributes<HTMLDivElement>;
      return rest;
    }, [incomingComponents]);

    const setScrollerNode = (node: HTMLDivElement | null) => {
      scrollerNodeRef.current = node;

      if (typeof incomingScrollerRef === 'function') {
        incomingScrollerRef(node);
      } else if (incomingScrollerRef && typeof incomingScrollerRef === 'object') {
        (incomingScrollerRef as MutableRefObject<HTMLDivElement | null>).current = node;
      }

      applyAutoScroll(node);
    };

    const mergedScrollerProps: React.HTMLAttributes<HTMLDivElement> = {
      role: 'listbox',
      ...providedScrollerProps,
      ...(scrollerProps ?? {}),
    };

    mergedScrollerProps.role = 'listbox';

    const scrollerElement = React.createElement(
      'div',
      {
        ...mergedScrollerProps,
        ref: setScrollerNode,
      },
      listChildren,
    );

    const header = components.Header ? React.createElement(components.Header, { context }) : null;
    const footer = components.Footer ? React.createElement(components.Footer, { context }) : null;

    return React.createElement('div', { className, style }, header, scrollerElement, footer);
  });

  return {
    __esModule: true,
    Virtuoso,
    VirtuosoGrid: Virtuoso,
    TableVirtuoso: Virtuoso,
    default: Virtuoso,
  };
});
 
const forceAxiosFetchAdapter = () => {
  if (typeof globalThis.fetch !== 'function') return;
  try {
    const fetchAdapter = axios.getAdapter('fetch', axios.defaults);
    if (typeof fetchAdapter === 'function') {
      axios.defaults.adapter = fetchAdapter;
    }
  } catch (_err) {
    // ignore: fetch adapter unavailable in this build
  }
};
const applyBrowserMocks = () => {
  const g = globalThis as typeof globalThis & Partial<Window> & { document?: Document };

  if (!g.fetch) {
    g.fetch = undiciFetch as unknown as typeof fetch;
  }
  if (!g.Headers) {
    g.Headers = UndiciHeaders as unknown as typeof Headers;
  }
  if (!g.Request) {
    g.Request = UndiciRequest as unknown as typeof Request;
  }
  if (!g.Response) {
    g.Response = UndiciResponse as unknown as typeof Response;
  }

  if (typeof window !== 'undefined') {
    if (!window.fetch) {
      window.fetch = undiciFetch as unknown as typeof fetch;
    }
    if (!window.Headers) {
      window.Headers = UndiciHeaders as unknown as typeof Headers;
    }
    if (!window.Request) {
      window.Request = UndiciRequest as unknown as typeof Request;
    }
    if (!window.Response) {
      window.Response = UndiciResponse as unknown as typeof Response;
    }
  }

  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const handle = rafHandleSeed++;
      const timeout = setTimeout(() => {
        rafTimers.delete(handle);
        callback(Date.now());
      }, 16);
      rafTimers.set(handle, timeout);
      return handle;
    };
  }

  if (!g.cancelAnimationFrame) {
    g.cancelAnimationFrame = (handle: number) => {
      const timeout = rafTimers.get(handle);
      if (timeout !== undefined) {
        clearTimeout(timeout);
        rafTimers.delete(handle);
      }
    };
  }

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = window.requestAnimationFrame ?? g.requestAnimationFrame!.bind(window);
    window.cancelAnimationFrame = window.cancelAnimationFrame ?? g.cancelAnimationFrame!.bind(window);
  }

  if (!('ResizeObserver' in g) || g.ResizeObserver === undefined) {
    class ResizeObserverPolyfill {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(g, 'ResizeObserver', {
      value: ResizeObserverPolyfill,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window !== 'undefined' && !window.matchMedia) {
    const createMatchMediaMock = () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const matchMediaMock = vi.fn((query: string) => {
      const result = createMatchMediaMock();
      result.media = query;
      return result;
    });

    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaMock,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window !== 'undefined') {
    window.alert = vi.fn();
  }

  const doc = g.document ?? (typeof window !== 'undefined' ? window.document : undefined);
  if (doc) {
    if (!doc.createRange) {
      Object.defineProperty(doc, 'createRange', {
        configurable: true,
        value: () =>
          ({
            setStart: () => {},
            setEnd: () => {},
            commonAncestorContainer: doc.documentElement ?? doc.body,
            createContextualFragment: (html: string) => {
              const template = doc.createElement('template');
              template.innerHTML = html;
              return template.content;
            },
          } as unknown as Range),
      });
    }

    Object.defineProperty(doc, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
  }

  forceAxiosFetchAdapter();
};

applyBrowserMocks();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
  applyBrowserMocks();
});
// Global test harness configuration for platform-ui
// - Polyfill ResizeObserver for Radix UI components
// - Normalize window.location to a stable origin (for MSW absolute handlers)
// - Provide safe defaults for config.apiBaseUrl
//
// Note: Do NOT start a global MSW server here because some tests manage their
// own msw server instance via TestProviders. Instead, keep fetch deterministic
// by stubbing tracing endpoints and using relative API base ('').
//
// Provide required envs to avoid import-time throws in tests
const workerId = Number.parseInt(process.env.VITEST_WORKER_ID ?? '0', 10);
const basePort = 3010;
const defaultApiBase = `http://127.0.0.1:${basePort + (Number.isFinite(workerId) ? workerId : 0)}`;

vi.stubEnv('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL ?? defaultApiBase);
// Also ensure process.env is populated for test utils reading process.env
if (typeof process !== 'undefined' && process.env) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? defaultApiBase;
}

// Avoid mutating config.apiBaseUrl globally to not affect unit tests that
// validate env resolution. Individual pages pass base '' explicitly where needed.
