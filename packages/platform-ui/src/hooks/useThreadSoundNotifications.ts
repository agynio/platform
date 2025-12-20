import { useEffect, useMemo, useRef, useState } from 'react';
import type { Thread } from '@/components/ThreadItem';
import { graphSocket } from '@/lib/graph/socket';
import { ThreadSoundController } from '@/features/threads/ThreadSoundController';

type UseThreadSoundNotificationsOptions = {
  threads: Thread[];
  delayMs?: number;
};

const DEFAULT_DELAY_MS = 300;

const SOUND_PATHS = {
  newMessage: '/sounds/new_message.mp3',
  finished: '/sounds/finished.mp3',
} as const;

export function useThreadSoundNotifications({ threads, delayMs = DEFAULT_DELAY_MS }: UseThreadSoundNotificationsOptions) {
  const isBrowser = typeof window !== 'undefined' && typeof window.Audio === 'function';

  const audioRefs = useRef<{ newMessage?: HTMLAudioElement; finished?: HTMLAudioElement }>({});
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;

    const newMessage = new Audio(SOUND_PATHS.newMessage);
    const finished = new Audio(SOUND_PATHS.finished);

    newMessage.preload = 'auto';
    finished.preload = 'auto';

    audioRefs.current = { newMessage, finished };
    setAudioReady(true);

    return () => {
      if (typeof newMessage.pause === 'function') {
        newMessage.pause();
      }
      if (typeof finished.pause === 'function') {
        finished.pause();
      }
      audioRefs.current = {};
    };
  }, [isBrowser]);

  const rootIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    rootIdsRef.current = new Set(threads.map((thread) => thread.id));
  }, [threads]);

  const controllerRef = useRef<ThreadSoundController | null>(null);

  const playSound = useMemo(() => {
    const play = (audio: HTMLAudioElement | undefined) => {
      if (!audio) return;
      try {
        if (typeof audio.pause === 'function') {
          audio.pause();
        }
        audio.currentTime = 0;
        if (typeof audio.play === 'function') {
          const result = audio.play();
          if (result && typeof result.catch === 'function') {
            result.catch(() => {});
          }
        }
      } catch {
        // Ignore autoplay rejections or other playback issues.
      }
    };
    return {
      newMessage: () => play(audioRefs.current.newMessage),
      finished: () => play(audioRefs.current.finished),
    };
  }, []);

  useEffect(() => {
    if (!audioReady) return;

    const controller = new ThreadSoundController({
      delayMs,
      playNewMessage: playSound.newMessage,
      playFinished: playSound.finished,
      isRootThread: (threadId) => rootIdsRef.current.has(threadId),
    });

    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [audioReady, delayMs, playSound]);

  useEffect(() => {
    if (!audioReady) return;
    const controller = controllerRef.current;
    if (!controller) return;

    const unsubscribe = graphSocket.onMessageCreated(({ threadId, message }) => {
      if (message.kind === 'user') return;
      controller.handleMessageCreated(threadId);
    });

    return () => {
      unsubscribe();
    };
  }, [audioReady]);

  const previousStatusesRef = useRef<Map<string, Thread['status']>>(new Map());
  const statusesInitializedRef = useRef(false);

  useEffect(() => {
    if (!audioReady) return;
    const controller = controllerRef.current;
    if (!controller) return;

    const previous = previousStatusesRef.current;
    const isInitialized = statusesInitializedRef.current;
    for (const thread of threads) {
      const prevStatus = previous.get(thread.id);
      if (isInitialized && prevStatus !== undefined && thread.status === 'finished' && prevStatus !== 'finished') {
        controller.handleThreadFinished(thread.id);
      }
      previous.set(thread.id, thread.status);
    }

    for (const key of Array.from(previous.keys())) {
      if (!rootIdsRef.current.has(key)) {
        previous.delete(key);
      }
    }
    statusesInitializedRef.current = true;
  }, [threads, audioReady]);
}
