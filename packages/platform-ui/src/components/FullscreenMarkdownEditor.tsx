import { useState, useEffect, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { Eye, Code, SplitSquareVertical } from 'lucide-react';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';

interface FullscreenMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  label?: string;
}

type ViewMode = 'split' | 'edit' | 'preview';

type ScrollSource = 'editor' | 'preview';

const clampRatio = (value: number): number => {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
};

const getScrollRatio = (element: HTMLElement): number => {
  const maxScroll = element.scrollHeight - element.clientHeight;

  if (maxScroll <= 0) {
    return 0;
  }

  return element.scrollTop / maxScroll;
};

const scheduleScrollUpdate = (
  target: HTMLElement,
  ratio: number,
  suppressRef: MutableRefObject<number>,
  rafRef: MutableRefObject<number | null>
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (rafRef.current !== null) {
    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (suppressRef.current > 0) {
      suppressRef.current -= 1;
    }
  }

  const maxScroll = target.scrollHeight - target.clientHeight;
  const safeRatio = Number.isFinite(ratio) ? clampRatio(ratio) : 0;
  const desiredScrollTop = maxScroll <= 0 ? 0 : safeRatio * maxScroll;

  if (maxScroll <= 0 || Math.abs(target.scrollTop - desiredScrollTop) < 0.5) {
    target.scrollTop = desiredScrollTop;
    return;
  }

  suppressRef.current += 1;

  const settle = () => {
    if (suppressRef.current > 0) {
      suppressRef.current -= 1;
    }
    rafRef.current = null;
  };

  const firstFrame = window.requestAnimationFrame(() => {
    const nextMaxScroll = target.scrollHeight - target.clientHeight;
    const nextRatio = Number.isFinite(ratio) ? clampRatio(ratio) : 0;
    const nextScrollTop = nextMaxScroll <= 0 ? 0 : nextRatio * nextMaxScroll;

    target.scrollTop = nextScrollTop;
    rafRef.current = window.requestAnimationFrame(settle);
  });

  rafRef.current = firstFrame;
};

interface ScrollSyncOptions {
  editorRef: MutableRefObject<HTMLTextAreaElement | null>;
  previewScrollRef: MutableRefObject<HTMLDivElement | null>;
  previewContentRef: MutableRefObject<HTMLDivElement | null>;
  isEnabled: boolean;
  content: string;
}

const useScrollSync = ({
  editorRef,
  previewScrollRef,
  previewContentRef,
  isEnabled,
  content
}: ScrollSyncOptions) => {
  const editorSuppressRef = useRef(0);
  const previewSuppressRef = useRef(0);
  const editorRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const lastEditorRatioRef = useRef(0);
  const lastPreviewRatioRef = useRef(0);
  const lastSourceRef = useRef<ScrollSource>('editor');
  const preferredSourceRef = useRef<ScrollSource | null>(null);

  const reapplyAlignment = useCallback(() => {
    if (!isEnabled || typeof window === 'undefined') {
      return;
    }

    const editor = editorRef.current;
    const preview = previewScrollRef.current;

    if (!editor || !preview) {
      return;
    }

    const preferredSource = preferredSourceRef.current;
    const hasPreferredSource = preferredSource !== null;
    if (preferredSource !== null) {
      lastSourceRef.current = preferredSource;
      preferredSourceRef.current = null;
    }

    if (lastSourceRef.current === 'preview') {
      const ratio = getScrollRatio(preview);
      lastPreviewRatioRef.current = ratio;
      lastEditorRatioRef.current = ratio;

      const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
      const editorDesiredScroll = editorMaxScroll <= 0
        ? 0
        : (Number.isFinite(ratio) ? clampRatio(ratio) : 0) * editorMaxScroll;

      if (
        !hasPreferredSource
        && ((editorMaxScroll <= 0 && editor.scrollTop === 0)
          || Math.abs(editor.scrollTop - editorDesiredScroll) < 0.5)
      ) {
        return;
      }

      scheduleScrollUpdate(editor, ratio, editorSuppressRef, editorRafRef);
      return;
    }

    const ratio = getScrollRatio(editor);
    lastEditorRatioRef.current = ratio;
    lastPreviewRatioRef.current = ratio;

    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    const previewDesiredScroll = previewMaxScroll <= 0
      ? 0
      : (Number.isFinite(ratio) ? clampRatio(ratio) : 0) * previewMaxScroll;

    if (
      !hasPreferredSource
      && ((previewMaxScroll <= 0 && preview.scrollTop === 0)
        || Math.abs(preview.scrollTop - previewDesiredScroll) < 0.5)
    ) {
      return;
    }

    scheduleScrollUpdate(preview, ratio, previewSuppressRef, previewRafRef);
  }, [editorRef, previewScrollRef, isEnabled]);

  const handleEditorScroll = useCallback(() => {
    if (!isEnabled) {
      return;
    }

    const editor = editorRef.current;
    const preview = previewScrollRef.current;

    if (!editor || !preview) {
      return;
    }

    if (editorSuppressRef.current > 0) {
      return;
    }

    const ratio = getScrollRatio(editor);
    lastSourceRef.current = 'editor';
    preferredSourceRef.current = 'editor';
    lastEditorRatioRef.current = ratio;
    lastPreviewRatioRef.current = ratio;
    scheduleScrollUpdate(preview, ratio, previewSuppressRef, previewRafRef);
    preferredSourceRef.current = null;
  }, [editorRef, previewScrollRef, isEnabled]);

  const handlePreviewScroll = useCallback(() => {
    if (!isEnabled) {
      return;
    }

    const editor = editorRef.current;
    const preview = previewScrollRef.current;

    if (!editor || !preview) {
      return;
    }

    if (previewSuppressRef.current > 0) {
      return;
    }

    const ratio = getScrollRatio(preview);
    lastSourceRef.current = 'preview';
    preferredSourceRef.current = 'preview';
    lastPreviewRatioRef.current = ratio;
    lastEditorRatioRef.current = ratio;
    scheduleScrollUpdate(editor, ratio, editorSuppressRef, editorRafRef);
    preferredSourceRef.current = null;
  }, [editorRef, previewScrollRef, isEnabled]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') {
      return;
    }

    const editor = editorRef.current;
    const preview = previewScrollRef.current;

    if (!editor || !preview) {
      return;
    }

    const onEditorScroll = () => handleEditorScroll();
    const onPreviewScroll = () => handlePreviewScroll();

    editor.addEventListener('scroll', onEditorScroll, { passive: true });
    preview.addEventListener('scroll', onPreviewScroll, { passive: true });
    reapplyAlignment();

    return () => {
      editor.removeEventListener('scroll', onEditorScroll);
      preview.removeEventListener('scroll', onPreviewScroll);

      if (editorRafRef.current !== null) {
        window.cancelAnimationFrame(editorRafRef.current);
        editorRafRef.current = null;
      }

      if (previewRafRef.current !== null) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }

      editorSuppressRef.current = 0;
      previewSuppressRef.current = 0;
    };
  }, [editorRef, previewScrollRef, isEnabled, handleEditorScroll, handlePreviewScroll, reapplyAlignment]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      reapplyAlignment();
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;

    if ('ResizeObserver' in window) {
      resizeObserver = new window.ResizeObserver(handleResize);

      const editor = editorRef.current;
      const preview = previewScrollRef.current;
      const previewContent = previewContentRef.current;

      if (editor) {
        resizeObserver.observe(editor);
      }

      if (preview) {
        resizeObserver.observe(preview);
      }

      if (previewContent) {
        resizeObserver.observe(previewContent);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [editorRef, previewScrollRef, previewContentRef, isEnabled, reapplyAlignment]);

  useEffect(() => {
    if (!isEnabled || typeof window === 'undefined') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      reapplyAlignment();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [content, isEnabled, reapplyAlignment]);

  const markEditorAsSource = useCallback(() => {
    lastSourceRef.current = 'editor';
    preferredSourceRef.current = 'editor';
    const editor = editorRef.current;
    if (editor) {
      const ratio = getScrollRatio(editor);
      lastEditorRatioRef.current = ratio;
      lastPreviewRatioRef.current = ratio;
    }
  }, [editorRef]);

  return { markEditorAsSource };
};

export function FullscreenMarkdownEditor({ 
  value, 
  onChange, 
  onClose,
  label = 'Editor'
}: FullscreenMarkdownEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const { markEditorAsSource } = useScrollSync({
    editorRef,
    previewScrollRef,
    previewContentRef,
    isEnabled: viewMode === 'split',
    content: localValue
  });

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleCancel = () => {
    setLocalValue(value);
    onClose();
  };

  // Simple markdown to HTML converter (basic implementation)
  const renderMarkdown = (text: string) => {
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br />');
    
    // Lists
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return html;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full h-full max-w-[1400px] max-h-[900px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-subtle)]">
          <div>
            <h3 className="text-[var(--agyn-dark)]">{label}</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Edit your content with live markdown preview
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Mode Toggles */}
            <SegmentedControl
              items={[
                { value: 'edit', label: 'Edit', icon: <Code className="w-4 h-4" />, title: 'Edit Only' },
                { value: 'split', label: 'Split', icon: <SplitSquareVertical className="w-4 h-4" />, title: 'Split View' },
                { value: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" />, title: 'Preview Only' }
              ]}
              value={viewMode}
              onChange={(newValue) => setViewMode(newValue as ViewMode)}
            />
            
            <div className="w-px h-6 bg-[var(--agyn-border-subtle)]" />
            
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} flex flex-col border-r border-[var(--agyn-border-subtle)]`}>
              <div className="px-6 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
                <h4 className="text-sm text-[var(--agyn-dark)]">Markdown Editor</h4>
              </div>
              <textarea
                ref={editorRef}
                value={localValue}
                onChange={(e) => {
                  setLocalValue(e.target.value);
                  markEditorAsSource();
                }}
                className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-[var(--agyn-dark)] bg-white"
                placeholder="Start typing your markdown here..."
                spellCheck={false}
              />
            </div>
          )}

          {/* Preview Panel */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} flex flex-col`}>
              <div className="px-6 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
                <h4 className="text-sm text-[var(--agyn-dark)]">Preview</h4>
              </div>
              <div ref={previewScrollRef} className="flex-1 p-6 overflow-auto bg-white">
                <div 
                  ref={previewContentRef}
                  className="prose prose-sm max-w-none markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(localValue) }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
