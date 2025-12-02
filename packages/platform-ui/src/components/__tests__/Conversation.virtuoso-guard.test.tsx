import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Conversation, type ConversationHandle, type Run } from '../Conversation';
import { waitForStableScrollHeight } from '../agents/waitForStableScrollHeight';
import type { MockVirtualizedListInstance } from './__mocks__/virtualizedListMock';

vi.mock('../agents/waitForStableScrollHeight', () => ({
  waitForStableScrollHeight: vi.fn(() => Promise.resolve()),
}));

vi.mock('../VirtualizedList', async () => await import('./__mocks__/virtualizedListMock'));

const waitForStableScrollHeightMock = vi.mocked(waitForStableScrollHeight);

type VirtualizedListMockModule = {
  __virtualizedListMock: {
    getInstances: () => MockVirtualizedListInstance[];
    clear: () => void;
  };
};

let virtualizedListMockModule: VirtualizedListMockModule;

describe('Conversation virtuoso guard', () => {
  beforeAll(async () => {
    virtualizedListMockModule = (await import('../VirtualizedList')) as unknown as VirtualizedListMockModule;
  });

  beforeEach(() => {
    waitForStableScrollHeightMock.mockClear();
    virtualizedListMockModule.__virtualizedListMock.clear();
  });

  afterEach(() => {
    waitForStableScrollHeightMock.mockClear();
    virtualizedListMockModule.__virtualizedListMock.clear();
  });

  function getLatestInstance(): MockVirtualizedListInstance {
    const instances = virtualizedListMockModule.__virtualizedListMock.getInstances();
    if (instances.length === 0) {
      throw new Error('VirtualizedList instance was not created');
    }
    return instances[instances.length - 1];
  }

  it('skips restore when snapshot lacks range data and keeps loader visible', async () => {
    const ref = React.createRef<ConversationHandle>();
    const runs: Run[] = [];

    render(
      <Conversation
        ref={ref}
        threadId="thread-guard"
        runs={runs}
        hydrationComplete={false}
        isActive
      />,
    );

    const instance = getLatestInstance();

    act(() => {
      instance.setAtBottom(false);
    });

    instance.captureScrollPosition.mockResolvedValueOnce(null);

    const captured = await ref.current?.captureScrollState();
    expect(captured).toBeNull();

    await act(async () => {
      ref.current?.restoreScrollState({ index: Number.NaN, scrollTop: Number.NaN, atBottom: false });
      await Promise.resolve();
    });

    expect(instance.scrollToIndex).not.toHaveBeenCalled();
    expect(instance.scrollTo).not.toHaveBeenCalled();
    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();
  });
});
