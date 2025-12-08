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

const codeBlockNoLanguage = ['```', 'line one', 'line two', '```'].join('\n');

const newlineSeparatedText = ['First line', 'Second line', 'Third line'].join('\n');

const listMarkdown = ['- First item', '- Second item'].join('\n');

const sanitizedHtmlCodeBlock = '<pre><code>alpha\nbeta\ngamma</code></pre>';

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

  it('renders fenced code blocks without language using preformatted whitespace', () => {
    const { container } = render(<MarkdownContent content={codeBlockNoLanguage} />);

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveStyle({ whiteSpace: 'pre-wrap', wordBreak: 'break-word' });

    const code = pre?.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('line one\nline two');
  });

  it('renders sanitized raw HTML code blocks within pre containers', () => {
    const { container } = render(<MarkdownContent content={sanitizedHtmlCodeBlock} />);

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveStyle({ whiteSpace: 'pre-wrap', wordBreak: 'break-word' });
    expect(pre?.textContent).toBe('alpha\nbeta\ngamma');

    const code = pre?.querySelector('code');
    expect(code).not.toBeNull();
  });

  it('preserves single newlines as line breaks in paragraphs', () => {
    const { container } = render(<MarkdownContent content={newlineSeparatedText} />);

    const paragraph = container.querySelector('p');
    expect(paragraph).not.toBeNull();

    const lineBreaks = paragraph?.querySelectorAll('br');
    expect(lineBreaks?.length).toBe(2);
    expect(paragraph?.textContent).toBe('First line\nSecond line\nThird line');
  });

  it('continues to render markdown lists correctly', () => {
    render(<MarkdownContent content={listMarkdown} />);

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');
    expect(list.tagName).toBe('UL');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('First item');
    expect(items[1]).toHaveTextContent('Second item');
  });
});
