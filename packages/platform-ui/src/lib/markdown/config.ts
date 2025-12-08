import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from './sanitize';

export const MARKDOWN_REMARK_PLUGINS: PluggableList = [remarkGfm, remarkBreaks];

export const MARKDOWN_REHYPE_PLUGINS: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
];
