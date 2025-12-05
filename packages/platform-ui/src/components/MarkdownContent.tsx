import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MARKDOWN_REMARK_PLUGINS, MARKDOWN_REHYPE_PLUGINS } from '@/lib/markdown/config';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  node?: unknown;
};

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const markdownComponents: Components = {
    // Headings
    h1: ({ children }) => (
      <h1 className="text-[var(--agyn-dark)] mb-4 mt-6 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-[var(--agyn-dark)] mb-3 mt-5 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-[var(--agyn-dark)] mb-2 mt-4 first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-[var(--agyn-dark)] mb-2 mt-3 first:mt-0">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="text-[var(--agyn-dark)] mb-2 mt-3 first:mt-0">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="text-[var(--agyn-dark)] mb-2 mt-3 first:mt-0">
        {children}
      </h6>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p className="text-[var(--agyn-dark)] mb-4 last:mb-0 leading-relaxed">
        {children}
      </p>
    ),

    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-5 mb-4 space-y-1 text-[var(--agyn-dark)]">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-5 mb-4 space-y-1 text-[var(--agyn-dark)]">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-[var(--agyn-dark)] leading-relaxed">
        {children}
      </li>
    ),

    // Inline code
    code: ({ inline, className: codeClassName, children, style, node: _node, ...props }: MarkdownCodeProps) => {
      const match = /language-(\w+)/.exec(codeClassName || '');
      const text = String(children).replace(/\n$/, '');

      return !inline && match ? (
        <div className="my-4 w-full overflow-x-auto" style={{ minWidth: 0, maxWidth: '100%' }}>
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderRadius: '10px',
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.6',
              maxWidth: '100%',
            }}
            codeTagProps={{
              style: {
                whiteSpace: 'pre',
              },
            }}
            {...props}
          >
            {text}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className="bg-[var(--agyn-bg-light)] text-[var(--agyn-purple)] px-1.5 py-0.5 rounded text-sm break-all"
          style={style}
          {...props}
        >
          {children}
        </code>
      );
    },

    // Code blocks
    pre: ({ children }) => (
      <div className="my-4">
        {children}
      </div>
    ),

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-[var(--agyn-blue)] bg-[var(--agyn-bg-light)] pl-4 pr-4 py-3 my-4 italic text-[var(--agyn-dark)]">
        {children}
      </blockquote>
    ),

    // Links
    a: ({ href, children }) => (
      <a
        href={typeof href === 'string' ? href : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--agyn-blue)] hover:text-[var(--agyn-purple)] underline transition-colors"
      >
        {children}
      </a>
    ),

    // Horizontal rule
    hr: () => (
      <hr className="border-0 border-t border-[var(--agyn-border-subtle)] my-6" />
    ),

    // Tables
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-[var(--agyn-border-subtle)] rounded-[6px]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-[var(--agyn-bg-light)]">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody>
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr className="border-b border-[var(--agyn-border-subtle)] last:border-b-0">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2 text-left text-[var(--agyn-dark)] border-r border-[var(--agyn-border-subtle)] last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2 text-[var(--agyn-dark)] border-r border-[var(--agyn-border-subtle)] last:border-r-0">
        {children}
      </td>
    ),

    // Strong (bold)
    strong: ({ children }) => (
      <strong className="text-[var(--agyn-dark)]">
        {children}
      </strong>
    ),

    // Emphasis (italic)
    em: ({ children }) => (
      <em className="text-[var(--agyn-dark)]">
        {children}
      </em>
    ),

    // Strikethrough
    del: ({ children }) => (
      <del className="text-[var(--agyn-gray)] opacity-70">
        {children}
      </del>
    ),
  };

  return (
    <div className={`markdown-content w-full min-w-0 ${className}`} style={{ overflowWrap: 'anywhere' }}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
