import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import React from 'react';
import { FullscreenMarkdownEditor } from '../FullscreenMarkdownEditor';

class ResizeObserverMock {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {}

  unobserve() {}

  disconnect() {}
}

interface ScrollController {
  setScrollTop: (value: number) => void;
  setScrollHeight: (value: number) => void;
  setClientHeight: (value: number) => void;
  readonly scrollTop: number;
  readonly setCalls: number;
  resetSetCalls: () => void;
}

const setupScrollController = (
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number }
): ScrollController => {
  let scrollHeightValue = metrics.scrollHeight;
  let clientHeightValue = metrics.clientHeight;
  let scrollTopValue = metrics.scrollTop ?? 0;
  let setterCalls = 0;

  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeightValue,
  });

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeightValue,
  });

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTopValue,
    set: (value: number) => {
      setterCalls += 1;
      scrollTopValue = value;
    },
  });

  return {
    setScrollTop(value: number) {
      scrollTopValue = value;
    },
    setScrollHeight(value: number) {
      scrollHeightValue = value;
    },
    setClientHeight(value: number) {
      clientHeightValue = value;
    },
    get scrollTop() {
      return scrollTopValue;
    },
    get setCalls() {
      return setterCalls;
    },
    resetSetCalls() {
      setterCalls = 0;
    },
  };
};

let rafCallbacks: Array<FrameRequestCallback | null> = [];

const installAnimationFrameMocks = () => {
  rafCallbacks = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length - 1;
  });

  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
    if (rafCallbacks[id]) {
      rafCallbacks[id] = null;
    }
  });
};

const flushAnimationFrames = async () => {
  await act(async () => {
    while (rafCallbacks.some(Boolean)) {
      const queue = [...rafCallbacks];
      rafCallbacks = [];
      queue.forEach((callback) => {
        callback?.(performance.now());
      });
    }
  });
};

const initialMarkdown = Array.from({ length: 120 }, (_, index) => `Line ${index + 1}`).join('\n');

const getEditor = () =>
  screen.getByPlaceholderText('Start typing your markdown here...') as HTMLTextAreaElement;

const getPreviewScrollContainer = () => {
  const previewHeading = screen.getByRole('heading', { name: 'Preview' });
  const container = previewHeading.parentElement?.nextElementSibling;

  if (!(container instanceof HTMLElement)) {
    throw new Error('Preview scroll container not found');
  }

  return container as HTMLDivElement;
};

describe('FullscreenMarkdownEditor scroll sync', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeAll(() => {
    originalResizeObserver = window.ResizeObserver;
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      originalResizeObserver;
  });

  beforeEach(() => {
    installAnimationFrameMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rafCallbacks = [];
  });

  it('syncs the preview proportionally with editor scroll', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 800,
      clientHeight: 200,
    });

    await flushAnimationFrames();

    editorControl.setScrollTop(100);
    fireEvent.scroll(editor);
    await flushAnimationFrames();

    expect(previewControl.scrollTop).toBeCloseTo(300);
  });

  it('syncs the editor proportionally with preview scroll', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 800,
      clientHeight: 200,
    });

    await flushAnimationFrames();
    editorControl.resetSetCalls();
    previewControl.resetSetCalls();

    previewControl.setScrollTop(300);
    fireEvent.scroll(previewScroll);
    await flushAnimationFrames();

    expect(editorControl.scrollTop).toBeCloseTo(100);
    expect(editorControl.setCalls).toBe(1);
  });

  it('avoids recursive scroll loops when syncing', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 800,
      clientHeight: 200,
    });

    await flushAnimationFrames();
    editorControl.resetSetCalls();
    previewControl.resetSetCalls();

    editorControl.setScrollTop(120);
    fireEvent.scroll(editor);
    await flushAnimationFrames();

    expect(editorControl.setCalls).toBe(0);
    expect(previewControl.setCalls).toBe(1);

    editorControl.resetSetCalls();
    previewControl.resetSetCalls();

    previewControl.setScrollTop(360);
    fireEvent.scroll(previewScroll);
    await flushAnimationFrames();

    expect(previewControl.setCalls).toBe(0);
    expect(editorControl.setCalls).toBe(1);
  });

  it('handles no-scroll content without applying offsets', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 200,
      clientHeight: 200,
    });

    await flushAnimationFrames();
    previewControl.resetSetCalls();

    editorControl.setScrollTop(150);
    fireEvent.scroll(editor);
    await flushAnimationFrames();

    expect(previewControl.scrollTop).toBe(0);
    expect(previewControl.setCalls).toBe(1);
  });

  it('reapplies alignment after markdown content changes', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 800,
      clientHeight: 200,
    });

    await flushAnimationFrames();

    editorControl.setScrollTop(100);
    fireEvent.scroll(editor);
    await flushAnimationFrames();

    expect(previewControl.scrollTop).toBeCloseTo(300);

    editorControl.setScrollHeight(600);
    previewControl.setScrollHeight(1200);

    fireEvent.change(editor, {
      target: { value: `${initialMarkdown}\n\nAdditional content block` },
    });
    await flushAnimationFrames();

    const editorMaxScroll = 600 - 200;
    const previewMaxScroll = 1200 - 200;
    const expectedRatio = editorControl.scrollTop / editorMaxScroll;

    expect(previewControl.scrollTop).toBeCloseTo(expectedRatio * previewMaxScroll);
  });

  it('keeps editor position when typing after preview was last scrolled', async () => {
    render(<FullscreenMarkdownEditor value={initialMarkdown} onChange={vi.fn()} onClose={vi.fn()} />);

    const editor = getEditor();
    const previewScroll = getPreviewScrollContainer();
    const editorControl = setupScrollController(editor, { scrollHeight: 400, clientHeight: 200, scrollTop: 80 });
    const previewControl = setupScrollController(previewScroll, {
      scrollHeight: 800,
      clientHeight: 200,
    });

    await flushAnimationFrames();

    fireEvent.scroll(editor);
    await flushAnimationFrames();

    previewControl.resetSetCalls();
    editorControl.resetSetCalls();

    previewControl.setScrollTop(360);
    fireEvent.scroll(previewScroll);
    await flushAnimationFrames();

    previewControl.resetSetCalls();
    editorControl.resetSetCalls();

    const initialEditorScroll = editorControl.scrollTop;

    fireEvent.change(editor, {
      target: { value: `${initialMarkdown}\nupdate` },
    });
    await flushAnimationFrames();

    expect(editorControl.scrollTop).toBe(initialEditorScroll);
    expect(editorControl.setCalls).toBe(0);
    expect(previewControl.setCalls).toBe(1);
  });
});
