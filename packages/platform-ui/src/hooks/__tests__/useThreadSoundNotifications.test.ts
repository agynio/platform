import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useThreadSoundNotifications } from '../useThreadSoundNotifications';
import type { Thread } from '@/components/ThreadItem';

type MessagePayload = {
  threadId: string;
  message: {
    id: string;
    kind: 'user' | 'assistant' | 'system' | 'tool';
    text: string | null;
    source: unknown;
    createdAt: string;
    runId?: string;
  };
};

const messageHandlers = vi.hoisted(() => [] as Array<(payload: MessagePayload) => void>);
const onMessageCreatedMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: {
    onMessageCreated: onMessageCreatedMock,
  },
}));

interface MockAudioInstance {
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  preload: string;
  currentTime: number;
}

let audioRegistry: MockAudioInstance[];
const originalAudio = globalThis.Audio;

const createThread = (overrides: Partial<Thread> = {}): Thread => ({
  id: 'thread-1',
  summary: 'summary',
  agentName: 'Agent',
  createdAt: new Date().toISOString(),
  status: 'running',
  isOpen: true,
  ...overrides,
});

const createMessage = (kind: MessagePayload['message']['kind']): MessagePayload['message'] => ({
  id: `${kind}-message`,
  kind,
  text: null,
  source: null,
  createdAt: new Date().toISOString(),
});

describe('useThreadSoundNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    messageHandlers.length = 0;
    onMessageCreatedMock.mockReset();
    onMessageCreatedMock.mockImplementation((handler: (payload: MessagePayload) => void) => {
      messageHandlers.push(handler);
      return () => {
        const idx = messageHandlers.indexOf(handler);
        if (idx >= 0) {
          messageHandlers.splice(idx, 1);
        }
      };
    });

    audioRegistry = [];
    class MockAudio implements MockAudioInstance {
      public src: string;
      public play: ReturnType<typeof vi.fn>;
      public pause: ReturnType<typeof vi.fn>;
      public preload = '';
      public currentTime = 0;

      constructor(src: string) {
        this.src = src;
        this.play = vi.fn().mockResolvedValue(undefined);
        this.pause = vi.fn();
        audioRegistry.push(this);
      }
    }

    (globalThis as { Audio?: unknown }).Audio = MockAudio as unknown;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    if (originalAudio) {
      (globalThis as { Audio?: typeof originalAudio }).Audio = originalAudio;
    } else {
      delete (globalThis as { Audio?: unknown }).Audio;
    }
  });

  it('plays new-message audio for assistant messages', async () => {
    const threads = [createThread()];
    const { unmount } = renderHook(() => useThreadSoundNotifications({ threads }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onMessageCreatedMock).toHaveBeenCalledTimes(1);
    const handler = messageHandlers[0];
    expect(handler).toBeDefined();

    act(() => {
      handler?.({ threadId: threads[0]!.id, message: createMessage('assistant') });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const newMessageAudio = audioRegistry.find((audio) => audio.src.includes('new_message'));
    expect(newMessageAudio?.play).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not play audio for user messages', async () => {
    const threads = [createThread()];
    const { unmount } = renderHook(() => useThreadSoundNotifications({ threads }));

    await act(async () => {
      await Promise.resolve();
    });

    const handler = messageHandlers[0];
    expect(handler).toBeDefined();

    act(() => {
      handler?.({ threadId: threads[0]!.id, message: createMessage('user') });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const newMessageAudio = audioRegistry.find((audio) => audio.src.includes('new_message'));
    expect(newMessageAudio?.play).not.toHaveBeenCalled();

    unmount();
  });
});
