import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  LineBreakNode,
  type LexicalEditor,
  type ElementNode,
  SELECTION_CHANGE_COMMAND,
  createCommand,
} from 'lexical';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CODE,
  TRANSFORMERS,
  type MultilineElementTransformer,
  type Transformer,
  type TextFormatTransformer,
} from '@lexical/markdown';
import {
  registerCodeHighlighting,
  PrismTokenizer,
  $isCodeNode,
  $createCodeNode,
  CodeHighlightNode,
  CodeNode,
  getCodeLanguageOptions,
} from '@lexical/code';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { HeadingNode, QuoteNode, $createQuoteNode } from '@lexical/rich-text';
import { LinkNode } from '@lexical/link';
import type { HTMLAttributes } from 'react';
import { IconButton } from './IconButton';
import { Dropdown } from './Dropdown';
import { FullscreenMarkdownEditor } from './FullscreenMarkdownEditor';
import { MARKDOWN_COMPOSER_THEME } from '@/lib/markdown/composerTheme';

import { AutosizeTextarea, type AutosizeTextareaProps } from './AutosizeTextarea';

// Local replacements for the removed lib/markdown/transformers helpers.
const UNDERLINE_MARKER = '__LEXICAL_UNDERLINE__';

const UNDERLINE_TRANSFORMER: TextFormatTransformer = {
  format: ['underline'],
  tag: UNDERLINE_MARKER,
  type: 'text-format',
};

function encodeUnderlinePlaceholders(markdown: string): string {
  if (!markdown.includes('<u>')) {
    return markdown;
  }

  const underlineHtmlPattern = /<u>([\s\S]*?)<\/u>/gi;

  return markdown.replace(underlineHtmlPattern, (_match, content) => {
    return `${UNDERLINE_MARKER}${content}${UNDERLINE_MARKER}`;
  });
}

function decodeUnderlinePlaceholders(markdown: string): string {
  const escapedMarker = UNDERLINE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = markdown
    .split('\\_\\_LEXICAL\\_UNDERLINE\\_\\_')
    .join(UNDERLINE_MARKER)
    .replace(new RegExp(escapedMarker, 'gi'), UNDERLINE_MARKER);

  if (!normalized.includes(UNDERLINE_MARKER)) {
    return markdown;
  }

  const segments = normalized.split(UNDERLINE_MARKER);

  if (segments.length % 2 === 0) {
    return normalized;
  }

  let result = segments[0];

  for (let index = 1; index < segments.length; index += 2) {
    const content = segments[index];
    result += `<u>${content}</u>`;
    result += segments[index + 1] ?? '';
  }

  return result;
}

const CODE_LANGUAGES_WITHOUT_MARKER = new Set(['auto', 'plain', 'plaintext', 'text']);

const CUSTOM_CODE_TRANSFORMER: MultilineElementTransformer = {
  ...CODE,
  export: (node) => {
    if (!$isCodeNode(node)) {
      return null;
    }

    const children = node.getChildren();
    const rawTextContent = node.getTextContent();
    const leadingShouldBeTrimmed =
      rawTextContent.startsWith('\n') &&
      children.length >= 2 &&
      children[0] instanceof LineBreakNode &&
      !(children[1] instanceof LineBreakNode);
    const textContent = leadingShouldBeTrimmed ? rawTextContent.slice(1) : rawTextContent;
    const language = node.getLanguage();
    const languageSuffix = language && !CODE_LANGUAGES_WITHOUT_MARKER.has(language) ? language : '';

    return `\`\`\`${languageSuffix}${textContent ? `\n${textContent}` : ''}\n\`\`\``;
  },
};

const BASE_TRANSFORMERS: Transformer[] = TRANSFORMERS.map((transformer) => {
  return transformer === CODE ? CUSTOM_CODE_TRANSFORMER : transformer;
});

const MARKDOWN_COMPOSER_TRANSFORMERS: Transformer[] = [
  ...BASE_TRANSFORMERS,
  UNDERLINE_TRANSFORMER,
];

type Formatter = () => void;

type ComposerMode = 'rendered' | 'source';

type SourceAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'inlineCode'
  | 'bullet'
  | 'numbered'
  | 'blockquote'
  | 'codeBlock';

interface SourceEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function toggleInlineMarker(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): SourceEditResult {
  const before = text.slice(0, selectionStart);
  const selection = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const markerLength = marker.length;
  const hasSelection = selectionStart !== selectionEnd;

  const hasSurroundingMarkers = before.endsWith(marker) && after.startsWith(marker);

  if (hasSurroundingMarkers) {
    return {
      value: `${before.slice(0, -markerLength)}${selection}${after.slice(markerLength)}`,
      selectionStart: selectionStart - markerLength,
      selectionEnd: selectionEnd - markerLength,
    };
  }

  if (hasSelection && selection.startsWith(marker) && selection.endsWith(marker)) {
    const inner = selection.slice(markerLength, selection.length - markerLength);
    return {
      value: `${before}${inner}${after}`,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  const wrapped = `${marker}${selection}${marker}`;
  const nextValue = `${before}${wrapped}${after}`;
  const caret = selectionStart + markerLength;

  return {
    value: nextValue,
    selectionStart: caret,
    selectionEnd: caret + selection.length,
  };
}

function toggleTagWrapper(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  tagName: string,
): SourceEditResult {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;
  const before = text.slice(0, selectionStart);
  const selection = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const hasSelection = selectionStart !== selectionEnd;

  const hasSurroundingTags = before.endsWith(openTag) && after.startsWith(closeTag);

  if (hasSurroundingTags) {
    return {
      value: `${before.slice(0, -openTag.length)}${selection}${after.slice(closeTag.length)}`,
      selectionStart: selectionStart - openTag.length,
      selectionEnd: selectionEnd - openTag.length,
    };
  }

  if (
    hasSelection
    && selection.startsWith(openTag)
    && selection.endsWith(closeTag)
  ) {
    const inner = selection.slice(openTag.length, selection.length - closeTag.length);
    return {
      value: `${before}${inner}${after}`,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  const wrapped = `${openTag}${selection}${closeTag}`;
  const nextValue = `${before}${wrapped}${after}`;
  const caret = selectionStart + openTag.length;

  return {
    value: nextValue,
    selectionStart: caret,
    selectionEnd: caret + selection.length,
  };
}

function expandSelectionToLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
) {
  let start = selectionStart;
  while (start > 0 && text[start - 1] !== '\n') {
    start -= 1;
  }

  let end = selectionEnd;
  while (end < text.length && text[end] !== '\n') {
    end += 1;
  }
  if (end < text.length) {
    end += 1;
  }

  const block = text.slice(start, end);
  const endsWithNewline = block.endsWith('\n');
  const lines = block.split('\n');
  if (endsWithNewline) {
    lines.pop();
  }

  return {
    start,
    end,
    lines,
    trailingNewline: endsWithNewline,
  } as const;
}

function toggleList(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  type: 'bullet' | 'numbered',
): SourceEditResult | null {
  const { start, end, lines, trailingNewline } = expandSelectionToLines(text, selectionStart, selectionEnd);

  if (lines.length === 0) {
    return null;
  }

  const bulletPattern = /^(\s*)[-*]\s+(.*)$/;
  const numberedPattern = /^(\s*)\d+\.\s+(.*)$/;

  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const shouldRemove =
    type === 'bullet'
      ? nonEmptyLines.length > 0 && nonEmptyLines.every((line) => bulletPattern.test(line))
      : nonEmptyLines.length > 0 && nonEmptyLines.every((line) => numberedPattern.test(line));

  let counter = 1;
  const updatedLines = lines.map((line) => {
    if (!line.trim()) {
      return line;
    }

    if (shouldRemove) {
      const pattern = type === 'bullet' ? bulletPattern : numberedPattern;
      const match = line.match(pattern);
      if (!match) {
        return line;
      }
      const [, indent = '', content = ''] = match;
      return `${indent}${content}`;
    }

    const indentMatch = line.match(/^(\s*)(.*)$/);
    const indent = indentMatch?.[1] ?? '';
    const content = indentMatch?.[2] ?? '';
    const normalizedContent = content.replace(bulletPattern, '$1$2').replace(numberedPattern, '$1$2');

    if (type === 'bullet') {
      return `${indent}- ${normalizedContent.trimStart()}`;
    }

    const current = `${counter}. `;
    counter += 1;
    return `${indent}${current}${normalizedContent.trimStart()}`;
  });

  const updatedBlock = `${updatedLines.join('\n')}${trailingNewline ? '\n' : ''}`;
  const nextValue = `${text.slice(0, start)}${updatedBlock}${text.slice(end)}`;

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: start + updatedBlock.length,
  };
}

function toggleBlockquote(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): SourceEditResult | null {
  const { start, end, lines, trailingNewline } = expandSelectionToLines(text, selectionStart, selectionEnd);

  if (lines.length === 0) {
    return null;
  }

  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const quotePattern = /^\s*>\s?/;
  const shouldRemove = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => quotePattern.test(line));

  const updatedLines = lines.map((line) => {
    if (!line.trim()) {
      if (!shouldRemove) {
        return line;
      }
      const blankMatch = line.match(/^\s*>\s?$/);
      if (blankMatch) {
        return '';
      }
      return line;
    }

    if (shouldRemove) {
      const match = line.match(/^(\s*)>\s?(.*)$/);
      if (!match) {
        return line;
      }
      const [, indent = '', content = ''] = match;
      return `${indent}${content}`;
    }

    const indentMatch = line.match(/^(\s*)(.*)$/);
    const indent = indentMatch?.[1] ?? '';
    const content = indentMatch?.[2] ?? '';
    const normalizedContent = content.replace(/^>\s?/, '');
    return `${indent}> ${normalizedContent}`;
  });

  const updatedBlock = `${updatedLines.join('\n')}${trailingNewline ? '\n' : ''}`;
  const nextValue = `${text.slice(0, start)}${updatedBlock}${text.slice(end)}`;

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: start + updatedBlock.length,
  };
}

function toggleCodeBlock(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): SourceEditResult | null {
  const { start, end, lines, trailingNewline } = expandSelectionToLines(text, selectionStart, selectionEnd);

  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0] ?? '';
  const lastLine = lines[lines.length - 1] ?? '';
  const hasFence = firstLine.startsWith('```') && lastLine.trim() === '```';

  if (hasFence && lines.length >= 2) {
    const innerLines = lines.slice(1, -1);
    const innerContent = innerLines.join('\n');
    const updatedBlock = `${innerContent}${trailingNewline ? '\n' : ''}`;
    const nextValue = `${text.slice(0, start)}${updatedBlock}${text.slice(end)}`;

    return {
      value: nextValue,
      selectionStart: start,
      selectionEnd: start + innerContent.length,
    };
  }

  const rawSelection = text.slice(selectionStart, selectionEnd);
  const content = rawSelection.length > 0 ? rawSelection : lines.join('\n');
  const block = `\`\`\`\n${content}\n\`\`\``;
  const updatedBlock = trailingNewline ? `${block}\n` : block;
  const nextValue = `${text.slice(0, start)}${updatedBlock}${text.slice(end)}`;
  const contentStart = start + 4; // ```\n

  return {
    value: nextValue,
    selectionStart: contentStart,
    selectionEnd: contentStart + content.length,
  };
}

function applySourceAction(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  action: SourceAction,
): SourceEditResult | null {
  switch (action) {
    case 'bold':
      return toggleInlineMarker(text, selectionStart, selectionEnd, '**');
    case 'italic':
      return toggleInlineMarker(text, selectionStart, selectionEnd, '*');
    case 'underline':
      return toggleTagWrapper(text, selectionStart, selectionEnd, 'u');
    case 'inlineCode':
      return toggleInlineMarker(text, selectionStart, selectionEnd, '`');
    case 'bullet':
      return toggleList(text, selectionStart, selectionEnd, 'bullet');
    case 'numbered':
      return toggleList(text, selectionStart, selectionEnd, 'numbered');
    case 'blockquote':
      return toggleBlockquote(text, selectionStart, selectionEnd);
    case 'codeBlock':
      return toggleCodeBlock(text, selectionStart, selectionEnd);
    default:
      return null;
  }
}

const convertParagraphToCodeBlock = (editor: LexicalEditor, paragraph: ElementNode) => {
  paragraph.clear();
  paragraph.selectStart();
  editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);

  const updatedSelection = $getSelection();
  if ($isRangeSelection(updatedSelection)) {
    const codeNode = updatedSelection.anchor.getNode().getTopLevelElementOrThrow();
    if ($isCodeNode(codeNode)) {
      codeNode.selectStart();
    }
  }
};

export interface MarkdownComposerRTEProps {
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

const MATCHED_MAC_PLATFORM = /Mac|iPad|iPhone|iPod/;

const isMacPlatform = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const platform = navigator.platform ?? '';
  if (MATCHED_MAC_PLATFORM.test(platform)) {
    return true;
  }
  const userAgent = navigator.userAgent ?? '';
  return MATCHED_MAC_PLATFORM.test(userAgent);
};

const isModKey = (event: { metaKey: boolean; ctrlKey: boolean }) => {
  if (isMacPlatform()) {
    return event.metaKey || event.ctrlKey;
  }
  return event.ctrlKey || event.metaKey;
};

const matchesShortcut = (
  event: { code?: string; key: string },
  { codes = [], keys = [] }: { codes?: string[]; keys?: string[] },
) => {
  if (codes.length > 0 && event.code && codes.includes(event.code)) {
    return true;
  }

  if (!event.key) {
    return false;
  }

  const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return keys.some((candidate) => {
    const normalizedCandidate = candidate.length === 1 ? candidate.toLowerCase() : candidate;
    return normalizedCandidate === normalizedKey;
  });
};

const TOGGLE_BLOCKQUOTE_COMMAND = createCommand<void>('TOGGLE_BLOCKQUOTE_COMMAND');
const TOGGLE_CODE_BLOCK_COMMAND = createCommand<void>('TOGGLE_CODE_BLOCK_COMMAND');
const AUTO_CODE_LANGUAGE = 'auto';
const AUTO_LANGUAGE_VALUES = new Set(['plain', 'plaintext', 'text']);

interface ToolbarAction {
  id: string;
  icon: ReactNode;
  label: string;
  formatter: Formatter;
}

function MarkdownPlaceholder({ placeholder }: { placeholder: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-2 text-sm text-[var(--agyn-gray)]">
      {placeholder}
    </div>
  );
}

function MarkdownComposerEditable({
  placeholder,
  minHeight,
  maxHeight,
  ariaLabel,
  ariaDescribedBy,
  ariaLabelledBy,
  id,
  disabled,
}: {
  placeholder: string;
  minHeight: number;
  maxHeight?: number;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  id?: string;
  disabled: boolean;
}) {
  const style: HTMLAttributes<HTMLDivElement>['style'] = {
    minHeight,
    overflowY: typeof maxHeight === 'number' ? 'auto' : 'hidden',
  };

  if (typeof maxHeight === 'number') {
    style.maxHeight = maxHeight;
  }

  return (
    <div className="relative">
      <RichTextPlugin
        contentEditable={(
          <ContentEditable
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-multiline="true"
            aria-disabled={disabled || undefined}
            aria-placeholder={placeholder}
            placeholder={<></>}
            role="textbox"
            spellCheck
            className="min-h-full w-full resize-none whitespace-pre-wrap break-words rounded-[10px] border border-transparent bg-transparent px-3 py-2 pr-12 text-sm leading-relaxed text-[var(--agyn-dark)] focus:outline-none focus-visible:outline-none"
            data-testid="markdown-composer-editor"
            style={style}
          />
        )}
        placeholder={<MarkdownPlaceholder placeholder={placeholder} />}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </div>
  );
}

function MarkdownComposerEditableStatePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  return null;
}

function MarkdownComposerCodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  const tokenizer = useMemo(() => ({
    ...PrismTokenizer,
    defaultLanguage: 'plain',
  }), []);

  useEffect(() => {
    return registerCodeHighlighting(editor, tokenizer);
  }, [editor, tokenizer]);

  return null;
}

function MarkdownComposerMarkdownPlugin({
  markdown,
  onMarkdownChange,
  maxLength,
}: {
  markdown: string;
  onMarkdownChange: (value: string) => void;
  maxLength?: number;
}) {
  const [editor] = useLexicalComposerContext();
  const isImportingRef = useRef(false);
  const lastValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastValueRef.current === markdown) {
      return;
    }

    editor.update(() => {
      isImportingRef.current = true;
      const root = $getRoot();
      root.clear();
      if (markdown) {
        $convertFromMarkdownString(
          encodeUnderlinePlaceholders(markdown),
          MARKDOWN_COMPOSER_TRANSFORMERS,
        );
      }
      root.selectEnd();
      lastValueRef.current = markdown;
      isImportingRef.current = false;
    });
  }, [editor, markdown]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      if (isImportingRef.current) {
        return;
      }

      let serialized = '';

      editorState.read(() => {
        serialized = $convertToMarkdownString(MARKDOWN_COMPOSER_TRANSFORMERS);
      });

      serialized = decodeUnderlinePlaceholders(serialized);
      serialized = serialized.replace(/^```([^\n]*)\n```$/gm, (_match, language) => {
        const suffix = language ?? '';
        return `\`\`\`${suffix}\n\n\`\`\``;
      });
      if (serialized === lastValueRef.current) {
        return;
      }

      if (typeof maxLength === 'number' && serialized.length > maxLength) {
        editor.update(() => {
          isImportingRef.current = true;
          const root = $getRoot();
          root.clear();
          if (lastValueRef.current) {
            $convertFromMarkdownString(
              encodeUnderlinePlaceholders(lastValueRef.current),
              MARKDOWN_COMPOSER_TRANSFORMERS,
            );
          }
          root.selectEnd();
          isImportingRef.current = false;
        });
        return;
      }

      lastValueRef.current = serialized;
      onMarkdownChange(serialized);
    });

    return unregister;
  }, [editor, maxLength, onMarkdownChange]);

  return null;
}

function MarkdownComposerFormatPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(
        TOGGLE_BLOCKQUOTE_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            const processed = new Set<string>();

            selection.getNodes().forEach((node) => {
              const candidate = node.getTopLevelElementOrThrow();
              if (!$isElementNode(candidate)) {
                return;
              }
              const topLevel = candidate;
              const key = topLevel.getKey();

              if (processed.has(key)) {
                return;
              }

              processed.add(key);

              const type = topLevel.getType();
              if (type === 'quote') {
                const paragraph = $createParagraphNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => paragraph.append(child));
                topLevel.replace(paragraph);
                return;
              }

              if (type === 'paragraph' || type.startsWith('heading')) {
                const quoteNode = $createQuoteNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => quoteNode.append(child));
                topLevel.replace(quoteNode);
              }
            });
          });

          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        TOGGLE_CODE_BLOCK_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            const processed = new Set<string>();

            selection.getNodes().forEach((node) => {
              const candidate = node.getTopLevelElementOrThrow();
              if (!$isElementNode(candidate)) {
                return;
              }
              const topLevel = candidate;
              const key = topLevel.getKey();

              if (processed.has(key)) {
                return;
              }

              processed.add(key);

              const type = topLevel.getType();
              if ($isCodeNode(topLevel)) {
                const paragraph = $createParagraphNode();
                const children = [...topLevel.getChildren()];
                children.forEach((child) => paragraph.append(child));
                topLevel.replace(paragraph);
                return;
              }

              if (type === 'paragraph' || type.startsWith('heading')) {
                const codeNode = $createCodeNode().setLanguage('plain');
                const children = [...topLevel.getChildren()];
                if (children.length === 0) {
                  codeNode.append($createTextNode(''));
                } else {
                  children.forEach((child) => codeNode.append(child));
                }
                topLevel.replace(codeNode);
              }
            });
          });

          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    );

    return unregister;
  }, [editor]);

  return null;
}

function MarkdownComposerKeymapPlugin({
  disabled,
  onSend,
  sendDisabled,
}: {
  disabled: boolean;
  onSend?: () => void;
  sendDisabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      if (disabled) {
        return;
      }

      let shouldConvert = false;

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        if ($isRootNode(anchorNode)) {
          return;
        }

        const topLevel = anchorNode.getTopLevelElementOrThrow();
        if (!$isParagraphNode(topLevel)) {
          return;
        }

        if (topLevel.getTextContent() === '```') {
          shouldConvert = true;
        }
      });

      if (!shouldConvert) {
        return;
      }

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        if ($isRootNode(anchorNode)) {
          return;
        }

        const topLevel = anchorNode.getTopLevelElementOrThrow();
        if (!$isParagraphNode(topLevel)) {
          return;
        }

        if (topLevel.getTextContent() !== '```') {
          return;
        }

        convertParagraphToCodeBlock(editor, topLevel);
      });
    });
  }, [disabled, editor]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (disabled) {
          return false;
        }

        if (event.key === 'Enter' && isModKey(event)) {
          if (onSend && !sendDisabled) {
            event.preventDefault();
            onSend();
            return true;
          }
          return false;
        }

        if (!isModKey(event)) {
          if (event.altKey) {
            return false;
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            let handled = false;
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                return;
              }

              const anchorNode = selection.anchor.getNode();
              if ($isRootNode(anchorNode)) {
                return;
              }
              const topLevel = anchorNode.getTopLevelElementOrThrow();

              if (!$isParagraphNode(topLevel)) {
                return;
              }

              if (topLevel.getTextContent() !== '```') {
                return;
              }

              handled = true;
              convertParagraphToCodeBlock(editor, topLevel);
            });

            if (handled) {
              event.preventDefault();
              return true;
            }
          }

          if (event.key === 'ArrowDown' && !event.shiftKey) {
            let handled = false;
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                return;
              }

              const anchorNode = selection.anchor.getNode();
              const topLevel = anchorNode.getTopLevelElementOrThrow();

              if (!$isCodeNode(topLevel)) {
                return;
              }

              const lastDescendant = topLevel.getLastDescendant();
              if (lastDescendant === null) {
                handled = true;
              } else if (selection.anchor.getNode() === lastDescendant) {
                if ($isTextNode(lastDescendant)) {
                  handled = selection.anchor.offset === lastDescendant.getTextContentSize();
                } else if ($isElementNode(lastDescendant)) {
                  handled = selection.anchor.offset === lastDescendant.getChildrenSize();
                } else if (lastDescendant instanceof LineBreakNode) {
                  handled = true;
                }
              } else if ($isElementNode(lastDescendant) && lastDescendant.isParentOf(selection.anchor.getNode())) {
                if ($isTextNode(selection.anchor.getNode())) {
                  handled = selection.anchor.offset === selection.anchor.getNode().getTextContentSize();
                }
              }

              if (!handled) {
                return;
              }

              const nextSibling = topLevel.getNextSibling();

              if (nextSibling) {
                if ($isElementNode(nextSibling)) {
                  nextSibling.selectStart();
                } else {
                  const paragraph = $createParagraphNode();
                  topLevel.insertAfter(paragraph);
                  paragraph.selectStart();
                }
                return;
              }

              const paragraph = $createParagraphNode();
              paragraph.append($createTextNode(''));
              topLevel.insertAfter(paragraph);
              paragraph.selectStart();
            });

            if (handled) {
              event.preventDefault();
              return true;
            }
          }

          return false;
        }

        if (!event.shiftKey) {
          if (matchesShortcut(event, { codes: ['KeyB'], keys: ['b'] })) {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            return true;
          }

          if (matchesShortcut(event, { codes: ['KeyI'], keys: ['i'] })) {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            return true;
          }

          if (matchesShortcut(event, { codes: ['KeyU'], keys: ['u'] })) {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
            return true;
          }

          if (matchesShortcut(event, { codes: ['KeyE'], keys: ['e'] })) {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
            return true;
          }

          if (matchesShortcut(event, { codes: ['Backquote'], keys: ['`'] })) {
            event.preventDefault();
            editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);
            return true;
          }
        }

        if (event.shiftKey) {
          if (matchesShortcut(event, { codes: ['KeyE'], keys: ['e'] })) {
            event.preventDefault();
            editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);
            return true;
          }

          if (matchesShortcut(event, { codes: ['Digit8'], keys: ['8', '*'] })) {
            event.preventDefault();
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            return true;
          }

          if (matchesShortcut(event, { codes: ['Digit7'], keys: ['7', '&'] })) {
            event.preventDefault();
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            return true;
          }

          if (matchesShortcut(event, { codes: ['Digit9'], keys: ['9', '('] })) {
            event.preventDefault();
            editor.dispatchCommand(TOGGLE_BLOCKQUOTE_COMMAND, undefined);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [disabled, editor, onSend, sendDisabled]);

  return null;
}

interface ToolbarState {
  blockType: 'paragraph' | 'quote' | 'code';
  listType: 'bullet' | 'number' | 'none';
  codeLanguage: string;
}

function getSelectedElementState(editor: LexicalEditor): ToolbarState {
  let blockType: ToolbarState['blockType'] = 'paragraph';
  let listType: ToolbarState['listType'] = 'none';
  let codeLanguage = '';

  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }

    const anchorNode = selection.anchor.getNode();
    if (anchorNode.getType() === 'root') {
      return;
    }

    const element = anchorNode.getTopLevelElementOrThrow();
    if (!$isElementNode(element)) {
      return;
    }

    if ($isListNode(element)) {
      const list = element;
      const type = list.getListType();
      if (type === 'number') {
        listType = 'number';
      } else {
        listType = 'bullet';
      }
      blockType = 'paragraph';
      return;
    }

    if ($isCodeNode(element)) {
      blockType = 'code';
      listType = 'none';
      const language = element.getLanguage() ?? '';
      codeLanguage = !language || AUTO_LANGUAGE_VALUES.has(language) ? '' : language;
      return;
    }

    const elementType = element.getType();
    if (elementType === 'quote') {
      blockType = 'quote';
    } else {
      blockType = 'paragraph';
    }
    listType = 'none';
  });

  return { blockType, listType, codeLanguage };
}

function MarkdownComposerToolbar({
  disabled,
  mode,
  onModeChange,
  onOpenFullscreen,
  onSourceAction,
}: {
  disabled: boolean;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onOpenFullscreen: () => void;
  onSourceAction: (action: SourceAction) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [toolbarState, setToolbarState] = useState<ToolbarState>(() => getSelectedElementState(editor));

  useEffect(() => {
    if (mode !== 'rendered') {
      setToolbarState({ blockType: 'paragraph', listType: 'none', codeLanguage: '' });
      return;
    }

    const updateToolbar = () => {
      setToolbarState(getSelectedElementState(editor));
    };

    updateToolbar();

    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterUpdate = editor.registerUpdateListener(() => {
      updateToolbar();
    });

    return () => {
      unregisterSelection();
      unregisterUpdate();
    };
  }, [editor, mode]);

  const applyBold = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
      return;
    }
    onSourceAction('bold');
  }, [editor, mode, onSourceAction]);

  const applyItalic = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
      return;
    }
    onSourceAction('italic');
  }, [editor, mode, onSourceAction]);

  const applyUnderline = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
      return;
    }
    onSourceAction('underline');
  }, [editor, mode, onSourceAction]);

  const applyInlineCode = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
      return;
    }
    onSourceAction('inlineCode');
  }, [editor, mode, onSourceAction]);

  const toggleBulletedList = useCallback(() => {
    if (mode === 'rendered') {
      if (toolbarState.listType === 'bullet') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
    }
    onSourceAction('bullet');
  }, [editor, mode, onSourceAction, toolbarState.listType]);

  const toggleNumberedList = useCallback(() => {
    if (mode === 'rendered') {
      if (toolbarState.listType === 'number') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    onSourceAction('numbered');
  }, [editor, mode, onSourceAction, toolbarState.listType]);

  const toggleCodeBlock = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(TOGGLE_CODE_BLOCK_COMMAND, undefined);
      return;
    }
    onSourceAction('codeBlock');
  }, [editor, mode, onSourceAction]);

  const toggleBlockquote = useCallback(() => {
    if (mode === 'rendered') {
      editor.dispatchCommand(TOGGLE_BLOCKQUOTE_COMMAND, undefined);
      return;
    }
    onSourceAction('blockquote');
  }, [editor, mode, onSourceAction]);

  const toolbarActions = useMemo<ToolbarAction[]>(
    () => [
      {
        id: 'bold',
        icon: <Bold className="h-4 w-4" />,
        label: 'Bold (Cmd/Ctrl+B)',
        formatter: applyBold,
      },
      {
        id: 'italic',
        icon: <Italic className="h-4 w-4" />,
        label: 'Italic (Cmd/Ctrl+I)',
        formatter: applyItalic,
      },
      {
        id: 'underline',
        icon: <Underline className="h-4 w-4" />,
        label: 'Underline (Cmd/Ctrl+U)',
        formatter: applyUnderline,
      },
      {
        id: 'bullet',
        icon: <List className="h-4 w-4" />,
        label: 'Bulleted list (Cmd/Ctrl+Shift+8)',
        formatter: toggleBulletedList,
      },
      {
        id: 'numbered',
        icon: <ListOrdered className="h-4 w-4" />,
        label: 'Numbered list (Cmd/Ctrl+Shift+7)',
        formatter: toggleNumberedList,
      },
      {
        id: 'blockquote',
        icon: <Quote className="h-4 w-4" />,
        label: 'Blockquote (Cmd/Ctrl+Shift+9)',
        formatter: toggleBlockquote,
      },
      {
        id: 'inlineCode',
        icon: <Code className="h-4 w-4" />,
        label: 'Inline code (Cmd/Ctrl+E)',
        formatter: applyInlineCode,
      },
      {
        id: 'codeBlock',
        icon: <CodeSquare className="h-4 w-4" />,
        label: 'Code block (Cmd/Ctrl+Shift+E or Cmd+`)',
        formatter: toggleCodeBlock,
      },
    ], [
      applyBold,
      applyInlineCode,
      applyItalic,
      applyUnderline,
      toggleBlockquote,
      toggleBulletedList,
      toggleCodeBlock,
      toggleNumberedList,
    ],
  );

  const languageOptions = useMemo(() => {
    const options = getCodeLanguageOptions();
    return options.map(([value, label]) => ({ value, label }));
  }, []);

  const currentToolbarState = mode === 'rendered'
    ? toolbarState
    : { blockType: 'paragraph', listType: 'none', codeLanguage: '' };

  const handleLanguageChange = useCallback(
    (next: string) => {
      if (mode !== 'rendered') {
        return;
      }
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const element = selection.anchor.getNode().getTopLevelElementOrThrow();
        if ($isCodeNode(element)) {
          element.setLanguage(next === AUTO_CODE_LANGUAGE ? undefined : next);
        }
      });
      setToolbarState((prev) => ({
        ...prev,
        codeLanguage: next === AUTO_CODE_LANGUAGE ? '' : next,
      }));
    },
    [editor, mode],
  );

  return (
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
            onClick={() => action.formatter()}
            disabled={disabled}
            data-testid={`markdown-composer-toolbar-${action.id}`}
          >
            {action.icon}
          </button>
        ))}

        {mode === 'rendered' && currentToolbarState.blockType === 'code' ? (
          <div
            className="ml-2 flex items-center gap-1"
            data-testid="markdown-composer-toolbar-code-language"
          >
            <Dropdown
              size="sm"
              variant="flat"
              placeholder="Language"
              value={currentToolbarState.codeLanguage || AUTO_CODE_LANGUAGE}
              onValueChange={handleLanguageChange}
              options={[{ value: AUTO_CODE_LANGUAGE, label: 'Auto' }, ...languageOptions]}
              disabled={disabled}
              className="w-[140px]"
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-[var(--agyn-border-subtle)] bg-white">
          <button
            type="button"
            className={`inline-flex h-8 items-center px-3 text-xs font-medium transition-colors rounded-l-md ${mode === 'rendered' ? 'bg-[var(--agyn-bg-light)] text-[var(--agyn-blue)]' : 'text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)]'}`}
            aria-pressed={mode === 'rendered'}
            onClick={() => onModeChange('rendered')}
            onMouseDown={(event) => event.preventDefault()}
            data-testid="markdown-composer-view-rendered"
          >
            Rendered
          </button>
          <button
            type="button"
            className={`inline-flex h-8 items-center px-3 text-xs font-medium transition-colors rounded-r-md ${mode === 'source' ? 'bg-[var(--agyn-bg-light)] text-[var(--agyn-blue)]' : 'text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)]'}`}
            aria-pressed={mode === 'source'}
            onClick={() => onModeChange('source')}
            onMouseDown={(event) => event.preventDefault()}
            data-testid="markdown-composer-view-source"
          >
            Source
          </button>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          title="Open fullscreen markdown editor"
          aria-label="Open fullscreen markdown editor"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpenFullscreen}
          disabled={disabled}
          data-testid="markdown-composer-toolbar-fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function MarkdownComposerRTE({
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
}: MarkdownComposerRTEProps) {
  const {
    maxLength,
    id: editorId,
    className: textareaClassName,
    size: textareaSize,
    'aria-describedby': ariaDescribedBy,
    'aria-labelledby': ariaLabelledBy,
    'aria-label': ariaLabelProp,
    ...restTextareaProps
  } = textareaProps ?? {};

  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [mode, setMode] = useState<ComposerMode>('rendered');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendButtonDisabled = disabled || Boolean(sendDisabled) || Boolean(isSending);
  const ariaLabel = textareaAriaLabel ?? ariaLabelProp ?? placeholder;
  const sourceTextareaClassName = [
    '!border-none !outline-none !ring-0 bg-transparent px-3 py-2 pr-12 text-sm leading-relaxed text-[var(--agyn-dark)]',
    'placeholder:text-[var(--agyn-gray)] focus:!ring-0 focus:!outline-none focus:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none',
    textareaClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const initialConfig = useMemo(
    () => ({
      namespace: 'MarkdownComposer',
      theme: MARKDOWN_COMPOSER_THEME,
      editable: !disabled,
      onError: (error: unknown) => {
        throw error;
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        CodeHighlightNode,
        LinkNode,
      ],
    }),
    [disabled],
  );

  const minHeight = minLines * 20;
  const maxHeight = typeof maxLines === 'number' ? maxLines * 20 : undefined;

  const handleModeChange = useCallback((nextMode: ComposerMode) => {
    if (mode === nextMode) {
      return;
    }
    setMode(nextMode);
  }, [mode]);

  const handleSend = useCallback(() => {
    if (!onSend || sendButtonDisabled) {
      return;
    }
    onSend();
  }, [onSend, sendButtonDisabled]);

  const handleTextareaChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    if (typeof maxLength === 'number' && nextValue.length > maxLength) {
      return;
    }
    onChange(nextValue);
  }, [maxLength, onChange]);

  const handleSourceAction = useCallback((action: SourceAction) => {
    if (mode !== 'source') {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? 0;
    const result = applySourceAction(value, selectionStart, selectionEnd, action);
    if (!result) {
      return;
    }

    if (typeof maxLength === 'number' && result.value.length > maxLength) {
      return;
    }

    onChange(result.value);

    const nextSelectionStart = Math.max(0, result.selectionStart);
    const nextSelectionEnd = Math.max(0, result.selectionEnd);

    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) {
        return;
      }
      target.focus();
      target.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  }, [maxLength, mode, onChange, value]);

  const handleTextareaKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (mode !== 'source' || disabled) {
      return;
    }

    const modKey = isModKey(event);

    if (event.key === 'Enter' && modKey) {
      if (onSend && !sendButtonDisabled) {
        event.preventDefault();
        handleSend();
      }
      return;
    }

    if (!modKey || event.altKey) {
      return;
    }

    if (!event.shiftKey) {
      if (matchesShortcut(event, { codes: ['KeyB'], keys: ['b'] })) {
        event.preventDefault();
        handleSourceAction('bold');
        return;
      }

      if (matchesShortcut(event, { codes: ['KeyI'], keys: ['i'] })) {
        event.preventDefault();
        handleSourceAction('italic');
        return;
      }

      if (matchesShortcut(event, { codes: ['KeyU'], keys: ['u'] })) {
        event.preventDefault();
        handleSourceAction('underline');
        return;
      }

      if (matchesShortcut(event, { codes: ['KeyE'], keys: ['e'] })) {
        event.preventDefault();
        handleSourceAction('inlineCode');
        return;
      }

      if (matchesShortcut(event, { codes: ['Backquote'], keys: ['`'] })) {
        event.preventDefault();
        handleSourceAction('codeBlock');
        return;
      }
    }

    if (event.shiftKey) {
      if (matchesShortcut(event, { codes: ['KeyE'], keys: ['e'] })) {
        event.preventDefault();
        handleSourceAction('codeBlock');
        return;
      }

      if (matchesShortcut(event, { codes: ['Digit8'], keys: ['8', '*'] })) {
        event.preventDefault();
        handleSourceAction('bullet');
        return;
      }

      if (matchesShortcut(event, { codes: ['Digit7'], keys: ['7', '&'] })) {
        event.preventDefault();
        handleSourceAction('numbered');
        return;
      }

      if (matchesShortcut(event, { codes: ['Digit9'], keys: ['9', '('] })) {
        event.preventDefault();
        handleSourceAction('blockquote');
      }
    }
  }, [disabled, handleSend, handleSourceAction, mode, onSend, sendButtonDisabled]);

  return (
    <div className={`rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white ${className}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <MarkdownComposerToolbar
          disabled={disabled}
          mode={mode}
          onModeChange={handleModeChange}
          onOpenFullscreen={() => setIsFullscreenOpen(true)}
          onSourceAction={handleSourceAction}
        />
        <div className="relative p-2">
          {mode === 'rendered' ? (
            <MarkdownComposerEditable
              placeholder={placeholder}
              minHeight={minHeight}
              maxHeight={maxHeight}
              ariaLabel={ariaLabel}
              ariaDescribedBy={ariaDescribedBy}
              ariaLabelledBy={ariaLabelledBy}
              id={editorId}
              disabled={disabled}
            />
          ) : (
            <AutosizeTextarea
              ref={textareaRef}
              value={value}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              id={editorId}
              placeholder={placeholder}
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedBy}
              aria-labelledby={ariaLabelledBy}
              disabled={disabled}
              minLines={minLines}
              maxLines={maxLines}
              maxLength={maxLength}
              size={textareaSize ?? 'sm'}
              className={sourceTextareaClassName}
              data-testid="markdown-composer-source-editor"
              {...restTextareaProps}
            />
          )}
          {onSend ? (
            <IconButton
              icon={isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              variant="primary"
              size="sm"
              className="absolute bottom-2 right-2"
              onClick={handleSend}
              disabled={sendButtonDisabled}
              aria-label="Send message"
              title="Send message"
              aria-busy={isSending || undefined}
            />
          ) : null}
        </div>
        <MarkdownComposerEditableStatePlugin editable={!disabled && mode === 'rendered'} />
        <MarkdownComposerCodeHighlightPlugin />
        <MarkdownComposerMarkdownPlugin
          markdown={value}
          onMarkdownChange={onChange}
          maxLength={maxLength}
        />
        <MarkdownComposerFormatPlugin />
        <MarkdownComposerKeymapPlugin
          disabled={disabled}
          onSend={handleSend}
          sendDisabled={sendButtonDisabled}
        />
        <HistoryPlugin />
        <ListPlugin />
        <MarkdownShortcutPlugin transformers={MARKDOWN_COMPOSER_TRANSFORMERS} />
      </LexicalComposer>

      {isFullscreenOpen && !disabled ? (
        <FullscreenMarkdownEditor
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          onClose={() => setIsFullscreenOpen(false)}
          label="Message"
        />
      ) : null}
    </div>
  );
}

export type { MarkdownComposerRTEProps as MarkdownComposerProps };
