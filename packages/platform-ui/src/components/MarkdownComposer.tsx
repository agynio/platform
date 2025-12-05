import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react';
import {
  Bold,
  Code,
  CodeSquare,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Quote,
  Send,
  Underline,
} from 'lucide-react';
import { AutosizeTextarea, type AutosizeTextareaProps } from './AutosizeTextarea';
import { IconButton } from './IconButton';
import { FullscreenMarkdownEditor } from './FullscreenMarkdownEditor';
import {
  toggleBlockquote,
  toggleBold,
  toggleBulletedList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleUnderline,
  type FormatResult,
} from '@/lib/markdown/formatting';

type Formatter = (input: { value: string; selection: { start: number; end: number } }) => FormatResult;

export interface MarkdownComposerProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minLines?: number;
  maxLines?: number;
  sendDisabled?: boolean;
  isSending?: boolean;
  onSend?: () => void;
  className?: string;
  textareaAriaLabel?: string;
  textareaProps?: Omit<AutosizeTextareaProps, 'value' | 'onChange' | 'ref' | 'minLines' | 'maxLines' | 'disabled' | 'placeholder'>;
}

interface ToolbarAction {
  id: string;
  icon: ReactNode;
  label: string;
  formatter: Formatter;
}

const isModKey = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

const focusTextarea = (element: HTMLTextAreaElement | null) => {
  if (!element) {
    return;
  }
  element.focus();
};

export function MarkdownComposer({
  value,
  onChange,
  placeholder = 'Type a message...',
  disabled = false,
  minLines = 1,
  maxLines = 8,
  sendDisabled = false,
  isSending = false,
  onSend,
  className = '',
  textareaAriaLabel,
  textareaProps,
}: MarkdownComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.setSelectionRange(pending.start, pending.end);
    focusTextarea(textarea);
    pendingSelectionRef.current = null;
  }, [value]);

  const applyFormatting = useCallback(
    (formatter: Formatter) => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) {
        return;
      }

      const selection = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };

      const result = formatter({ value, selection });

      if (result.value !== value) {
        pendingSelectionRef.current = result.selection;
        onChange(result.value);
        return;
      }

      textarea.setSelectionRange(result.selection.start, result.selection.end);
      focusTextarea(textarea);
    },
    [disabled, onChange, value],
  );

  const toolbarActions = useMemo<ToolbarAction[]>(
    () => [
      { id: 'bold', icon: <Bold className="h-4 w-4" />, label: 'Bold (Cmd/Ctrl+B)', formatter: toggleBold },
      { id: 'italic', icon: <Italic className="h-4 w-4" />, label: 'Italic (Cmd/Ctrl+I)', formatter: toggleItalic },
      { id: 'underline', icon: <Underline className="h-4 w-4" />, label: 'Underline (Cmd/Ctrl+U)', formatter: toggleUnderline },
      { id: 'bullet', icon: <List className="h-4 w-4" />, label: 'Bulleted list (Cmd/Ctrl+Shift+8)', formatter: toggleBulletedList },
      { id: 'numbered', icon: <ListOrdered className="h-4 w-4" />, label: 'Numbered list (Cmd/Ctrl+Shift+7)', formatter: toggleNumberedList },
      { id: 'blockquote', icon: <Quote className="h-4 w-4" />, label: 'Blockquote (Cmd/Ctrl+Shift+9)', formatter: toggleBlockquote },
      { id: 'inlineCode', icon: <Code className="h-4 w-4" />, label: 'Inline code (Cmd/Ctrl+E)', formatter: toggleInlineCode },
      { id: 'codeBlock', icon: <CodeSquare className="h-4 w-4" />, label: 'Code block (Cmd/Ctrl+Shift+E)', formatter: toggleCodeBlock },
    ],
    [],
  );

  const handleToolbarClick = useCallback(
    (formatter: Formatter) => {
      applyFormatting(formatter);
    },
    [applyFormatting],
  );

  const handleChange: NonNullable<AutosizeTextareaProps['onChange']> = useCallback(
    (event) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  const attemptSend = useCallback(() => {
    if (!onSend || disabled || sendDisabled) {
      return;
    }

    onSend();
  }, [disabled, onSend, sendDisabled]);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === 'Enter' && isModKey(event)) {
        event.preventDefault();
        attemptSend();
        return;
      }

      if (!isModKey(event) || event.altKey || disabled) {
        return;
      }

      const lowerKey = event.key.toLowerCase();

      if (!event.shiftKey) {
        if (lowerKey === 'b') {
          event.preventDefault();
          applyFormatting(toggleBold);
          return;
        }
        if (lowerKey === 'i') {
          event.preventDefault();
          applyFormatting(toggleItalic);
          return;
        }
        if (lowerKey === 'u') {
          event.preventDefault();
          applyFormatting(toggleUnderline);
          return;
        }
        if (lowerKey === 'e') {
          event.preventDefault();
          applyFormatting(toggleInlineCode);
        }
        return;
      }

      const key = event.key;

      if (lowerKey === 'e') {
        event.preventDefault();
        applyFormatting(toggleCodeBlock);
        return;
      }

      if (key === '8' || key === '*') {
        event.preventDefault();
        applyFormatting(toggleBulletedList);
        return;
      }

      if (key === '7' || key === '&') {
        event.preventDefault();
        applyFormatting(toggleNumberedList);
        return;
      }

      if (key === '9' || key === '(') {
        event.preventDefault();
        applyFormatting(toggleBlockquote);
      }
    },
    [applyFormatting, attemptSend, disabled],
  );

  const handleFullscreenSave = useCallback(
    (nextValue: string) => {
      pendingSelectionRef.current = {
        start: nextValue.length,
        end: nextValue.length,
      };
      onChange(nextValue);
    },
    [onChange],
  );

  return (
    <div className={`rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--agyn-border-subtle)] px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {toolbarActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:cursor-not-allowed disabled:opacity-50"
              title={action.label}
              aria-label={action.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleToolbarClick(action.formatter)}
              disabled={disabled}
              data-testid={`markdown-composer-toolbar-${action.id}`}
            >
              {action.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          title="Open fullscreen markdown editor"
          aria-label="Open fullscreen markdown editor"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsFullscreenOpen(true)}
          disabled={disabled}
          data-testid="markdown-composer-toolbar-fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <div className="relative p-2">
        <AutosizeTextarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          minLines={minLines}
          maxLines={maxLines}
          aria-label={textareaAriaLabel}
          size="sm"
          className="border-none bg-transparent pr-12 focus:border-none focus:ring-0 focus-visible:outline-none"
          {...textareaProps}
        />
        {onSend ? (
          <IconButton
            icon={isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            variant="primary"
            size="sm"
            className="absolute bottom-2 right-2"
            onClick={attemptSend}
            disabled={disabled || sendDisabled}
            aria-label="Send message"
            title="Send message"
            aria-busy={isSending || undefined}
          />
        ) : null}
      </div>

      {isFullscreenOpen && !disabled ? (
        <FullscreenMarkdownEditor
          value={value}
          onChange={handleFullscreenSave}
          onClose={() => setIsFullscreenOpen(false)}
          label="Message"
        />
      ) : null}
    </div>
  );
}
