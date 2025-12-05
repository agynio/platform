import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MarkdownContent } from '../MarkdownContent';

const richMarkdown = [
  '# Heading',
  '',
  '**Bold** *Italic* <u>Underline</u> ~~Gone~~',
  '',
  '- Item one',
  '- Item two',
  '',
  '1. First',
  '2. Second',
  '',
  '> Blockquote',
  '',
  'Inline `code` and:',
  '',
  '```ts',
  'const example = 42;',
  '```',
].join('\n');

const unsafeMarkdown = '<u>Safe</u> <script>alert("x")</script> [Link](javascript:alert("x")) <img src="#" onerror="alert(\'x\')" />';

const linkProtocolsMarkdown = [
  '[Safe Link](https://example.com)',
  '[Mail Link](mailto:support@example.com)',
  '[Blocked Js](javascript:alert("x"))',
  '[Blocked Data](data:text/plain;base64,SGVsbG8=)',
].join('\n\n');

describe('MarkdownContent rendering', () => {
  it('renders expected markdown primitives including underline and lists', () => {
    render(<MarkdownContent content={richMarkdown} className="prose" />);

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('Italic').tagName).toBe('EM');
    expect(screen.getByText('Underline').tagName).toBe('U');

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(4);
    expect(listItems[0]).toHaveTextContent('Item one');

    const blockquote = screen.getByText('Blockquote').closest('blockquote');
    expect(blockquote).not.toBeNull();

    const inlineCode = screen.getByText('code');
    expect(inlineCode.tagName).toBe('CODE');

    const codeElements = screen.getAllByText((_, element) => element?.tagName === 'CODE');
    const blockCode = codeElements.find((element) => element.textContent?.includes('const'));
    expect(blockCode).toBeDefined();
    expect(blockCode?.textContent?.replace(/\s+/g, ' ').trim()).toBe('const example = 42;');
  });

  it('sanitizes disallowed content while keeping allowed tags', () => {
    render(<MarkdownContent content={unsafeMarkdown} />);

    const underline = screen.getByText('Safe');
    expect(underline.tagName).toBe('U');

    expect(screen.queryByText((_, element) => element?.tagName === 'SCRIPT')).toBeNull();

    const link = screen.getByText('Link');
    expect(link).not.toHaveAttribute('href');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('retains safe link protocols and strips unsafe ones', () => {
    render(<MarkdownContent content={linkProtocolsMarkdown} />);

    const safeLink = screen.getByRole('link', { name: 'Safe Link' });
    expect(safeLink).toHaveAttribute('href', 'https://example.com');
    expect(safeLink).toHaveAttribute('target', '_blank');
    expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');

    const mailLink = screen.getByRole('link', { name: 'Mail Link' });
    expect(mailLink).toHaveAttribute('href', 'mailto:support@example.com');

    const blockedJs = screen.getByText('Blocked Js');
    expect(blockedJs.closest('a')).not.toHaveAttribute('href');

    const blockedData = screen.getByText('Blocked Data');
    expect(blockedData.closest('a')).not.toHaveAttribute('href');
  });
});
