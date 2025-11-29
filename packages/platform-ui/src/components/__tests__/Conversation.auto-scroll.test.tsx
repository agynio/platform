import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Conversation, type Run } from '../Conversation';
import { waitForStableScrollHeight } from '../agents/waitForStableScrollHeight';

vi.mock('../agents/waitForStableScrollHeight', () => ({
  waitForStableScrollHeight: vi.fn(() => Promise.resolve()),
}));

const waitForStableScrollHeightMock = vi.mocked(waitForStableScrollHeight);

function createRuns(): Run[] {
  return [
    {
      id: 'run-1',
      status: 'finished',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ],
    },
  ];
}

function setupScrollAreaMock(scrollArea: HTMLDivElement) {
  let scrollHeightValue = 0;
  let lastScrollOptions: ScrollToOptions | number | undefined;

  Object.defineProperty(scrollArea, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeightValue,
  });

  const scrollToMock = vi.fn((options: ScrollToOptions | number) => {
    lastScrollOptions = options;
  });

  Object.defineProperty(scrollArea, 'scrollTo', {
    configurable: true,
    writable: true,
    value: scrollToMock,
  });

  return {
    setScrollHeight(value: number) {
      scrollHeightValue = value;
    },
    getLastScrollTop(): number {
      if (typeof lastScrollOptions === 'number') {
        return lastScrollOptions;
      }
      return lastScrollOptions?.top ?? 0;
    },
    getLastScrollOptions() {
      return lastScrollOptions;
    },
    scrollToMock,
  };
}

describe('Conversation auto-scroll behavior', () => {
  beforeEach(() => {
    waitForStableScrollHeightMock.mockReset();
    waitForStableScrollHeightMock.mockImplementation(() => Promise.resolve());

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls to the bottom after the scroll height stabilizes', async () => {
    let resolveWait: (() => void) = () => {
      throw new Error('resolve not set');
    };
    waitForStableScrollHeightMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWait = resolve;
        }),
    );

    render(
      <Conversation
        runs={createRuns()}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    const scrollArea = screen.getByTestId('conversation-scroll-area') as HTMLDivElement;
    const { setScrollHeight, scrollToMock, getLastScrollOptions, getLastScrollTop } = setupScrollAreaMock(scrollArea);

    setScrollHeight(960);

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledWith(scrollArea);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: 960, behavior: 'auto' }));
    expect(getLastScrollTop()).toBe(960);
    expect(getLastScrollOptions()).toEqual(expect.objectContaining({ top: 960, behavior: 'auto' }));
  });

  it('scrolls only after transcript hydration when runs start empty', async () => {
    const { rerender } = render(
      <Conversation
        runs={[]}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    const scrollArea = screen.getByTestId('conversation-scroll-area') as HTMLDivElement;
    const { setScrollHeight, scrollToMock, getLastScrollTop } = setupScrollAreaMock(scrollArea);

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();

    rerender(
      <Conversation
        runs={[
          {
            id: 'run-1',
            status: 'finished',
            messages: [],
          },
        ]}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(getLastScrollTop()).toBe(0);

    let resolveWait: (() => void) = () => {
      throw new Error('resolve not set');
    };
    waitForStableScrollHeightMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWait = resolve;
        }),
    );

    setScrollHeight(720);

    rerender(
      <Conversation
        runs={createRuns()}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: 720, behavior: 'auto' }));
    expect(getLastScrollTop()).toBe(720);
  });

  it('uses the latest scroll height after dynamic content growth', async () => {
    let resolveWait: (() => void) = () => {
      throw new Error('resolve not set');
    };
    waitForStableScrollHeightMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWait = resolve;
        }),
    );

    render(
      <Conversation
        runs={createRuns()}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    const scrollArea = screen.getByTestId('conversation-scroll-area') as HTMLDivElement;
    const { setScrollHeight, scrollToMock, getLastScrollTop } = setupScrollAreaMock(scrollArea);

    setScrollHeight(200);
    await Promise.resolve();
    setScrollHeight(640);

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: 640 }));
    expect(getLastScrollTop()).toBe(640);
  });

  it('does not auto-follow updates for the same active thread after the initial scroll', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation
        runs={runs}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    const scrollArea = screen.getByTestId('conversation-scroll-area') as HTMLDivElement;
    const { setScrollHeight, scrollToMock } = setupScrollAreaMock(scrollArea);

    setScrollHeight(500);

    await Promise.resolve();

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: 500 }));

    waitForStableScrollHeightMock.mockClear();

    rerender(
      <Conversation
        runs={[
          {
            ...runs[0],
            messages: [
              ...runs[0].messages,
              { id: 'm3', role: 'assistant', content: 'Extra' },
            ],
          },
        ]}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    setScrollHeight(700);

    await Promise.resolve();

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });
});
