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
const orderedListWithParagraph = ['1. First item', '', 'Extra context between items.', '', '2. Second item'].join('\n');

const sanitizedHtmlCodeBlock = '<pre><code>alpha\nbeta\ngamma</code></pre>';
const wrappingMarkdown = 'Discuss removing break-all without forced breaks.';
const inlineCodeWrappingMarkdown = 'Inline code like `removing_break_all()` should stay put.';

describe('MarkdownContent rendering', () => {
  it('renders expected markdown primitives including underline and lists', () => {
    const { container } = render(<MarkdownContent content={richMarkdown} className="prose" />);

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('Italic').tagName).toBe('EM');
    expect(screen.getByText('Underline').tagName).toBe('U');

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(4);
    expect(listItems[0]).toHaveTextContent('Item one');

    const blockquote = screen.getByText('Blockquote').closest('blockquote');
    expect(blockquote).not.toBeNull();

    const inlineCode = container.querySelector('p code');
    expect(inlineCode?.tagName).toBe('CODE');
    expect(inlineCode).toHaveTextContent('code');
    expect(inlineCode).toHaveClass('break-words');
    expect(inlineCode).not.toHaveClass('break-all');

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

  it('keeps regular prose words intact without injecting breaks', () => {
    const { container } = render(<MarkdownContent content={wrappingMarkdown} />);

    const wrapper = container.querySelector('.markdown-content');
    expect(wrapper).toHaveStyle({ overflowWrap: 'break-word' });

    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toBe(wrappingMarkdown);
    expect(paragraph).not.toHaveTextContent(/\n/);
  });

  it('keeps inline code contiguous with punctuation', () => {
    const { container } = render(<MarkdownContent content={inlineCodeWrappingMarkdown} />);

    const inlineCode = container.querySelector('code');
    expect(inlineCode?.tagName).toBe('CODE');
    expect(inlineCode).toHaveClass('break-words');
    expect(inlineCode).toHaveStyle({ overflowWrap: 'break-word', wordBreak: 'break-word' });
    expect(inlineCode).not.toHaveTextContent(/\n/);

    const paragraph = inlineCode?.closest('p');
    expect(paragraph?.textContent).toBe('Inline code like removing_break_all() should stay put.');
    expect(paragraph).not.toHaveTextContent(/\n/);
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

  it('maintains ordered list numbering across separated segments', () => {
    const { container } = render(<MarkdownContent content={orderedListWithParagraph} />);

    const orderedLists = container.querySelectorAll('ol');
    expect(orderedLists).toHaveLength(2);

    const [firstList, secondList] = Array.from(orderedLists);
    expect(firstList.querySelectorAll('li')).toHaveLength(1);
    expect(secondList.querySelectorAll('li')).toHaveLength(1);

    expect(secondList).toHaveAttribute('start', '2');
    expect(screen.getByText('Extra context between items.').tagName).toBe('P');
  });

  it('renders syntax highlighted code blocks without inline text shadows', () => {
    const highlighted = ['```ts', 'const example = 42;', '```'].join('\n');
    const { container } = render(<MarkdownContent content={highlighted} />);

    const highlightedTokens = container.querySelectorAll('pre [style*="text-shadow"]');
    expect(highlightedTokens.length).toBe(0);
  });
});
