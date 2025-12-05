import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
} from 'vitest';
import { render, fireEvent, screen, waitFor, within, act } from '@testing-library/react';
import React, { useState } from 'react';
import { MarkdownComposer, type MarkdownComposerProps } from '../MarkdownComposer';
import { MarkdownContent } from '../MarkdownContent';
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';

interface ComposerHarnessProps {
  initialValue?: string;
  sendDisabled?: boolean;
  isSending?: boolean;
  onSend?: (value: string) => void;
  disabled?: boolean;
  renderPreview?: boolean;
}

function ComposerHarness({
  initialValue = '',
  sendDisabled,
  isSending,
  onSend,
  disabled,
  renderPreview = false,
}: ComposerHarnessProps) {
  const [value, setValue] = useState(initialValue);

  const composerProps: MarkdownComposerProps = {
    value,
    onChange: setValue,
    placeholder: 'Type a message...',
    sendDisabled,
    isSending,
    disabled,
  };

  if (onSend) {
    composerProps.onSend = () => {
      onSend(value);
    };
  }

  return (
    <>
      <MarkdownComposer {...composerProps} />
      <div data-testid="value-output">{value}</div>
      {renderPreview ? (
        <div data-testid="markdown-preview">
          <MarkdownContent content={value} />
        </div>
      ) : null}
    </>
  );
}

const getComposerEditor = () =>
  screen.getByTestId('markdown-composer-editor') as HTMLElement;

const getValue = () => screen.getByTestId('value-output').textContent ?? '';

const getSourceEditor = () =>
  screen.getByTestId('markdown-composer-source-editor') as HTMLTextAreaElement;

const switchToSourceView = () => {
  fireEvent.click(screen.getByTestId('markdown-composer-view-source'));
};

const switchToRenderedView = () => {
  fireEvent.click(screen.getByTestId('markdown-composer-view-rendered'));
};

const getLexicalEditor = (element: HTMLElement): LexicalEditor => {
  const editor = (element as unknown as { __lexicalEditor?: unknown }).__lexicalEditor;
  if (!editor) {
    throw new Error('Lexical editor instance not found');
  }
  return editor as LexicalEditor;
};

const insertText = async (element: HTMLElement, text: string) => {
  const editor = getLexicalEditor(element);
  await act(async () => {
    editor.focus();
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        $getRoot().selectEnd();
      }
      let activeSelection = $getSelection();
      if (!$isRangeSelection(activeSelection)) {
        throw new Error('Range selection not available for insertText');
      }
      for (const char of text) {
        activeSelection.insertText(char);
        activeSelection = $getSelection();
        if (!$isRangeSelection(activeSelection)) {
          throw new Error('Range selection not available for insertText');
        }
      }
    });
  });
};

const focusAndSelectAll = (editor: HTMLElement) => {
  editor.focus();
  fireEvent.focus(editor);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
};

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'platform');

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }),
  });

  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: 'MacIntel',
  });
});

afterAll(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(window.navigator, 'platform', originalPlatformDescriptor);
  }
});

const fireMacShortcut = (
  target: HTMLElement,
  event: KeyboardEventInit,
) => {
  fireEvent.keyDown(target, {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    ...event,
  });
};

describe('MarkdownComposer formatting', () => {
  it('wraps selected text in bold via toolbar', async () => {
    render(<ComposerHarness initialValue="hello" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('hello'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bold'));

    await waitFor(() => expect(getValue()).toBe('**hello**'));
  });

  it('toggles bulleted list for selected lines', async () => {
    render(<ComposerHarness initialValue={'Line one\n\nLine two'} />);

    const editor = getComposerEditor();
    await waitFor(() => expect(getValue()).toBe('Line one\n\nLine two'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));
    await waitFor(() => expect(getValue()).toBe('- Line one\n- Line two'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));
    await waitFor(() => expect(getValue()).toBe('Line one\n\nLine two'));
  });

  it('wraps code block with shortcut Cmd/Ctrl+Shift+E', async () => {
    render(<ComposerHarness initialValue="snippet" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('snippet'));

    focusAndSelectAll(editor);
    fireEvent.keyDown(editor, {
      key: 'E',
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('```\nsnippet\n```'));
  });

  it('wraps inline code with shortcut Cmd/Ctrl+E', async () => {
    render(<ComposerHarness initialValue="inline" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('inline'));

    focusAndSelectAll(editor);
    fireEvent.keyDown(editor, {
      key: 'e',
      ctrlKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('`inline`'));
  });

  it('wraps selected text in underline via toolbar', async () => {
    render(<ComposerHarness initialValue="focus" />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('focus'));

    focusAndSelectAll(editor);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-underline'));

    await waitFor(() => expect(getValue()).toBe('<u>focus</u>'));
  });
});

describe('MarkdownComposer view modes', () => {
  it('maintains content when toggling between rendered and source modes', async () => {
    render(<ComposerHarness initialValue="hello world" />);

    await waitFor(() => expect(getValue()).toBe('hello world'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    expect(sourceEditor.value).toBe('hello world');

    fireEvent.change(sourceEditor, { target: { value: 'updated markdown' } });

    await waitFor(() => expect(getValue()).toBe('updated markdown'));

    switchToRenderedView();

    await waitFor(() => {
      const editor = getComposerEditor();
      expect(editor.textContent).toContain('updated markdown');
    });
  });

  it('applies bold formatting via toolbar in source view', async () => {
    render(<ComposerHarness initialValue="format me" />);

    await waitFor(() => expect(getValue()).toBe('format me'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();
    sourceEditor.setSelectionRange(0, sourceEditor.value.length);

    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bold'));

    await waitFor(() => expect(getValue()).toBe('**format me**'));
  });

  it('applies inline code via shortcut Cmd/Ctrl+E in source view', async () => {
    render(<ComposerHarness initialValue="inline" />);

    await waitFor(() => expect(getValue()).toBe('inline'));

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();
    sourceEditor.setSelectionRange(0, sourceEditor.value.length);

    fireEvent.keyDown(sourceEditor, {
      key: 'e',
      ctrlKey: true,
    });

    await waitFor(() => expect(getValue()).toBe('`inline`'));
  });

  it('calls onSend for Cmd/Ctrl+Enter in source view when enabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();

    fireEvent.keyDown(sourceEditor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });
});

describe('MarkdownComposer sending', () => {
  it('calls onSend for Cmd/Ctrl+Enter when enabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    const editor = getComposerEditor();
    editor.focus();

    fireEvent.keyDown(editor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });

  it('calls onSend for Cmd+Enter on mac layouts', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    const editor = getComposerEditor();
    editor.focus();

    fireMacShortcut(editor, {
      key: 'Enter',
      code: 'Enter',
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });

  it('calls onSend for Cmd+Enter inside code blocks on mac layouts', async () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('message'));

    focusAndSelectAll(editor);
    fireMacShortcut(editor, {
      key: 'e',
      code: 'KeyE',
      shiftKey: true,
    });

    const codeBlockValue = ['```', 'message', '```'].join('\n');
    await waitFor(() => expect(getValue()).toBe(codeBlockValue));

    fireMacShortcut(editor, {
      key: 'Enter',
      code: 'Enter',
    });

    expect(handleSend).toHaveBeenCalledWith(codeBlockValue);
  });

  it('does not call onSend when disabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} sendDisabled />);

    const editor = getComposerEditor();
    editor.focus();

    fireEvent.keyDown(editor, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).not.toHaveBeenCalled();
  });

  it('respects Enter and Shift+Enter without send on mac layouts', async () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="line" onSend={handleSend} />);

    const editor = getComposerEditor();
    await waitFor(() => expect(editor.textContent).toContain('line'));

    editor.focus();
    fireEvent.keyDown(editor, { key: 'Enter' });
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });

    expect(handleSend).not.toHaveBeenCalled();
    await waitFor(() => expect(getValue()).toContain('line'));
  });
});

describe('MarkdownComposer mac shortcuts parity', () => {
  const macShortcutCases = [
    {
      name: 'bold',
      keyEvent: { key: 'b', code: 'KeyB' },
      initial: 'bold',
      expected: '**bold**',
    },
    {
      name: 'italic',
      keyEvent: { key: 'i', code: 'KeyI' },
      initial: 'italic',
      expected: '*italic*',
    },
    {
      name: 'underline',
      keyEvent: { key: 'u', code: 'KeyU' },
      initial: 'underline',
      expected: '<u>underline</u>',
    },
    {
      name: 'inline code',
      keyEvent: { key: 'e', code: 'KeyE' },
      initial: 'inline',
      expected: '`inline`',
    },
    {
      name: 'code block (Cmd+Shift+E)',
      keyEvent: { key: 'e', code: 'KeyE', shiftKey: true },
      initial: 'snippet',
      expected: ['```', 'snippet', '```'].join('\n'),
    },
    {
      name: 'code block (Cmd+`)',
      keyEvent: { key: '`', code: 'Backquote' },
      initial: 'snippet',
      expected: ['```', 'snippet', '```'].join('\n'),
    },
    {
      name: 'bulleted list',
      keyEvent: { key: '*', code: 'Digit8', shiftKey: true },
      initial: 'Line one\n\nLine two',
      expected: '- Line one\n- Line two',
    },
    {
      name: 'numbered list',
      keyEvent: { key: '&', code: 'Digit7', shiftKey: true },
      initial: 'Line one\n\nLine two',
      expected: '1. Line one\n2. Line two',
    },
    {
      name: 'blockquote',
      keyEvent: { key: '(', code: 'Digit9', shiftKey: true },
      initial: 'Line one\nLine two',
      expected: '> Line one\n> Line two',
    },
  ] as const;

  const modes: Array<'rendered' | 'source'> = ['rendered', 'source'];

  it.each(macShortcutCases.flatMap((testCase) => (
    modes.map((mode) => ({ ...testCase, mode }))
  )))('$name shortcut via Cmd in $mode mode', async (scenario) => {
    render(<ComposerHarness initialValue={scenario.initial} />);

    if (scenario.mode === 'rendered') {
      const editor = getComposerEditor();
      await waitFor(() => expect(getValue()).toBe(scenario.initial));
      focusAndSelectAll(editor);
      fireMacShortcut(editor, scenario.keyEvent);
    } else {
      switchToSourceView();
      const sourceEditor = getSourceEditor();
      await waitFor(() => expect(sourceEditor.value).toBe(scenario.initial));
      sourceEditor.focus();
      sourceEditor.setSelectionRange(0, sourceEditor.value.length);
      fireMacShortcut(sourceEditor, scenario.keyEvent);
    }

    await waitFor(() => expect(getValue()).toBe(scenario.expected));
  });

  it('calls onSend for Cmd+Enter in source mode on mac layouts', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();

    fireMacShortcut(sourceEditor, {
      key: 'Enter',
      code: 'Enter',
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });

  it('does not call onSend for Enter without modifiers in source mode on mac layouts', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    switchToSourceView();

    const sourceEditor = getSourceEditor();
    sourceEditor.focus();

    fireEvent.keyDown(sourceEditor, { key: 'Enter' });
    fireEvent.keyDown(sourceEditor, { key: 'Enter', shiftKey: true });

    expect(handleSend).not.toHaveBeenCalled();
  });
});

describe('MarkdownComposer code fences', () => {
  it('creates a code block when typing triple backticks directly in rendered mode', async () => {
    render(<ComposerHarness />);

    const editor = getComposerEditor();
    await waitFor(() => expect(getValue()).toBe(''));

    await act(async () => {
      editor.focus();
      fireEvent.focus(editor);
    });

    const lexicalEditor = getLexicalEditor(editor);

    const insertBacktick = async () => {
      await act(async () => {
        lexicalEditor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText('`');
          }
        });
      });
    };

    await insertBacktick();
    await insertBacktick();
    await insertBacktick();

    await waitFor(() =>
      expect(getValue()).toBe(['```', '', '```'].join('\n')),
    );

    await waitFor(() => {
      expect(editor.querySelector('code')).not.toBeNull();
    });

    switchToSourceView();

    await waitFor(() =>
      expect(getSourceEditor().value).toBe(['```', '', '```'].join('\n')),
    );
  });

  it('creates a code block when typing triple backticks in rendered mode', async () => {
    render(<ComposerHarness renderPreview />);

    const editor = getComposerEditor();
    await waitFor(() => expect(getValue()).toBe(''));

    editor.focus();
    fireEvent.focus(editor);

    await insertText(editor, '```');
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(editor, { key: 'Enter', code: 'Enter' });

    await insertText(editor, "console.log('hi')");

    await waitFor(() => expect(getValue()).toBe(["```", "console.log('hi')", '```'].join('\n')));

    await waitFor(() => {
      expect(getComposerEditor().querySelector('code')).not.toBeNull();
    });

    switchToSourceView();

    await waitFor(() =>
      expect(getSourceEditor().value).toBe(["```", "console.log('hi')", '```'].join('\n')),
    );
  });

  it('moves the caret out of a trailing code block when pressing ArrowDown', async () => {
    render(<ComposerHarness initialValue={['```', 'line one', 'line two', '```'].join('\n')} />);

    const editor = getComposerEditor();
    await waitFor(() => expect(getValue()).toBe(['```', 'line one', 'line two', '```'].join('\n')));

    editor.focus();
    fireEvent.focus(editor);

    await act(async () => {
      await new Promise((resolve) => {
        getLexicalEditor(editor).update(() => {
          $getRoot().selectEnd();
          resolve(null);
        });
      });
    });

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyUp(editor, { key: 'ArrowDown', code: 'ArrowDown' });
    });
    await act(async () => {
      await insertText(editor, 'After block');
    });

    await waitFor(() =>
      expect(getValue()).toBe(['```', 'line one', 'line two', '```', '', 'After block'].join('\n')),
    );
  });
});

describe('MarkdownComposer source styling', () => {
  it('removes border and outline in source mode', async () => {
    render(<ComposerHarness />);

    switchToSourceView();

    const sourceEditor = await screen.findByTestId('markdown-composer-source-editor');

    expect(sourceEditor.className).toContain('!border-none');
    expect(sourceEditor.className).toContain('focus:!ring-0');
    expect(sourceEditor.className).toContain('focus:!outline-none');
  });
});

describe('MarkdownComposer markdown parity', () => {
  it('preserves underline markup when importing markdown', async () => {
    render(<ComposerHarness initialValue={'A <u>highlight</u>'} />);

    await waitFor(() => expect(getValue()).toBe('A <u>highlight</u>'));
  });

  it('renders MarkdownContent output matching serialized markdown', async () => {
    render(
      <ComposerHarness
        initialValue={'**bold** and <u>link</u> [Link](https://example.com)'}
        renderPreview
      />,
    );

    await waitFor(() => expect(getValue()).toBe('**bold** and <u>link</u> [Link](https://example.com)'));

    const preview = screen.getByTestId('markdown-preview');
    const link = within(preview).getByRole('link', { name: 'Link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(preview.querySelector('strong')).not.toBeNull();
    expect(preview.querySelector('u')).not.toBeNull();
  });
});
