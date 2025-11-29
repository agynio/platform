import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('Conversation auto-scroll behavior', () => {
  beforeEach(() => {
    waitForStableScrollHeightMock.mockReset();
    waitForStableScrollHeightMock.mockImplementation(() => Promise.resolve());
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
    let scrollHeightValue = 0;
    let scrollTopValue = 0;

    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeightValue,
    });
    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });

    scrollHeightValue = 960;

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledWith(scrollArea);
    expect(scrollTopValue).toBe(960);
  });

  it('scrolls after runs load asynchronously for the selected thread', async () => {
    let resolveWait: (() => void) = () => {
      throw new Error('resolve not set');
    };
    waitForStableScrollHeightMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWait = resolve;
        }),
    );

    const { rerender } = render(
      <Conversation
        runs={[]}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    const scrollArea = screen.getByTestId('conversation-scroll-area') as HTMLDivElement;
    let scrollHeightValue = 0;
    let scrollTopValue = 0;

    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeightValue,
    });
    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();

    rerender(
      <Conversation
        runs={createRuns()}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    scrollHeightValue = 720;

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(scrollTopValue).toBe(720);
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
    let scrollHeightValue = 200;
    let scrollTopValue = 0;

    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeightValue,
    });
    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });

    scrollHeightValue = 200;
    await Promise.resolve();
    scrollHeightValue = 640;

    await act(async () => {
      resolveWait();
      await Promise.resolve();
    });

    expect(scrollTopValue).toBe(640);
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
    let scrollTopValue = 0;

    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalledTimes(1);
    expect(scrollTopValue).toBe(500);

    waitForStableScrollHeightMock.mockClear();

    scrollTopValue = 120;

    rerender(
      <Conversation
        runs={[
          {
            id: 'run-1',
            status: 'finished',
            messages: [
              { id: 'm1', role: 'user', content: 'Hello' },
              { id: 'm2', role: 'assistant', content: 'Hi there' },
              { id: 'm3', role: 'assistant', content: 'Extra' },
            ],
          },
        ]}
        activeThreadId="thread-1"
        className="h-full"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(scrollTopValue).toBe(120);
  });
});
