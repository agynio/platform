import type { Schema } from 'hast-util-sanitize';

const allowedTagNames: Schema['tagNames'] = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'u',
  'ul',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
];

const allowedProtocols: string[] = ['http', 'https', 'mailto'];

export const markdownSanitizeSchema: Schema = {
  tagNames: allowedTagNames,
  attributes: {
    a: [
      'href',
      ['target', '_blank', '_self'],
      ['rel', 'noopener', 'noreferrer', 'nofollow'],
    ],
    code: [
      ['className', /^language-[\w-]+$/],
    ],
    th: ['align'],
    td: ['align'],
  },
  protocols: {
    href: [...allowedProtocols],
  },
};
