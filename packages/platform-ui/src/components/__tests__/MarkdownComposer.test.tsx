import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { MarkdownComposer, type MarkdownComposerProps } from '../MarkdownComposer';

interface ComposerHarnessProps {
  initialValue?: string;
  sendDisabled?: boolean;
  isSending?: boolean;
  onSend?: (value: string) => void;
  disabled?: boolean;
}

function ComposerHarness({
  initialValue = '',
  sendDisabled,
  isSending,
  onSend,
  disabled,
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

  return <MarkdownComposer {...composerProps} />;
}

const getComposerTextarea = () =>
  screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;

const selectAll = (textarea: HTMLTextAreaElement) => {
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
};

describe('MarkdownComposer formatting', () => {
  it('wraps selected text in bold via toolbar', async () => {
    render(<ComposerHarness initialValue="hello" />);

    const textarea = getComposerTextarea();
    selectAll(textarea);

    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bold'));

    await waitFor(() => expect(textarea.value).toBe('**hello**'));
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('toggles bulleted list for selected lines', async () => {
    render(<ComposerHarness initialValue={['Line one', 'Line two'].join('\n')} />);

    const textarea = getComposerTextarea();
    selectAll(textarea);

    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));

    await waitFor(() => expect(textarea.value).toBe('- Line one\n- Line two'));

    selectAll(textarea);
    fireEvent.click(screen.getByTestId('markdown-composer-toolbar-bullet'));

    await waitFor(() => expect(textarea.value).toBe('Line one\nLine two'));
  });

  it('wraps code block with shortcut Cmd/Ctrl+Shift+E', async () => {
    render(<ComposerHarness initialValue="snippet" />);

    const textarea = getComposerTextarea();
    selectAll(textarea);

    fireEvent.keyDown(textarea, {
      key: 'E',
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(textarea.value).toBe('```\nsnippet\n```'));
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(11);
  });

  it('wraps inline code with shortcut Cmd/Ctrl+E', async () => {
    render(<ComposerHarness initialValue="inline" />);

    const textarea = getComposerTextarea();
    selectAll(textarea);

    fireEvent.keyDown(textarea, {
      key: 'e',
      ctrlKey: true,
    });

    await waitFor(() => expect(textarea.value).toBe('`inline`'));
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(7);
  });
});

describe('MarkdownComposer sending', () => {
  it('calls onSend for Cmd/Ctrl+Enter when enabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} />);

    const textarea = getComposerTextarea();
    textarea.focus();

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).toHaveBeenCalledWith('message');
  });

  it('does not call onSend when disabled', () => {
    const handleSend = vi.fn();
    render(<ComposerHarness initialValue="message" onSend={handleSend} sendDisabled />);

    const textarea = getComposerTextarea();
    textarea.focus();

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(handleSend).not.toHaveBeenCalled();
  });
});
